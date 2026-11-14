"""
Welkomstmodule: begroet nieuwe leden automatisch.

Instellingen in .env:
  WELCOME_CHANNEL_ID  - kanaal waar het welkomstbericht komt (verplicht)
  WELCOME_IMAGE_URL   - link naar de banner/afbeelding (optioneel)

Met /welkom-test bekijk je het bericht zonder dat er iemand hoeft te joinen.
"""

from __future__ import annotations

import logging
import os

import discord
from discord import app_commands
from discord.ext import commands

log = logging.getLogger("aids.welkom")

ORANGE = discord.Color.from_rgb(214, 92, 30)
FOOTER = "Airborne Insertion Direct Seizure · Tempo, initiatief en controle"


def _env_id(name: str) -> int | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        log.warning("%s is geen geldig ID (%r) - wordt genegeerd", name, raw)
        return None


def build_welcome_embed(member: discord.abc.User) -> discord.Embed:
    """Bouwt het welkomstbericht. Wordt ook door /welkom-test gebruikt."""
    embed = discord.Embed(
        title="Welkom bij Airborne Insertion Direct Seizure!",
        colour=ORANGE,
        description=(
            f"Welkom {member.mention}. Meld je bij de **intake** en probeer bij je "
            "eerste landing minstens één rotorblad heel te houden.\n\n"
            "Snelheid boven alles. Hotdrops recht op het doel. En onthoud: sterven is "
            "onderdeel van de strategie — je impact is wat telt."
        ),
        timestamp=discord.utils.utcnow(),
    )

    image_url = os.getenv("WELCOME_IMAGE_URL", "").strip()
    if image_url:
        embed.set_image(url=image_url)

    embed.set_footer(text=FOOTER)
    return embed


class Welkom(commands.Cog):
    """Begroet nieuwe soldaten zodra ze binnenkomen."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    async def cog_app_command_error(
        self, interaction: discord.Interaction, error: app_commands.AppCommandError
    ) -> None:
        if isinstance(error, (app_commands.CheckFailure, app_commands.MissingPermissions)):
            await interaction.response.send_message(
                "Jij hebt hier geen rechten voor, soldaat.", ephemeral=True
            )
        else:
            log.exception("Fout in welkomst-command", exc_info=error)
            await interaction.response.send_message(
                "Er ging iets mis. Probeer het opnieuw.", ephemeral=True
            )

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        if member.bot:
            return

        channel_id = _env_id("WELCOME_CHANNEL_ID")
        if channel_id is None:
            log.warning(
                "WELCOME_CHANNEL_ID staat niet in .env - welkomstbericht voor %s overgeslagen",
                member,
            )
            return

        channel = member.guild.get_channel(channel_id)
        if not isinstance(channel, discord.TextChannel):
            log.warning(
                "Kanaal %s (WELCOME_CHANNEL_ID) niet gevonden of geen tekstkanaal", channel_id
            )
            return

        try:
            await channel.send(content=member.mention, embed=build_welcome_embed(member))
            log.info("Welkomstbericht gestuurd voor %s in #%s", member, channel.name)
        except discord.HTTPException:
            log.exception("Kon welkomstbericht niet sturen in #%s", channel.name)

    @app_commands.command(
        name="welkom-test",
        description="Laat zien hoe het welkomstbericht eruitziet (alleen voor jou).",
    )
    @app_commands.default_permissions(manage_guild=True)
    @app_commands.checks.has_permissions(manage_guild=True)
    @app_commands.guild_only()
    async def welcome_test(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(
            content="Zo ziet een nieuw lid het (het echte bericht pingt het lid):",
            embed=build_welcome_embed(interaction.user),
            ephemeral=True,
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Welkom(bot))
