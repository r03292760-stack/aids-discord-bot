const { SlashCommandBuilder, MessageFlags } = require('discord.js');

function uptime() {
  const total = Math.floor(process.uptime());
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [days ? `${days}d` : null, hours ? `${hours}u` : null, `${minutes}m`, `${seconds}s`]
    .filter(Boolean)
    .join(' ');
}

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check of de bot wakker is.'),

  async execute(interaction, client) {
    const latency = Math.max(0, Math.round(client.ws.ping));
    return interaction.reply({
      content: `🏓 Pong. Latency: **${latency} ms** · online: **${uptime()}**`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
