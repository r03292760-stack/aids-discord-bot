const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { welcomeEmbed } = require('../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welkom-test')
    .setDescription('Laat zien hoe het welkomstbericht eruitziet (alleen voor jou).')
    .setDefaultMemberPermissions(8), // Beheer server

  async execute(interaction) {
    return interaction.reply({
      content: 'Zo ziet een nieuw lid het (het echte bericht pingt het lid):',
      embeds: [welcomeEmbed(interaction.user)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
