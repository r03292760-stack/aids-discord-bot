/**
 * Opkomst: een sessie-aanmelding voor Arma met knoppen.
 * Iedereen op de server mag zich aanmelden; de paneelrol kan de opkomst later
 * aanpassen of rollen laten pingen. Alles blijft staan in data/opkomst.json,
 * dus ook na een herstart van de bot.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const store = require('./opkomstStore');
const botLog = require('./botLog');
const { ORANGE } = require('./embeds');
const { canPaneel, deniedMessage } = require('./permissions');

const FOOTER = 'Airborne Insertion Direct Seizure · opkomst';
const GREEN = 0x2ecc71;
const MAX_NAMES = 20;

const ANSWERS = { ja: 'yes', misschien: 'maybe', nee: 'no' };

/** Rollen die iemand in het instelscherm koos, tot hij op Doorgaan klikt. */
const pendingRoles = new Map();

function button(id, label, emoji, style) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
}

function input(customId, label, style, maxLength, required, value) {
  const builder = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setMaxLength(maxLength)
    .setRequired(required);
  if (value) builder.setValue(String(value).slice(0, maxLength));
  return builder;
}

function denied(interaction) {
  return interaction.reply({ content: deniedMessage('paneel'), flags: MessageFlags.Ephemeral });
}

/* ------------------------------ instellen ------------------------------ */

function setupView(selected = []) {
  const embed = new EmbedBuilder()
    .setTitle('🚁 Opkomst instellen')
    .setColor(ORANGE)
    .setDescription(
      'Kies hieronder eventueel rollen die een **ping** krijgen als je de opkomst plaatst. ' +
        'Zonder rollen gaat het bericht gewoon zonder ping de lucht in.\n\n' +
        'Klaar? Klik op **Doorgaan** en vul de sessie in.'
    )
    .addFields({
      name: 'Ping-rollen',
      value: selected.length ? selected.map((id) => `<@&${id}>`).join(', ') : '—',
    })
    .setFooter({ text: FOOTER });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('aids:opkomst:rollen')
          .setPlaceholder('Rollen die een ping krijgen (max 5)')
          .setMinValues(1)
          .setMaxValues(5)
      ),
      new ActionRowBuilder().addComponents(
        button('aids:opkomst:ga', 'Doorgaan', '➡️', ButtonStyle.Primary)
      ),
    ],
  };
}

/* ------------------------------- venster ------------------------------- */

function createModal() {
  return new ModalBuilder()
    .setCustomId('aids:opkomst:nieuw')
    .setTitle('Opkomst aanmaken')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input('titel', 'Sessie (bijv. Operatie Zwarte Zwaan)', TextInputStyle.Short, 120, true)
      ),
      new ActionRowBuilder().addComponents(
        input('wanneer', 'Wanneer (bijv. zaterdag 20:00)', TextInputStyle.Short, 100, true)
      ),
      new ActionRowBuilder().addComponents(
        input('server', 'Server (bijv. Reforger #1, mag leeg)', TextInputStyle.Short, 120, false)
      ),
      new ActionRowBuilder().addComponents(
        input(
          'toelichting',
          'Toelichting: modset, kaart, slot (mag leeg)',
          TextInputStyle.Paragraph,
          1500,
          false
        )
      ),
      new ActionRowBuilder().addComponents(
        input('minimum', 'Minimaal aantal spelers (mag leeg)', TextInputStyle.Short, 3, false)
      )
    );
}

function editModal(entry) {
  return new ModalBuilder()
    .setCustomId(`aids:opkomst:bewerk:${entry.id}`)
    .setTitle('Opkomst aanpassen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input('titel', 'Sessie', TextInputStyle.Short, 120, true, entry.title)
      ),
      new ActionRowBuilder().addComponents(
        input('wanneer', 'Wanneer', TextInputStyle.Short, 100, true, entry.when)
      ),
      new ActionRowBuilder().addComponents(
        input('server', 'Server (mag leeg)', TextInputStyle.Short, 120, false, entry.server)
      ),
      new ActionRowBuilder().addComponents(
        input('toelichting', 'Toelichting (mag leeg)', TextInputStyle.Paragraph, 1500, false, entry.notes)
      ),
      new ActionRowBuilder().addComponents(
        input(
          'minimum',
          'Minimaal aantal spelers (mag leeg)',
          TextInputStyle.Short,
          3,
          false,
          entry.minimum ? String(entry.minimum) : ''
        )
      )
    );
}

/** Leest het minimum uit het venster; null als het leeg is. */
function readMinimum(interaction) {
  const tekst = interaction.fields.getTextInputValue('minimum').trim();
  if (!tekst) return { ok: true, value: null };

  const parsed = Number.parseInt(tekst, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 200) {
    return { ok: false };
  }
  return { ok: true, value: parsed };
}

/* ------------------------------- embed -------------------------------- */

