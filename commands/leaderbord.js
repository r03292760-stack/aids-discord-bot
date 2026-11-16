const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const settings = require('../lib/settings');
const statsBoard = require('../lib/statsBoard');
const { canPaneel, deniedMessage } = require('../lib/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderbord')
    .setDescription('Plaatst of ververst het vaste leaderbord in dit kanaal.')
    .addIntegerOption((option) =>
      option
        .setName('dagen')
        .setDescription('Periode van het leaderbord (standaard 30 dagen)')
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

    const days = interaction.options.getInteger('dagen') ?? settings.leaderboard?.days ?? 30;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await statsBoard.place(interaction.client, 'leaderboard', {
        guildId: interaction.guildId,
        channel,
        days,
      });
    } catch (error) {
      return interaction.editReply({
        content: `Kon het leaderbord niet plaatsen of bijwerken: ${error.message}`,
      });
    }

    return interaction.editReply({
      content: `✅ Leaderbord staat in ${channel}. De bot werkt het elke 5 minuten bij.`,
    });
  },
};
