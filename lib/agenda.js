/**
 * Agenda: één bericht waarin iedereen zelf zet wanneer hij kan.
 * De paneelrol plaatst de agenda; elk lid kiest zijn dagen en blokken van 2 uur.
 * Alles blijft staan in data/agenda.json, dus ook na een herstart.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const store = require('./agendaStore');
const { ORANGE } = require('./embeds');
const { canPaneel, deniedMessage } = require('./permissions');

const FOOTER = 'Airborne Insertion Direct Seizure · agenda';
const MAX_LINES = 20;

const DAY_LABELS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

const ALIASES = {
  ma: 0, maa: 0, maan: 0, maandag: 0,
  di: 1, din: 1, dins: 1, dinsdag: 1,
  wo: 2, woe: 2, woensdag: 2,
  do: 3, don: 3, donder: 3, donderdag: 3,
  vr: 4, vrij: 4, vrijdag: 4,
  za: 5, zat: 5, zaterdag: 5,
  zo: 6, zon: 6, zondag: 6,
};

/** Blokken van twee uur, in de volgorde waarin ze in het menu staan. */
const BLOCKS = [
  { start: 14, end: 16 },
  { start: 16, end: 18 },
  { start: 18, end: 20 },
  { start: 20, end: 22 },
  { start: 22, end: 24 },
  { start: 0, end: 2 },
];

/** Ingekozen blokken van deze sessie, per lid en agenda. Alleen voor het keuzescherm. */
const pending = new Map();

function button(id, label, emoji, style) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
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

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function hhmm(hour) {
  return `${String(hour % 24).padStart(2, '0')}:00`;
}

function blockLabel(block) {
  return `${hhmm(block.start)} - ${hhmm(block.end)}`;
}

/** Minuten sinds middernacht; 00:00 als eindtijd telt als 24:00. */
function blockMinutes(block) {
  return { start: block.start * 60, end: block.end * 60 };
}

function denied(interaction) {
  return interaction.reply({ content: deniedMessage('paneel'), flags: MessageFlags.Ephemeral });
}

