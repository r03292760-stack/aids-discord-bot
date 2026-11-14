const { SlashCommandBuilder } = require('discord.js');
const tickets = require('../lib/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sluit')
    .setDescription('Sluit dit ticket en archiveer het gesprek.'),

  async execute(interaction) {
    return tickets.closeTicket(interaction);
  },
};
