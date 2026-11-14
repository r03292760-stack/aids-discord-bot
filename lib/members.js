/** Hulpjes voor ledenbeheer: zoeken, rolhoogte en rolwijzigingen. */

const { PermissionFlagsBits } = require('discord.js');

/** Discord laat maximaal 25 keuzes per dropdown zien. */
const MAX_OPTIONS = 25;

/** Rollen van een lid als leesbare regel (zonder @everyone). */
function formatRoles(member) {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => role.name);
  return roles.length ? roles.slice(0, 8).join(', ') : 'geen';
}

function countRoles(member) {
  return member.roles.cache.filter((role) => role.id !== member.guild.id).size;
}

/** Zoekt leden op (deel van) de naam, of pakt de nieuwste leden. */
async function findMembers(guild, term, limit = MAX_OPTIONS) {
  if (term) {
    const found = await guild.members.fetch({ query: term, limit });
    return [...found.values()];
  }
  const all = await guild.members.fetch();
  return [...all.values()]
    .sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0))
    .slice(0, limit);
}

/** Rollen die de bot zelf mag geven en afnemen, hoogste eerst. */
function assignableRoles(guild) {
  const me = guild.members.me;
  if (!me) return [];
  return [...guild.roles.cache.values()]
    .filter(
      (role) =>
        role.id !== guild.id &&
        !role.managed &&
        role.position < me.roles.highest.position
    )
    .sort((a, b) => b.position - a.position);
}

/** Waarom de bot dit lid niet kan beheren, of null als het wel mag. */
function memberBlockReason(guild, target) {
  const me = guild.members.me;
  if (!me) return 'Ik kon mijn eigen lidmaatschap niet ophalen. Herstart de bot even.';
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return 'Ik mis de rechten **Rollen beheren**.';
  }
  if (target.id === guild.ownerId) return 'De servereigenaar kun je niet aanpassen.';
  if (target.id === me.id) return 'Mijn eigen rollen pas ik niet aan.';
  if (target.roles.highest.position >= me.roles.highest.position) {
    return 'Dit lid staat hoger in de rollenlijst dan ik.';
  }
  return null;
}

/** Waarom dit lid niet gekickt kan worden, of null als het mag. */
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

/**
 * Vergelijkt de gekozen rollen met wat het lid nu heeft en voert alleen de
 * verschillen uit. Rollen die niet in de lijst staan blijven ongemoeid.
 */
async function applyRoleChanges(guild, target, roleIds, actorName) {
  const chosen = new Set(roleIds);
  const log = [];

  for (const role of assignableRoles(guild).slice(0, MAX_OPTIONS)) {
    const has = target.roles.cache.has(role.id);
    const want = chosen.has(role.id);
    if (has === want) continue;

    try {
      if (want) {
        await target.roles.add(role, `Rollenbeheer door ${actorName}`);
        log.push(`➕ ${role.name}`);
      } else {
        await target.roles.remove(role, `Rollenbeheer door ${actorName}`);
        log.push(`➖ ${role.name}`);
      }
    } catch (error) {
      log.push(`⚠️ ${role.name}: ${error.message}`);
    }
  }

  return log;
}

module.exports = {
  MAX_OPTIONS,
  formatRoles,
  countRoles,
  findMembers,
  assignableRoles,
  memberBlockReason,
  kickBlockReason,
  applyRoleChanges,
};
