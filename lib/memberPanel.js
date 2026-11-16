/**
 * Leden- en rollenbeheer binnen /beheer: door alle leden bladeren (25 per
 * pagina), zoeken, rollen aan- en uitvinken en kicken met bevestiging.
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

const members = require('./members');
const botLog = require('./botLog');
const config = require('./config');
const { canBeheer, deniedMessage } = require('./permissions');

const COLOR = 0xd65c1e;
const FOOTER = 'Airborne Insertion Direct Seizure · ledenbeheer';

/** Discord laat maximaal 25 keuzes per dropdown zien; daarom bladeren we. */
const PAGE_SIZE = 25;

function cut(text, max = 100) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function guildOf(client) {
  return client.guilds.cache.get(config.guildId) ?? client.guilds.cache.first() ?? null;
}

function denied(interaction) {
  return interaction.reply({
    content: deniedMessage(),
    flags: MessageFlags.Ephemeral,
  });
}

function button(id, label, emoji, style = ButtonStyle.Secondary) {
  const builder = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) builder.setEmoji(emoji);
  return builder;
}

function memberOption(member) {
  return new StringSelectMenuOptionBuilder()
    .setLabel(cut(member.displayName ?? member.user.username, 100))
    .setValue(member.id)
    .setDescription(
      cut(
        `@${member.user.username}${member.user.bot ? ' · bot' : ''} · ${members.countRoles(member)} rollen`,
        100
      )
    );
}

function memberRow(list, page) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('aids:memb:pick')
      .setPlaceholder(`Kies een lid (pagina ${page + 1})`)
      .addOptions(list.slice(0, PAGE_SIZE).map(memberOption))
  );
}

/** Pakt 25 leden voor de gevraagde pagina; zoeken geeft één pagina resultaten. */
async function memberPage(guild, term, wanted) {
  if (term) {
    const found = await members.findMembers(guild, term, PAGE_SIZE);
    return { list: found, page: 0, pages: 1, total: found.length };
  }

  let all;
  try {
    all = await guild.members.fetch();
  } catch (error) {
    console.error('Kon de ledenlijst niet ophalen:', error.message);
    all = guild.members.cache;
  }

  const sorted = [...all.values()].sort(
    (a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0)
  );
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(Math.max(0, Number(wanted) || 0), pages - 1);

  return {
    list: sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    page,
    pages,
    total: sorted.length,
  };
}

/** Overzicht met een keuzelijst van leden. */
async function listView(guild, { term = '', page = 0, note = '' } = {}) {
  if (!guild) {
    return {
      content: 'Ik kan de server niet vinden. Zet `GUILD_ID` in je omgeving.',
      embeds: [],
      components: [],
    };
  }

  const { list, page: current, pages, total } = await memberPage(guild, term, page);
  const humans = guild.members.cache.filter((member) => !member.user.bot).size;
  const bots = guild.members.cache.filter((member) => member.user.bot).size;

  const embed = new EmbedBuilder()
    .setTitle(term ? `👥 Leden met “${cut(term, 60)}”` : '👥 Ledenbeheer')
    .setColor(COLOR)
    .setDescription(
      (note ? `${note}\n\n` : '') +
        (list.length
          ? 'Kies hieronder een lid om de rollen te bekijken of aan te passen.\n' +
            (term
              ? 'Zoek je iemand anders? Gebruik **Zoeken** met een ander stukje van de naam.'
              : 'Blader met **Vorige** en **Volgende**, of zoek direct met **Zoeken**.')
          : 'Geen leden gevonden met die naam. Probeer een ander stukje van de naam.')
    )
    .addFields(
      { name: 'Leden', value: `${guild.memberCount}`, inline: true },
      { name: 'Mensen', value: `${humans}`, inline: true },
      { name: 'Bots', value: `${bots}`, inline: true }
    )
    .setFooter({
      text: term
        ? `${FOOTER} · ${total} resultaten`
        : `${FOOTER} · pagina ${current + 1} van ${pages} · ${total} leden`,
    });

  const rows = [];
  if (list.length) rows.push(memberRow(list, current));

  if (!term && pages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        button(`aids:memb:page:${current - 1}`, 'Vorige', '◀️').setDisabled(current === 0),
        button(`aids:memb:page:${current + 1}`, 'Volgende', '▶️').setDisabled(current >= pages - 1)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      button('aids:memb:search', 'Zoeken', '🔍', ButtonStyle.Primary),
      button('aids:memb:list', 'Verversen', '🔄'),
      button('aids:beheer:back', 'Terug', '⬅️'),
      button('aids:beheer:close', 'Sluiten', '✖️', ButtonStyle.Danger)
    )
  );

  return { embeds: [embed], components: rows };
}

