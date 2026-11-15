/**
 * Het /paneel-menu: ticketpaneel plaatsen of zelf een embed maken en sturen.
 * Na het sturen kun je die embed bewerken of verwijderen.
 * Toegankelijk voor de rol die in /beheer → Toegang is ingesteld.
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
  PermissionFlagsBits,
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
        'en voettekst. Hij komt in het kanaal waar je `/paneel` typt.\n\n' +
        'Wil je hem ergens anders neerzetten? Kies hieronder het **doelkanaal** en het ' +
        'invulvenster opent meteen voor dat kanaal.\n\n' +
        '**Opkomst** maakt een aanmeldlijst voor je volgende sessie: aanwezig, misschien ' +
        'of afwezig, met een live teller en een knop om de opkomst te sluiten.\n\n' +
        '**Agenda** plaatst een gedeeld bericht waarin iedereen zelf zet op welke dagen ' +
        'en tijden hij kan.'
    )
    .setFooter({ text: FOOTER });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button('aids:paneel:ticket', 'Ticketpaneel plaatsen', '🎫', ButtonStyle.Primary),
        button('aids:paneel:embed', 'Embed sturen', '✉️', ButtonStyle.Success),
        button('aids:opkomst:nieuw', 'Opkomst', '🚁', ButtonStyle.Secondary),
        button('aids:agenda:nieuw', 'Agenda', '📅', ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('aids:paneel:kanaal')
          .setPlaceholder('Embed sturen naar een ander kanaal…')
          .setMinValues(1)
          .setMaxValues(1)
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
    ],
  };
}

/** Bewerk- en verwijderknoppen voor de embed die net verstuurd is. */
function manageRow(channelId, messageId) {
  return new ActionRowBuilder().addComponents(
    button(`aids:paneel:bewerk:${channelId}:${messageId}`, 'Bewerken', '✏️', ButtonStyle.Primary),
    button(
      `aids:paneel:verwijder:${channelId}:${messageId}`,
      'Verwijderen',
      '🗑️',
      ButtonStyle.Danger
    )
  );
}

function hexColor(color) {
  if (color === null || color === undefined) return '';
  return Number(color).toString(16).padStart(6, '0').toUpperCase();
}

/** Leest een embed uit een bericht, of hij nu van de API komt of zelf gebouwd is. */
function embedData(message) {
  const embed = message?.embeds?.[0];
  return embed?.data ?? embed ?? {};
}

function composerModal(channelId, message = null) {
  const current = embedData(message);

  return new ModalBuilder()
    .setCustomId(`aids:paneel:modal:${channelId}${message ? `:${message.id}` : ''}`)
    .setTitle(message ? 'Embed bewerken' : 'Embed maken')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input('titel', 'Titel', TextInputStyle.Short, 256, true, current?.title)
      ),
      new ActionRowBuilder().addComponents(
        input('tekst', 'Tekst', TextInputStyle.Paragraph, 4000, true, current?.description)
      ),
      new ActionRowBuilder().addComponents(
        input(
          'kleur',
          'Kleur als hex, bijv. D65C1E (mag leeg)',
          TextInputStyle.Short,
          7,
          false,
          hexColor(current?.color)
        )
      ),
      new ActionRowBuilder().addComponents(
        input(
          'afbeelding',
          'Afbeelding-URL (https, mag leeg)',
          TextInputStyle.Short,
          500,
          false,
          current?.image?.url
        )
      ),
      new ActionRowBuilder().addComponents(
        input('footer', 'Voettekst (mag leeg)', TextInputStyle.Short, 2000, false, current?.footer?.text)
      )
    );
}

/** Haalt het doelkanaal op en controleert of de bot er mag posten. */
async function resolveChannel(interaction, channelId) {
  if (!channelId || !interaction.guild) return null;

  const channel =
    interaction.guild.channels.cache.get(channelId) ||
    (await interaction.guild.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isTextBased()) return null;

  const me = interaction.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (
    !perms ||
    !perms.has(PermissionFlagsBits.SendMessages) ||
    !perms.has(PermissionFlagsBits.EmbedLinks)
  ) {
    return null;
  }

  return channel;
}

/** Zoekt de embed die eerder gestuurd is, met kanaal en bericht erbij. */
async function findEmbed(interaction, channelId, messageId) {
  if (!messageId) return null;

  const channel = await resolveChannel(interaction, channelId);
  if (!channel) return null;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message || !message.embeds?.length) return null;
  return message;
}

