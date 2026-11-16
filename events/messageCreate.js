/**
 * Telt berichten per lid voor de activiteitenstatistiek.
 * Bots, webhooks en privéberichten tellen niet mee.
 */

const { Events } = require('discord.js');
const activityStore = require('../lib/activityStore');

module.exports = {
  name: Events.MessageCreate,

  execute(message) {
    if (!message.guildId) return;
    if (!message.author || message.author.bot) return;
    if (message.system) return;

    activityStore.recordMessage(message.guildId, message.author.id);
  },
};
