/**
 * Leest alle stores uit de opslag bij het starten, en kan na een wijziging van
 * de databasegegevens in .env opnieuw verbinden en inlezen.
 */

const db = require('./db');
const settings = require('./settings');
const ticketStore = require('./ticketStore');
const { store: ticketTypeStore } = require('./ticketTypeStore');
const opkomstStore = require('./opkomstStore');
const agendaStore = require('./agendaStore');

const stores = [settings, ticketStore, ticketTypeStore, opkomstStore, agendaStore];

/** Vult elke store uit de database (of laat de lokale bestanden staan). */
async function hydrateAll() {
  await Promise.all(stores.map((store) => store.hydrate()));
}

/** Sluit de database, leest de nieuwe gegevens en vult de stores opnieuw. */
async function reloadStorage() {
  const usingDb = await db.reload();
  if (usingDb) await hydrateAll();
  return usingDb;
}

module.exports = { hydrateAll, reloadStorage, isDbReady: db.isReady };
