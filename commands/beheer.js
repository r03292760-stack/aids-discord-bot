const { SlashCommandBuilder } = require('discord.js');
const admin = require('../lib/adminPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('beheer')
    .setDescription('Open het beheerpaneel voor het ticketpaneel en het welkomstbericht.')
    .setDefaultMemberPermissions(8), // Beheer server

  async execute(interaction, client) {
    return admin.openMain(interaction, client);
  },
};