/** "ma, wo, za", "weekend", "elke dag" → [0, 2, 5]. Onbekend → null. */
function parseDays(text) {
  const clean = String(text ?? '')
    .toLowerCase()
    .replace(/[.]/g, ' ');

  if (/heel de week|hele week|elke dag|alle dagen|iedere dag/.test(clean)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  const days = new Set();
  for (const token of clean.split(/[^a-z]+/).filter(Boolean)) {
    if (token === 'weekend') {
      days.add(5);
      days.add(6);
      continue;
    }
    if (token === 'week' || token === 'werkweek' || token === 'doorweek') {
      [0, 1, 2, 3, 4].forEach((day) => days.add(day));
      continue;
    }
    const day = ALIASES[token];
    if (day !== undefined) days.add(day);
  }

  const sorted = [...days].sort((a, b) => a - b);
  return sorted.length ? sorted : null;
}

function daysText(days) {
  return (days ?? []).map((day) => DAY_SHORT[day]).join(', ');
}

/** [2, 3] → "18:00-22:00". Aaneensluitende blokken worden één tijdvak. */
function timesText(indices) {
  const chosen = [...new Set(indices ?? [])].map(Number).filter((i) => BLOCKS[i]).sort((a, b) => a - b);
  if (!chosen.length) return '';

  const parts = [];
  let runStart = chosen[0];
  let runEnd = chosen[0];

  for (const index of chosen.slice(1)) {
    if (index === runEnd + 1) {
      runEnd = index;
      continue;
    }
    parts.push(`${hhmm(BLOCKS[runStart].start)}-${hhmm(BLOCKS[runEnd].end)}`);
    runStart = index;
    runEnd = index;
  }
  parts.push(`${hhmm(BLOCKS[runStart].start)}-${hhmm(BLOCKS[runEnd].end)}`);

  return parts.join(', ');
}

/** "18:00-22:00, 00:00-02:00" → bloknummers [2, 3, 5]. */
function blocksFromTimes(times) {
  const ranges = [];
  const pattern = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/g;
  let match = pattern.exec(String(times ?? ''));

  while (match) {
    const start = Number(match[1]) * 60 + Number(match[2]);
    let end = Number(match[3]) * 60 + Number(match[4]);
    if (end <= start) end += 24 * 60;
    ranges.push({ start, end });
    match = pattern.exec(String(times ?? ''));
  }

  const chosen = [];
  BLOCKS.forEach((block, index) => {
    const minutes = blockMinutes(block);
    const inside = ranges.some(
      ({ start, end }) =>
        (minutes.start >= start && minutes.end <= end) ||
        (minutes.start + 24 * 60 >= start && minutes.end + 24 * 60 <= end)
    );
    if (inside) chosen.push(index);
  });
  return chosen;
}

/* ------------------------------ keuzescherm ----------------------------- */

function stateFor(agenda, userId) {
  const key = `${agenda.id}:${userId}`;
  if (!pending.has(key)) {
    const own = agenda.entries?.[userId];
    pending.set(key, {
      days: new Set(own?.days ?? []),
      blocks: new Set(blocksFromTimes(own?.times)),
      note: own?.note ?? '',
    });
  }
  return pending.get(key);
}

function daySelect(agenda, state) {
  return new StringSelectMenuBuilder()
    .setCustomId(`aids:agenda:dag:${agenda.id}`)
    .setPlaceholder('Kies je dagen')
    .setMinValues(1)
    .setMaxValues(DAY_LABELS.length)
    .addOptions(
      DAY_LABELS.map((label, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(capitalise(label))
          .setValue(String(index))
          .setDefault(state.days.has(index))
      )
    );
}

function timeSelect(agenda, state) {
  return new StringSelectMenuBuilder()
    .setCustomId(`aids:agenda:tijd:${agenda.id}`)
    .setPlaceholder('Kies tijdsblokken van 2 uur')
    .setMinValues(1)
    .setMaxValues(BLOCKS.length)
    .addOptions(
      BLOCKS.map((block, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(blockLabel(block))
          .setValue(String(index))
          .setDefault(state.blocks.has(index))
      )
    );
}

function panelFor(agenda, state) {
  const days = [...state.days].sort((a, b) => a - b);
  const times = timesText([...state.blocks]);

  const content = [
    `**Wanneer kun je?** — ${agenda.title}`,
    'Kies je dagen en de blokken van 2 uur waarin je kunt, en klik daarna op **Opslaan**.',
    '',
    `📆 Dagen: ${days.length ? days.map((day) => capitalise(DAY_LABELS[day])).join(', ') : '*nog niets gekozen*'}`,
    `🕗 Tijden: ${times || '*nog niets gekozen*'}`,
    `📝 Opmerking: ${state.note || '*geen*'}`,
  ].join('\n');

  return {
    content,
    components: [
      new ActionRowBuilder().addComponents(daySelect(agenda, state)),
      new ActionRowBuilder().addComponents(timeSelect(agenda, state)),
      new ActionRowBuilder().addComponents(
        button(`aids:agenda:opslaan:${agenda.id}`, 'Opslaan', '✅', ButtonStyle.Success),
        button(`aids:agenda:notitie:${agenda.id}`, 'Opmerking', '📝', ButtonStyle.Secondary),
        button(`aids:agenda:stop:${agenda.id}`, 'Annuleren', '✖️', ButtonStyle.Secondary)
      ),
    ],
  };
}

/* ------------------------------- vensters ------------------------------ */

function makerModal() {
  return new ModalBuilder()
    .setCustomId('aids:agenda:maak')
    .setTitle('Agenda plaatsen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input('titel', 'Titel (bijv. Wie kan wanneer deze week?)', TextInputStyle.Short, 100, true)
      ),
      new ActionRowBuilder().addComponents(
        input('uitleg', 'Extra uitleg (mag leeg)', TextInputStyle.Paragraph, 800, false)
      )
    );
}

function noteModal(agenda, note) {
  return new ModalBuilder()
    .setCustomId(`aids:agenda:notitie:${agenda.id}`)
    .setTitle('Opmerking bij je agenda')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input('opmerking', 'Bijv. na 22:00 liever niet', TextInputStyle.Short, 150, false, note)
      )
    );
}

