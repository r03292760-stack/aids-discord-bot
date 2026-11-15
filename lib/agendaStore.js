/** Agenda: wie kan wanneer. */

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

const STORE_FILE = path.join(__dirname, '..', 'data', 'agenda.json');
const TABLE = 'agenda';
const ENTRIES_TABLE = 'agenda_entries';
const COUNTER = 'agenda';

const COLUMNS = [
  'id',
  'guild_id',
  'channel_id',
  'message_id',
  'title',
  'notes',
  'created_by',
  'created_at',
];

function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function valuesOf(agenda) {
  return [
    String(agenda.id),
    agenda.guildId ?? null,
    agenda.channelId ?? null,
    agenda.messageId ?? null,
    String(agenda.title ?? ''),
    String(agenda.notes ?? ''),
    agenda.createdBy ?? null,
    String(agenda.createdAt ?? new Date().toISOString()),
  ];
}

async function upsertAgenda(connection, agenda) {
  await connection.query(
    `INSERT INTO ${TABLE} (${COLUMNS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ` +
      'ON DUPLICATE KEY UPDATE guild_id = VALUES(guild_id), channel_id = VALUES(channel_id), ' +
      'message_id = VALUES(message_id), title = VALUES(title), notes = VALUES(notes), ' +
      'created_at = VALUES(created_at)',
    valuesOf(agenda)
  );
}

/** Zet de invoer van één agenda gelijk aan wat er in het geheugen staat. */
async function syncEntries(connection, agenda) {
  const entries = agenda.entries ?? {};
  const wanted = new Set(Object.keys(entries));

  const [current] = await connection.query(
    `SELECT user_id FROM ${ENTRIES_TABLE} WHERE agenda_id = ?`,
    [String(agenda.id)]
  );

  const removed = current.map((row) => row.user_id).filter((userId) => !wanted.has(userId));
  if (removed.length) {
    await connection.query(`DELETE FROM ${ENTRIES_TABLE} WHERE agenda_id = ? AND user_id IN (?)`, [
      String(agenda.id),
      removed,
    ]);
  }

  for (const [userId, entry] of Object.entries(entries)) {
    await connection.query(
      `INSERT INTO ${ENTRIES_TABLE} (agenda_id, user_id, days, times, note) VALUES (?, ?, ?, ?, ?) ` +
        'ON DUPLICATE KEY UPDATE days = VALUES(days), times = VALUES(times), note = VALUES(note)',
      [
        String(agenda.id),
        String(userId),
        JSON.stringify(Array.isArray(entry.days) ? entry.days : []),
        String(entry.times ?? ''),
        String(entry.note ?? ''),
      ]
    );
  }
}

async function upsertCounter(connection, value) {
  await connection.query(
    'INSERT INTO bot_counters (name, value) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE value = GREATEST(value, VALUES(value))',
    [COUNTER, value]
  );
}

class AgendaStore {
  constructor(file = STORE_FILE) {
    this.file = file;
    this.name = 'agenda';
    this.counter = 0;
    this.agendas = {};
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!data || typeof data !== 'object') return;
      this.counter = Number(data.counter) || 0;
      this.agendas = data.agendas && typeof data.agendas === 'object' ? data.agendas : {};
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Kon ${this.file} niet lezen: ${error.message}`);
      }
    }
  }

  /** Leest de agenda's uit de database, of zet de bestaande bestanden erin. */
  async hydrate() {
    if (!db.isReady()) return;

    try {
      await this.migrateLegacy();

      const agendas = await db.query(`SELECT ${COLUMNS.join(', ')} FROM ${TABLE} ORDER BY id`);
      const counter = await db.readCounter(COUNTER);

      if (!agendas.length) {
        // Tabel nog leeg: bestaande data/agenda.json eenmalig overzetten.
        const highest = Math.max(0, ...Object.values(this.agendas).map((agenda) => Number(agenda.id) || 0));
        this.counter = Math.max(this.counter, counter, highest);
        if (Object.keys(this.agendas).length) this.save();
        return;
      }

      const entries = await db.query(
        `SELECT agenda_id, user_id, days, times, note, updated_at FROM ${ENTRIES_TABLE} ` +
          'ORDER BY updated_at, user_id'
      );

      const byAgenda = new Map();
      for (const row of entries) {
        if (!byAgenda.has(row.agenda_id)) byAgenda.set(row.agenda_id, {});
        byAgenda.get(row.agenda_id)[row.user_id] = {
          days: parseJson(row.days, []),
          times: row.times,
          note: row.note,
          updatedAt: new Date(row.updated_at).toISOString(),
        };
      }

      this.agendas = {};
      for (const row of agendas) {
        this.agendas[row.id] = {
          id: row.id,
          guildId: row.guild_id,
          channelId: row.channel_id,
          messageId: row.message_id,
          title: row.title,
          notes: row.notes,
          createdBy: row.created_by,
          createdAt: row.created_at,
          entries: byAgenda.get(row.id) ?? {},
        };
      }

      this.counter = Math.max(counter, ...agendas.map((row) => Number(row.id) || 0));
    } catch (error) {
      console.error(
        `Kon de agenda's niet uit de database laden - ik gebruik ${this.file}: ${error.message}`
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

