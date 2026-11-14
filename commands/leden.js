const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const members = require('../lib/members');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leden')
    .setDescription('Leden zoeken, rollen geven of iemand kicken.')
    .setDefaultMemberPermissions(8) // Beheer server
    .addSubcommand((sub) =>
      sub
        .setName('zoeken')
        .setDescription('Zoek leden op (een deel van) hun naam.')
        .addStringOption((option) =>
          option.setName('naam').setDescription('Deel van de gebruikersnaam of nickname')
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('rol')
        .setDescription('Geef of neem een rol.')
        .addUserOption((option) =>
          option.setName('lid').setDescription('Wie?').setRequired(true)
        )
        .addRoleOption((option) =>
          option.setName('rol').setDescription('Welke rol?').setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('actie')
            .setDescription('Geven of afnemen?')
            .setRequired(true)
            .addChoices({ name: 'geven', value: 'geven' }, { name: 'afnemen', value: 'afnemen' })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Verwijder een lid van de server (met bevestiging).')
        .addUserOption((option) =>
          option.setName('lid').setDescription('Wie?').setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Dit werkt alleen binnen de server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'zoeken') {
      const term = interaction.options.getString('naam')?.trim() ?? '';
      const found = await members.findMembers(interaction.guild, term);
      return interaction.reply({
        embeds: [members.membersEmbed(found, term)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'rol') {
      const target = interaction.options.getMember('lid');
      const role = interaction.options.getRole('rol');
      const action = interaction.options.getString('actie');

      if (!target) {
        return interaction.reply({
          content: 'Dat lid is niet (meer) op de server.',
          flags: MessageFlags.Ephemeral,
        });
      }
      if (target.id === interaction.user.id) {
        return interaction.reply({
          content: 'Je eigen rollen pas je beter aan via Discord zelf.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const problem = await members.setRole(interaction.guild, target, role, action);
      if (problem) {
        return interaction.reply({ content: problem, flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({
        content:
          action === 'afnemen'
            ? `✅ Rol **${role.name}** is afgenomen van ${target}.`
            : `✅ ${target} heeft nu de rol **${role.name}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'kick') {
      const target = interaction.options.getMember('lid');
      if (!target) {
        return interaction.reply({
          content: 'Dat lid is niet (meer) op de server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const problem = members.kickBlockReason(interaction.guild, target, interaction.user.id);
      if (problem) {
        return interaction.reply({ content: problem, flags: MessageFlags.Ephemeral });
      }

      return interaction.reply(members.kickConfirmView(target, interaction.user.id));
    }

    return interaction.reply({
      content: 'Onbekende actie.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
