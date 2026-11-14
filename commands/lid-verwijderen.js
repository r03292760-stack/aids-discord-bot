const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const store = require('../lib/ticketStore');
const { isStaff } = require('../lib/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lid-verwijderen')
    .setDescription('Haal een lid weer uit dit ticket.')
    .addUserOption((option) =>
      option.setName('lid').setDescription('Wie mag hier niet meer meepraten?').setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('lid');

    if (!store.get(interaction.channel.id)) {
      return interaction.reply({
        content: 'Dit is geen ticketkanaal.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!isStaff(interaction)) {
      return interaction.reply({
        content: 'Alleen de staf kan dit doen, soldaat.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await interaction.channel.permissionOverwrites.edit(user, { ViewChannel: false });
    } catch (error) {
      console.error('Kon permissies niet aanpassen:', error.message);
      return interaction.reply({
        content: 'Kon dit lid niet verwijderen. Check mijn rechten.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({ content: `✅ ${user} is uit dit ticket gehaald.`, flags: MessageFlags.Ephemeral });
  },
};
