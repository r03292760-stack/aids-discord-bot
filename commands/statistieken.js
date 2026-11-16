const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const settings = require('../lib/settings');
const statsBoard = require('../lib/statsBoard');
const { canPaneel, deniedMessage } = require('../lib/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('statistieken')
    .setDescription('Plaatst of ververst het statistiekenbord in dit kanaal.')
    .addIntegerOption((option) =>
      option
        .setName('dagen')
        .setDescription('Periode van het bord (standaard 30 dagen)')
        .setRequired(false)
        .addChoices(
          { name: '7 dagen', value: 7 },
          { name: '30 dagen', value: 30 },
          { name: '90 dagen', value: 90 }
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Dit werkt alleen binnen de server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!canPaneel(interaction)) {
      return interaction.reply({ content: deniedMessage('stats'), flags: MessageFlags.Ephemeral });
    }

    const channel = interaction.channel?.isTextBased?.() ? interaction.channel : null;
    if (!channel) {
      return interaction.reply({
        content: 'Dit kanaal kan geen berichten ontvangen.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const days = interaction.options.getInteger('dagen') ?? settings.stats?.days ?? 30;
    const config = settings.stats;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Staat het bord al in dit kanaal? Dan bijwerken in plaats van een tweede neerzetten.
    let message = null;
    if (config?.messageId && config.channelId === channel.id) {
      message = await channel.messages.fetch(config.messageId).catch(() => null);
    }

    try {
      if (message) {
        await message.edit({ embeds: [statsBoard.boardEmbed(interaction.guildId, days)] });
      } else {
        message = await channel.send({ embeds: [statsBoard.boardEmbed(interaction.guildId, days)] });
      }
    } catch (error) {
      return interaction.editReply({
        content: `Kon het bord niet plaatsen of bijwerken: ${error.message}`,
      });
    }

    settings.update('stats', {
      guildId: interaction.guildId,
      channelId: channel.id,
      messageId: message.id,
      days,
    });

    statsBoard.start(interaction.client);

    return interaction.editReply({
      content: `✅ Statistiekenbord staat in ${channel}. De bot werkt het elke 5 minuten bij.`,
    });
  },
};
