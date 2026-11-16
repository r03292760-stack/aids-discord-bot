/**
 * Het statistiekenbord: één embed in een kanaal die de bot zelf bijwerkt.
 *
 * Discord kan een embed niet zelf laten verversen, dus bewerkt de bot het bericht
 * elke vijf minuten opnieuw. Waar het bord staat (kanaal, bericht en periode)
 * wordt bij de instellingen bewaard, zodat het na een herstart doorgaat.
 */

const { EmbedBuilder } = require('discord.js');
const settings = require('./settings');
const activityStore = require('./activityStore');
const { duration, MEDALS } = require('./activityView');

const REFRESH_MS = 5 * 60 * 1000;
const COLOR = 0xd65c1e;

let timer = null;

function totals(guildId, days) {
  const { all } = activityStore.summary(guildId, { days, limit: Number.MAX_SAFE_INTEGER });

  return {
    all,
    messages: all.reduce((sum, entry) => sum + entry.messages, 0),
    voiceSeconds: all.reduce((sum, entry) => sum + entry.voiceSeconds, 0),
  };
}

function bar(share) {
  const filled = Math.max(0, Math.min(10, Math.round(share * 10)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}`;
}

/** De embed met totalen en de vijf actiefste leden. */
function boardEmbed(guildId, days = 30) {
  const { all, messages, voiceSeconds } = totals(guildId, days);
  const top = all.slice(0, 5);
  const best = top.length ? top[0].messages + top[0].voiceSeconds / 60 : 0;

  const embed = new EmbedBuilder()
    .setTitle('📊 Serverstatistieken')
    .setColor(COLOR)
    .addFields(
      { name: '💬 Berichten', value: messages.toLocaleString('nl-NL'), inline: true },
      { name: '🎙️ Spreektijd', value: duration(voiceSeconds), inline: true },
      { name: '👥 Actieve leden', value: all.length.toLocaleString('nl-NL'), inline: true }
    );

  if (!top.length) {
    embed.setDescription(
      `Nog geen activiteit in de laatste ${days} dagen. Berichten en spreektijd tellen vanaf de eerste start mee.`
    );
  } else {
    embed.setDescription(`De actiefste leden van de laatste **${days}** dagen.`);
    embed.addFields(
      top.map((entry, index) => {
        const score = entry.messages + entry.voiceSeconds / 60;
        const share = best ? score / best : 0;
        return {
          name: `${MEDALS[index] ?? `**${index + 1}.**`} <@${entry.userId}>`,
          value:
            `${bar(share)} **${entry.messages}** berichten · ${duration(entry.voiceSeconds)}\n` +
            `${entry.days} ${entry.days === 1 ? 'actieve dag' : 'actieve dagen'}`,
        };
      })
    );
  }

  embed
    .setFooter({ text: 'Wordt automatisch bijgewerkt · elke 5 minuten' })
    .setTimestamp(new Date());

  return embed;
}

async function channelOf(client, channelId) {
  return client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
}

/** Werkt het bord bij; false als er (nog) geen bord is of het bericht weg is. */
async function refresh(client) {
  const config = settings.stats;
  if (!config?.channelId || !config?.messageId) return false;

  const guildId = config.guildId || client.guilds.cache.first()?.id;
  if (!guildId) return false;

  const channel = await channelOf(client, config.channelId);
  if (!channel?.messages) return false;

  const message = await channel.messages.fetch(config.messageId).catch(() => null);
  if (!message) {
    console.warn(
      'Statistiekenbord: het bericht bestaat niet meer. Plaats het opnieuw met /statistieken.'
    );
    settings.update('stats', { messageId: '' });
    return false;
  }

  await message.edit({ embeds: [boardEmbed(guildId, config.days || 30)] });
  return true;
}

/** Start het verversen (eenmalig) en werk meteen één keer bij. */
function start(client) {
  if (timer) return;

  refresh(client).catch((error) =>
    console.error('Statistiekenbord bijwerken mislukt:', error.message)
  );

  timer = setInterval(() => {
    refresh(client).catch((error) =>
      console.error('Statistiekenbord bijwerken mislukt:', error.message)
    );
  }, REFRESH_MS);

  if (typeof timer.unref === 'function') timer.unref();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { boardEmbed, refresh, start, stop, REFRESH_MS, totals };