/** Detailweergave van één lid met roldropdown en kickknop. */
function memberView(guild, member, note = '') {
  const block = members.memberBlockReason(guild, member);
  const roles = member.roles.cache
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => b.position - a.position);

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${cut(member.displayName ?? member.user.username, 80)}`)
    .setColor(COLOR)
    .setDescription(
      [
        note,
        block
          ? `⚠️ ${block}`
          : 'Vink hieronder aan welke rollen dit lid moet hebben.\n' +
            'Wat je uitvinkt wordt afgenomen, wat je aanzet wordt gegeven.',
      ]
        .filter(Boolean)
        .join('\n\n')
    )
    .addFields(
      { name: 'Account', value: `${member} · \`${member.id}\`` },
      {
        name: 'Op de server',
        value: member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
          : 'onbekend',
        inline: true,
      },
      {
        name: 'Account sinds',
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      {
        name: `Rollen (${roles.size})`,
        value: roles.size ? cut(roles.map((role) => role.toString()).join(' '), 1024) : 'geen',
      }
    )
    .setFooter({ text: FOOTER });

  if (typeof member.displayAvatarURL === 'function') {
    embed.setThumbnail(member.displayAvatarURL());
  }

  const rows = [];

  if (!block) {
    const available = members.assignableRoles(guild).slice(0, members.MAX_OPTIONS);
    if (available.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`aids:memb:roles:${member.id}`)
            .setPlaceholder('Rollen kiezen')
            .setMinValues(0)
            .setMaxValues(available.length)
            .addOptions(
              available.map((role) => {
                const option = new StringSelectMenuOptionBuilder()
                  .setLabel(cut(role.name, 100))
                  .setValue(role.id)
                  .setDescription(cut(`${role.members.size} leden · positie ${role.position}`, 100));
                if (member.roles.cache.has(role.id)) option.setDefault(true);
                return option;
              })
            )
        )
      );
    } else {
      embed.addFields({
        name: 'Geen rollen',
        value: 'Er zijn geen rollen die ik mag uitdelen. Zet mijn rol hoger in de rollenlijst.',
      });
    }
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      button(`aids:memb:kick:${member.id}`, 'Kicken', '👢', ButtonStyle.Danger),
      button('aids:memb:list', 'Terug naar lijst', '⬅️'),
      button('aids:beheer:close', 'Sluiten', '✖️')
    )
  );

  return { embeds: [embed], components: rows };
}

function kickConfirmView(member) {
  const embed = new EmbedBuilder()
    .setTitle('👢 Weet je het zeker?')
    .setColor(COLOR)
    .setDescription(
      `Hiermee gooi je **${member.user.username}** van de server.\n` +
        'Het lid kan later opnieuw joinen; de rollen raakt hij kwijt.'
    )
    .setFooter({ text: FOOTER });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button(`aids:memb:kickyes:${member.id}`, 'Ja, kicken', '👢', ButtonStyle.Danger),
        button(`aids:memb:back:${member.id}`, 'Nee, terug', null, ButtonStyle.Secondary)
      ),
    ],
  };
}

function searchModal() {
  return new ModalBuilder()
    .setCustomId('aids:memb:search')
    .setTitle('Lid zoeken')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('zoek')
          .setLabel('Naam of een deel van de naam')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(50)
          .setRequired(true)
      )
    );
}

