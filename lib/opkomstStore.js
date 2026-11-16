/** Opkomsten: wie doet er mee aan welke sessie. */

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

const STORE_FILE = path.join(__dirname, '..', 'data', 'opkomst.json');
const TABLE = 'opkomst';
const ANSWERS_TABLE = 'opkomst_answers';
const COUNTER = 'opkomst';

const COLUMNS = [
  'id',
  'guild_id',
  'channel_id',
  'message_id',
  'title',
  'when_text',
  'server_text',
  'notes',
  'minimum',
  'roles',
  'created_by',
  'created_at',
  'closed_at',
  'closed_by',
];

const ANSWER_KEYS = ['yes', 'maybe', 'no'];

function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function valuesOf(entry) {
  return [
    String(entry.id),
    entry.guildId ?? null,
    entry.channelId ?? null,
    entry.messageId ?? null,
    String(entry.title ?? ''),
    String(entry.when ?? ''),
    String(entry.server ?? ''),
    String(entry.notes ?? ''),
    entry.minimum ?? null,
    JSON.stringify(Array.isArray(entry.roles) ? entry.roles : []),
    entry.createdBy ?? null,
    String(entry.createdAt ?? new Date().toISOString()),
    entry.closedAt ?? null,
    entry.closedBy ?? null,
  ];
}

