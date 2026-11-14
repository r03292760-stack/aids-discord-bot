const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const store = require('../lib/ticketStore');
const { isStaff } = require('../lib/tickets');

const MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lid-toevoegen')
    .setDescription('Geef een lid toegang tot dit ticket.')
    .addUserOption((option) =>
      option.setName('lid').setDescription('Wie mag meepraten in dit ticket?').setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.guild || !store.get(interaction.channel.id)) {
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

    const member = await interaction.guild.members
      .fetch(interaction.options.getUser('lid').id)
      .catch(() => null);
    if (!member) {
      return interaction.reply({
        content: 'Dat lid is niet gevonden op deze server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await interaction.channel.permissionOverwrites.edit(member, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      });
    } catch (error) {
      console.error('Kon permissies niet aanpassen:', error.message);
      return interaction.reply({
        content: 'Kon dit lid niet toevoegen. Check mijn rechten.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({ content: `✅ ${member} is toegevoegd aan dit ticket.`, flags: MessageFlags.Ephemeral });
    await interaction.channel
      .send(`➕ ${member} is toegevoegd door ${interaction.user}.`)
      .catch(() => {});
  },
};
