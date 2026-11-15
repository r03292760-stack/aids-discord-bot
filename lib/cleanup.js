/**
 * Onderhoud bij het starten: rijen opruimen die nergens meer bij horen.
 *
 * - Tickets waarvan het kanaal is verwijderd (ook als dat gebeurde terwijl de
 *   bot offline was).
 * - Opkomsten en agenda's waarvan het kanaal of het bericht niet meer bestaat.
 *
 * Alleen rijen die aantoonbaar weg zijn verdwijnen; als de bot iets niet mag of
 * kan controleren, blijft de rij staan en komt er een waarschuwing in de log.
 */

const ticketStore = require('./ticketStore');
const opkomstStore = require('./opkomstStore');
const agendaStore = require('./agendaStore');

const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;

/** Kanaal uit de cache of van de API; null als het niet meer bestaat. */
async function findChannel(client, channelId) {
  if (!channelId) return null;

  const cached = client.channels.cache.get(channelId);
  if (cached) return cached;

  try {
    return await client.channels.fetch(channelId);
  } catch (error) {
    if (error.code === UNKNOWN_CHANNEL) return null;
    throw error;
  }
}

/** Bestaat het bericht van deze opkomst of agenda nog? */
async function messageExists(client, entry) {
  if (!entry.messageId) return false;

  const channel = await findChannel(client, entry.channelId);
  if (!channel || !channel.messages) return false;

  try {
    await channel.messages.fetch(entry.messageId);
    return true;
  } catch (error) {
    if (error.code === UNKNOWN_MESSAGE) return false;
    throw error;
  }
}

async function cleanupTickets(client) {
  const result = { removed: 0, kept: 0, skipped: 0 };

  for (const { channelId } of ticketStore.all()) {
    try {
      if (await findChannel(client, channelId)) {
        result.kept += 1;
        continue;
      }
      ticketStore.remove(channelId);
      result.removed += 1;
      console.log(`Ticketkanaal ${channelId} bestaat niet meer - ticket uit de lijst gehaald`);
    } catch (error) {
      result.skipped += 1;
      console.warn(`Kon ticketkanaal ${channelId} niet controleren: ${error.message}`);
    }
  }

  return result;
}

async function cleanupMessages(client, store, label) {
  const result = { removed: 0, kept: 0, skipped: 0 };

  for (const entry of store.all()) {
    try {
      if (await messageExists(client, entry)) {
        result.kept += 1;
        continue;
      }
      store.remove(entry.id);
      result.removed += 1;
      console.log(`${label} ${entry.id} (${entry.title ?? 'zonder titel'}) bestaat niet meer - opgeruimd`);
    } catch (error) {
      result.skipped += 1;
      console.warn(`Kon ${label} ${entry.id} niet controleren: ${error.message}`);
    }
  }

  return result;
}

/** Voert alle opruimacties uit en logt de uitkomst. */
async function runCleanup(client) {
  const tickets = await cleanupTickets(client);
  const opkomsten = await cleanupMessages(client, opkomstStore, 'Opkomst');
  const agendas = await cleanupMessages(client, agendaStore, 'Agenda');

  const parts = [];
  if (tickets.removed) {
    parts.push(`${tickets.removed} ${tickets.removed === 1 ? 'ticket' : 'tickets'}`);
  }
  if (opkomsten.removed) {
    parts.push(`${opkomsten.removed} ${opkomsten.removed === 1 ? 'opkomst' : 'opkomsten'}`);
  }
  if (agendas.removed) {
    parts.push(`${agendas.removed} ${agendas.removed === 1 ? 'agenda' : "agenda's"}`);
  }

  if (parts.length) console.log(`Opgeruimd: ${parts.join(', ')}.`);

  const skipped = tickets.skipped + opkomsten.skipped + agendas.skipped;
  if (skipped) {
    console.warn(`Opruimen overgeslagen voor ${skipped} rij(en) die ik niet kon controleren.`);
  }

  return { tickets, opkomsten, agendas };
}

module.exports = { runCleanup, findChannel, messageExists };
