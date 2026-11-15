/**
 * MySQL/MariaDB-opslag voor de gegevens van de bot.
 *
 * Zet DB_HOST, DB_USER en DB_NAME (en indien nodig DB_PORT en DB_PASSWORD) in
 * de omgeving of in .env. Zijn die er niet, dan blijft alles in data/*.json
 * staan, zodat de bot ook lokaal zonder database werkt.
 *
 * Tickets, opkomsten en de agenda hebben eigen tabellen. De instellingen en de
 * ticketsoorten zijn kleine configuratieblokken en staan als document in
 * bot_state.
 */

const mysql = require('mysql2/promise');

const config = {
  host: (process.env.DB_HOST || '').trim(),
  port: Number(process.env.DB_PORT) || 3306,
  user: (process.env.DB_USER || '').trim(),
  password: process.env.DB_PASSWORD || '',
  database: (process.env.DB_NAME || '').trim(),
};

const enabled = Boolean(config.host && config.user && config.database);

const CREATE_TABLES = [
  // Configuratie: instellingen en ticketsoorten.
  'CREATE TABLE IF NOT EXISTS bot_state (' +
    'name VARCHAR(64) NOT NULL PRIMARY KEY, ' +
    'data LONGTEXT NOT NULL, ' +
    'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' +
    ') DEFAULT CHARSET = utf8mb4',

  // Tellers voor ticketnummers, opkomst-ids en agenda-ids.
  'CREATE TABLE IF NOT EXISTS bot_counters (' +
    'name VARCHAR(64) NOT NULL PRIMARY KEY, ' +
    'value INT NOT NULL DEFAULT 0' +
    ') DEFAULT CHARSET = utf8mb4',

  'CREATE TABLE IF NOT EXISTS tickets (' +
    'channel_id VARCHAR(32) NOT NULL PRIMARY KEY, ' +
    'number INT NOT NULL, ' +
    'user_id VARCHAR(32) NOT NULL, ' +
    'opener_name VARCHAR(100) NOT NULL, ' +
    'opened_at VARCHAR(40) NOT NULL, ' +
    'claimed_by VARCHAR(32) NULL, ' +
    'claimed_by_name VARCHAR(100) NULL, ' +
    'type_id VARCHAR(64) NULL, ' +
    'answers LONGTEXT NOT NULL, ' +
    'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ' +
    'KEY tickets_user (user_id)' +
    ') DEFAULT CHARSET = utf8mb4',

  'CREATE TABLE IF NOT EXISTS opkomst (' +
    'id VARCHAR(20) NOT NULL PRIMARY KEY, ' +
    'guild_id VARCHAR(32) NULL, ' +
    'channel_id VARCHAR(32) NULL, ' +
    'message_id VARCHAR(32) NULL, ' +
    'title VARCHAR(255) NOT NULL, ' +
    'when_text VARCHAR(255) NOT NULL, ' +
    'notes LONGTEXT NOT NULL, ' +
    'minimum INT NULL, ' +
    'roles LONGTEXT NOT NULL, ' +
    'created_by VARCHAR(32) NULL, ' +
    'created_at VARCHAR(40) NOT NULL, ' +
    'closed_at VARCHAR(40) NULL, ' +
    'closed_by VARCHAR(32) NULL, ' +
    'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' +
    ') DEFAULT CHARSET = utf8mb4',

  'CREATE TABLE IF NOT EXISTS opkomst_answers (' +
    'event_id VARCHAR(20) NOT NULL, ' +
    'user_id VARCHAR(32) NOT NULL, ' +
    'answer ENUM(\'yes\', \'maybe\', \'no\') NOT NULL, ' +
    'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ' +
    'PRIMARY KEY (event_id, user_id)' +
    ') DEFAULT CHARSET = utf8mb4',

  'CREATE TABLE IF NOT EXISTS agenda (' +
    'id VARCHAR(20) NOT NULL PRIMARY KEY, ' +
    'guild_id VARCHAR(32) NULL, ' +
    'channel_id VARCHAR(32) NULL, ' +
    'message_id VARCHAR(32) NULL, ' +
    'title VARCHAR(255) NOT NULL, ' +
    'notes LONGTEXT NOT NULL, ' +
    'created_by VARCHAR(32) NULL, ' +
    'created_at VARCHAR(40) NOT NULL, ' +
    'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' +
    ') DEFAULT CHARSET = utf8mb4',

  'CREATE TABLE IF NOT EXISTS agenda_entries (' +
    'agenda_id VARCHAR(20) NOT NULL, ' +
    'user_id VARCHAR(32) NOT NULL, ' +
    'days LONGTEXT NOT NULL, ' +
    'times VARCHAR(255) NOT NULL, ' +
    'note VARCHAR(255) NOT NULL, ' +
    'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ' +
    'PRIMARY KEY (agenda_id, user_id)' +
    ') DEFAULT CHARSET = utf8mb4',
];

