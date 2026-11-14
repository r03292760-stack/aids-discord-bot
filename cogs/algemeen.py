"""
Algemene module: /ping en /info.

Dit bestand is de blauwdruk voor je eigen commands.
Kopieer het, hernoem de class, en zet de nieuwe module in COGS in main.py.

Zo voeg je een command toe:

    @app_commands.command(name="helikopter", description="Roept de heli.")
    async def helikopter(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message("Rotors draaien. Instappen. 🚁")
"""

from __future__ import annotations

import time

import discord
from discord import app_commands
from discord.ext import commands

START_TIME = time.monotonic()


def _uptime() -> str:
    seconds = int(time.monotonic() - START_TIME)
    days, rest = divmod(seconds, 86400)
    hours, rest = divmod(rest, 3600)
    minutes, seconds = divmod(rest, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}u")
    parts.append(f"{minutes}m")
    parts.append(f"{seconds}s")
    return " ".join(parts)


class Algemeen(commands.Cog):
    """Basisdingen: is de bot wakker, en wie is hij."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="ping", description="Check of de bot wakker is.")
    async def ping(self, interaction: discord.Interaction) -> None:
        latency = round(self.bot.latency * 1000)
        await interaction.response.send_message(
            f"🏓 Pong. Latency: **{latency} ms** · online: **{_uptime()}**",
            ephemeral=True,
        )

    @app_commands.command(name="info", description="Laat zien wie de bot is en wat hij kan.")
    async def info(self, interaction: discord.Interaction) -> None:
        command_names = sorted(cmd.name for cmd in self.bot.tree.get_commands())
        embed = discord.Embed(
            title="🛩️ Airborne Insertion Direct Seizure",
            description=(
                "Tempo, initiatief en controle.\n"
                "Deze bot regelt de tickets en alles wat we er later aan hangen."
            ),
            colour=discord.Color.from_rgb(214, 92, 30),
        )
        embed.add_field(name="Servers", value=str(len(self.bot.guilds)), inline=True)
        embed.add_field(name="Latency", value=f"{round(self.bot.latency * 1000)} ms", inline=True)
        embed.add_field(name="Online", value=_uptime(), inline=True)
        embed.add_field(
            name="Commands",
            value=" ".join(f"`/{name}`" for name in command_names) or "nog geen",
            inline=False,
        )
        embed.set_footer(text="Airborne Insertion Direct Seizure · tempo, initiatief en controle")
        await interaction.response.send_message(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Algemeen(bot))
