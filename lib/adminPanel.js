/**
 * Beheerpaneel in Discord: knoppen + invulvensters (modals) om het
 * ticketpaneel en het welkomstbericht aan te passen.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const config = require('./config');
const settings = require('./settings');
const envFile = require('./envFile');
const storage = require('./storage');
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
  const guild = client.guilds.cache.get(config.guildId) ?? client.guilds.cache.first();
  const panel = settings.panel;
  const welcome = settings.welcome;

  const embed = new EmbedBuilder()
    .setTitle('🛠️ A.I.D.S. beheer')
    .setColor(COLOR)
    .setDescription(
      'Kies wat je wilt aanpassen. Wijzigingen gelden meteen voor nieuwe berichten.\n' +
        'Onder **Leden** zoek je leden, pas je rollen aan met een keuzelijst en kun je iemand kicken.\n' +
        'Onder **Toegang** kies je welke rol `/paneel` mag gebruiken.\n' +
        'Onder **Instellingen** pas je de kanaal- en rol-ID\'s en de databasegegevens uit `.env` aan.'
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
    button('aids:beheer:access', 'Toegang', '🔐'),
    button('aids:beheer:env', 'Instellingen', '⚙️')
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

/* --------------------------- instellingen (.env) --------------------------- */

const ENV_GROUPS = {
  kanalen: {
    title: 'Kanalen en server',
    fields: [
      'GUILD_ID',
      'TICKET_CATEGORY_ID',
      'WELCOME_CHANNEL_ID',
      'TICKET_LOG_CHANNEL_ID',
      'WELCOME_IMAGE_URL',
    ],
  },
  rollen: { title: 'Rollen', fields: ['STAFF_ROLE_ID', 'AUTO_ROLE_ID'] },
  database: {
    title: 'Database',
    fields: ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'],
  },
};

const ENV_LABELS = {
  GUILD_ID: 'Server-ID',
  TICKET_CATEGORY_ID: 'Ticketcategorie-ID',
  WELCOME_CHANNEL_ID: 'Welkomstkanaal-ID',
  TICKET_LOG_CHANNEL_ID: 'Logkanaal-ID',
  WELCOME_IMAGE_URL: 'Afbeelding welkomstbericht',
  STAFF_ROLE_ID: 'Stafrol-ID',
  AUTO_ROLE_ID: 'Instaprol-ID',
  DB_HOST: 'DB_HOST',
  DB_PORT: 'DB_PORT (leeg = 3306)',
  DB_NAME: 'DB_NAME',
  DB_USER: 'DB_USER',
  DB_PASSWORD: 'DB_PASSWORD (leeg = laten staan)',
};

/** Waarde voor het overzicht; wachtwoorden tonen we nooit. */
function envValue(key) {
  const value = envFile.value(key);
  if (key === 'DB_PASSWORD') return value ? 'ingesteld' : 'leeg';
  if (!value) return '—';

  const short = value.length > 40 ? `${value.slice(0, 37)}…` : value;
  return envFile.isExternal(key) ? `${short} (hosting)` : short;
}

function envView(note = '') {
  const lines = [];

  for (const info of Object.values(ENV_GROUPS)) {
    lines.push(`**${info.title}**`);
    for (const key of info.fields) lines.push(`\`${key}\`: ${envValue(key)}`);
    lines.push('');
  }

  lines.push(
    'Waarden met **(hosting)** komen uit het paneel van je hosting; die winnen van `.env` en kun je hier dus niet aanpassen.'
  );
  lines.push('`DISCORD_TOKEN` staat hier bewust niet bij.');

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Instellingen (.env)')
    .setColor(COLOR)
    .setDescription((note ? `${note}\n\n` : '') + lines.join('\n'))
    .setFooter({ text: `${FOOTER} · v${version.version}` });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button('aids:beheer:env:kanalen', 'Kanalen', '📺', ButtonStyle.Primary),
        button('aids:beheer:env:rollen', 'Rollen', '🎭', ButtonStyle.Primary),
        button('aids:beheer:env:database', 'Database', '🗄️', ButtonStyle.Primary)
      ),
      backRow(),
    ],
  };
}

function envModal(group) {
  const info = ENV_GROUPS[group];
  const modal = new ModalBuilder()
    .setCustomId(`aids:beheer:envmodal:${group}`)
    .setTitle(`Instellingen: ${info.title}`.slice(0, 45));

  for (const key of info.fields) {
    const maxLength = key === 'WELCOME_IMAGE_URL' ? 500 : 100;
    const field = new TextInputBuilder()
      .setCustomId(key)
      .setLabel(`${ENV_LABELS[key] ?? key} (${key})`.slice(0, 45))
      .setStyle(TextInputStyle.Short)
      .setMaxLength(maxLength)
      .setRequired(false);

    // Het wachtwoord laten we leeg: leeg betekent "niet wijzigen".
    const current = envFile.value(key);
    if (current && key !== 'DB_PASSWORD') field.setValue(current.slice(0, maxLength));

    modal.addComponents(new ActionRowBuilder().addComponents(field));
  }

  return modal;
}

