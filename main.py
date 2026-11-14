"""
A.I.D.S. - Airborne Insertion Direct Seizure
Basis van de Discord-bot.

Start met:  python main.py

Nieuwe module toevoegen?
1. Maak een bestand in cogs/ (kopieer cogs/algemeen.py als blauwdruk).
2. Zet de naam in COGS hieronder, bijvoorbeeld "cogs.welkom".
3. Bot opnieuw starten. Klaar.
"""

from __future__ import annotations

import asyncio
import logging
import os

import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("aids")

# Alle modules die bij het opstarten geladen worden.
COGS = (
    "cogs.tickets",
    "cogs.welkom",
    "cogs.algemeen",
)

GUILD_ID = os.getenv("GUILD_ID", "").strip()


class AIDSBot(commands.Bot):
    """De bot zelf. Houdt alleen de basis bij; de inhoud zit in de cogs."""

    def __init__(self) -> None:
        # members: nodig voor rollen/rechten van leden.
        # message_content: nodig om gesprekken in tickets te archiveren.
        intents = discord.Intents.default()
        intents.members = True
        intents.message_content = True
        super().__init__(command_prefix="!", intents=intents, help_command=None)

    async def setup_hook(self) -> None:
        for cog in COGS:
            try:
                await self.load_extension(cog)
                log.info("Module geladen: %s", cog)
            except Exception:
                log.exception("Module %s kon niet geladen worden", cog)

        await self.sync_commands()

    async def sync_commands(self) -> None:
        """Zet de slash commands klaar in Discord."""
        try:
            if GUILD_ID:
                guild = discord.Object(id=int(GUILD_ID))
                self.tree.copy_global_to(guild=guild)
                synced = await self.tree.sync(guild=guild)
                log.info("%d commands klaargezet op server %s", len(synced), GUILD_ID)
            else:
                synced = await self.tree.sync()
                log.info(
                    "%d globale commands klaargezet (kan tot een uur duren voordat "
                    "Discord ze toont; zet GUILD_ID in .env om dat te versnellen)",
                    len(synced),
                )
        except discord.HTTPException:
            log.exception("Synchroniseren van commands mislukt")

    async def on_ready(self) -> None:
        log.info("Ingelogd als %s (ID: %s)", self.user, getattr(self.user, "id", "?"))
        await self.change_presence(
            activity=discord.Activity(
                type=discord.ActivityType.watching,
                name="de rotors | /ticketpanel",
            )
        )


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    token = os.getenv("DISCORD_TOKEN", "").strip()
    if not token:
        raise SystemExit(
            "\nGeen DISCORD_TOKEN gevonden.\n"
            "Kopieer .env.example naar .env en plak daar je bot-token in.\n"
        )

    async with AIDSBot() as bot:
        await bot.start(token)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bot gestopt met Ctrl+C.")
