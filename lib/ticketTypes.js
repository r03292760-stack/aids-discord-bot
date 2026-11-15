/**
 * De soorten tickets en de vragen die erbij horen.
 * De lijst staat in data/ticketTypes.json (zie ticketTypeStore.js) en is via
 * /paneel → Ticketsoorten aan te passen.
 */

const {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { MAX_QUESTIONS, store } = require('./ticketTypeStore');

/** Alle soorten, ook de verborgen. */
function list() {
  return store.list();
}

/** Soorten die op het ticketpaneel staan. */
function enabled() {
  return store.list().filter((type) => type.enabled);
}

function get(id) {
  return store.get(id);
}

/** De keuzelijst onder "Ticket aanmaken". */
function selectMenu() {
  const types = enabled();
  const menu = new StringSelectMenuBuilder()
    .setCustomId('aids:ticket:type')
    .setPlaceholder(types.length ? 'Waarvoor is je ticket?' : 'Er staan geen soorten aan');

  if (!types.length) {
    return menu.addOptions({ label: 'Nog geen soorten ingesteld', value: 'geen' });
  }

  return menu.addOptions(
    types.map((type) => ({
      label: type.label,
      value: type.id,
      description: type.description || undefined,
      emoji: type.emoji || undefined,
    }))
  );
}

/** Het invulvenster met alleen de vragen van dit type. */
function formModal(type) {
  const modal = new ModalBuilder().setCustomId(`aids:ticket:form:${type.id}`).setTitle(type.title);

  for (const question of (type.questions ?? []).slice(0, MAX_QUESTIONS)) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(question.id)
          .setLabel(String(question.label).slice(0, 45))
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
  return (type.questions ?? [])
    .map((question) => ({
      label: question.label,
      value: interaction.fields.getTextInputValue(question.id).trim(),
    }))
    .filter((answer) => answer.value);
}

module.exports = { list, enabled, get, selectMenu, formModal, readAnswers };