/** Controleert de ingevulde ID's tegen de server voordat ze worden opgeslagen. */
async function checkIdsInGuild(interaction, group, patch) {
  if (group === 'database') return [];

  const errors = [];
  const client = interaction.client;
  let guild = interaction.guild ?? client?.guilds?.cache?.get(config.guildId ?? '') ?? null;

  if (group === 'kanalen' && patch.GUILD_ID) {
    guild = client?.guilds?.cache?.get(patch.GUILD_ID) ?? null;
    if (!guild) {
      return [
        `Ik zit niet in een server met ID \`${patch.GUILD_ID}\`. Controleer het ID of nodig de bot eerst uit.`,
      ];
    }
  }

  if (!guild) return errors;

  const checkChannel = async (key, type, soort) => {
    const id = patch[key];
    if (!id) return;

    const channel =
      guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));

    if (!channel) {
      errors.push(`Kanaal \`${id}\` (${key}) bestaat niet in deze server.`);
      return;
    }
    if (channel.type !== type) {
      errors.push(`\`${key}\` wijst naar een kanaal dat geen ${soort} is.`);
    }
  };

  await checkChannel('TICKET_CATEGORY_ID', ChannelType.GuildCategory, 'categorie');
  await checkChannel('WELCOME_CHANNEL_ID', ChannelType.GuildText, 'tekstkanaal');
  await checkChannel('TICKET_LOG_CHANNEL_ID', ChannelType.GuildText, 'tekstkanaal');

  for (const key of ['STAFF_ROLE_ID', 'AUTO_ROLE_ID']) {
    const id = patch[key];
    if (!id) continue;

    const role = guild.roles.cache.get(id) ?? (await guild.roles.fetch(id).catch(() => null));
    if (!role) errors.push(`Rol \`${id}\` (${key}) bestaat niet in deze server.`);
  }

  return errors;
}

/** Valideert het venster, schrijft .env en past de wijziging toe. */
async function handleEnvModal(interaction, group) {
  const info = ENV_GROUPS[group];
  if (!info) {
    return interaction.reply({ content: 'Onbekende instellingengroep.', flags: MessageFlags.Ephemeral });
  }

  const read = (key) => interaction.fields.getTextInputValue(key).trim();
  const errors = [];
  const patch = {};

  if (group === 'database') {
    const host = read('DB_HOST');
    const port = read('DB_PORT');
    const name = read('DB_NAME');
    const user = read('DB_USER');
    const password = read('DB_PASSWORD');

    if (port && !(Number(port) >= 1 && Number(port) <= 65535)) {
      errors.push('`DB_PORT` moet een getal tussen 1 en 65535 zijn (of leeg).');
    }

    const filled = [host, name, user].filter(Boolean).length;
    if (filled > 0 && filled < 3) {
      errors.push('Vul `DB_HOST`, `DB_NAME` en `DB_USER` alle drie in, of laat ze alle drie leeg.');
    }

    Object.assign(patch, { DB_HOST: host, DB_PORT: port, DB_NAME: name, DB_USER: user });
    if (password) patch.DB_PASSWORD = password;
  } else {
    for (const key of info.fields) {
      const value = read(key);

      if (key === 'WELCOME_IMAGE_URL') {
        if (value && !/^https?:\/\//i.test(value)) {
          errors.push('De afbeelding-URL moet met `https://` beginnen (of leeg zijn).');
        }
      } else if (value && !/^\d{15,25}$/.test(value)) {
        errors.push(`\`${key}\` moet een Discord-ID van 15 tot 25 cijfers zijn (of leeg).`);
      }

      patch[key] = value;
    }
  }

  if (!errors.length) {
    errors.push(...(await checkIdsInGuild(interaction, group, patch)));
  }

  if (errors.length) {
    return interaction.reply({ content: `⚠️ ${errors.join('\n')}`, flags: MessageFlags.Ephemeral });
  }

  let written;
  try {
    written = envFile.setValues(patch);
  } catch (error) {
    return interaction.reply({
      content: `Opslaan in \`.env\` mislukt: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const notes = [];
  const overruled = written.filter((key) => envFile.isExternal(key));
  if (overruled.length) {
    notes.push(
      `⚠️ ${overruled.map((key) => `\`${key}\``).join(', ')} wordt door je hosting gezet; die waarde wint van \`.env\`.`
    );
  }

  if (group === 'database') {
    let usingDb = false;
    try {
      usingDb = await storage.reloadStorage();
    } catch (error) {
      notes.push(`Opnieuw verbinden mislukte: ${error.message}`);
    }

    notes.unshift(
      usingDb
        ? '✅ Databasegegevens opgeslagen en opnieuw verbonden.'
        : '⚠️ Opgeslagen, maar de verbinding lukte niet; de bot werkt nu op `data/*.json`. Zie de console.'
    );
  } else {
    notes.unshift(
      '✅ Opgeslagen in `.env`. Wijzigingen gelden meteen, behalve een nieuwe `GUILD_ID`: die werkt pas na een herstart (commands).'
    );
  }

  return interaction.reply({ ...envView(notes.join('\n\n')), flags: MessageFlags.Ephemeral });
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
    case 'env':
      if (rest[0]) {
        if (!ENV_GROUPS[rest[0]]) return;
        return interaction.showModal(envModal(rest[0]));
      }
      return interaction.update(envView());
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
        .fetch(config.welcomeChannelId ?? interaction.channelId)
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
  envView,
  envModal,
  handleEnvModal,
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
