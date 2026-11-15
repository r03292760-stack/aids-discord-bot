/**
 * De ticketlogica: kanaal aanmaken, claimen, sluiten en archiveren.
 * Wordt gebruikt door de commands én door de knoppen.
 */

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const store = require('./ticketStore');
const config = require('./config');
const { ORANGE, panelEmbed, ticketEmbed, transcriptEmbed } = require('./embeds');
const settings = require('./settings');
const { canPaneel, deniedMessage } = require('./permissions');
const ticketTypes = require('./ticketTypes');
const { buttonStyle } = require('./ticketTypeStore');

const MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

function isStaff(interaction) {
  const member = interaction.member;
  if (!member) return false;

  const perms = interaction.memberPermissions;
  if (
    perms &&
    (perms.has(PermissionFlagsBits.ManageGuild) || perms.has(PermissionFlagsBits.Administrator))
  ) {
    return true;
  }
  if (!config.staffRoleId) return false;
  return Boolean(
    member.roles && member.roles.cache && member.roles.cache.has(config.staffRoleId)
  );
}

async function replyEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred && !interaction.replied) return await interaction.editReply({ content });
    if (interaction.replied) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch (error) {
    console.error('Kon niet antwoorden op een interactie:', error.message);
  }
}

/** Eén knop per soort op het paneel, vijf per rij (max 20 soorten). */
function panelRows() {
  const types = ticketTypes.enabled();
  if (!types.length) return [];

  const buttons = types.map((type) =>
    new ButtonBuilder()
      .setCustomId(`aids:ticket:soort:${type.id}`)
      .setLabel(String(type.buttonLabel || type.label).slice(0, 80))
      .setEmoji(type.emoji || '🎫')
      .setStyle(buttonStyle(type.buttonColor))
  );

  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
  }
  return rows;
}

/** De oude enkele knop, voor panelen die nog ergens staan. */
function panelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aids:ticket:open')
      .setLabel(settings.panel.buttonLabel || 'Ticket aanmaken')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Success)
  );
}

function controlRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aids:ticket:claim')
      .setLabel('Claimen')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('aids:ticket:close')
      .setLabel('Sluiten')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

function confirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aids:ticket:confirm')
      .setLabel('Ja, sluiten')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('aids:ticket:cancel')
      .setLabel('Nee, laat open')
      .setStyle(ButtonStyle.Secondary)
  );
}

/** Plaatst het paneel met per soort een knop (via /paneel). */
async function sendPanel(interaction) {
  if (!canPaneel(interaction)) {
    return replyEphemeral(interaction, deniedMessage('paneel'));
  }
  await interaction.channel.send({ embeds: [panelEmbed()], components: panelRows() });
  return replyEphemeral(interaction, '✅ Ticket-paneel geplaatst.');
}

/** Direct het invulvenster van één soort openen (knop op het paneel). */
async function openType(interaction, typeId) {
  const type = ticketTypes.get(typeId);
  if (!type || !type.enabled) {
    return replyEphemeral(interaction, 'Die soort staat niet meer op het paneel. Probeer het opnieuw.');
  }
  return interaction.showModal(ticketTypes.formModal(type));
}

/** Stap 1: vraag waarvoor het ticket is (oude panelen met één knop). */
async function openTypes(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🎫 Waarvoor is je ticket?')
    .setColor(ORANGE)
    .setDescription(
      'Kies hieronder de soort. Je krijgt daarna alleen de vragen die erbij horen, ' +
        'en je ticket komt in een eigen kanaal met de staf.'
    )
    .setFooter({ text: 'Airborne Insertion Direct Seizure · ticket' });

  return interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(ticketTypes.selectMenu())],
    flags: MessageFlags.Ephemeral,
  });
}

/** Stap 2: het invulvenster van het gekozen type openen. */
async function chooseType(interaction) {
  const type = ticketTypes.get(interaction.values?.[0]);
  if (!type) return replyEphemeral(interaction, 'Dat tickettype ken ik niet meer. Probeer opnieuw.');
  return interaction.showModal(ticketTypes.formModal(type));
}

/** Stap 3: het ingevulde venster omzetten in een ticket. */
async function createFromForm(interaction, typeId) {
  const type = ticketTypes.get(typeId);
  if (!type) return replyEphemeral(interaction, 'Dat tickettype ken ik niet meer. Probeer opnieuw.');
  return createTicket(interaction, type, ticketTypes.readAnswers(interaction, type));
}