    const agendas = Object.values(doc.data?.agendas ?? {}).filter((entry) => entry && entry.id);

    await db.transaction(async (connection) => {
      for (const agenda of agendas) {
        await upsertAgenda(connection, agenda);
        await syncEntries(connection, agenda);
      }
      await upsertCounter(connection, Number(doc.data?.counter) || 0);
    });

    await db.deleteLegacyDoc(this.name);
    console.log(`Migratie: ${agendas.length} agenda's uit het oude document naar tabel ${TABLE}`);
  }

  save() {
    if (!db.isReady()) {
      this.saveFile();
      return;
    }

    const agendas = Object.values(this.agendas).map((agenda) => JSON.parse(JSON.stringify(agenda)));
    const counter = this.counter;

    db.enqueue(TABLE, () =>
      db.transaction(async (connection) => {
        for (const agenda of agendas) {
          await upsertAgenda(connection, agenda);
          await syncEntries(connection, agenda);
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
      fs.writeFileSync(tmp, JSON.stringify({ counter: this.counter, agendas: this.agendas }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error(`Kon ${this.file} niet opslaan: ${error.message}`);
    }
  }

  create({ guildId, channelId, messageId, title, notes, createdBy }) {
    this.counter += 1;
    const agenda = {
      id: String(this.counter),
      guildId,
      channelId,
      messageId,
      title,
      notes,
      createdBy,
      createdAt: new Date().toISOString(),
      entries: {},
    };
    this.agendas[agenda.id] = agenda;
    this.save();
    return agenda;
  }

  get(id) {
    return this.agendas[String(id)] ?? null;
  }

  /** Alle agenda's, voor onderhoud (opruimen van verdwenen berichten). */
  all() {
    return Object.values(this.agendas).slice();
  }

  /** Haalt een agenda en alle ingevulde invoer weg. */
  remove(id) {
    const agenda = this.get(id);
    if (!agenda) return null;

    const key = String(id);
    delete this.agendas[key];

    if (db.isReady()) {
      db.enqueue(TABLE, () =>
        db.transaction(async (connection) => {
          await connection.query(`DELETE FROM ${ENTRIES_TABLE} WHERE agenda_id = ?`, [key]);
          await connection.query(`DELETE FROM ${TABLE} WHERE id = ?`, [key]);
        })
      );
    } else {
      this.saveFile();
    }

    return agenda;
  }

  /** Zet of vervangt de dagen en tijden van één lid. */
  setEntry(id, userId, { days, times, note }) {
    const agenda = this.get(id);
    if (!agenda) return null;

    agenda.entries[userId] = {
      days,
      times,
      note: note ?? '',
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return agenda;
  }

  /** Haalt iemands eigen invoer weer weg. */
  removeEntry(id, userId) {
    const agenda = this.get(id);
    if (!agenda) return null;

    delete agenda.entries[userId];
    this.save();
    return agenda;
  }
}

module.exports = new AgendaStore();
