/**
 * De ticketsoorten-editor achter /paneel → Ticketsoorten.
 * Je past hier de naam, omschrijving en de vragen per soort aan, en zet soorten
 * aan of uit voor het ticketpaneel.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const ticketTypes = require('./ticketTypes');
const { MAX_QUESTIONS, store } = require('./ticketTypeStore');

const FOOTER_NOTE =
  'Alles wordt bewaard in data/ticketTypes.json en blijft dus na een herstart staan.';

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

function awardedStyle(style) {
  return style === TextInputStyle.Paragraph ? 'lang' : 'kort';
}

function readStyle(text, fallback) {
  const clean = String(text ?? '').toLowerCase();
  if (/lang|paragraph|groot|uitgebreid|tekstvak/.test(clean)) return TextInputStyle.Paragraph;
  if (/kort|short|een\s*regel/.test(clean)) return TextInputStyle.Short;
  return fallback;
}

function readRequired(text, fallback) {
  const clean = String(text ?? '').trim().toLowerCase();
  if (/^(ja|j|yes|y|1|true|verplicht)$/.test(clean)) return true;
  if (/^(nee|n|no|0|false|optioneel|niet)$/.test(clean)) return false;
  return fallback;
}

function typeRows() {
  const types = ticketTypes.list();
  if (!types.length) return [];
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('aids:paneel:kies')
        .setPlaceholder('Kies een ticketsoort')
        .addOptions(
          types.map((type) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${type.enabled ? '✅' : '⛔'} ${type.label}`.slice(0, 100))
              .setValue(type.id)
              .setDescription(
                `${type.questions.length} ${type.questions.length === 1 ? 'vraag' : 'vragen'} · ${type.description}`.slice(
                  0,
                  100
                )
              )
          )
        )
    ),
  ];
}

function overviewView() {
  const types = ticketTypes.list();
  const lines = types.map(
    (type) =>
      `${type.enabled ? '✅' : '⛔'} ${type.emoji} **${type.label}** · ${type.questions.length} ${
        type.questions.length === 1 ? 'vraag' : 'vragen'
      }`
  );

  const content = [
    '**🧾 Ticketsoorten**',
    'Kies hieronder een soort om de naam, de omschrijving en de vragen aan te passen.',
    '✅ staat op het ticketpaneel, ⛔ is verborgen.',
    '',
    ...(lines.length ? lines : ['Er zijn nog geen soorten.']),
    '',
    FOOTER_NOTE,
  ].join('\n');

  return {
    content: content.slice(0, 2000),
    embeds: [],
    components: [
      ...typeRows(),
      new ActionRowBuilder().addComponents(
        button('aids:paneel:terug', 'Sluiten', '✖️', ButtonStyle.Secondary)
      ),
    ],
  };
}

function typeView(type) {
  const questions = type.questions.map(
    (question, index) =>
      `**${index + 1}.** ${question.label} _(${awardedStyle(question.style)}, ${
        question.required ? 'verplicht' : 'optioneel'
      })_`
  );

  const content = [
    `**${type.emoji} ${type.label}** — ${type.enabled ? 'staat op het paneel ✅' : 'verborgen ⛔'}`,
    type.description ? `_${type.description}_` : '',
    '',
    `Vragen (${type.questions.length}/${MAX_QUESTIONS}):`,
    ...questions,
    '',
    'Kies een vraag om hem aan te passen, of voeg er een toe.',
    FOOTER_NOTE,
  ]
    .filter((line) => line !== '')
    .join('\n');

  const questionSelect = new StringSelectMenuBuilder()
    .setCustomId(`aids:paneel:vraag:${type.id}`)
    .setPlaceholder('Kies een vraag om aan te passen')
    .addOptions(
      type.questions.map((question, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${index + 1}. ${question.label}`.slice(0, 100))
          .setValue(String(index))
          .setDescription(
            `${awardedStyle(question.style)} · ${question.required ? 'verplicht' : 'optioneel'}`.slice(0, 100)
          )
      )
    );

  return {
    content: content.slice(0, 2000),
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(questionSelect),
      new ActionRowBuilder().addComponents(
        button(`aids:paneel:typeinfo:${type.id}`, 'Naam & omschrijving', '✏️', ButtonStyle.Primary),
        button(`aids:paneel:vraagplus:${type.id}`, 'Vraag toevoegen', '➕', ButtonStyle.Success),
        button(`aids:paneel:vraagweg:${type.id}`, 'Laatste vraag weg', '🗑️', ButtonStyle.Danger),
        button(
          `aids:paneel:aanuit:${type.id}`,
          type.enabled ? 'Verberg op paneel' : 'Zet op paneel',
          type.enabled ? '⛔' : '✅',
          ButtonStyle.Secondary
        )
      ),
      new ActionRowBuilder().addComponents(
        button('aids:paneel:soorten', 'Terug naar soorten', '↩️', ButtonStyle.Secondary)
      ),
    ],
  };
}

function typeInfoModal(type) {
  return new ModalBuilder()
    .setCustomId(`aids:paneel:typeinfo:${type.id}`)
    .setTitle('Ticketsoort aanpassen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input('label', 'Naam van de soort', TextInputStyle.Short, 80, true, type.label)
      ),
      new ActionRowBuilder().addComponents(
        input('emoji', 'Emoji (mag leeg)', TextInputStyle.Short, 8, false, type.emoji)
      ),
      new ActionRowBuilder().addComponents(
        input('description', 'Korte omschrijving in de keuzelijst', TextInputStyle.Short, 100, false, type.description)
      ),
      new ActionRowBuilder().addComponents(
        input('title', 'Titel boven het invulvenster', TextInputStyle.Short, 45, true, type.title)
      )
    );
}

function questionModal(type, index = null) {
  const question = index === null ? null : type.questions[index];
  const customId =
    question === null
      ? `aids:paneel:vraagplus:${type.id}`
      : `aids:paneel:vraag:${type.id}:${index}`;

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(question === null ? 'Vraag toevoegen' : `Vraag ${index + 1} aanpassen`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        input('label', 'De vraag (max 45 tekens)', TextInputStyle.Short, 45, true, question?.label)
      ),
      new ActionRowBuilder().addComponents(
        input(
          'soort',
          'Soort: kort of lang',
          TextInputStyle.Short,
          10,
          false,
          question ? awardedStyle(question.style) : 'kort'
        )
      ),
      new ActionRowBuilder().addComponents(
        input(
          'verplicht',
          'Verplicht: ja of nee',
          TextInputStyle.Short,
          5,
          false,
          question ? (question.required ? 'ja' : 'nee') : 'ja'
        )
      )
    );
}

/** Bewerkt het privéscherm; lukt dat niet, dan een gewoon privébericht. */
async function refresh(interaction, payload) {
  try {
    await interaction.update(payload);
  } catch {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function handleSelect(interaction, action) {
  if (action === 'kies') {
    const type = ticketTypes.get(interaction.values?.[0]);
    if (!type) {
      return refresh(interaction, { content: 'Die soort bestaat niet meer.', embeds: [], components: [] });
    }
    return refresh(interaction, typeView(type));
  }

  if (action === 'vraag') {
    const type = ticketTypes.get((interaction.customId || '').split(':')[3]);
    if (!type) {
      return refresh(interaction, { content: 'Die soort bestaat niet meer.', embeds: [], components: [] });
    }
    const index = Number(interaction.values?.[0]);
    if (!type.questions[index]) {
      return refresh(interaction, typeView(type));
    }
    return interaction.showModal(questionModal(type, index));
  }

  return undefined;
}

async function handleButton(interaction, action, rest = []) {
  const id = rest[0];

  if (action === 'soorten') {
    return refresh(interaction, overviewView());
  }

  if (action === 'terug') {
    return refresh(interaction, { content: 'Soorten-editor gesloten.', embeds: [], components: [] });
  }

  const type = ticketTypes.get(id);
  if (!type) {
    return refresh(interaction, { content: 'Die soort bestaat niet meer.', embeds: [], components: [] });
  }

  if (action === 'typeinfo') {
    return interaction.showModal(typeInfoModal(type));
  }

  if (action === 'vraagplus') {
    return interaction.showModal(questionModal(type));
  }

  if (action === 'aanuit') {
    store.setField(type.id, { enabled: !type.enabled });
    const updated = ticketTypes.get(type.id);
    return refresh(interaction, {
      ...typeView(updated),
      content: `${updated.enabled ? '✅ Staat weer op het paneel.' : '⛔ Staat niet meer op het paneel.'}\n\n${typeView(updated).content}`.slice(0, 2000),
    });
  }

  if (action === 'vraagweg') {
    const last = type.questions.length - 1;
    if (last < 0) return refresh(interaction, typeView(type));

    const label = type.questions[last].label;
    const result = store.removeQuestion(type.id, last);
    if (result.error) {
      return refresh(interaction, {
        ...typeView(type),
        content: `⚠️ ${result.error}\n\n${typeView(type).content}`.slice(0, 2000),
      });
    }

    const updated = ticketTypes.get(type.id);
    return refresh(interaction, {
      ...typeView(updated),
      content: `🗑️ Vraag ${last + 1} ("${label}") is weg.\n\n${typeView(updated).content}`.slice(0, 2000),
    });
  }

  return undefined;
}

async function handleModal(interaction, action, rest = []) {
  const id = rest[0];
  const type = ticketTypes.get(id);
  if (!type) {
    return refresh(interaction, { content: 'Die soort bestaat niet meer.', embeds: [], components: [] });
  }

  const read = (field) => interaction.fields.getTextInputValue(field).trim();

  if (action === 'typeinfo') {
    store.setField(type.id, {
      label: read('label'),
      emoji: read('emoji'),
      description: read('description'),
      title: read('title'),
    });
    const updated = ticketTypes.get(type.id);
    return refresh(interaction, {
      ...typeView(updated),
      content: `✅ Opgeslagen.\n\n${typeView(updated).content}`.slice(0, 2000),
    });
  }

  if (action === 'vraagplus') {
    const result = store.addQuestion(type.id, {
      label: read('label'),
      style: readStyle(read('soort'), TextInputStyle.Short),
      required: readRequired(read('verplicht'), true),
    });

    if (result.error) {
      return refresh(interaction, {
        ...typeView(type),
        content: `⚠️ ${result.error}\n\n${typeView(type).content}`.slice(0, 2000),
      });
    }

    const updated = ticketTypes.get(type.id);
    return refresh(interaction, {
      ...typeView(updated),
      content: `✅ Vraag toegevoegd.\n\n${typeView(updated).content}`.slice(0, 2000),
    });
  }

  if (action === 'vraag') {
    const index = Number(rest[1]);
    if (!type.questions[index]) return refresh(interaction, typeView(type));

    store.setQuestion(type.id, index, {
      label: read('label'),
      style: readStyle(read('soort'), type.questions[index].style),
      required: readRequired(read('verplicht'), type.questions[index].required),
    });

    const updated = ticketTypes.get(type.id);
    return refresh(interaction, {
      ...typeView(updated),
      content: `✅ Vraag ${index + 1} bijgewerkt.\n\n${typeView(updated).content}`.slice(0, 2000),
    });
  }

  return undefined;
}

module.exports = {
  overviewView,
  typeView,
  typeInfoModal,
  questionModal,
  handleSelect,
  handleButton,
  handleModal,
};