async function createTicket(interaction, type = null, answers = []) {
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) {
    return replyEphemeral(interaction, 'Tickets openen werkt alleen binnen de server.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const existing = store.findByUser(member.id);
  if (existing) {
    return interaction.editReply({
      content:
        `Je hebt al een open ticket: <#${existing.channelId}> ` +
        `(#${String(existing.ticket.number).padStart(4, '0')}). ` +
        'Sluit dat eerst, dan kun je een nieuwe openen.',
    });
  }

  let category = null;
  if (config.ticketCategoryId) {
    category = await guild.channels.fetch(config.ticketCategoryId).catch(() => null);
    if (category && category.type !== ChannelType.GuildCategory) {
      console.warn(
        `TICKET_CATEGORY_ID ${config.ticketCategoryId} is geen categorie - ticket komt bovenaan`
      );
      category = null;
    }
  }

  const staffRole = config.staffRoleId
    ? guild.roles.cache.get(config.staffRoleId) ?? null
    : null;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: MEMBER_ALLOW },
  ];
  if (staffRole) {
    overwrites.push({
      id: staffRole.id,
      allow: [...MEMBER_ALLOW, PermissionFlagsBits.ManageMessages],
    });
  }
  if (guild.members.me) {
    overwrites.push({
      id: guild.members.me.id,
      allow: [
        ...MEMBER_ALLOW,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const number = store.nextNumber();
  const padded = String(number).padStart(4, '0');

  let channel;
  try {
    channel = await guild.channels.create({
      name: `${type ? type.id : 'ticket'}-${padded}`,
      type: ChannelType.GuildText,
      parent: category ? category.id : undefined,
      topic: `${type ? type.label : 'Ticket'} #${padded} · ${member.user.username} (${member.id})`,
      permissionOverwrites: overwrites,
      reason: `Ticket voor ${member.user.username} (${member.id})`,
    });
  } catch (error) {
    console.error('Kon geen ticketkanaal maken:', error.message);
    return interaction.editReply({
      content:
        'Kon geen ticketkanaal maken. Controleer of de bot **Kanalen beheren** heeft en ' +
        'hoog genoeg in de rollenlijst staat.',
    });
  }

  store.add(channel.id, member, number, { typeId: type ? type.id : null, answers });

  const ping = staffRole ? `${member} ${staffRole}` : `${member}`;
  try {
    await channel.send({
      content: ping,
      embeds: [ticketEmbed(number, member, staffRole, type, answers)],
      components: [controlRow()],
    });
  } catch (error) {
    console.error(`Kon het welkomstbericht in ${channel.id} niet sturen:`, error.message);
  }

  return interaction.editReply({
    content: `✅ Je ticket staat klaar: ${channel} (#${padded}, ${type ? type.label.toLowerCase() : 'algemeen'}).`,
  });
}

async function claimTicket(interaction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    return replyEphemeral(interaction, 'Dit is geen ticketkanaal.');
  }

  const ticket = store.get(channel.id);
  if (!ticket) return replyEphemeral(interaction, 'Dit kanaal staat niet als ticket in de lijst.');
  if (!isStaff(interaction)) {
    return replyEphemeral(interaction, 'Alleen de staf kan een ticket claimen, soldaat.');
  }
  if (ticket.claimedBy) {
    return replyEphemeral(interaction, `Dit ticket is al geclaimd door <@${ticket.claimedBy}>.`);
  }

  ticket.claimedBy = interaction.user.id;
  ticket.claimedByName = interaction.user.username;
  store.save();

  await replyEphemeral(interaction, '🙋 Jij hebt dit ticket.');
  await channel
    .send(`🙋 ${interaction.user} pakt dit ticket op. Even geduld, soldaat.`)
    .catch((error) => console.error('Kon claim-melding niet sturen:', error.message));
}

async function askClose(interaction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    return replyEphemeral(interaction, 'Dit is geen ticketkanaal.');
  }

  const ticket = store.get(channel.id);
  if (!ticket) return replyEphemeral(interaction, 'Dit kanaal staat niet als ticket in de lijst.');

  const isOpener = ticket.userId === interaction.user.id;
  if (!isOpener && !isStaff(interaction)) {
    return replyEphemeral(interaction, 'Alleen de staf of de opener kan dit ticket sluiten.');
  }

  return interaction.reply({
    content: 'Weet je zeker dat dit ticket dicht moet? Het kanaal verdwijnt daarna.',
    components: [confirmRow()],
    flags: MessageFlags.Ephemeral,
  });
}

async function cancelClose(interaction) {
  return interaction.update({ content: '👍 Ticket blijft open. Ga door.', embeds: [], components: [] });
}

async function closeTicket(interaction, { confirmed = false } = {}) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    return replyEphemeral(interaction, 'Dit is geen ticketkanaal.');
  }

  const ticket = store.get(channel.id);
  if (!ticket) return replyEphemeral(interaction, 'Dit kanaal staat niet als ticket in de lijst.');

  const isOpener = ticket.userId === interaction.user.id;
  if (!isOpener && !isStaff(interaction)) {
    return replyEphemeral(interaction, 'Alleen de staf of de opener kan dit ticket sluiten.');
  }

  if (confirmed && interaction.isButton()) {
    await interaction
      .update({
        content: `🔒 Ticket wordt gesloten door ${interaction.user}.`,
        embeds: [],
        components: [],
      })
      .catch(() => {});
  } else {
    await replyEphemeral(interaction, '🔒 Ticket wordt gesloten en gearchiveerd…');
  }

  await sendTranscript(channel, ticket, interaction.user);
  store.remove(channel.id);

  await channel
    .send(
      `🔒 Ticket gesloten door ${interaction.user}. Dit kanaal verdwijnt over 5 seconden.`
    )
    .catch((error) => console.error('Kon sluitmelding niet sturen:', error.message));

  setTimeout(() => {
    channel
      .delete(`Ticket gesloten door ${interaction.user.username}`)
      .catch((error) => console.error(`Kon ticketkanaal ${channel.id} niet verwijderen:`, error.message));
  }, 5000);
}

