/**
 * Logboek van de bot in een eigen kanaal.
 *
 * Het kanaal staat in /beheer → Logboek (bij de instellingen), niet in .env.
 * Lukt schrijven niet (kanaal weg, geen rechten), dan gaat de bot gewoon door en
 * komt er een waarschuwing in de console.
 */

const { EmbedBuilder } = require('discord.js');
const settings = require('./settings');
const version = require('./version');

const COLOR = 0x2f3136;
const GREEN = 0x57f287;
const RED = 0xed4245;

function channelOf(client) {
  const id = settings.log?.channelId;
  if (!id || !client) return null;
  return client.channels?.cache?.get(id) ?? null;
}

/** Schrijft één regel naar het logkanaal; stil als er geen kanaal is ingesteld. */
async function log(client, { title, description = '', color = COLOR, fields = [], footer }) {
  const channel = channelOf(client);
  if (!channel) return null;

  const embed = new EmbedBuilder().setTitle(String(title).slice(0, 256)).setColor(color);

  if (description) embed.setDescription(String(description).slice(0, 4000));
  if (fields.length) embed.addFields(fields.slice(0, 25));
  embed.setTimestamp();
  embed.setFooter({ text: footer ?? `A.I.D.S. logboek · v${version.version}` });

  try {
    return await channel.send({
      embeds: [embed],
      // Nooit pingen vanuit een logboek, ook niet als er een @everyone in een titel staat.
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.warn(`Logboek: schrijven naar het logkanaal mislukt: ${error.message}`);
    return null;
  }
}

/** Naam en ID van een gebruiker, voor in het logboek. */
function who(user) {
  if (!user) return 'onbekend';
  const name = user.tag ?? user.username ?? 'onbekend';
  return `${name} (${user.id})`;
}

module.exports = { log, channelOf, who, COLOR, GREEN, RED };
