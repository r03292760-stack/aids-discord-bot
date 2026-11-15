/**
 * De embedbouwer achter /paneel: embed opstellen en versturen, plus de
 * subpanelen (opkomst, agenda, ticketsoorten).
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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const agenda = require('./agenda');
const opkomst = require('./opkomst');
const ticketEditor = require('./ticketEditor');
const ticketTypes = require('./ticketTypes');

const DRAFT = 'aids:paneel:concept';
const MAX_DRAFTS = 500;

/** Conceptembeds per gebruiker (per bericht bewaard in geheugen). */
const drafts = new Map();

const COLORS = [
  { label: 'A.I.D.S.-groen', value: '5763719' },
  { label: 'Rotorblauw', value: '3447003' },
  { label: 'Waarschuwingsrood', value: '15548997' },
  { label: 'Zandgeel', value: '16705372' },
  { label: 'Zwart', value: '2895667' },
  { label: 'Wit', value: '16777215' },
];

function draftFor(interaction) {
  const key = interaction.user.id;
  if (!drafts.has(key)) {
    if (drafts.size >= MAX_DRAFTS) drafts.clear();
    drafts.set(key, { title: '', description: '', color: COLORS[0].value, image: '', footer: '' });
  }
  return drafts.get(key);
}

/** Menu van /paneel. */
function panelView() {
  return {
    content: [
      '**🛠️ Paneel**',
      'Waar wil je aan werken? Alles blijft binnen Discord, er is geen website nodig.',
      '',
      '**🎫 Ticketpaneel** · het bericht met de knop waarmee leden een ticket openen.',
      '**🖼️ Embed sturen** · zelf een aankondiging of uitleg plaatsen.',
      '**📋 Opkomst** · wie doet er mee, met rollen en teller.',
      '**🗓️ Agenda** · vaste trainingsavonden en tijden per weekdag.',
      '**🧾 Ticketsoorten** · soorten toevoegen, aanpassen en vragen op volgorde zetten.',
    ].join('\n'),
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        button('aids:paneel:ticketpaneel', 'Ticketpaneel', '🎫', ButtonStyle.Primary),
        button('aids:paneel:embed', 'Embed sturen', '🖼️', ButtonStyle.Secondary),
        button('aids:paneel:opkomst', 'Opkomst', '📋', ButtonStyle.Secondary),
        button('aids:paneel:agenda', 'Agenda', '🗓️', ButtonStyle.Secondary),
        button('aids:paneel:soorten', 'Ticketsoorten', '🧾', ButtonStyle.Secondary)
      ),
    ],
  };
}

function button(id, label, emoji, style = ButtonStyle.Secondary) {
  const builder = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) builder.setEmoji(emoji);
  return builder;
}

function input(customId, label, style, maxLength, required, value) {
  const builder = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(String(label).slice(0, 45))
    .setStyle(style)
    .setMaxLength(maxLength)
    .setRequired(required);
  if (value) builder.setValue(String(value).slice(0, maxLength));
  return builder;
}

function draftView(interaction) {
  const draft = draftFor(interaction);
  const embed = new EmbedBuilder()
    .setTitle(draft.title || 'Nog geen titel')
    .setDescription(draft.description || 'Nog geen tekst. Kies **Tekst** om iets te schrijven.')
    .setColor(Number(draft.color));

  if (draft.image) embed.setImage(draft.image);
  if (draft.footer) embed.setFooter({ text: draft.footer });

  const colorLabel = COLORS.find((color) => color.value === draft.color)?.label ?? 'Kleur';

  return {
    content: [
      '**🖼️ Embed**',
      'Zo ziet hij eruit. Kies hieronder wat je wilt aanpassen, of stuur hem naar een kanaal.',
      '',
      '⚠️ Een afbeelding moet een directe link zijn (eindigt op .png, .jpg of .gif).',
    ].join('\n'),
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button('aids:embed:titel', 'Titel', '📝', ButtonStyle.Secondary),
        button('aids:embed:tekst', 'Tekst', '✏️', ButtonStyle.Secondary),
        button('aids:embed:kleur', 'Kleur', '🎨', ButtonStyle.Secondary),
        button('aids:embed:afbeelding', 'Afbeelding', '🖼️', ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        button('aids:embed:voettekst', 'Voettekst', '🔻', ButtonStyle.Secondary),
        button('aids:embed:voorbeeld', 'Voorbeeld', '👁️', ButtonStyle.Secondary),
        button('aids:embed:wis', 'Leegmaken', '🧹', ButtonStyle.Danger),
        button(`aids:embed:plaats:kleur:${draft.color}`, colorLabel, '🎨', ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('aids:embed:kanaal')
          .setPlaceholder('Kies het kanaal en verstuur')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        button('aids:paneel:terug', 'Terug naar paneel', '↩️', ButtonStyle.Secondary)
      ),
    ],
  };
}

function embedModal(field) {
  const modal = new ModalBuilder().setCustomId(`${DRAFT}:${field}`).setTitle('Embed aanpassen');

  const fields = {
    titel: [input('waarde', 'Titel', TextInputStyle.Short, 256, false)],
    tekst: [input('waarde', 'Tekst', TextInputStyle.Paragraph, 4000, false)],
    kleur: [input('waarde', 'Kleur als hex, bijvoorbeeld #57f287', TextInputStyle.Short, 7, false)],
    afbeelding: [input('waarde', 'Directe link naar de afbeelding', TextInputStyle.Short, 400, false)],
    voettekst: [input('waarde', 'Voettekst', TextInputStyle.Short, 2048, false)],
  };

  for (const component of fields[field] ?? []) {
    modal.addComponents(new ActionRowBuilder().addComponents(component));
  }

  return modal;
}

async function handleButton(interaction, action, rest = []) {
  // Ticketsoorten-editor (soorten toevoegen, volgorde van vragen, aan/uit).
  if (
    [
      'soorten',
      'nieuwtype',
      'typeinfo',
      'vraagplus',
      'vraagweg',
      'aanuit',
      'omhoog',
      'omlaag',
      'terug',
    ].includes(action)
  ) {
    return ticketEditor.handleButton(interaction, action, rest);
  }

  if (action === 'terug') {
    return interaction.update(panelView());
  }

  return undefined;
}

async function handleSelect(interaction, action, rest = []) {
  if (action === 'kies' || action === 'vraag' || action === 'kiesvraag') {
    return ticketEditor.handleSelect(interaction, action, rest);
  }

  return undefined;
}

async function handleModal(interaction, action, rest = []) {
  if (['nieuwtype', 'typeinfo', 'vraagplus', 'vraag'].includes(action)) {
    return ticketEditor.handleModal(interaction, action, rest);
  }

  return undefined;
}

module.exports = {
  panelView,
  draftView,
  embedModal,
  handleButton,
  handleSelect,
  handleModal,
  COLORS,
};
