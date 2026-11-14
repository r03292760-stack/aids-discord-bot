const { SlashCommandBuilder } = require('discord.js');
const admin = require('../lib/adminPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('beheer')
    .setDescription('Beheer tickets, het welkomstbericht en leden/rollen.')
    .setDefaultMemberPermissions(8), // Beheer server

  async execute(interaction, client) {
    return admin.openMain(interaction, client);
  },
};
