const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const store = require('../lib/pollStore');
const { buildView } = require('../lib/pollView');
const botLog = require('../lib/botLog');

/** Niet vaker dan eens per vijf minuten, en maximaal drie open peilingen per lid. */
const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_OPEN = 3;
const cooldowns = new Map();

function parseOptions(raw) {
  return String(raw)
    .split(/[,;|]/)
    .map((option) => option.trim())
    .filter(Boolean);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('peiling')
    .setDescription('Zet een peiling neer waar iedereen op kan stemmen.')
    .addStringOption((option) =>
      option
        .setName('vraag')
        .setDescription('De vraag die bovenaan komt')
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption((option) =>
      option
        .setName('opties')
        .setDescription("2 tot 5 opties, gescheiden door komma's")
        .setRequired(true)
        .setMaxLength(400)
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
        content: `Rustig, soldaat — je kunt over ${seconds} seconden weer een peiling openen.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (store.openBy(interaction.user.id).length >= MAX_OPEN) {
      return interaction.reply({
        content:
          `Je hebt al ${MAX_OPEN} open peilingen staan. ` +
          'Sluit er eerst één met 🔒, dan kun je weer een nieuwe openen.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const question = interaction.options.getString('vraag', true).trim();
    const options = parseOptions(interaction.options.getString('opties', true));
    const unique = new Set(options.map((option) => option.toLowerCase()));

    if (
      options.length < 2 ||
      options.length > 5 ||
      unique.size !== options.length ||
      options.some((option) => option.length > 80)
    ) {
      return interaction.reply({
        content:
          "Gebruik 2 tot 5 verschillende opties van maximaal 80 tekens, gescheiden door komma's. " +
          'Bijvoorbeeld: `Ja, Nee, Misschien`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const poll = store.create({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      question,
      options,
      createdBy: interaction.user.id,
    });

    let sent;
    try {
      sent = await interaction.channel.send(buildView(poll));
    } catch (error) {
      store.remove(poll.id);
      return interaction.editReply({ content: `Kon de peiling niet plaatsen: ${error.message}` });
    }

    store.setMessage(poll.id, sent.id);
    cooldowns.set(interaction.user.id, now);

    await botLog.log(interaction.client, {
      title: '📊 Peiling geplaatst',
      description: `**${question}** in ${interaction.channel} door <@${interaction.user.id}>.`,
    });

    return interaction.editReply({
      content: `✅ Peiling staat in ${interaction.channel}. Iedereen kan stemmen; klik nog eens op je keuze om je stem in te trekken.`,
    });
  },
};