async function openList(interaction) {
  if (!canBeheer(interaction)) return denied(interaction);
  return interaction.update(await listView(interaction.guild));
}

async function handleSelect(interaction, action) {
  if (!canBeheer(interaction)) return denied(interaction);

  const guild = interaction.guild;
  if (!guild) return;

  if (action === 'pick') {
    const member = await guild.members.fetch(interaction.values[0]).catch(() => null);
    if (!member) {
      return interaction.update(await listView(guild, { note: 'Dat lid is niet meer op de server.' }));
    }
    return interaction.update(memberView(guild, member));
  }

  if (action === 'roles') {
    const memberId = interaction.customId.split(':')[3];
    const member = await guild.members.fetch(memberId).catch(() => null);
    if (!member) {
      return interaction.update(await listView(guild, { note: 'Dat lid is niet meer op de server.' }));
    }

    const block = members.memberBlockReason(guild, member);
    if (block) return interaction.update(memberView(guild, member, `⚠️ ${block}`));

    const log = await members.applyRoleChanges(
      guild,
      member,
      interaction.values,
      interaction.user.username
    );

    if (log.length) {
      await botLog.log(interaction.client, {
        title: '🎭 Rollen aangepast',
        description: `Door <@${interaction.user.id}> bij ${member}: ${log.join(', ')}.`,
      });
    }

    const note = log.length ? `✅ Aangepast: ${log.join(', ')}` : 'Niets gewijzigd.';
    return interaction.update(memberView(guild, member, note));
  }
}

async function handleButton(interaction, action, rest) {
  if (!canBeheer(interaction)) return denied(interaction);

  const guild = interaction.guild;
  if (!guild) return;

  if (action === 'search') return interaction.showModal(searchModal());
  if (action === 'list') return interaction.update(await listView(guild));
  if (action === 'page') return interaction.update(await listView(guild, { page: rest[0] }));

  if (action === 'back') {
    const member = await guild.members.fetch(rest[0]).catch(() => null);
    if (!member) {
      return interaction.update(await listView(guild, { note: 'Dat lid is niet meer op de server.' }));
    }
    return interaction.update(memberView(guild, member));
  }

  if (action === 'kick') {
    const member = await guild.members.fetch(rest[0]).catch(() => null);
    if (!member) {
      return interaction.update(await listView(guild, { note: 'Dat lid is niet meer op de server.' }));
    }
    return interaction.update(kickConfirmView(member));
  }

  if (action === 'kickyes') {
    const target = await guild.members.fetch(rest[0]).catch(() => null);
    if (!target) {
      return interaction.update(await listView(guild, { note: 'Dat lid is niet meer op de server.' }));
    }

    const reason = members.kickBlockReason(guild, target, interaction.user.id);
    if (reason) {
      return interaction.update(memberView(guild, target, `⚠️ ${reason}`));
    }

    const name = target.user.username;
    try {
      await target.kick(`Gekickt door ${interaction.user.username}`);
    } catch (error) {
      return interaction.update(memberView(guild, target, `⚠️ Kicken mislukte: ${error.message}`));
    }

    await botLog.log(interaction.client, {
      title: '👢 Lid gekickt',
      description: `**${name}** (${target.id}) is door <@${interaction.user.id}> van de server verwijderd.`,
    });

    return interaction.update(
      await listView(guild, { note: `👢 **${name}** is van de server verwijderd.` })
    );
  }

  return undefined;
}

async function handleModal(interaction) {
  if (!canBeheer(interaction)) return denied(interaction);

  const term = interaction.fields.getTextInputValue('zoek').trim();
  const view = await listView(interaction.guild, { term });
  return interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
}

module.exports = {
  PAGE_SIZE,
  guildOf,
  listView,
  memberView,
  kickConfirmView,
  searchModal,
  openList,
  handleSelect,
  handleButton,
  handleModal,
};
