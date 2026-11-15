/** Tickets: welke tickets open staan en welk nummer we zijn. */

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

const STORE_FILE = path.join(__dirname, '..', 'data', 'tickets.json');
const TABLE = 'tickets';
const COUNTER = 'tickets';

const COLUMNS = [
  'channel_id',
  'number',
  'user_id',
  'opener_name',
  'opened_at',
  'claimed_by',
  'claimed_by_name',
  'type_id',
  'answers',
];

function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function valuesOf(channelId, ticket) {
  return [
    channelId,
    Number(ticket.number) || 0,
    String(ticket.userId ?? ''),
    String(ticket.openerName ?? ''),
    String(ticket.openedAt ?? new Date().toISOString()),
    ticket.claimedBy ?? null,
    ticket.claimedByName ?? null,
    ticket.type ?? null,
    JSON.stringify(Array.isArray(ticket.answers) ? ticket.answers : []),
  ];
}

async function upsertTicket(connection, channelId, ticket) {
  await connection.query(
    `INSERT INTO ${TABLE} (${COLUMNS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
      'ON DUPLICATE KEY UPDATE number = VALUES(number), user_id = VALUES(user_id), ' +
      'opener_name = VALUES(opener_name), opened_at = VALUES(opened_at), ' +
      'claimed_by = VALUES(claimed_by), claimed_by_name = VALUES(claimed_by_name), ' +
      'type_id = VALUES(type_id), answers = VALUES(answers)',
    valuesOf(channelId, ticket)
  );
}

async function upsertCounter(connection, value) {
  await connection.query(
    'INSERT INTO bot_counters (name, value) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE value = GREATEST(value, VALUES(value))',
    [COUNTER, value]
  );
}

class TicketStore {
  constructor(file = STORE_FILE) {
    this.file = file;
    this.name = 'tickets';
    this.counter = 0;
    this.tickets = {};
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!data || typeof data !== 'object') return;
      this.counter = Number(data.counter) || 0;
      this.tickets = data.open && typeof data.open === 'object' ? data.open : {};
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Kon ${this.file} niet lezen: ${error.message}`);
      }
    }
  }

  /** Leest de tickets uit de database, of zet de bestaande bestanden erin. */
  async hydrate() {
    if (!db.isReady()) return;

    try {
      await this.migrateLegacy();

      const rows = await db.query(`SELECT ${COLUMNS.join(', ')} FROM ${TABLE} ORDER BY number`);
      const counter = await db.readCounter(COUNTER);

      if (!rows.length) {
        // Tabel nog leeg: bestaande data/tickets.json eenmalig overzetten.
        const highest = Math.max(
          0,
          ...Object.values(this.tickets).map((ticket) => Number(ticket.number) || 0)
        );
        this.counter = Math.max(this.counter, counter, highest);
        if (Object.keys(this.tickets).length) this.save();
        return;
      }

      this.tickets = {};
      for (const row of rows) {
        this.tickets[row.channel_id] = {
          number: Number(row.number) || 0,
          userId: row.user_id,
          openerName: row.opener_name,
          openedAt: row.opened_at,
          claimedBy: row.claimed_by,
          claimedByName: row.claimed_by_name,
          type: row.type_id,
          answers: parseJson(row.answers, []),
        };
      }

      this.counter = Math.max(counter, ...rows.map((row) => Number(row.number) || 0));
    } catch (error) {
      console.error(
        `Kon de tickets niet uit de database laden - ik gebruik ${this.file}: ${error.message}`
      );
    }
  }

  /** Eenmalig: het oude bot_state-document naar de tabel verplaatsen. */
  async migrateLegacy() {
    const doc = await db.readLegacyDoc(this.name);
    if (!doc.found) return;

    const rows = await db.query(`SELECT COUNT(*) AS aantal FROM ${TABLE}`);
    if (Number(rows[0]?.aantal) > 0) {
      await db.deleteLegacyDoc(this.name);
      return;
    }

    const open = doc.data?.open && typeof doc.data.open === 'object' ? doc.data.open : {};
    const entries = Object.entries(open);
    const counter = Number(doc.data?.counter) || 0;

    await db.transaction(async (connection) => {
      for (const [channelId, ticket] of entries) {
        await upsertTicket(connection, channelId, ticket ?? {});
      }
      await upsertCounter(connection, counter);
    });

    await db.deleteLegacyDoc(this.name);
    console.log(`Migratie: ${entries.length} open tickets uit het oude document naar tabel ${TABLE}`);
  }

  save() {
    if (!db.isReady()) {
      this.saveFile();
      return;
    }

    const open = Object.entries(this.tickets).map(([channelId, ticket]) => [
      channelId,
      JSON.parse(JSON.stringify(ticket)),
    ]);
    const counter = this.counter;

    db.enqueue(TABLE, () =>
      db.transaction(async (connection) => {
        for (const [channelId, ticket] of open) {
          await upsertTicket(connection, channelId, ticket);
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
      fs.writeFileSync(tmp, JSON.stringify({ counter: this.counter, open: this.tickets }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error(`Kon ${this.file} niet opslaan: ${error.message}`);
    }
  }

  nextNumber() {
    this.counter += 1;
    this.save();
    return this.counter;
  }

  add(channelId, member, number, meta = {}) {
    const ticket = {
      number,
      userId: member.id,
      openerName: member.user.username,
      openedAt: new Date().toISOString(),
      claimedBy: null,
      claimedByName: null,
      type: meta.typeId ?? null,
      answers: Array.isArray(meta.answers) ? meta.answers : [],
    };
    this.tickets[channelId] = ticket;
    this.save();
    return ticket;
  }

  get(channelId) {
    return this.tickets[channelId] ?? null;
  }

  remove(channelId) {
    const ticket = this.tickets[channelId] ?? null;
    delete this.tickets[channelId];

    if (db.isReady()) {
      db.enqueue(TABLE, () => db.query(`DELETE FROM ${TABLE} WHERE channel_id = ?`, [channelId]));
    } else {
      this.saveFile();
    }

    return ticket;
  }

  /** Alle open tickets, voor onderhoud (opruimen van dode kanalen). */
  all() {
    return Object.entries(this.tickets).map(([channelId, ticket]) => ({ channelId, ticket }));
  }

  findByUser(userId) {
    for (const [channelId, ticket] of Object.entries(this.tickets)) {
      if (ticket.userId === userId) return { channelId, ticket };
    }
    return null;
  }
}

module.exports = new TicketStore();
