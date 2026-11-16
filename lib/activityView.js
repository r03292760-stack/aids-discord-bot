/**
 * De samenvatting van de activiteitenstatistiek, gedeeld door /activiteit en
 * /beheer → Statistieken, zodat beide dezelfde cijfers en opmaak tonen.
 */

const { EmbedBuilder } = require('discord.js');
const activityStore = require('./activityStore');

const COLOR = 0xd65c1e;
const MEDALS = ['🥇', '🥈', '🥉'];

function duration(seconds) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);

  if (hours && minutes) return `${hours} u ${minutes} min`;
  if (hours) return `${hours} u`;
  return `${minutes} min`;
}

/** De actiefste leden; embed is null als er nog geen activiteit is. */
function summaryEmbed(guildId, days = 30, limit = 10) {
  const { top, total } = activityStore.summary(guildId, { days, limit });

  if (!top.length) return { embed: null, total: 0 };

  const lines = top.map((entry, index) => {
    const badge = MEDALS[index] ?? `**${index + 1}.**`;
    return `${badge} <@${entry.userId}> — **${entry.messages}** berichten · ${duration(entry.voiceSeconds)}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`📊 Actiefste leden (${days} dagen)`)
    .setColor(COLOR)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${total} leden met activiteit · gesorteerd op berichten + spreektijd` });

  return { embed, total };
}

module.exports = { duration, summaryEmbed, MEDALS, COLOR };