async function upsertEvent(connection, entry) {
  await connection.query(
    `INSERT INTO ${TABLE} (${COLUMNS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
      'ON DUPLICATE KEY UPDATE guild_id = VALUES(guild_id), channel_id = VALUES(channel_id), ' +
      'message_id = VALUES(message_id), title = VALUES(title), when_text = VALUES(when_text), ' +
      'server_text = VALUES(server_text), notes = VALUES(notes), minimum = VALUES(minimum), ' +
      'roles = VALUES(roles), created_at = VALUES(created_at), closed_at = VALUES(closed_at), ' +
      'closed_by = VALUES(closed_by)',
    valuesOf(entry)
  );
}

/** Zet de aanmeldingen van één opkomst gelijk aan wat er in het geheugen staat. */
async function syncAnswers(connection, entry) {
  const wanted = new Map();
  for (const answer of ANSWER_KEYS) {
    for (const userId of entry[answer] ?? []) wanted.set(String(userId), answer);
  }

  const [current] = await connection.query(
    `SELECT user_id, answer FROM ${ANSWERS_TABLE} WHERE event_id = ?`,
    [String(entry.id)]
  );

  const known = new Set();
  for (const row of current) {
    known.add(row.user_id);
    const want = wanted.get(row.user_id);
    if (!want) {
      await connection.query(`DELETE FROM ${ANSWERS_TABLE} WHERE event_id = ? AND user_id = ?`, [
        String(entry.id),
        row.user_id,
      ]);
    } else if (want !== row.answer) {
      await connection.query(
        `UPDATE ${ANSWERS_TABLE} SET answer = ? WHERE event_id = ? AND user_id = ?`,
        [want, String(entry.id), row.user_id]
      );
    }
  }

  const additions = [...wanted].filter(([userId]) => !known.has(userId));
  if (additions.length) {
    await connection.query(`INSERT INTO ${ANSWERS_TABLE} (event_id, user_id, answer) VALUES ?`, [
      additions.map(([userId, answer]) => [String(entry.id), userId, answer]),
    ]);
  }
}

async function upsertCounter(connection, value) {
  await connection.query(
    'INSERT INTO bot_counters (name, value) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE value = GREATEST(value, VALUES(value))',
    [COUNTER, value]
  );
}

class OpkomstStore {
  constructor(file = STORE_FILE) {
    this.file = file;
    this.name = 'opkomst';
    this.counter = 0;
    this.events = {};
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!data || typeof data !== 'object') return;
      this.counter = Number(data.counter) || 0;
      this.events = data.events && typeof data.events === 'object' ? data.events : {};
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Kon ${this.file} niet lezen: ${error.message}`);
      }
    }
  }

  /** Leest de opkomsten uit de database, of zet de bestaande bestanden erin. */
  async hydrate() {
    if (!db.isReady()) return;

    try {
      await this.migrateLegacy();

      const events = await db.query(`SELECT ${COLUMNS.join(', ')} FROM ${TABLE} ORDER BY id`);
      const counter = await db.readCounter(COUNTER);

      if (!events.length) {
        // Tabel nog leeg: bestaande data/opkomst.json eenmalig overzetten.
        const highest = Math.max(0, ...Object.values(this.events).map((entry) => Number(entry.id) || 0));
        this.counter = Math.max(this.counter, counter, highest);
        if (Object.keys(this.events).length) this.save();
        return;
      }

      const answers = await db.query(
        `SELECT event_id, user_id, answer FROM ${ANSWERS_TABLE} ORDER BY updated_at, user_id`
      );

      const lists = new Map();
      for (const row of answers) {
        if (!lists.has(row.event_id)) lists.set(row.event_id, { yes: [], maybe: [], no: [] });
        const bucket = lists.get(row.event_id);
        if (bucket[row.answer]) bucket[row.answer].push(row.user_id);
      }

      this.events = {};
      for (const row of events) {
        const bucket = lists.get(row.id) ?? { yes: [], maybe: [], no: [] };
        this.events[row.id] = {
          id: row.id,
          guildId: row.guild_id,
          channelId: row.channel_id,
          messageId: row.message_id,
          title: row.title,
          when: row.when_text,
          server: row.server_text ?? '',
          notes: row.notes,
          minimum: row.minimum === null ? null : Number(row.minimum),
          roles: parseJson(row.roles, []),
          createdBy: row.created_by,
          createdAt: row.created_at,
          closedAt: row.closed_at,
          closedBy: row.closed_by,
          yes: bucket.yes,
          maybe: bucket.maybe,
          no: bucket.no,
        };
      }

      this.counter = Math.max(counter, ...events.map((row) => Number(row.id) || 0));
    } catch (error) {
      console.error(
        `Kon de opkomsten niet uit de database laden - ik gebruik ${this.file}: ${error.message}`
      );
    }
  }

  /** Eenmalig: het oude bot_state-document naar de tabellen verplaatsen. */
  async migrateLegacy() {
    const doc = await db.readLegacyDoc(this.name);
    if (!doc.found) return;

    const rows = await db.query(`SELECT COUNT(*) AS aantal FROM ${TABLE}`);
    if (Number(rows[0]?.aantal) > 0) {
      await db.deleteLegacyDoc(this.name);
      return;
    }

    const events = Object.values(doc.data?.events ?? {}).filter((entry) => entry && entry.id);

    await db.transaction(async (connection) => {
      for (const entry of events) {
        await upsertEvent(connection, entry);
        await syncAnswers(connection, entry);
      }
      await upsertCounter(connection, Number(doc.data?.counter) || 0);
    });

    await db.deleteLegacyDoc(this.name);
    console.log(`Migratie: ${events.length} opkomsten uit het oude document naar tabel ${TABLE}`);
  }

  save() {
    if (!db.isReady()) {
      this.saveFile();
      return;
    }

    const events = Object.values(this.events).map((entry) => JSON.parse(JSON.stringify(entry)));
    const counter = this.counter;

    db.enqueue(TABLE, () =>
      db.transaction(async (connection) => {
        for (const entry of events) {
          await upsertEvent(connection, entry);
          await syncAnswers(connection, entry);
        }
        await upsertCounter(connection, counter);
      })
    );
  }

  /** Terugval zonder database: het JSON-bestand. */
  saveFile() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ counter: this.counter, events: this.events }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error(`Kon ${this.file} niet opslaan: ${error.message}`);
    }
  }

  create({ guildId, channelId, messageId, title, when, server = '', notes, minimum, roles, createdBy }) {
    this.counter += 1;
    const entry = {
      id: String(this.counter),
      guildId,
      channelId,
      messageId,
      title,
      when,
      server: String(server ?? ''),
      notes,
      minimum: minimum ?? null,
      roles: Array.isArray(roles) ? roles : [],
      createdBy,
      createdAt: new Date().toISOString(),
      yes: [],
      maybe: [],
      no: [],
    };
    this.events[entry.id] = entry;
    this.save();
    return entry;
  }

  get(id) {
    return this.events[String(id)] ?? null;
  }

  /** Alle opkomsten, voor onderhoud (opruimen van verdwenen berichten). */
  all() {
    return Object.values(this.events).slice();
  }

  /** Haalt een opkomst en alle aanmeldingen weg. */
  remove(id) {
    const entry = this.get(id);
    if (!entry) return null;

    const key = String(id);
    delete this.events[key];

    if (db.isReady()) {
      db.enqueue(TABLE, () =>
        db.transaction(async (connection) => {
          await connection.query(`DELETE FROM ${ANSWERS_TABLE} WHERE event_id = ?`, [key]);
          await connection.query(`DELETE FROM ${TABLE} WHERE id = ?`, [key]);
        })
      );
    } else {
      this.saveFile();
    }

    return entry;
  }

  /** Zet iemand op aanwezig, misschien of afwezig; nog eens klikken meldt af. */
  setAnswer(id, userId, answer) {
    const entry = this.get(id);
    if (!entry) return null;

    const already = entry[answer].includes(userId);

    entry.yes = entry.yes.filter((value) => value !== userId);
    entry.maybe = entry.maybe.filter((value) => value !== userId);
    entry.no = entry.no.filter((value) => value !== userId);

    if (!already) entry[answer].push(userId);

    this.save();
    return entry;
  }
}

module.exports = new OpkomstStore();
module.exports.OpkomstStore = OpkomstStore;
