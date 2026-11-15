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
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const settings = require('./settings');
const { panelEmbed, welcomeEmbed, normalizeColor, parseColor } = require('./embeds');
const { panelRows } = require('./tickets');
const memberPanel = require('./memberPanel');
const { canBeheer, deniedMessage, panelRoleId } = require('./permissions');
const version = require('./version');

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
        'Onder **Leden** zoek je leden, pas je rollen aan met een keuzelijst en kun je iemand kicken.\n' +
        'Onder **Toegang** kies je welke rol `/paneel` mag gebruiken.'
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
      },
      {
        name: '🔐 Toegang',
        value: panelRoleId()
          ? `\`/paneel\` voor <@&${panelRoleId()}>`
          : '`/paneel` voor beheerders (nog geen rol gekozen)',
      }
    )
    .setFooter({ text: `${FOOTER} · v${version.version}` });

  const row = new ActionRowBuilder().addComponents(
    button('aids:beheer:panel', 'Ticketpaneel', '🎫', ButtonStyle.Primary),
    button('aids:beheer:welcome', 'Welkomstbericht', '👋', ButtonStyle.Primary),
    button('aids:beheer:members', 'Leden', '👥'),
    button('aids:beheer:access', 'Toegang', '🔐')
  );

  return { embeds: [embed], components: [row] };
}

function panelPreviewView() {
  const rows = panelRows();

  return {
    content:
      'Zo ziet je ticketpaneel eruit. Kies **Aanpassen** om iets te wijzigen of **Plaats hier** ' +
      'om het paneel in dit kanaal te zetten.' +
      (rows.length
        ? ''
        : '\n\n⚠️ Er staan nog geen ticketsoorten aan, dus het paneel heeft nog geen knoppen. ' +
          'Zet ze aan via **/paneel → Ticketsoorten**.'),
    embeds: [panelEmbed()],
    components: [
      // Zelfde knoppen als het echte paneel (max 4 rijen), plus één rij om te beheren.
      ...rows,
      new ActionRowBuilder().addComponents(
        button('aids:beheer:modal:panel', 'Aanpassen', '✏️', ButtonStyle.Primary),
        button('aids:beheer:place', 'Plaats hier', '📍', ButtonStyle.Success),
        button('aids:beheer:back', 'Terug', '⬅️'),
        button('aids:beheer:close', 'Sluiten', '✖️', ButtonStyle.Danger)
      ),
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

function accessView(note = '') {
  const roleId = panelRoleId();

  const embed = new EmbedBuilder()
    .setTitle('🔐 Toegang')
    .setColor(COLOR)
    .setDescription(
      [
        note,
        'Kies hieronder welke rol `/paneel` mag gebruiken. Die rol kan daarmee het ' +
          'ticketpaneel in een kanaal zetten.',
        roleId ? `Nu: <@&${roleId}>` : 'Nu: alleen beheerders met **Beheer server**.',
      ]
        .filter(Boolean)
        .join('\n\n')
    )
    .setFooter({ text: `${FOOTER} · v${version.version}` });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('aids:beheer:accessrole')
          .setPlaceholder('Kies de rol voor /paneel')
          .setMinValues(1)
          .setMaxValues(1)
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
  if (!canBeheer(interaction)) {
    return interaction.reply({
      content: deniedMessage(),
      flags: MessageFlags.Ephemeral,
    });
  }
  return interaction.reply({ ...mainView(client), flags: MessageFlags.Ephemeral });
}

async function handleButton(interaction, action, rest) {
  if (!canBeheer(interaction)) {
    return interaction.reply({ content: deniedMessage(), flags: MessageFlags.Ephemeral });
  }

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
      return interaction.update(await memberPanel.listView(memberPanel.guildOf(client)));
    case 'access':
      return interaction.update(accessView());
    case 'modal':
      if (rest[0] === 'panel') return interaction.showModal(panelModal());
      if (rest[0] === 'welcome') return interaction.showModal(welcomeModal());
      return;
    case 'place': {
      const rows = panelRows();
      if (!rows.length) {
        return interaction.reply({
          content:
            'Er staan nog geen ticketsoorten aan, dus het paneel zou geen knoppen hebben. ' +
            'Zet er eerst een aan via **/paneel → Ticketsoorten**.',
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.channel.send({ embeds: [panelEmbed()], components: rows });
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

async function handleSelect(interaction, action) {
  if (!canBeheer(interaction)) {
    return interaction.reply({ content: deniedMessage(), flags: MessageFlags.Ephemeral });
  }

  if (action === 'accessrole') {
    const roleId = interaction.values[0];
    settings.update('access', { panelRoleId: roleId });
    return interaction.update(accessView(`✅ \`/paneel\` is nu voor <@&${roleId}>.`));
  }
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
  accessView,
  handleSelect,
  panelPreviewView,
  welcomePreviewView,
  openMain,
  handleButton,
  handleModal,
  panelModal,
  welcomeModal,
  parseColor,
};
