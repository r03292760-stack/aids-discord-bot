/**
 * Houdt bij hoe lang iemand in een spraakkanaal zit, voor de activiteiten-
 * statistiek. Wisselen van kanaal telt gewoon door; het AFK-kanaal telt niet mee.
 */

const { Events } = require('discord.js');
const activityStore = require('../lib/activityStore');

/** Starttijd per lid: `${guildId}:${userId}` -> timestamp. */
const joins = new Map();

function counts(state) {
  return Boolean(state.channelId) && state.channelId !== state.guild?.afkChannelId;
}

function closeSession(key, userId, guildId) {
  const start = joins.get(key);
  if (!start) return;

  joins.delete(key);
  const seconds = (Date.now() - start) / 1000;
  if (seconds >= 1) activityStore.recordVoice(guildId, userId, seconds);
}

module.exports = {
  name: Events.VoiceStateUpdate,

  execute(oldState, newState) {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    const key = `${guild.id}:${member.id}`;
    const wasInside = counts(oldState);
    const isInside = counts(newState);

    if (!wasInside && isInside) {
      joins.set(key, Date.now());
      return;
    }

    if (wasInside && !isInside) {
      closeSession(key, member.id, guild.id);
      return;
    }

    // Van kanaal gewisseld: oude sessie afsluiten en opnieuw beginnen.
    if (wasInside && isInside && oldState.channelId !== newState.channelId) {
      closeSession(key, member.id, guild.id);
      joins.set(key, Date.now());
    }
  },

  /** Bij het stoppen: open spraaksessies tot nu meetellen. */
  flushAll() {
    for (const key of [...joins.keys()]) {
      const [guildId, userId] = key.split(':');
      closeSession(key, userId, guildId);
    }
  },
};