/* -------------------------------- embed -------------------------------- */

function buildEmbed(agenda) {
  const entries = Object.entries(agenda.entries ?? {});

  const embed = new EmbedBuilder()
    .setTitle(`📅 ${agenda.title}`)
    .setColor(ORANGE)
    .setDescription(
      (agenda.notes ? `${agenda.notes}\n\n` : '') +
        `**${entries.length}** ${entries.length === 1 ? 'lid heeft' : 'leden hebben'} iets ingevuld.\n` +
        'Klik op **Beschikbaarheid doorgeven**, kies je dagen en de blokken van 2 uur, ' +
        'en klik op **Opslaan**. Opnieuw invullen overschrijft wat je eerder zei.'
    )
    .setFooter({ text: FOOTER })
    .setTimestamp(new Date(agenda.createdAt || Date.now()));

  const fields = [];
  for (let day = 0; day < 7; day += 1) {
    const people = entries.filter(([, value]) => (value.days ?? []).includes(day));
    if (!people.length) continue;

    const lines = people
      .slice(0, MAX_LINES)
      .map(([userId, value]) => `<@${userId}> · ${value.times}${value.note ? ` — ${value.note}` : ''}`);
    if (people.length > MAX_LINES) lines.push(`… en ${people.length - MAX_LINES} meer`);

    fields.push({
      name: `${DAY_LABELS[day]} (${people.length})`,
      value: lines.join('\n').slice(0, 1024),
    });
  }

  if (!fields.length) {
    fields.push({
      name: 'Nog niemand',
      value: 'Klik op **Beschikbaarheid doorgeven** en kies je dagen en tijdsblokken.',
    });
  }

  return embed.addFields(fields);
}

function agendaRow(agenda) {
  return new ActionRowBuilder().addComponents(
    button(`aids:agenda:zet:${agenda.id}`, 'Beschikbaarheid doorgeven', '📝', ButtonStyle.Primary),
    button(`aids:agenda:wis:${agenda.id}`, 'Mijn invoer wissen', '🧹', ButtonStyle.Secondary)
  );
}

function messageFor(agenda) {
  return { embeds: [buildEmbed(agenda)], components: [agendaRow(agenda)] };
}

/* -------------------------------- acties ------------------------------- */

async function refresh(interaction, agenda) {
  const channel =
    interaction.channel ?? (await interaction.guild?.channels.fetch(agenda.channelId).catch(() => null));
  if (!channel || !agenda.messageId) return;

  const message = await channel.messages.fetch(agenda.messageId).catch(() => null);
  if (message) await message.edit(messageFor(agenda)).catch(() => {});
}

