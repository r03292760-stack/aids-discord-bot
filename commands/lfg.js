const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const opkomst = require('../lib/opkomst');
const store = require('../lib/opkomstStore');
const settings = require('../lib/settings');

/** Niet vaker dan eens per twee minuten, en maximaal twee open sessies per lid. */
const COOLDOWN_MS = 2 * 60 * 1000;
const MAX_OPEN = 2;
const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Zoek spelers voor nu: zet meteen een spontane sessie neer.')
    .addStringOption((option) =>
      option
        .setName('spel')
        .setDescription('Wat ga je spelen?')
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription('Arma Reforger-server; leeg = laatst gebruikte, - = geen')
        .setMaxLength(120)
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName('minimum')
        .setDescription('Hoeveel spelers heb je nodig? (standaard 2)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('notitie')
        .setDescription('Korte toelichting, bijvoorbeeld de modset')
        .setMaxLength(300)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Dit werkt alleen binnen de server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const now = Date.now();
    const last = cooldowns.get(interaction.user.id) ?? 0;
    if (now - last < COOLDOWN_MS) {
      const seconds = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      return interaction.reply({
        content: `Rustig, soldaat — je kunt over ${seconds} seconden weer een sessie openen.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const open = store
      .all()
      .filter((entry) => !entry.closedAt && entry.createdBy === interaction.user.id);

    if (open.length >= MAX_OPEN) {
      return interaction.reply({
        content:
          `Je hebt al ${MAX_OPEN} open sessies staan. ` +
          'Sluit er eerst één met 🔒 op het bericht, dan kun je weer een nieuwe openen.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const game = interaction.options.getString('spel', true).trim();
    const minimum = interaction.options.getInteger('minimum') ?? 2;
    const typedServer = (interaction.options.getString('server') ?? '').trim();
    const remembered = settings.lfg?.servers?.[interaction.guildId] ?? '';

    // Leeg = de laatst gebruikte server; een streepje betekent bewust geen server.
    const server = typedServer === '-' ? '' : typedServer || remembered;
    const note = (interaction.options.getString('notitie') ?? '').trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await opkomst.postSession(interaction, {
      title: game,
      when: 'Nu',
      server,
      notes: note,
      minimum,
    });

    if (result.error) {
      return interaction.editReply({ content: `Kon de sessie niet plaatsen: ${result.error}` });
    }

    cooldowns.set(interaction.user.id, now);

    if (typedServer && typedServer !== '-') {
      settings.update('lfg', {
        servers: { ...(settings.lfg?.servers ?? {}), [interaction.guildId]: typedServer },
      });
    }

    let content = `✅ Sessie voor **${game}** staat in ${interaction.channel}. Iedereen kan zich aanmelden.`;
    if (!typedServer && server) {
      content += `\n📡 Server: **${server}** (laatst gebruikt).`;
    }

    return interaction.editReply({ content });
  },
};