let pool = null;
let ready = false;

/** Eén wachtrij per onderwerp, zodat snelle wijzigingen elkaar niet inhalen. */
const queues = new Map();

/** Maakt verbinding en zorgt dat alle tabellen bestaan. */
async function init() {
  if (!enabled) {
    console.log('Geen database ingesteld (DB_HOST/DB_USER/DB_NAME) - opslag blijft in data/*.json');
    return false;
  }

  try {
    pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
    });

    for (const sql of CREATE_TABLES) await pool.query(sql);

    ready = true;
    console.log(`Database verbonden (${config.database} op ${config.host}) - opslag in eigen tabellen`);
    return true;
  } catch (error) {
    console.error(`Database niet bereikbaar (${error.message}) - ik val terug op data/*.json`);
    if (pool) await pool.end().catch(() => {});
    pool = null;
    ready = false;
    return false;
  }
}

function ensureReady() {
  if (!ready) throw new Error('Geen databaseverbinding');
}

/** Rijen ophalen. */
async function query(sql, params = []) {
  ensureReady();
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Meerdere schrijfacties als één geheel. */
async function transaction(work) {
  ensureReady();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

/** Voert schrijfwerk in volgorde uit per onderwerp. */
function enqueue(key, job) {
  if (!ready) return Promise.resolve(false);

  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(job)
    .then(() => true)
    .catch((error) => {
      console.error(`Opslaan van ${key} mislukt: ${error.message}`);
      return false;
    });

  queues.set(key, next);
  return next;
}

/** Teller uit bot_counters, 0 als hij er nog niet is. */
async function readCounter(name) {
  const rows = await query('SELECT value FROM bot_counters WHERE name = ? LIMIT 1', [name]);
  return rows.length ? Number(rows[0].value) || 0 : 0;
}

/** Oud document uit bot_state (voor de eenmalige migratie). */
async function readLegacyDoc(name) {
  const rows = await query('SELECT data FROM bot_state WHERE name = ? LIMIT 1', [name]);
  if (!rows.length) return { found: false };
  return { found: true, data: JSON.parse(rows[0].data) };
}

async function deleteLegacyDoc(name) {
  await query('DELETE FROM bot_state WHERE name = ?', [name]);
}

/**
 * Document in bot_state (instellingen en ticketsoorten).
 * Fouten gooien door, zodat een mislukte lezing niet de oude lokale kopie over
 * de database heen schrijft.
 */
async function readDoc(name) {
  if (!ready) return { found: false };

  const rows = await query('SELECT data FROM bot_state WHERE name = ? LIMIT 1', [name]);
  if (!rows.length) return { found: false };
  return { found: true, data: JSON.parse(rows[0].data) };
}

/** Document in bot_state schrijven, in volgorde per document. */
function writeDoc(name, value) {
  if (!ready) return Promise.resolve(false);

  const payload = JSON.stringify(value);
  return enqueue(`doc:${name}`, () =>
    query(
      'INSERT INTO bot_state (name, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      [name, payload]
    )
  );
}

/** Bewaart in de database als die er is, anders via de terugvaloptie (JSON). */
function persist(name, value, fallback) {
  if (ready) return writeDoc(name, value);
  return Promise.resolve(fallback());
}

/** Wacht tot alle schrijfacties klaar zijn. */
async function flush() {
  await Promise.all([...queues.values()].map((job) => job.catch(() => {})));
}

/** Laatste schrijfacties afmaken en de verbinding netjes sluiten. */
async function close() {
  await flush();
  if (pool) await pool.end().catch(() => {});
  pool = null;
  ready = false;
}

module.exports = {
  enabled,
  init,
  query,
  transaction,
  enqueue,
  readCounter,
  readLegacyDoc,
  deleteLegacyDoc,
  readDoc,
  writeDoc,
  persist,
  flush,
  close,
  isReady: () => ready,
};