/** Bewerkt het privé-keuzescherm; lukt dat niet, dan een gewoon privébericht. */
async function updatePanel(interaction, payload) {
  try {
    await interaction.update(payload);
  } catch {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function handleModal(interaction, sub, id) {
  const read = (field) => interaction.fields.getTextInputValue(field).trim();

  if (sub === 'maak') {
    if (!canPaneel(interaction)) return denied(interaction);

    const agenda = store.create({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: null,
      title: read('titel'),
      notes: read('uitleg'),
      createdBy: interaction.user.id,
    });

    let sent;
    try {
      sent = await interaction.channel.send(messageFor(agenda));
    } catch (error) {
      return interaction.reply({
        content: `Kon de agenda niet plaatsen: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    agenda.messageId = sent.id;
    store.save();

    return interaction.reply({
      content: `✅ Agenda geplaatst in ${interaction.channel}. Iedereen kan nu zijn dagen invullen.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'notitie') {
    const agenda = store.get(id);
    if (!agenda) {
      return interaction.reply({
        content: 'Deze agenda bestaat niet meer.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const state = stateFor(agenda, interaction.user.id);
    state.note = read('opmerking');
    return updatePanel(interaction, panelFor(agenda, state));
  }

  return undefined;
}

async function handleSelect(interaction, action, id) {
  const agenda = store.get(id);
  if (!agenda) {
    return interaction.reply({
      content: 'Deze agenda bestaat niet meer. Plaats een nieuwe via `/paneel`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const state = stateFor(agenda, interaction.user.id);
  const values = interaction.values ?? [];

  if (action === 'dag') state.days = new Set(values.map(Number));
  else if (action === 'tijd') state.blocks = new Set(values.map(Number));
  else return undefined;

  return updatePanel(interaction, panelFor(agenda, state));
}

async function handleButton(interaction, action, id) {
  if (action === 'nieuw') {
    if (!canPaneel(interaction)) return denied(interaction);
    return interaction.showModal(makerModal());
  }

  const agenda = store.get(id);
  if (!agenda) {
    return interaction.reply({
      content: 'Deze agenda bestaat niet meer. Plaats een nieuwe via `/paneel`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'zet') {
    pending.delete(`${agenda.id}:${interaction.user.id}`);
    const state = stateFor(agenda, interaction.user.id);
    return interaction.reply({ ...panelFor(agenda, state), flags: MessageFlags.Ephemeral });
  }

  if (action === 'notitie') {
    const state = stateFor(agenda, interaction.user.id);
    return interaction.showModal(noteModal(agenda, state.note));
  }

  if (action === 'stop') {
    pending.delete(`${agenda.id}:${interaction.user.id}`);
    return updatePanel(interaction, { content: 'Afgebroken, er is niets opgeslagen.', components: [] });
  }

  if (action === 'opslaan') {
    const state = stateFor(agenda, interaction.user.id);
    const days = [...state.days].sort((a, b) => a - b);
    const times = timesText([...state.blocks]);

    if (!days.length || !times) {
      return updatePanel(interaction, panelFor(agenda, state));
    }

    store.setEntry(agenda.id, interaction.user.id, { days, times, note: state.note });
    pending.delete(`${agenda.id}:${interaction.user.id}`);
    await refresh(interaction, agenda);

    return updatePanel(interaction, {
      content: [
        '✅ Opgeslagen en in de agenda gezet:',
        `📆 ${days.map((day) => capitalise(DAY_LABELS[day])).join(', ')}`,
        `🕗 ${times}`,
        state.note ? `📝 ${state.note}` : '',
        '',
        'Je kunt het later aanpassen door opnieuw op **Beschikbaarheid doorgeven** te klikken.',
      ]
        .filter((line) => line !== '')
        .join('\n'),
      components: [],
    });
  }

  if (action === 'wis') {
    if (!agenda.entries[interaction.user.id]) {
      return interaction.reply({
        content: 'Je had nog niets ingevuld in deze agenda.',
        flags: MessageFlags.Ephemeral,
      });
    }

    pending.delete(`${agenda.id}:${interaction.user.id}`);
    store.removeEntry(agenda.id, interaction.user.id);
    await refresh(interaction, agenda);

    return interaction.reply({
      content: '🧹 Je invoer is uit de agenda gehaald.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return undefined;
}

module.exports = {
  BLOCKS,
  parseDays,
  daysText,
  timesText,
  blocksFromTimes,
  buildEmbed,
  agendaRow,
  messageFor,
  makerModal,
  noteModal,
  panelFor,
  handleSelect,
  handleModal,
  handleButton,
};
