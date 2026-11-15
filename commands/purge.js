const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { blockedReason, purge: purgeChannel } = require('../lib/purge');
const { canPaneel, deniedMessage } = require('../lib/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Verwijdert berichten in dit kanaal.')
    .addIntegerOption((option) =>
      option
        .setName('aantal')
        .setDescription('Hoeveel berichten (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption((option) =>
      option.setName('gebruiker').setDescription('Alleen berichten van dit lid').setRequired(false)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('aantal', true);
    const user = interaction.options.getUser('gebruiker');
    const channel = interaction.channel;

    if (!interaction.guild) {
      return interaction.reply({
        content: 'Dit werkt alleen binnen de server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Zelfde rol als /paneel: de rol uit /beheer → Toegang, anders STAFF_ROLE_ID.
    if (!canPaneel(interaction)) {
      return interaction.reply({
        content: deniedMessage('purge'),
        flags: MessageFlags.Ephemeral,
      });
    }

    const blocked = blockedReason(channel, interaction.guild.members.me);
    if (blocked) {
      return interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await purgeChannel(channel, { amount, userId: user?.id });

      if (result.empty) {
        return interaction.editReply({
          content: `Ik vond geen berichten van ${user} in de laatste 100 berichten van dit kanaal.`,
        });
      }

      if (!result.deleted) {
        return interaction.editReply({
          content:
            `Die ${result.skipped} berichten zijn ouder dan 14 dagen; die kan ik niet in bulk verwijderen. ` +
            'Verwijder ze handmatig als het echt weg moet.',
        });
      }

      let content = `🧹 **${result.deleted}** ${result.deleted === 1 ? 'bericht' : 'berichten'} verwijderd`;
      content += user ? ` van ${user}.` : '.';
      if (result.skipped) {
        content += `\n${result.skipped} ${result.skipped === 1 ? 'bericht was' : 'berichten waren'} ouder dan 14 dagen en staan er nog.`;
      }
      content += '\nRotors draaien, kanaal weer schoon.';

      return interaction.editReply({ content });
    } catch (error) {
      return interaction.editReply({
        content: `Verwijderen mislukt: ${error.message}`,
      });
    }
  },
};
