/**
 * Agenda: één bericht waarin iedereen zelf zet wanneer hij kan.
 * De paneelrol plaatst de agenda; elk lid vult zijn eigen dagen en tijden in.
 * Alles blijft staan in data/agenda.json, dus ook na een herstart.
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

function entryModal(agenda, own) {
  return new ModalBuilder()
    .setCustomId(`aids:agenda:form:${agenda.id}`)
    .setTitle('Wanneer kun je?')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input(
          'dagen',
          'Dagen (bijv. ma, wo, za of weekend)',
          TextInputStyle.Short,
          100,
          true,
          own ? daysText(own.days) : ''
        )
      ),
      new ActionRowBuilder().addComponents(
        input('tijden', 'Tijden (bijv. 20:00-23:00)', TextInputStyle.Short, 60, true, own?.times)
      ),
      new ActionRowBuilder().addComponents(
        input('opmerking', 'Opmerking (mag leeg)', TextInputStyle.Short, 150, false, own?.note)
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
        'Klik op **Beschikbaarheid doorgeven** om je eigen dagen en tijden te zetten; ' +
        'opnieuw invullen overschrijft wat je eerder zei.'
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
      value: 'Klik op **Beschikbaarheid doorgeven** en zet je dagen en tijden neer.',
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

  if (sub === 'form') {
    const agenda = store.get(id);
    if (!agenda) {
      return interaction.reply({
        content: 'Deze agenda bestaat niet meer.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const days = parseDays(read('dagen'));
    if (!days) {
      return interaction.reply({
        content:
          'Ik kon de dagen niet lezen. Gebruik bijvoorbeeld `ma, wo, za`, `weekend` of `elke dag`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    store.setEntry(agenda.id, interaction.user.id, {
      days,
      times: read('tijden'),
      note: read('opmerking'),
    });

    await refresh(interaction, agenda);

    return interaction.reply({
      content: `✅ Opgeslagen: ${days.map((day) => DAY_LABELS[day]).join(', ')} · ${read('tijden')}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return undefined;
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
    return interaction.showModal(entryModal(agenda, agenda.entries[interaction.user.id]));
  }

  if (action === 'wis') {
    if (!agenda.entries[interaction.user.id]) {
      return interaction.reply({
        content: 'Je had nog niets ingevuld in deze agenda.',
        flags: MessageFlags.Ephemeral,
      });
    }

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
  parseDays,
  daysText,
  buildEmbed,
  agendaRow,
  messageFor,
  makerModal,
  entryModal,
  handleModal,
  handleButton,
};
