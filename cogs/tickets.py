"""
Ticketmodule.

Wat het doet
------------
* /ticketpanel plaatst een paneel met een knop. Elk lid dat klikt krijgt een
  eigen privékanaal waar alleen hij/zij, de stafrol en de bot bij kunnen.
* Staf kan een ticket claimen, leden toevoegen/verwijderen en het sluiten.
* Bij sluiten gaat er een tekstbestand (transcript) naar het logkanaal en
  verdwijnt het kanaal.

Instellingen staan in .env: STAFF_ROLE_ID, TICKET_CATEGORY_ID, TICKET_LOG_CHANNEL_ID.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands

log = logging.getLogger("aids.tickets")

ORANGE = discord.Color.from_rgb(214, 92, 30)
STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "tickets.json"

PANEL_FOOTER = "Airborne Insertion Direct Seizure · tempo, initiatief en controle"


def _env_id(name: str) -> int | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        log.warning("%s is geen geldig ID (%r) - wordt genegeerd", name, raw)
        return None


async def _reply(
    interaction: discord.Interaction, content: str, *, ephemeral: bool = True
) -> None:
    """Antwoord op een interactie, ook als er al eens geantwoord is."""
    try:
        if interaction.response.is_done():
            await interaction.followup.send(content, ephemeral=ephemeral)
        else:
            await interaction.response.send_message(content, ephemeral=ephemeral)
    except discord.HTTPException:
        log.exception("Kon niet antwoorden op een interactie")


def _staff_only():
    """Check: is dit een staf- of beheerderslid?"""

    async def predicate(interaction: discord.Interaction) -> bool:
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            raise app_commands.CheckFailure("Dit werkt alleen binnen de server.")
        member = interaction.user
        if member.guild_permissions.manage_guild or member.guild_permissions.administrator:
            return True
        role_id = _env_id("STAFF_ROLE_ID")
        role = interaction.guild.get_role(role_id) if role_id else None
        if role is not None and role in member.roles:
            return True
        raise app_commands.CheckFailure("Alleen de staf kan dit doen, soldaat.")

    return app_commands.check(predicate)


class TicketStore:
    """Kleine JSON-opslag: welke tickets staan open en welk nummer zijn we."""

    def __init__(self, path: Path = STORE_PATH) -> None:
        self.path = path
        self.counter: int = 0
        self.tickets: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        try:
            raw = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return
        except OSError:
            log.exception("Kon %s niet lezen", self.path)
            return
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            log.exception("%s is beschadigd - we beginnen met een lege lijst", self.path)
            return
        if not isinstance(data, dict):
            return
        self.counter = int(data.get("counter") or 0)
        tickets = data.get("open")
        if isinstance(tickets, dict):
            self.tickets = {str(k): v for k, v in tickets.items() if isinstance(v, dict)}

    def save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(
                json.dumps({"counter": self.counter, "open": self.tickets}, indent=2),
                encoding="utf-8",
            )
            tmp.replace(self.path)
        except OSError:
            log.exception("Kon %s niet opslaan", self.path)

    def next_number(self) -> int:
        self.counter += 1
        self.save()
        return self.counter

    def add(self, channel_id: int, member: discord.Member, number: int) -> dict:
        ticket = {
            "number": number,
            "user_id": member.id,
            "opener_name": str(member),
            "opened_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "claimed_by": None,
            "claimed_by_name": None,
        }
        self.tickets[str(channel_id)] = ticket
        self.save()
        return ticket

    def get(self, channel_id: int) -> dict | None:
        return self.tickets.get(str(channel_id))

    def remove(self, channel_id: int) -> dict | None:
        ticket = self.tickets.pop(str(channel_id), None)
        self.save()
        return ticket

    def find_by_user(self, user_id: int) -> tuple[str, dict] | None:
        for channel_id, ticket in self.tickets.items():
            if ticket.get("user_id") == user_id:
                return channel_id, ticket
        return None


# --------------------------------------------------------------------------- #
# Knoppen
# --------------------------------------------------------------------------- #


class TicketPanelView(discord.ui.View):
    """Het paneel met de knop 'Ticket aanmaken'. Blijft werken na een restart."""

    def __init__(self) -> None:
        super().__init__(timeout=None)

    @discord.ui.button(
        label="Ticket aanmaken",
        emoji="🎫",
        style=discord.ButtonStyle.success,
        custom_id="aids:ticket:open",
    )
    async def open_ticket(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        cog = interaction.client.get_cog("Tickets")
        if not isinstance(cog, Tickets):
            await _reply(interaction, "De ticketmodule is niet geladen. Meld dit bij de staf.")
            return
        await cog.create_ticket(interaction)


class TicketControlView(discord.ui.View):
    """De knoppen binnen een ticket: claimen en sluiten."""

    def __init__(self) -> None:
        super().__init__(timeout=None)

    @discord.ui.button(
        label="Claimen",
        emoji="🙋",
        style=discord.ButtonStyle.primary,
        custom_id="aids:ticket:claim",
    )
    async def claim(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        cog = interaction.client.get_cog("Tickets")
        if isinstance(cog, Tickets):
            await cog.claim_ticket(interaction)
        else:
            await _reply(interaction, "De ticketmodule is niet geladen.")

    @discord.ui.button(
        label="Sluiten",
        emoji="🔒",
        style=discord.ButtonStyle.danger,
        custom_id="aids:ticket:close",
    )
    async def close(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        cog = interaction.client.get_cog("Tickets")
        if isinstance(cog, Tickets):
            await cog.ask_close_ticket(interaction)
        else:
            await _reply(interaction, "De ticketmodule is niet geladen.")


class CloseConfirmView(discord.ui.View):
    """Vraagt om bevestiging voordat een ticket dichtgaat."""

    def __init__(self, requester: discord.abc.User) -> None:
        super().__init__(timeout=120)
        self.requester = requester

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.requester.id:
            await _reply(interaction, "Deze knoppen zijn niet van jou.")
            return False
        return True

    @discord.ui.button(label="Ja, sluiten", emoji="🔒", style=discord.ButtonStyle.danger)
    async def confirm(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        cog = interaction.client.get_cog("Tickets")
        if not isinstance(cog, Tickets):
            await _reply(interaction, "De ticketmodule is niet geladen.")
            return
        await interaction.response.edit_message(
            content=f"🔒 Ticket wordt gesloten door {interaction.user.mention}.", view=None
        )
        await cog.close_ticket(interaction)

    @discord.ui.button(label="Nee, laat open", style=discord.ButtonStyle.secondary)
    async def cancel(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        await interaction.response.edit_message(
            content="👍 Ticket blijft open. Ga door.", view=None
        )


# --------------------------------------------------------------------------- #
# De cog
# --------------------------------------------------------------------------- #


class Tickets(commands.Cog):
    """Ticket systeem."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self.store = TicketStore()

    async def cog_load(self) -> None:
        # Persistent views: knoppen van vóór een restart blijven werken.
        self.bot.add_view(TicketPanelView())
        self.bot.add_view(TicketControlView())

    # ----------------------------- helpers ----------------------------- #

    def _is_staff(self, interaction: discord.Interaction) -> bool:
        member = interaction.user
        if interaction.guild is None or not isinstance(member, discord.Member):
            return False
        if member.guild_permissions.manage_guild or member.guild_permissions.administrator:
            return True
        role_id = _env_id("STAFF_ROLE_ID")
        role = interaction.guild.get_role(role_id) if role_id else None
        return role is not None and role in member.roles

    def _staff_role(self, guild: discord.Guild) -> discord.Role | None:
        role_id = _env_id("STAFF_ROLE_ID")
        return guild.get_role(role_id) if role_id else None

    async def cog_app_command_error(
        self, interaction: discord.Interaction, error: app_commands.AppCommandError
    ) -> None:
        if isinstance(error, app_commands.CheckFailure):
            await _reply(interaction, str(error) or "Geen rechten, soldaat.")
        elif isinstance(error, app_commands.MissingPermissions):
            await _reply(interaction, "Jij hebt hier geen rechten voor, soldaat.")
        else:
            log.exception("Fout in ticket-command", exc_info=error)
            await _reply(
                interaction,
                "Er ging iets mis bij het uitvoeren. Probeer het opnieuw of meld het bij de staf.",
            )

    # ----------------------------- paneel ------------------------------ #

    @app_commands.command(
        name="ticketpanel",
        description="Plaats het ticket-paneel met de aanmaakknop in dit kanaal.",
    )
    @app_commands.default_permissions(manage_guild=True)
    @app_commands.checks.has_permissions(manage_guild=True)
    @app_commands.guild_only()
    async def ticketpanel(self, interaction: discord.Interaction) -> None:
        embed = discord.Embed(
            title="🎫 A.I.D.S. — Support & Aanmeldingen",
            colour=ORANGE,
            description=(
                "Klik op **Ticket aanmaken** en je krijgt een eigen kanaal met de staf.\n"
                "Gebruik het voor je **intake**, een **aanmelding**, een **vraag** of een **klacht**.\n\n"
                "Eén ticket per persoon. Geen ticket-spam — de rotorbladen zijn al duur genoeg."
            ),
        )
        embed.add_field(
            name="Zo werkt het",
            value=(
                "1. Klik op **Ticket aanmaken**\n"
                "2. Beschrijf kort wat je nodig hebt\n"
                "3. De staf claimt je ticket en pakt het op"
            ),
            inline=False,
        )
        embed.set_footer(text=PANEL_FOOTER)

        await interaction.channel.send(embed=embed, view=TicketPanelView())
        await _reply(interaction, "✅ Ticket-paneel geplaatst.")

    # ------------------------- ticket aanmaken ------------------------- #

    async def create_ticket(self, interaction: discord.Interaction) -> None:
        guild = interaction.guild
        member = interaction.user
        if guild is None or not isinstance(member, discord.Member):
            await _reply(interaction, "Tickets openen werkt alleen binnen de server.")
            return

        await interaction.response.defer(ephemeral=True, thinking=True)

        existing = self.store.find_by_user(member.id)
        if existing is not None:
            channel_id, ticket = existing
            await interaction.followup.send(
                f"Je hebt al een open ticket: <#{channel_id}> (#{ticket['number']:04d}). "
                "Sluit dat eerst, dan kun je een nieuwe openen.",
                ephemeral=True,
            )
            return

        category = None
        category_id = _env_id("TICKET_CATEGORY_ID")
        if category_id:
            found = guild.get_channel(category_id)
            if isinstance(found, discord.CategoryChannel):
                category = found
            else:
                log.warning("TICKET_CATEGORY_ID %s is geen categorie - ticket komt bovenaan", category_id)

        staff_role = self._staff_role(guild)
        bot_member = guild.me

        overwrites: dict[discord.abc.Snowflake, discord.PermissionOverwrite] = {
            guild.default_role: discord.PermissionOverwrite(view_channel=False),
            member: discord.PermissionOverwrite(
                view_channel=True,
                send_messages=True,
                read_message_history=True,
                attach_files=True,
                embed_links=True,
            ),
        }
        if staff_role is not None:
            overwrites[staff_role] = discord.PermissionOverwrite(
                view_channel=True,
                send_messages=True,
                read_message_history=True,
                attach_files=True,
                embed_links=True,
                manage_messages=True,
            )
        if bot_member is not None:
            overwrites[bot_member] = discord.PermissionOverwrite(
                view_channel=True,
                send_messages=True,
                read_message_history=True,
                attach_files=True,
                embed_links=True,
                manage_channels=True,
                manage_messages=True,
            )

        number = self.store.next_number()
        try:
            channel = await guild.create_text_channel(
                name=f"ticket-{number:04d}",
                category=category,
                topic=f"Ticket #{number:04d} · {member} ({member.id})",
                overwrites=overwrites,
                reason=f"Ticket voor {member} ({member.id})",
            )
        except discord.HTTPException as exc:
            log.exception("Kon geen ticketkanaal maken")
            await interaction.followup.send(
                f"Kon geen ticketkanaal maken ({exc.status}). "
                "Controleer of de bot **Kanalen beheren** heeft en hoog genoeg in de rollenlijst staat.",
                ephemeral=True,
            )
            return

        ticket = self.store.add(channel.id, member, number)

        embed = discord.Embed(
            title=f"🎫 Ticket #{number:04d}",
            colour=ORANGE,
            description=(
                f"Welkom {member.mention}, je ticket staat open.\n\n"
                "Vertel kort **wat** je nodig hebt, **waarom** en sinds **wanneer**. "
                "Hoe duidelijker je bent, hoe sneller we toeslaan.\n\n"
                "De staf sluit het ticket als het klaar is; het gesprek wordt gearchiveerd."
            ),
        )
        embed.add_field(name="Geopend door", value=member.mention, inline=True)
        embed.add_field(name="Nummer", value=f"#{number:04d}", inline=True)
        if staff_role is not None:
            embed.add_field(name="Staf", value=staff_role.mention, inline=True)
        embed.set_footer(text=PANEL_FOOTER)

        ping = member.mention
        if staff_role is not None:
            ping += f" {staff_role.mention}"
        try:
            await channel.send(content=ping, embed=embed, view=TicketControlView())
        except discord.HTTPException:
            log.exception("Kon het welkomstbericht in %s niet sturen", channel.id)

        await interaction.followup.send(
            f"✅ Je ticket staat klaar: {channel.mention} (#{ticket['number']:04d}).",
            ephemeral=True,
        )

    # ------------------------------ claimen ---------------------------- #

    async def claim_ticket(self, interaction: discord.Interaction) -> None:
        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel):
            await _reply(interaction, "Dit is geen ticketkanaal.")
            return

        ticket = self.store.get(channel.id)
        if ticket is None:
            await _reply(interaction, "Dit kanaal staat niet als ticket in de lijst.")
            return
        if not self._is_staff(interaction):
            await _reply(interaction, "Alleen de staf kan een ticket claimen, soldaat.")
            return

        if ticket.get("claimed_by"):
            await _reply(
                interaction,
                f"Dit ticket is al geclaimd door <@{ticket['claimed_by']}>.",
            )
            return

        ticket["claimed_by"] = interaction.user.id
        ticket["claimed_by_name"] = str(interaction.user)
        self.store.save()

        await _reply(interaction, "🙋 Jij hebt dit ticket.")
        try:
            await channel.send(
                f"🙋 {interaction.user.mention} pakt dit ticket op. Even geduld, soldaat."
            )
        except discord.HTTPException:
            log.exception("Kon claim-melding niet sturen")

    # ------------------------- leden toevoegen -------------------------- #

    @app_commands.command(
        name="lid-toevoegen", description="Geef een lid toegang tot dit ticket."
    )
    @app_commands.describe(lid="Wie mag meepraten in dit ticket?")
    @app_commands.guild_only()
    @_staff_only()
    async def add_member(
        self, interaction: discord.Interaction, lid: discord.Member
    ) -> None:
        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel) or self.store.get(channel.id) is None:
            await _reply(interaction, "Dit is geen ticketkanaal.")
            return

        try:
            await channel.set_permissions(
                lid,
                overwrite=discord.PermissionOverwrite(
                    view_channel=True,
                    send_messages=True,
                    read_message_history=True,
                    attach_files=True,
                    embed_links=True,
                ),
                reason=f"Toegevoegd aan ticket door {interaction.user}",
            )
        except discord.HTTPException:
            log.exception("Kon permissies niet aanpassen")
            await _reply(interaction, "Kon dit lid niet toevoegen. Check mijn rechten.")
            return

        await _reply(interaction, f"✅ {lid.mention} is toegevoegd aan dit ticket.")
        try:
            await channel.send(f"➕ {lid.mention} is toegevoegd door {interaction.user.mention}.")
        except discord.HTTPException:
            pass

    @app_commands.command(
        name="lid-verwijderen", description="Haal een lid weer uit dit ticket."
    )
    @app_commands.describe(lid="Wie mag hier niet meer meepraten?")
    @app_commands.guild_only()
    @_staff_only()
    async def remove_member(
        self, interaction: discord.Interaction, lid: discord.Member
    ) -> None:
        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel) or self.store.get(channel.id) is None:
            await _reply(interaction, "Dit is geen ticketkanaal.")
            return

        try:
            await channel.set_permissions(
                lid,
                overwrite=discord.PermissionOverwrite(view_channel=False),
                reason=f"Verwijderd uit ticket door {interaction.user}",
            )
        except discord.HTTPException:
            log.exception("Kon permissies niet aanpassen")
            await _reply(interaction, "Kon dit lid niet verwijderen. Check mijn rechten.")
            return

        await _reply(interaction, f"✅ {lid.mention} is uit dit ticket gehaald.")

    # ------------------------------ sluiten ---------------------------- #

    async def ask_close_ticket(self, interaction: discord.Interaction) -> None:
        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel) or self.store.get(channel.id) is None:
            await _reply(interaction, "Dit is geen ticketkanaal.")
            return

        ticket = self.store.get(channel.id) or {}
        is_opener = ticket.get("user_id") == interaction.user.id
        if not (is_opener or self._is_staff(interaction)):
            await _reply(interaction, "Alleen de staf of de opener kan dit ticket sluiten.")
            return

        await interaction.response.send_message(
            "Weet je zeker dat dit ticket dicht moet? Het kanaal verdwijnt daarna.",
            view=CloseConfirmView(interaction.user),
            ephemeral=True,
        )

    @app_commands.command(
        name="sluit", description="Sluit dit ticket en archiveer het gesprek."
    )
    @app_commands.guild_only()
    async def close_command(self, interaction: discord.Interaction) -> None:
        await self.close_ticket(interaction)

    async def close_ticket(self, interaction: discord.Interaction) -> None:
        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel):
            await _reply(interaction, "Dit is geen ticketkanaal.")
            return

        ticket = self.store.get(channel.id)
        if ticket is None:
            await _reply(interaction, "Dit kanaal staat niet als ticket in de lijst.")
            return

        is_opener = ticket.get("user_id") == interaction.user.id
        if not (is_opener or self._is_staff(interaction)):
            await _reply(interaction, "Alleen de staf of de opener kan dit ticket sluiten.")
            return

        await _reply(interaction, "🔒 Ticket wordt gesloten en gearchiveerd…")

        await self._send_transcript(channel, ticket, interaction.user)
        self.store.remove(channel.id)

        try:
            await channel.send(
                f"🔒 Ticket gesloten door {interaction.user.mention}. "
                "Dit kanaal verdwijnt over 5 seconden."
            )
        except discord.HTTPException:
            log.exception("Kon sluitmelding niet sturen")

        await asyncio.sleep(5)
        try:
            await channel.delete(reason=f"Ticket gesloten door {interaction.user}")
        except discord.HTTPException:
            log.exception("Kon ticketkanaal %s niet verwijderen", channel.id)

    async def _send_transcript(
        self,
        channel: discord.TextChannel,
        ticket: dict,
        closer: discord.abc.User,
    ) -> None:
        log_channel_id = _env_id("TICKET_LOG_CHANNEL_ID")
        log_channel = channel.guild.get_channel(log_channel_id) if log_channel_id else None

        lines = [
            f"Ticket #{ticket['number']:04d} - {ticket['opener_name']}",
            f"Kanaal: #{channel.name} ({channel.id})",
            f"Geopend: {ticket['opened_at']}",
            f"Geclaimd door: {ticket.get('claimed_by_name') or 'niemand'}",
            f"Gesloten door: {closer} ({closer.id})",
            f"Gesloten op: {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC",
            "-" * 60,
            "",
        ]

        try:
            async for message in channel.history(limit=1000, oldest_first=True):
                content = message.content or ""
                if message.attachments:
                    content += " " + " ".join(a.url for a in message.attachments)
                if not content and message.embeds:
                    content = "[embed]"
                stamp = message.created_at.strftime("%Y-%m-%d %H:%M")
                lines.append(f"[{stamp}] {message.author} ({message.author.id}): {content}")
        except discord.HTTPException:
            log.exception("Kon geschiedenis van %s niet lezen", channel.id)
            lines.append("(gesprek kon niet worden uitgelezen)")

        data = "\n".join(lines).encode("utf-8")
        filename = f"ticket-{ticket['number']:04d}.txt"

        if not isinstance(log_channel, discord.TextChannel):
            log.warning(
                "Geen geldig TICKET_LOG_CHANNEL_ID - transcript van ticket #%s niet opgeslagen",
                ticket["number"],
            )
            return

        embed = discord.Embed(
            title=f"🎫 Ticket #{ticket['number']:04d} gesloten",
            colour=ORANGE,
            description=(
                f"**Opener:** <@{ticket['user_id']}>\n"
                f"**Geclaimd door:** {ticket.get('claimed_by_name') or 'niemand'}\n"
                f"**Gesloten door:** {closer.mention}"
            ),
        )
        embed.set_footer(text=PANEL_FOOTER)

        try:
            await log_channel.send(
                embed=embed,
                file=discord.File(io.BytesIO(data), filename=filename),
            )
        except discord.HTTPException:
            log.exception("Kon transcript niet naar het logkanaal sturen")

    # ------------------- opruimen na handmatig verwijderen ------------------- #

    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel: discord.abc.GuildChannel) -> None:
        if self.store.get(channel.id) is not None:
            self.store.remove(channel.id)
            log.info("Ticketkanaal %s handmatig verwijderd - uit de lijst gehaald", channel.id)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Tickets(bot))
