/** Ledenbeheer: zoeken, rollen geven/afnemen en kicken met bevestiging. */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const COLOR = 0xd65c1e;
const pendingKicks = new Map();

function hasPermission(interaction, permission) {
  return interaction.memberPermissions?.has(permission) ?? false;
}

function formatRoles(member) {
  const everyoneId = member.guild?.id;
  const roles = member.roles.cache
    .filter((role) => role.id !== everyoneId)
    .sort((a, b) => b.position - a.position)
    .map((role) => role.name);
  return roles.length ? roles.slice(0, 8).join(', ') : 'geen';
}

/** Zoekt leden op (deel van) de naam, of pakt de nieuwste leden. */
async function findMembers(guild, term, limit = 20) {
  if (term) {
    const found = await guild.members.fetch({ query: term, limit });
    return [...found.values()];
  }
  const all = await guild.members.fetch();
  return [...all.values()]
    .sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0))
    .slice(0, limit);
}

function membersEmbed(members, term) {
  const embed = new EmbedBuilder()
    .setTitle(term ? `🔎 Leden met "${term}"` : '🕒 Nieuwste leden')
    .setColor(COLOR)
    .setFooter({ text: 'Airborne Insertion Direct Seizure · ledenbeheer' });

  if (!members.length) {
    return embed.setDescription('Geen leden gevonden.');
  }

  embed.setDescription(
    members
      .map((member) => {
        const joined = member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
          : 'onbekend';
        return (
          `**${member.user.username}** (${member})\n` +
          `Sinds ${joined} · rollen: ${formatRoles(member)}`
        );
      })
      .join('\n\n')
  );

  return embed;
}

/** Controleert of de bot deze rol mag geven of afnemen. */
function roleBlockReason(guild, target, role) {
  const me = guild.members.me;
  if (!me) return 'Ik kon mijn eigen lidmaatschap niet ophalen. Herstart de bot even.';
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return 'Ik mis de rechten **Rollen beheren**.';
  }
  if (role.id === guild.id) return 'De @everyone-rol kun je niet toewijzen.';
  if (role.managed) return 'Deze rol wordt door een integratie beheerd.';
  if (role.position >= me.roles.highest.position) {
    return 'Die rol staat hoger dan mijn eigen rol. Zet mijn rol hoger in de rollenlijst.';
  }
  if (target.id === guild.ownerId) return 'De servereigenaar kun je niet aanpassen.';
  if (
    target.roles.highest.position >= me.roles.highest.position &&
    target.id !== me.id
  ) {
    return 'Dit lid staat hoger in de rollenlijst dan ik.';
  }
  return null;
}

async function setRole(guild, target, role, action) {
  const reason = roleBlockReason(guild, target, role);
  if (reason) return reason;

  try {
    if (action === 'afnemen') {
      if (!target.roles.cache.has(role.id)) return `Dit lid heeft **${role.name}** niet.`;
      await target.roles.remove(role, 'Rol afgenomen via /leden');
      return null;
    }
    await target.roles.add(role, 'Rol gegeven via /leden');
    return null;
  } catch (error) {
    return `Discord weigerde het: ${error.message}`;
  }
}

function kickBlockReason(guild, target, actorId) {
  const me = guild.members.me;
  if (!me) return 'Ik kon mijn eigen lidmaatschap niet ophalen. Herstart de bot even.';
  if (!me.permissions.has(PermissionFlagsBits.KickMembers)) {
    return 'Ik mis de rechten **Leden kicken**.';
  }
  if (target.id === guild.ownerId) return 'De servereigenaar kun je niet kicken.';
  if (target.id === me.id) return 'Ik kan mezelf niet kicken.';
  if (target.id === actorId) return 'Je kunt jezelf niet kicken.';
  if (target.roles.highest.position >= me.roles.highest.position) {
    return 'Dit lid staat hoger in de rollenlijst dan ik.';
  }
  return null;
}

function kickConfirmView(target, actorId) {
  pendingKicks.set(`${actorId}:${target.id}`, Date.now() + 2 * 60 * 1000);

  return {
    content: `Weet je zeker dat je **${target.user.username}** wilt kicken?`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aids:leden:kick:yes:${target.id}`)
          .setLabel('Ja, kicken')
          .setEmoji('👢')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('aids:leden:kick:no')
          .setLabel('Nee, laten zitten')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

function kickStateValid(actorId, targetId) {
  const key = `${actorId}:${targetId}`;
  const expiry = pendingKicks.get(key);
  if (!expiry || expiry < Date.now()) {
    pendingKicks.delete(key);
    return false;
  }
  return true;
}

async function handleButton(interaction, action, rest) {
  if (action === 'kick' && rest[0] === 'no') {
    return interaction.update({ content: '👍 Niets gedaan.', components: [] });
  }

  if (action === 'kick' && rest[0] === 'yes') {
    const targetId = rest[1];
    if (!kickStateValid(interaction.user.id, targetId)) {
      return interaction.update({
        content: 'Deze bevestiging is verlopen. Gebruik `/leden kick` opnieuw.',
        components: [],
      });
    }
    const guild = interaction.guild;
    const target = await guild.members.fetch(targetId).catch(() => null);
    if (!target) {
      return interaction.update({ content: 'Dat lid is niet meer op de server.', components: [] });
    }
    const reason = kickBlockReason(guild, target, interaction.user.id);
    if (reason) return interaction.update({ content: reason, components: [] });

    try {
      await target.kick(`Gekickt door ${interaction.user.username}`);
    } catch (error) {
      return interaction.update({
        content: `Kicken mislukte: ${error.message}`,
        components: [],
      });
    }

    pendingKicks.delete(`${interaction.user.id}:${targetId}`);
    return interaction.update({
      content: `👢 **${target.user.username}** is van de server verwijderd.`,
      components: [],
    });
  }

  return undefined;
}

module.exports = {
  findMembers,
  membersEmbed,
  setRole,
  kickBlockReason,
  roleBlockReason,
  kickConfirmView,
  handleButton,
};
