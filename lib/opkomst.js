/**
 * Opkomst: een sessie-aanmelding voor Arma met knoppen.
 * Iedereen op de server mag zich aanmelden; het bericht werkt ook na een herstart
 * omdat de opkomst in data/opkomst.json blijft staan.
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

const store = require('./opkomstStore');
const { ORANGE } = require('./embeds');
const { canPaneel, deniedMessage } = require('./permissions');

const FOOTER = 'Airborne Insertion Direct Seizure · opkomst';
const GREEN = 0x2ecc71;
const MAX_NAMES = 22;

const ANSWERS = { ja: 'yes', misschien: 'maybe', nee: 'no' };

function button(id, label, emoji, style) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
}

function createModal() {
  return new ModalBuilder()
    .setCustomId('aids:opkomst:nieuw')
    .setTitle('Opkomst aanmaken')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('titel')
          .setLabel('Sessie (bijv. Operatie Zwarte Zwaan)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(120)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('wanneer')
          .setLabel('Wanneer (bijv. zaterdag 20:00)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('toelichting')
          .setLabel('Toelichting: modset, kaart, slot (mag leeg)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1500)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('minimum')
          .setLabel('Minimaal aantal spelers (mag leeg)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(3)
          .setRequired(false)
      )
    );
}

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

  const closed = entry.closedAt ? `\n\n**Opkomst gesloten** door <@${entry.closedBy}>.` : '';
  if (closed) embed.setDescription(embed.data.description + closed);

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
      button(`aids:opkomst:sluit:${entry.id}`, 'Opkomst sluiten', '🔒', ButtonStyle.Primary)
    );
  }

  return row;
}

async function handleModal(interaction) {
  if (!canPaneel(interaction)) {
    return interaction.reply({ content: deniedMessage('paneel'), flags: MessageFlags.Ephemeral });
  }

  const read = (id) => interaction.fields.getTextInputValue(id).trim();
  const minimumTekst = read('minimum');
  let minimum = null;
  if (minimumTekst) {
    const parsed = Number.parseInt(minimumTekst, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 200) {
      return interaction.reply({
        content: 'Het minimum moet een getal tussen 1 en 200 zijn, of leeg blijven.',
        flags: MessageFlags.Ephemeral,
      });
    }
    minimum = parsed;
  }

  const entry = store.create({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: null,
    title: read('titel'),
    when: read('wanneer'),
    notes: read('toelichting'),
    minimum,
    createdBy: interaction.user.id,
  });

  let sent;
  try {
    sent = await interaction.channel.send({
      embeds: [buildEmbed(entry)],
      components: [answerRow(entry)],
    });
  } catch (error) {
    return interaction.reply({
      content: `Kon de opkomst niet plaatsen: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  entry.messageId = sent.id;
  store.save();

  return interaction.reply({
    content: `✅ Opkomst geplaatst in ${interaction.channel}. Iedereen kan zich nu aanmelden.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleButton(interaction, action, id) {
  // Nieuwe opkomst: het invulvenster openen.
  if (action === 'nieuw') {
    if (!canPaneel(interaction)) {
      return interaction.reply({ content: deniedMessage('paneel'), flags: MessageFlags.Ephemeral });
    }
    return interaction.showModal(createModal());
  }

  const entry = store.get(id);
  if (!entry) {
    return interaction.reply({
      content: 'Deze opkomst bestaat niet meer. Maak een nieuwe aan via `/paneel`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Sluiten mag alleen wie het /paneel mag gebruiken.
  if (action === 'sluit') {
    if (!canPaneel(interaction)) {
      return interaction.reply({ content: deniedMessage('paneel'), flags: MessageFlags.Ephemeral });
    }
    if (!entry.closedAt) {
      entry.closedAt = new Date().toISOString();
      entry.closedBy = interaction.user.id;
      store.save();
    }
    return interaction.update({ embeds: [buildEmbed(entry)], components: [answerRow(entry)] });
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
  return interaction.update({ embeds: [buildEmbed(updated)], components: [answerRow(updated)] });
}

module.exports = {
  createModal,
  buildEmbed,
  answerRow,
  handleModal,
  handleButton,
};
