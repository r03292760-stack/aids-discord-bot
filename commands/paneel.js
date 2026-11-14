const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { paneelView } = require('../lib/embedComposer');
const { canPaneel, deniedMessage } = require('../lib/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('paneel')
    .setDescription('Plaats het ticketpaneel of stuur een eigen embed.'),

  async execute(interaction) {
    if (!canPaneel(interaction)) {
      return interaction.reply({
        content: deniedMessage('paneel'),
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({ ...paneelView(), flags: MessageFlags.Ephemeral });
  },
};