const goneMessage = 'Die embed kan ik niet meer vinden: hij is verwijderd of ik mis rechten.';

async function openEdit(interaction, channelId, messageId) {
  const message = await findEmbed(interaction, channelId, messageId);
  if (!message) {
    return interaction.reply({ content: goneMessage, flags: MessageFlags.Ephemeral });
  }

  return interaction.showModal(composerModal(message.channelId, message));
}

async function askDelete(interaction, channelId, messageId) {
  const message = await findEmbed(interaction, channelId, messageId);
  if (!message) {
    return interaction.reply({ content: goneMessage, flags: MessageFlags.Ephemeral });
  }

  return interaction.reply({
    content: `Weet je het zeker? De embed in <#${message.channelId}> verdwijnt dan.`,
    components: [
      new ActionRowBuilder().addComponents(
        button(
          `aids:paneel:echtverwijder:${message.channelId}:${message.id}`,
          'Ja, verwijderen',
          '🗑️',
          ButtonStyle.Danger
        ),
        button('aids:paneel:annuleer', 'Annuleren', null, ButtonStyle.Secondary)
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function deleteEmbed(interaction, channelId, messageId) {
  const message = await findEmbed(interaction, channelId, messageId);
  if (!message) {
    return interaction.reply({ content: goneMessage, flags: MessageFlags.Ephemeral });
  }

  try {
    await message.delete();
  } catch (error) {
    return interaction.reply({
      content: `Kon de embed niet verwijderen: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `🗑️ Embed verwijderd uit <#${message.channelId}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleButton(interaction, action, rest = []) {
  if (!canPaneel(interaction)) return denied(interaction);

  if (action === 'ticket') return tickets.sendPanel(interaction);
  if (action === 'embed') return interaction.showModal(composerModal(interaction.channelId));

  const [channelId, messageId] = rest;
  if (action === 'bewerk') return openEdit(interaction, channelId, messageId);
  if (action === 'verwijder') return askDelete(interaction, channelId, messageId);
  if (action === 'echtverwijder') return deleteEmbed(interaction, channelId, messageId);
  if (action === 'annuleer') {
    return interaction.update({ content: 'Niets verwijderd.', components: [] });
  }

  return undefined;
}

/** Doelkanaal gekozen in de dropdown: meteen het invulvenster openen. */
async function handleSelect(interaction) {
  if (!canPaneel(interaction)) return denied(interaction);

  const channel = await resolveChannel(interaction, interaction.values?.[0]);
  if (!channel) {
    return interaction.reply({
      content:
        'Dat kanaal kan ik niet gebruiken. Kies een tekstkanaal waar ik berichten en ' +
        'embeds mag plaatsen.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.showModal(composerModal(channel.id));
}

async function handleModal(interaction, channelId, messageId) {
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

  // Bewerken: het bestaande bericht aanpassen.
  if (messageId) {
    const existing = await findEmbed(interaction, channelId, messageId);
    if (!existing) {
      return interaction.reply({ content: goneMessage, flags: MessageFlags.Ephemeral });
    }

    try {
      await existing.edit({ embeds: [embed] });
    } catch (error) {
      return interaction.reply({
        content: `Kon de embed niet bewerken: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: `✅ Embed bijgewerkt in <#${existing.channelId}>.`,
      components: [manageRow(existing.channelId, existing.id)],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Nieuwe embed: sturen naar het gekozen kanaal (of waar het menu geopend is).
  const target =
    (await resolveChannel(interaction, channelId)) ||
    (await resolveChannel(interaction, interaction.channelId));
  if (!target) {
    return interaction.reply({
      content:
        'Ik kan nergens posten: het gekozen kanaal bestaat niet meer of ik mis rechten. ' +
        'Kies een ander kanaal in het menu.',
      flags: MessageFlags.Ephemeral,
    });
  }

  let sent;
  try {
    sent = await target.send({ embeds: [embed] });
  } catch (error) {
    return interaction.reply({
      content: `Kon de embed niet plaatsen: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `✅ Embed geplaatst in ${target}.`,
    components: [manageRow(target.id, sent.id)],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  COLOR,
  paneelView,
  composerModal,
  manageRow,
  handleButton,
  handleSelect,
  handleModal,
};
