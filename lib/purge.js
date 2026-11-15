/**
 * /purge: berichten in een kanaal in bulk verwijderen.
 * Discord staat maximaal 100 berichten per keer toe, en niets ouder dan 14 dagen.
 */

const { PermissionFlagsBits } = require('discord.js');

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const FETCH_LIMIT = 100;

/** Waarom de bot hier niet kan opruimen, of null als het wel kan. */
function blockedReason(channel, me) {
  if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
    return 'Dit is geen tekstkanaal.';
  }
  if (typeof channel.isThread === 'function' && channel.isThread()) {
    return 'In een thread kan ik geen berichten in bulk verwijderen.';
  }

  const perms = typeof channel.permissionsFor === 'function' ? channel.permissionsFor(me) : null;
  if (!perms?.has?.([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory])) {
    return 'Ik mis de rechten **Berichten beheren** en **Kanaalgeschiedenis lezen** in dit kanaal.';
  }

  return null;
}

/**
 * Verwijdert berichten.
 * Zonder userId: de laatste `amount` berichten van het kanaal.
 * Met userId: alleen berichten van dat lid, uit de laatste 100 berichten.
 */
async function purge(channel, { amount, userId = null }) {
  const now = Date.now();

  if (userId) {
    const fetched = await channel.messages.fetch({ limit: FETCH_LIMIT });
    const targets = [...fetched.values()]
      .filter((message) => message.author?.id === userId)
      .slice(0, amount);

    if (!targets.length) return { deleted: 0, skipped: 0, empty: true };

    const recent = targets.filter((message) => now - message.createdTimestamp < MAX_AGE_MS);
    const skipped = targets.length - recent.length;
    if (!recent.length) return { deleted: 0, skipped, empty: false };

    const removed = await channel.bulkDelete(recent, true);
    return { deleted: removed.size, skipped, empty: false };
  }

  const removed = await channel.bulkDelete(amount, true);
  return { deleted: removed.size, skipped: Math.max(0, amount - removed.size), empty: false };
}

module.exports = { MAX_AGE_MS, FETCH_LIMIT, blockedReason, purge };
