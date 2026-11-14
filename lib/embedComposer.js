/**
 * Het /paneel-menu: ticketpaneel plaatsen of zelf een embed maken en sturen.
 * Toegankelijk voor de rol die in /beheer → Toegang is ingesteld.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const tickets = require('./tickets');
const { ORANGE, parseColor, normalizeColor } = require('./embeds');
const { canPaneel, deniedMessage } = require('./permissions');

const COLOR = 0xd65c1e;
const FOOTER = 'Airborne Insertion Direct Seizure · paneel';

function button(id, label, emoji, style = ButtonStyle.Secondary) {
  const builder = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) builder.setEmoji(emoji);
  return builder;
}

function denied(interaction) {
  return interaction.reply({
    content: deniedMessage('paneel'),
    flags: MessageFlags.Ephemeral,
  });
}

function paneelView() {
  const embed = new EmbedBuilder()
    .setTitle('🛠️ Paneel')
    .setColor(COLOR)
    .setDescription(
      '**Ticketpaneel plaatsen** zet het ticketbericht met de aanmaakknop in dit kanaal.\n\n' +
        '**Embed sturen** laat je zelf een bericht maken met titel, tekst, kleur, afbeelding ' +
        'en voettekst. Hij komt in het kanaal waar je `/paneel` typt.\n\n' +
        'Wil je hem ergens anders neerzetten? Kies hieronder het **doelkanaal** en het ' +
        'invulvenster opent meteen voor dat kanaal.'
    )
    .setFooter({ text: FOOTER });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button('aids:paneel:ticket', 'Ticketpaneel plaatsen', '🎫', ButtonStyle.Primary),
        button('aids:paneel:embed', 'Embed sturen', '✉️', ButtonStyle.Success)
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('aids:paneel:kanaal')
          .setPlaceholder('Embed sturen naar een ander kanaal…')
          .setMinValues(1)
          .setMaxValues(1)
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
    ],
  };
}

function composerModal(channelId) {
  return new ModalBuilder()
    .setCustomId(`aids:paneel:modal:${channelId}`)
    .setTitle('Embed maken')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('titel')
          .setLabel('Titel')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('tekst')
          .setLabel('Tekst')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('kleur')
          .setLabel('Kleur als hex, bijv. D65C1E (mag leeg)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(7)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('afbeelding')
          .setLabel('Afbeelding-URL (https, mag leeg)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(500)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('footer')
          .setLabel('Voettekst (mag leeg)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2000)
          .setRequired(false)
      )
    );
}

/** Haalt het doelkanaal op en controleert of de bot er mag posten. */
async function resolveChannel(interaction, channelId) {
  if (!channelId || !interaction.guild) return null;

  const channel =
    interaction.guild.channels.cache.get(channelId) ||
    (await interaction.guild.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isTextBased()) return null;

  const me = interaction.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (
    !perms ||
    !perms.has(PermissionFlagsBits.SendMessages) ||
    !perms.has(PermissionFlagsBits.EmbedLinks)
  ) {
    return null;
  }

  return channel;
}

async function handleButton(interaction, action) {
  if (!canPaneel(interaction)) return denied(interaction);

  if (action === 'ticket') return tickets.sendPanel(interaction);
  if (action === 'embed') return interaction.showModal(composerModal(interaction.channelId));

  return undefined;
}

/** Doelkanaal gekozen in de dropdown: meteen het invulvenster openen. */
async function handleSelect(interaction) {
  if (!canPaneel(interaction)) return denied(interaction);

  const channel = await resolveChannel(interaction, interaction.values?.[0]);
  if (!channel) {
    return interaction.reply({
      content:
        'Dat kanaal kan ik niet gebruiken. Kies een tekstkanaal waar ik berichten en ' +
        'embeds mag plaatsen.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.showModal(composerModal(channel.id));
}

async function handleModal(interaction, channelId) {
  if (!canPaneel(interaction)) return denied(interaction);

  const read = (id) => interaction.fields.getTextInputValue(id).trim();

  const kleur = read('kleur');
  const color = kleur ? normalizeColor(kleur) : null;
  if (kleur && !color) {
    return interaction.reply({
      content: 'Die kleur klopt niet. Gebruik zes tekens, bijvoorbeeld `D65C1E`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const afbeelding = read('afbeelding');
  if (afbeelding && !/^https?:\/\//i.test(afbeelding)) {
    return interaction.reply({
      content: 'De afbeelding-URL moet met `https://` beginnen.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(read('titel'))
    .setDescription(read('tekst'))
    .setColor(color ? parseColor(color) : ORANGE)
    .setTimestamp();

  const footer = read('footer');
  if (footer) embed.setFooter({ text: footer });
  if (afbeelding) embed.setImage(afbeelding);

  const target =
    (await resolveChannel(interaction, channelId)) ||
    (await resolveChannel(interaction, interaction.channelId));
  if (!target) {
    return interaction.reply({
      content:
        'Ik kan nergens posten: het gekozen kanaal bestaat niet meer of ik mis rechten. ' +
        'Kies een ander kanaal in het menu.',
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    await target.send({ embeds: [embed] });
  } catch (error) {
    return interaction.reply({
      content: `Kon de embed niet plaatsen: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `✅ Embed geplaatst in ${target}.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  COLOR,
  paneelView,
  composerModal,
  handleButton,
  handleSelect,
  handleModal,
};
