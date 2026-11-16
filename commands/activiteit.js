const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const activityStore = require('../lib/activityStore');
const { duration, summaryEmbed, COLOR } = require('../lib/activityView');

async function nameOf(guild, userId) {
  const member =
    guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  return member?.displayName ?? 'Onbekend lid';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activiteit')
    .setDescription('Bekijk wie er actief is op de server.')
    .addUserOption((option) =>
      option.setName('lid').setDescription('Bekijk de cijfers van één lid').setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName('dagen')
        .setDescription('Periode (standaard 30 dagen)')
        .setRequired(false)
        .addChoices(
          { name: '7 dagen', value: 7 },
          { name: '30 dagen', value: 30 },
          { name: '90 dagen', value: 90 }
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Dit werkt alleen binnen de server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const days = interaction.options.getInteger('dagen') ?? 30;
    const user = interaction.options.getUser('lid');

    if (user) {
      const { entry, position, total } = activityStore.forUser(interaction.guild.id, user.id, days);
      const name = await nameOf(interaction.guild, user.id);

      const embed = new EmbedBuilder()
        .setTitle(`📊 Activiteit van ${name}`)
        .setColor(COLOR)
        .setDescription(`Laatste **${days}** dagen.`)
        .addFields(
          { name: 'Berichten', value: String(entry.messages), inline: true },
          { name: 'Spreektijd', value: duration(entry.voiceSeconds), inline: true },
          { name: 'Actieve dagen', value: String(entry.days), inline: true },
          {
            name: 'Positie',
            value: position ? `#${position} van ${total}` : 'nog geen activiteit',
            inline: true,
          }
        );

      return interaction.editReply({ embeds: [embed] });
    }

    const { embed } = summaryEmbed(interaction.guild.id, days, 10);

    if (!embed) {
      return interaction.editReply({
        content: `Nog geen activiteit in de laatste ${days} dagen.`,
      });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