function names(list) {
  if (!list.length) return '—';
  const shown = list.slice(0, MAX_NAMES).map((id) => `<@${id}>`);
  if (list.length > MAX_NAMES) shown.push(`… en ${list.length - MAX_NAMES} meer`);
  return shown.join('\n').slice(0, 1024);
}

function buildEmbed(entry) {
  const enough = entry.minimum ? entry.yes.length >= entry.minimum : null;
  const color = enough === true ? GREEN : ORANGE;

  const embed = new EmbedBuilder()
    .setTitle(`🚁 Opkomst · ${entry.title}`)
    .setColor(color)
    .setDescription(
      (entry.notes ? `${entry.notes}\n\n` : '') +
        `**Wanneer:** ${entry.when}\n` +
        (entry.server ? `**Server:** ${entry.server}\n` : '') +
        'Meld je aan met de knoppen hieronder. Nog eens op dezelfde knop = je meldt je af.'
    )
    .addFields(
      { name: `✅ Aanwezig (${entry.yes.length})`, value: names(entry.yes), inline: true },
      { name: `❔ Misschien (${entry.maybe.length})`, value: names(entry.maybe), inline: true },
      { name: `❌ Afwezig (${entry.no.length})`, value: names(entry.no), inline: true }
    );

  let quorum = 'Geen minimum ingesteld — we zien wel wie opduikt.';
  if (entry.minimum) {
    quorum = enough
      ? `✅ Genoeg voor een operatie: ${entry.yes.length}/${entry.minimum} aanwezig.`
      : `⏳ Nog ${entry.minimum - entry.yes.length} nodig: ${entry.yes.length}/${entry.minimum} aanwezig.`;
  }
  embed.addFields({ name: 'Genoeg spelers?', value: quorum });

  if (entry.roles?.length) {
    embed.addFields({
      name: 'Wordt gepind',
      value: entry.roles.map((id) => `<@&${id}>`).join(', ').slice(0, 1024),
    });
  }

  if (entry.closedAt) {
    embed.setDescription(embed.data.description + `\n\n**Opkomst gesloten** door <@${entry.closedBy}>.`);
  }

  return embed
    .setFooter({ text: FOOTER })
    .setTimestamp(new Date(entry.createdAt || Date.now()));
}

function answerRow(entry) {
  const row = new ActionRowBuilder().addComponents(
    button(`aids:opkomst:ja:${entry.id}`, 'Aanwezig', '✅', ButtonStyle.Success),
    button(`aids:opkomst:misschien:${entry.id}`, 'Misschien', '❔', ButtonStyle.Secondary),
    button(`aids:opkomst:nee:${entry.id}`, 'Afwezig', '❌', ButtonStyle.Danger)
  );

  if (!entry.closedAt) {
    row.addComponents(
      button(`aids:opkomst:aanpassen:${entry.id}`, 'Aanpassen', '✏️', ButtonStyle.Secondary),
      button(`aids:opkomst:sluit:${entry.id}`, 'Sluiten', '🔒', ButtonStyle.Primary)
    );
  }

  return row;
}

/** Dropdown om rollen te pingen die zich nog niet hebben gemeld. */
function pingRow(entry) {
  return new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`aids:opkomst:ping:${entry.id}`)
      .setPlaceholder(entry.closedAt ? 'Opkomst gesloten' : 'Staf: ping rollen voor deze sessie')
      .setMinValues(1)
      .setMaxValues(5)
      .setDisabled(Boolean(entry.closedAt))
  );
}

function messageFor(entry) {
  return {
    embeds: [buildEmbed(entry)],
    components: [answerRow(entry), pingRow(entry)],
  };
}

/* ------------------------------- acties ------------------------------- */

