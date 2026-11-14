/**
 * Beheerpaneel in Discord: knoppen + invulvensters (modals) om het
 * ticketpaneel en het welkomstbericht aan te passen.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const settings = require('./settings');
const { panelEmbed, welcomeEmbed, normalizeColor, parseColor } = require('./embeds');
const { panelRow } = require('./tickets');

const COLOR = 0xd65c1e;
const FOOTER = 'Airborne Insertion Direct Seizure · beheer';

function button(id, label, emoji, style = ButtonStyle.Secondary) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function backRow() {
  return new ActionRowBuilder().addComponents(
    button('aids:beheer:back', 'Terug', '⬅️'),
    button('aids:beheer:close', 'Sluiten', '✖️', ButtonStyle.Danger)
  );
}

function input(id, label, style, value, maxLength, required = false) {
  const field = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setMaxLength(maxLength)
    .setRequired(required);
  if (value) field.setValue(String(value).slice(0, maxLength));
  return new ActionRowBuilder().addComponents(field);
}

function mainView(client) {
  const guild = client.guilds.cache.get(require('./config').guildId) ?? client.guilds.cache.first();
  const panel = settings.panel;
  const welcome = settings.welcome;

  const embed = new EmbedBuilder()
    .setTitle('🛠️ A.I.D.S. beheer')
    .setColor(COLOR)
    .setDescription(
      'Kies wat je wilt aanpassen. Wijzigingen gelden meteen voor nieuwe berichten.\n' +
        'Gebruik `/leden` voor leden zoeken, rollen geven of iemand kicken.'
    )
    .addFields(
      {
        name: '🎫 Ticketpaneel',
        value: `**${panel.title}**\nKleur: \`#${panel.color}\` · knop: **${panel.buttonLabel}**`,
      },
      {
        name: '👋 Welkomstbericht',
        value: `**${welcome.title}**\nKleur: \`#${welcome.color}\` · afbeelding: ${
          welcome.imageUrl ? 'ja' : 'nee'
        }`,
      },
      {
        name: '👥 Leden',
        value: guild ? `**${guild.memberCount}** leden op deze server` : 'Server niet gevonden',
      }
    )
    .setFooter({ text: FOOTER });

  const row = new ActionRowBuilder().addComponents(
    button('aids:beheer:panel', 'Ticketpaneel', '🎫', ButtonStyle.Primary),
    button('aids:beheer:welcome', 'Welkomstbericht', '👋', ButtonStyle.Primary),
    button('aids:beheer:members', 'Leden', '👥')
  );

  return { embeds: [embed], components: [row] };
}

function panelPreviewView() {
  return {
    content:
      'Zo ziet je ticketpaneel eruit. Kies **Aanpassen** om iets te wijzigen of **Plaats hier** ' +
      'om het paneel in dit kanaal te zetten.',
    embeds: [panelEmbed()],
    components: [
      panelRow(),
      new ActionRowBuilder().addComponents(
        button('aids:beheer:modal:panel', 'Aanpassen', '✏️', ButtonStyle.Primary),
        button('aids:beheer:place', 'Plaats hier', '📍', ButtonStyle.Success)
      ),
      backRow(),
    ],
  };
}

function welcomePreviewView(member) {
  return {
    content:
      'Zo ziet het welkomstbericht eruit (`{lid}` wordt de ping van het nieuwe lid). ' +
      'Kies **Aanpassen** of **Stuur testbericht**.',
    embeds: [welcomeEmbed(member)],
    components: [
      new ActionRowBuilder().addComponents(
        button('aids:beheer:modal:welcome', 'Aanpassen', '✏️', ButtonStyle.Primary),
        button('aids:beheer:testwelcome', 'Stuur testbericht', '📨', ButtonStyle.Success)
      ),
      backRow(),
    ],
  };
}

function panelModal() {
  const s = settings.panel;
  return new ModalBuilder()
    .setCustomId('aids:beheer:modal:panel')
    .setTitle('Ticketpaneel aanpassen')
    .addComponents(
      input('titel', 'Titel', TextInputStyle.Short, s.title, 256, true),
      input('beschrijving', 'Beschrijving', TextInputStyle.Paragraph, s.description, 4000, true),
      input('kleur', 'Kleur als hex, bijv. D65C1E', TextInputStyle.Short, s.color, 7),
      input('footer', 'Voettekst (mag leeg)', TextInputStyle.Short, s.footer, 2000),
      input('knop', 'Tekst op de knop', TextInputStyle.Short, s.buttonLabel, 80)
    );
}

function welcomeModal() {
  const s = settings.welcome;
  return new ModalBuilder()
    .setCustomId('aids:beheer:modal:welcome')
    .setTitle('Welkomstbericht aanpassen')
    .addComponents(
      input('titel', 'Titel', TextInputStyle.Short, s.title, 256, true),
      input('beschrijving', 'Beschrijving (gebruik {lid} voor de ping)', TextInputStyle.Paragraph, s.description, 4000, true),
      input('kleur', 'Kleur als hex, bijv. D65C1E', TextInputStyle.Short, s.color, 7),
      input('footer', 'Voettekst (mag leeg)', TextInputStyle.Short, s.footer, 2000),
      input('afbeelding', 'Afbeelding-URL (https, mag leeg)', TextInputStyle.Short, s.imageUrl, 500)
    );
}

async function openMain(interaction, client) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: 'Alleen beheerders kunnen dit paneel openen, soldaat.',
      flags: MessageFlags.Ephemeral,
    });
  }
  return interaction.reply({ ...mainView(client), flags: MessageFlags.Ephemeral });
}

async function handleButton(interaction, action, rest) {
  const client = interaction.client;

  switch (action) {
    case 'back':
      return interaction.update(mainView(client));
    case 'close':
      return interaction.update({ content: 'Beheer gesloten.', embeds: [], components: [] });
    case 'panel':
      return interaction.update(panelPreviewView());
    case 'welcome':
      return interaction.update(welcomePreviewView(interaction.user));
    case 'members':
      return interaction.update(membersView(client));
    case 'modal':
      if (rest[0] === 'panel') return interaction.showModal(panelModal());
      if (rest[0] === 'welcome') return interaction.showModal(welcomeModal());
      return;
    case 'place': {
      await interaction.channel.send({ embeds: [panelEmbed()], components: [panelRow()] });
      return interaction.update({
        content: `✅ Ticketpaneel geplaatst in ${interaction.channel}.`,
        embeds: [],
        components: [backRow()],
      });
    }
    case 'testwelcome': {
      const channel = await interaction.client.channels
        .fetch(require('./config').welcomeChannelId ?? interaction.channelId)
        .catch(() => interaction.channel);
      await channel.send({ content: `${interaction.user}`, embeds: [welcomeEmbed(interaction.user)] });
      return interaction.update({
        content: `✅ Testbericht gestuurd naar ${channel}.`,
        embeds: [welcomeEmbed(interaction.user)],
        components: [backRow()],
      });
    }
    default:
      return;
  }
}

function membersView(client) {
  const guild = client.guilds.cache.get(require('./config').guildId) ?? client.guilds.cache.first();
  const humans = guild ? guild.members.cache.filter((m) => !m.user.bot).size : 0;
  const bots = guild ? guild.members.cache.filter((m) => m.user.bot).size : 0;

  const embed = new EmbedBuilder()
    .setTitle('👥 Ledenbeheer')
    .setColor(COLOR)
    .setDescription(
      'Gebruik deze commands:\n\n' +
        '`/leden zoeken [naam]` — leden zoeken en hun rollen zien\n' +
        '`/leden rol` — een rol geven of afnemen\n' +
        '`/leden kick` — iemand van de server verwijderen (met bevestiging)'
    )
    .addFields(
      { name: 'Leden', value: `${guild ? guild.memberCount : 0}`, inline: true },
      { name: 'Mensen', value: `${humans}`, inline: true },
      { name: 'Bots', value: `${bots}`, inline: true }
    )
    .setFooter({ text: FOOTER });

  return { embeds: [embed], components: [backRow()] };
}

async function handleModal(interaction, which) {
  const value = (id) => interaction.fields.getTextInputValue(id).trim();

  if (which === 'panel') {
    const color = normalizeColor(value('kleur'));
    if (!color) {
      return interaction.reply({
        content: 'Die kleur klopt niet. Gebruik zes tekens, bijvoorbeeld `D65C1E`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    settings.update('panel', {
      title: value('titel'),
      description: value('beschrijving'),
      color,
      footer: value('footer'),
      buttonLabel: value('knop') || 'Ticket aanmaken',
    });
    return interaction.reply({ ...panelPreviewView(), flags: MessageFlags.Ephemeral });
  }

  if (which === 'welcome') {
    const color = normalizeColor(value('kleur'));
    if (!color) {
      return interaction.reply({
        content: 'Die kleur klopt niet. Gebruik zes tekens, bijvoorbeeld `D65C1E`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const imageUrl = value('afbeelding');
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      return interaction.reply({
        content: 'De afbeelding-URL moet met `https://` beginnen.',
        flags: MessageFlags.Ephemeral,
      });
    }
    settings.update('welcome', {
      title: value('titel'),
      description: value('beschrijving'),
      color,
      footer: value('footer'),
      imageUrl,
    });
    return interaction.reply({ ...welcomePreviewView(interaction.user), flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  COLOR,
  mainView,
  membersView,
  panelPreviewView,
  welcomePreviewView,
  openMain,
  handleButton,
  handleModal,
  panelModal,
  welcomeModal,
  parseColor,
};
