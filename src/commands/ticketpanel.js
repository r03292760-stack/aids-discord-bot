const { SlashCommandBuilder } = require('discord.js');
const tickets = require('../lib/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Plaats het ticket-paneel met de aanmaakknop in dit kanaal.')
    .setDefaultMemberPermissions(8), // Beheer server

  async execute(interaction) {
    return tickets.sendPanel(interaction);
  },
};
