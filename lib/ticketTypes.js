/**
 * De soorten tickets en de vragen die erbij horen.
 * Bij "Ticket aanmaken" kies je eerst een soort; daarna krijg je alleen de
 * vragen die voor die soort tellen.
 */

const {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const TYPES = [
  {
    id: 'sollicitatie',
    label: 'Sollicitatie',
    emoji: '🎯',
    description: 'Je wilt lid worden of een rol oppakken',
    title: 'Aanvraag: sollicitatie',
    questions: [
      {
        id: 'naam',
        label: 'Je Arma-naam en hoe we je kennen',
        style: TextInputStyle.Short,
        maxLength: 120,
        required: true,
      },
      {
        id: 'ervaring',
        label: 'Hoeveel uur Arma, welke mods en rollen?',
        style: TextInputStyle.Paragraph,
        maxLength: 900,
        required: true,
      },
      {
        id: 'beschikbaar',
        label: 'Wanneer kun je meestal spelen?',
        style: TextInputStyle.Short,
        maxLength: 200,
        required: false,
      },
    ],
  },
  {
    id: 'klacht',
    label: 'Klacht over een lid',
    emoji: '⚠️',
    description: 'Iemand ging te ver, of je wilt iets melden',
    title: 'Aanvraag: klacht',
    questions: [
      {
        id: 'tegen',
        label: 'Over wie gaat het (Arma- of Discord-naam)?',
        style: TextInputStyle.Short,
        maxLength: 120,
        required: true,
      },
      {
        id: 'wat',
        label: 'Wat is er precies gebeurd?',
        style: TextInputStyle.Paragraph,
        maxLength: 1200,
        required: true,
      },
      {
        id: 'wanneer',
        label: 'Wanneer was het, en heb je bewijs (clip/screenshot)?',
        style: TextInputStyle.Short,
        maxLength: 300,
        required: false,
      },
    ],
  },
  {
    id: 'unban',
    label: 'Unban-aanvraag',
    emoji: '🔓',
    description: 'Je bent geband en vraagt om terug te mogen',
    title: 'Aanvraag: unban',
    questions: [
      {
        id: 'naam',
        label: 'Je Arma- en Discord-naam',
        style: TextInputStyle.Short,
        maxLength: 120,
        required: true,
      },
      {
        id: 'steam',
        label: 'Steam-ID of spelersnaam op de server',
        style: TextInputStyle.Short,
        maxLength: 120,
        required: true,
      },
      {
        id: 'waarom',
        label: 'Waarom zou je unbanned mogen worden?',
        style: TextInputStyle.Paragraph,
        maxLength: 1200,
        required: true,
      },
    ],
  },
  {
    id: 'technisch',
    label: 'Technisch probleem',
    emoji: '🛠️',
    description: 'Mods, crashes, verbinding of de server',
    title: 'Aanvraag: technisch probleem',
    questions: [
      {
        id: 'probleem',
        label: 'Wat gaat er mis? (foutmelding mag je plakken)',
        style: TextInputStyle.Paragraph,
        maxLength: 1200,
        required: true,
      },
      {
        id: 'sinds',
        label: 'Sinds wanneer, en bij welke kaart of mod?',
        style: TextInputStyle.Short,
        maxLength: 200,
        required: false,
      },
      {
        id: 'geprobeerd',
        label: 'Wat heb je zelf al geprobeerd?',
        style: TextInputStyle.Paragraph,
        maxLength: 900,
        required: false,
      },
    ],
  },
];

function list() {
  return TYPES;
}

function get(id) {
  return TYPES.find((type) => type.id === id) ?? null;
}

/** De keuzelijst onder "Ticket aanmaken". */
function selectMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId('aids:ticket:type')
    .setPlaceholder('Waarvoor is je ticket?')
    .addOptions(
      TYPES.map((type) => ({
        label: type.label,
        value: type.id,
        description: type.description,
        emoji: type.emoji,
      }))
    );
}

/** Het invulvenster met alleen de vragen van dit type. */
function formModal(type) {
  const modal = new ModalBuilder().setCustomId(`aids:ticket:form:${type.id}`).setTitle(type.title);

  for (const question of type.questions) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(question.id)
          .setLabel(question.label.slice(0, 45))
          .setStyle(question.style)
          .setMaxLength(question.maxLength)
          .setRequired(question.required)
      )
    );
  }

  return modal;
}

/** Leest de antwoorden uit het ingevulde venster. */
function readAnswers(interaction, type) {
  return type.questions
    .map((question) => ({
      label: question.label,
      value: interaction.fields.getTextInputValue(question.id).trim(),
    }))
    .filter((answer) => answer.value);
}

module.exports = { list, get, selectMenu, formModal, readAnswers };
