/**
 * Het /paneel-menu: ticketpaneel plaatsen of zelf een embed maken en sturen.
 * Toegankelijk voor de rol die in /beheer → Toegang is ingesteld.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
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
        'en voettekst. Hij komt in het kanaal waar je `/paneel` typt.'
    )
    .setFooter({ text: FOOTER });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button('aids:paneel:ticket', 'Ticketpaneel plaatsen', '🎫', ButtonStyle.Primary),
        button('aids:paneel:embed', 'Embed sturen', '✉️', ButtonStyle.Success)
      ),
    ],
  };
}

function composerModal() {
  return new ModalBuilder()
    .setCustomId('aids:paneel:modal')
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

async function handleButton(interaction, action) {
  if (!canPaneel(interaction)) return denied(interaction);

  if (action === 'ticket') return tickets.sendPanel(interaction);
  if (action === 'embed') return interaction.showModal(composerModal());

  return undefined;
}

async function handleModal(interaction) {
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

  try {
    await interaction.channel.send({ embeds: [embed] });
  } catch (error) {
    return interaction.reply({
      content: `Kon de embed niet plaatsen: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `✅ Embed geplaatst in ${interaction.channel}.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  COLOR,
  paneelView,
  composerModal,
  handleButton,
  handleModal,
};
