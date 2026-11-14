const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const version = require('../lib/version');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Laat zien wie de bot is en wat hij kan.'),

  async execute(interaction, client) {
    const commands = [...client.commands.keys()].sort();
    const embed = new EmbedBuilder()
      .setTitle('🛩️ Airborne Insertion Direct Seizure')
      .setColor(0xd65c1e)
      .setDescription(
        'Tempo, initiatief en controle.\n' +
          'Deze bot regelt de tickets en alles wat we er later aan hangen.'
      )
      .addFields(
        { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Latency', value: `${Math.max(0, Math.round(client.ws.ping))} ms`, inline: true },
        { name: 'Online', value: `<t:${Math.floor((Date.now() - process.uptime() * 1000) / 1000)}:R>`, inline: true },
        { name: 'Versie', value: version.label, inline: true },
        {
          name: 'Commands',
          value: commands.map((name) => `\`/${name}\``).join(' ') || 'nog geen',
        }
      )
      .setFooter({ text: 'Airborne Insertion Direct Seizure · tempo, initiatief en controle' });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