/** Haalt de laatste berichten op (max 500) in chronologische volgorde. */
async function fetchMessages(channel, max = 500) {
  const collected = [];
  let before;
  while (collected.length < max) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });
    if (batch.size === 0) break;
    collected.push(...batch.values());
    if (batch.size < 100) break;
    before = batch.last().id;
  }
  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function sendTranscript(channel, ticket, closer) {
  const typeLabel = ticket.type ? ticketTypes.get(ticket.type)?.label ?? ticket.type : 'algemeen';

  const lines = [
    `Ticket #${String(ticket.number).padStart(4, '0')} - ${ticket.openerName}`,
    `Type: ${typeLabel}`,
    `Kanaal: #${channel.name} (${channel.id})`,
    `Geopend: ${ticket.openedAt}`,
    `Geclaimd door: ${ticket.claimedByName ?? 'niemand'}`,
    `Gesloten door: ${closer.username} (${closer.id})`,
    `Gesloten op: ${new Date().toISOString()}`,
    '-'.repeat(60),
  ];

  for (const answer of ticket.answers ?? []) {
    lines.push(`${answer.label}: ${answer.value}`);
  }

  lines.push('-'.repeat(60), '');

  try {
    for (const message of await fetchMessages(channel)) {
      let content = message.content || '';
      if (message.attachments.size > 0) {
        content += ` ${[...message.attachments.values()].map((a) => a.url).join(' ')}`;
      }
      if (!content && message.embeds.length > 0) content = '[embed]';
      const stamp = message.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      lines.push(`[${stamp}] ${message.author.username} (${message.author.id}): ${content}`);
    }
  } catch (error) {
    console.error(`Kon geschiedenis van ${channel.id} niet lezen:`, error.message);
    lines.push('(gesprek kon niet worden uitgelezen)');
  }

  const logChannelId = config.ticketLogChannelId;
  if (!logChannelId) {
    console.warn(
      `Geen geldig TICKET_LOG_CHANNEL_ID - transcript van ticket #${ticket.number} niet opgeslagen`
    );
    return;
  }

  const logChannel = await channel.guild.channels.fetch(logChannelId).catch(() => null);
  if (!logChannel || logChannel.type !== ChannelType.GuildText) {
    console.warn(`Logkanaal ${logChannelId} niet gevonden of geen tekstkanaal`);
    return;
  }

  const file = new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), {
    name: `ticket-${String(ticket.number).padStart(4, '0')}.txt`,
  });

  await logChannel
    .send({ embeds: [transcriptEmbed(ticket, closer)], files: [file] })
    .catch((error) => console.error('Kon transcript niet naar het logkanaal sturen:', error.message));
}

module.exports = {
  isStaff,
  panelRow,
  panelRows,
  openType,
  sendPanel,
  openTypes,
  chooseType,
  createFromForm,
  createTicket,
  claimTicket,
  askClose,
  cancelClose,
  closeTicket,
  fetchMessages,
};