async function handleModal(interaction, sub, id) {
  if (!canPaneel(interaction)) return denied(interaction);

  const minimum = readMinimum(interaction);
  if (!minimum.ok) {
    return interaction.reply({
      content: 'Het minimum moet een getal tussen 1 en 200 zijn, of leeg blijven.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const read = (field) => interaction.fields.getTextInputValue(field).trim();

  if (sub === 'bewerk') {
    const entry = store.get(id);
    if (!entry) {
      return interaction.reply({
        content: 'Deze opkomst bestaat niet meer.',
        flags: MessageFlags.Ephemeral,
      });
    }

    entry.title = read('titel');
    entry.when = read('wanneer');
    entry.server = read('server');
    entry.notes = read('toelichting');
    entry.minimum = minimum.value;
    store.save();

    await refresh(interaction, entry);

    return interaction.reply({
      content: '✅ Opkomst aangepast.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const roles = pendingRoles.get(interaction.user.id) ?? [];
  pendingRoles.delete(interaction.user.id);

  const result = await postSession(interaction, {
    title: read('titel'),
    when: read('wanneer'),
    server: read('server'),
    notes: read('toelichting'),
    minimum: minimum.value,
    roles,
  });

  if (result.error) {
    return interaction.reply({
      content: `Kon de opkomst niet plaatsen: ${result.error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `✅ Opkomst geplaatst in ${interaction.channel}. Iedereen kan zich nu aanmelden.`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Plaatst meteen een sessie zonder invulvenster (gebruikt door /lfg).
 * Geeft { entry, message } of { error } terug.
 */
async function postSession(
  interaction,
  { title, when = 'Nu', server = '', notes = '', minimum = null, roles = [] }
) {
  const entry = store.create({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: null,
    title,
    when,
    server,
    notes,
    minimum,
    roles,
    createdBy: interaction.user.id,
  });

  const ping = roles.length
    ? `${roles.map((roleId) => `<@&${roleId}>`).join(' ')} — opkomst voor **${entry.title}**`
    : undefined;

  let sent;
  try {
    sent = await interaction.channel.send({ content: ping, ...messageFor(entry) });
  } catch (error) {
    store.remove(entry.id);
    return { error: error.message };
  }

  entry.messageId = sent.id;
  store.save();

  await botLog.log(interaction.client, {
    title: '📢 Opkomst geplaatst',
    description: `**${entry.title}** (${entry.when}) in ${interaction.channel} door <@${interaction.user.id}>.`,
  });

  return { entry, message: sent };
}

/** Het opkomstbericht opnieuw tekenen (na aanpassen of een ping). */
async function refresh(interaction, entry) {
  const channel =
    interaction.channel ?? (await interaction.guild?.channels.fetch(entry.channelId).catch(() => null));
  if (!channel || !entry.messageId) return;

  const message = await channel.messages.fetch(entry.messageId).catch(() => null);
  if (message) await message.edit(messageFor(entry)).catch(() => {});
}

async function handleButton(interaction, action, id) {
  // Nieuwe opkomst: eerst rollen kiezen, dan invullen.
  if (action === 'nieuw') {
    if (!canPaneel(interaction)) return denied(interaction);
    pendingRoles.delete(interaction.user.id);
    return interaction.reply({ ...setupView(), flags: MessageFlags.Ephemeral });
  }

  // Doorgaan in het instelscherm: het invulvenster openen.
  if (action === 'ga') {
    if (!canPaneel(interaction)) return denied(interaction);
    return interaction.showModal(createModal());
  }

  const entry = store.get(id);
  if (!entry) {
    return interaction.reply({
      content: 'Deze opkomst bestaat niet meer. Maak een nieuwe aan via `/paneel`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'aanpassen') {
    if (!canPaneel(interaction)) return denied(interaction);
    return interaction.showModal(editModal(entry));
  }

  if (action === 'sluit') {
    // De maker mag zijn eigen sessie altijd sluiten (bijvoorbeeld een /lfg-sessie).
    if (!canPaneel(interaction) && entry.createdBy !== interaction.user.id) {
      return denied(interaction);
    }
    if (!entry.closedAt) {
      entry.closedAt = new Date().toISOString();
      entry.closedBy = interaction.user.id;
      store.save();

      await botLog.log(interaction.client, {
        title: '🔒 Opkomst gesloten',
        description: `**${entry.title}** (${entry.when}) gesloten door <@${interaction.user.id}>.`,
      });
    }
    return interaction.update(messageFor(entry));
  }

  const answer = ANSWERS[action];
  if (!answer) return undefined;

  if (entry.closedAt) {
    return interaction.reply({
      content: 'Deze opkomst is gesloten; aanmelden kan niet meer.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const updated = store.setAnswer(entry.id, interaction.user.id, answer);
  return interaction.update(messageFor(updated));
}

/** Rolkeuze: bij het instellen onthouden, op het bericht de rollen pingen. */
async function handleSelect(interaction, action, id) {
  if (action === 'rollen') {
    if (!canPaneel(interaction)) return denied(interaction);

    const gekozen = interaction.values ?? [];
    pendingRoles.set(interaction.user.id, gekozen);
    return interaction.update(setupView(gekozen));
  }

  if (action === 'ping') {
    if (!canPaneel(interaction)) return denied(interaction);

    const entry = store.get(id);
    if (!entry) {
      return interaction.reply({
        content: 'Deze opkomst bestaat niet meer.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (entry.closedAt) {
      return interaction.reply({
        content: 'Deze opkomst is gesloten; pingen heeft geen zin meer.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const rollen = (interaction.values ?? []).map((roleId) => `<@&${roleId}>`).join(' ');
    if (!rollen) {
      return interaction.reply({ content: 'Geen rollen gekozen.', flags: MessageFlags.Ephemeral });
    }

    try {
      await interaction.channel.send({
        content:
          `${rollen} — nog spelers nodig voor **${entry.title}** (${entry.when}). ` +
          'Meld je aan met de knoppen hierboven.',
        allowedMentions: {
          parse: [],
          roles: interaction.values,
        },
      });
    } catch (error) {
      return interaction.reply({
        content: `Kon de ping niet sturen: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: '📣 Ping verstuurd.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return undefined;
}

module.exports = {
  postSession,
  createModal,
  editModal,
  buildEmbed,
  answerRow,
  pingRow,
  messageFor,
  handleModal,
  handleButton,
  handleSelect,
};
