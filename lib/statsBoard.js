/**
 * De vaste borden met cijfers: het statistiekenbord en het leaderbord.
 *
 * Discord kan een embed niet zelf laten verversen, dus bewerkt de bot het bericht
 * elke vijf minuten opnieuw. Waar een bord staat (kanaal, bericht en periode)
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

function scoreOf(entry) {
  return entry.messages + entry.voiceSeconds / 60;
}

/** Het statistiekenbord met totalen en de vijf actiefste leden. */
function statsEmbed(guildId, days = 30) {
  const { all, messages, voiceSeconds } = totals(guildId, days);
  const top = all.slice(0, 5);
  const best = top.length ? scoreOf(top[0]) : 0;

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
        const share = best ? scoreOf(entry) / best : 0;
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

/** Het leaderbord: de tien actiefste leden, met een balk achter elk cijfer. */
function leaderboardEmbed(guildId, days = 30) {
  const { all } = totals(guildId, days);
  const top = all.slice(0, 10);
  const best = top.length ? scoreOf(top[0]) : 0;

  const embed = new EmbedBuilder()
    .setTitle('🏆 Leaderbord')
    .setColor(COLOR)
    .setDescription(
      top.length
        ? `De tien actiefste leden van de laatste **${days}** dagen.\n\n` +
            top
              .map((entry, index) => {
                const share = best ? scoreOf(entry) / best : 0;
                const badge = MEDALS[index] ?? `**${index + 1}.**`;
                return (
                  `${badge} <@${entry.userId}> — **${entry.messages}** berichten · ${duration(entry.voiceSeconds)}\n` +
                  `${bar(share)} · ${entry.days} ${entry.days === 1 ? 'actieve dag' : 'actieve dagen'}`
                );
              })
              .join('\n\n')
        : `Nog geen activiteit in de laatste ${days} dagen. Berichten en spreektijd tellen vanaf de eerste start mee.`
    )
    .setFooter({ text: 'Wordt automatisch bijgewerkt · elke 5 minuten' })
    .setTimestamp(new Date());

  return embed;
}

const BOARDS = {
  stats: {
    label: 'Statistiekenbord',
    command: '/statistieken',
    config: () => settings.stats,
    save: (patch) => settings.update('stats', patch),
    embed: statsEmbed,
  },
  leaderboard: {
    label: 'Leaderbord',
    command: '/leaderbord',
    config: () => settings.leaderboard,
    save: (patch) => settings.update('leaderboard', patch),
    embed: leaderboardEmbed,
  },
};

async function channelOf(client, channelId) {
  return client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
}

/** Werkt een bord bij; false als het er (nog) niet is of het bericht weg is. */
async function refresh(client, kind = 'stats') {
  const board = BOARDS[kind];
  if (!board) throw new Error(`Onbekend bord: ${kind}`);

  const config = board.config();
  if (!config?.channelId || !config?.messageId) return false;

  const guildId = config.guildId || client.guilds.cache.first()?.id;
  if (!guildId) return false;

  const channel = await channelOf(client, config.channelId);
  if (!channel?.messages) return false;

  const message = await channel.messages.fetch(config.messageId).catch(() => null);
  if (!message) {
    console.warn(`${board.label}: het bericht bestaat niet meer. Plaats het opnieuw met ${board.command}.`);
    board.save({ messageId: '' });
    return false;
  }

  await message.edit({ embeds: [board.embed(guildId, config.days || 30)] });
  return true;
}

/**
 * Zet een bord in het kanaal of werkt het bestaande bord in dat kanaal bij.
 * Geeft het bericht terug; de aanroeper regelt de bevestiging.
 */
async function place(client, kind, { guildId, channel, days = 30 }) {
  const board = BOARDS[kind];
  if (!board) throw new Error(`Onbekend bord: ${kind}`);

  const config = board.config();
  let message = null;

  if (config?.messageId && config.channelId === channel.id) {
    message = await channel.messages.fetch(config.messageId).catch(() => null);
  }

  if (message) {
    await message.edit({ embeds: [board.embed(guildId, days)] });
  } else {
    message = await channel.send({ embeds: [board.embed(guildId, days)] });
  }

  board.save({ guildId, channelId: channel.id, messageId: message.id, days });
  start(client);

  return { message, created: !config?.messageId || config.messageId !== message.id };
}

/** Start het verversen (eenmalig) en werk alle borden meteen één keer bij. */
function start(client) {
  if (timer) return;

  const refreshAll = () => {
    for (const kind of Object.keys(BOARDS)) {
      refresh(client, kind).catch((error) =>
        console.error(`${BOARDS[kind].label} bijwerken mislukt:`, error.message)
      );
    }
  };

  refreshAll();
  timer = setInterval(refreshAll, REFRESH_MS);

  if (typeof timer.unref === 'function') timer.unref();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  boardEmbed: statsEmbed,
  statsEmbed,
  leaderboardEmbed,
  refresh,
  place,
  start,
  stop,
  REFRESH_MS,
  totals,
};
