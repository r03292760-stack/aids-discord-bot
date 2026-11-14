const { SlashCommandBuilder } = require('discord.js');
const tickets = require('../lib/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('paneel')
    .setDescription('Plaats het ticketpaneel in dit kanaal.'),

  async execute(interaction) {
    return tickets.sendPanel(interaction);
  },
};
