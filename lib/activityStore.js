/**
 * Activiteitenstatistiek: hoeveel berichten iemand stuurt en hoeveel tijd hij in
 * spraakkanalen zit, per lid per dag.
 *
 * In de database staat tabel activity_daily; zonder database valt alles terug op
 * data/activity.json. Tijdens het draaien wordt in het geheugen geteld en gaat
 * het elke minuut in één batch naar de database, zodat een druk kanaal niet bij
 * elk bericht hoeft te wachten.
 */

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

const FILE = path.join(__dirname, '..', 'data', 'activity.json');
const TABLE = 'activity_daily';
const KEEP_DAYS = 90;
const FLUSH_MS = 60 * 1000;

/** Dag in UTC, als YYYY-MM-DD. */
function dayOf(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function cutoffDay(days) {
  return dayOf(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
}

class ActivityStore {
  constructor(file = FILE) {
    this.file = file;
    this.rows = new Map();
    this.pending = new Map();
    this.timer = null;
  }

  key(guildId, userId, day) {
    return `${guildId}:${userId}:${day}`;
  }

  /** Telt een gebeurtenis bij de dag van vandaag op. */
  record(guildId, userId, { messages = 0, voiceSeconds = 0 } = {}) {
    if (!guildId || !userId) return;
    if (!messages && !voiceSeconds) return;

    const day = dayOf();
    const seconds = Math.max(0, Math.round(voiceSeconds));
    const key = this.key(guildId, userId, day);

    const row = this.rows.get(key) ?? { guildId, userId, day, messages: 0, voiceSeconds: 0 };
    row.messages += messages;
    row.voiceSeconds += seconds;
    this.rows.set(key, row);

    const pending = this.pending.get(key) ?? { guildId, userId, day, messages: 0, voiceSeconds: 0 };
    pending.messages += messages;
    pending.voiceSeconds += seconds;
    this.pending.set(key, pending);

    this.startTimer();
  }

  recordMessage(guildId, userId) {
    this.record(guildId, userId, { messages: 1 });
  }

  recordVoice(guildId, userId, seconds) {
    this.record(guildId, userId, { voiceSeconds: seconds });
  }

  startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush().catch((error) =>
        console.error('Activiteit opslaan mislukt:', error.message)
      );
    }, FLUSH_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  readFile() {
    const rows = new Map();

    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const list = Array.isArray(raw) ? raw : Array.isArray(raw.rows) ? raw.rows : [];

      for (const row of list) {
        if (!row || !row.guildId || !row.userId || !row.day) continue;
        rows.set(this.key(row.guildId, row.userId, row.day), {
          guildId: String(row.guildId),
          userId: String(row.userId),
          day: String(row.day),
          messages: Number(row.messages) || 0,
          voiceSeconds: Number(row.voiceSeconds) || 0,
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Kon ${this.file} niet lezen: ${error.message}`);
      }
    }

    return rows;
  }

  saveFile() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...this.rows.values()], null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error(`Kon ${this.file} niet opslaan: ${error.message}`);
    }
  }

  /** Leest de laatste 90 dagen uit de database (of het bestand). */
  async hydrate() {
    const fileRows = this.readFile();

    if (db.isReady()) {
      try {
        const rows = await db.query(
          `SELECT guild_id, user_id, DATE_FORMAT(day, '%Y-%m-%d') AS day, messages, voice_seconds ` +
            `FROM ${TABLE} WHERE day >= ?`,
          [cutoffDay(KEEP_DAYS)]
        );

        this.rows = new Map();
        for (const row of rows) {
          this.rows.set(this.key(row.guild_id, row.user_id, row.day), {
            guildId: String(row.guild_id),
            userId: String(row.user_id),
            day: String(row.day),
            messages: Number(row.messages) || 0,
            voiceSeconds: Number(row.voice_seconds) || 0,
          });
        }

        // Eerste start met een database: bestaande bestandsgegevens overzetten.
        if (!rows.length && fileRows.size) {
          for (const row of fileRows.values()) {
            const key = this.key(row.guildId, row.userId, row.day);
            this.rows.set(key, { ...row });
            this.pending.set(key, { ...row });
          }
          await this.flush();
          console.log(`Activiteit: ${fileRows.size} dagregels uit ${this.file} overgezet naar de database`);
        }

        await this.prune();
        return;
      } catch (error) {
        console.error(`Kon de activiteit niet uit de database laden: ${error.message}`);
      }
    }

    this.rows = fileRows;
  }

  /** Schrijft de tellers van deze minuut weg. */
  async flush() {
    if (!this.pending.size) {
      if (!db.isReady()) this.saveFile();
      return;
    }

    const batch = [...this.pending.values()];
    this.pending = new Map();

    if (!db.isReady()) {
      this.saveFile();
      return;
    }

    await db.enqueue('activity', () =>
      db.transaction(async (connection) => {
        for (const row of batch) {
          await connection.query(
            `INSERT INTO ${TABLE} (guild_id, user_id, day, messages, voice_seconds) VALUES (?, ?, ?, ?, ?) ` +
              'ON DUPLICATE KEY UPDATE messages = messages + VALUES(messages), ' +
              'voice_seconds = voice_seconds + VALUES(voice_seconds)',
            [row.guildId, row.userId, row.day, row.messages, row.voiceSeconds]
          );
        }
      })
    );
  }

  /** Gooit dagregels ouder dan 90 dagen weg. */
  async prune() {
    const cutoff = cutoffDay(KEEP_DAYS);

    for (const [key, row] of this.rows) {
      if (row.day < cutoff) this.rows.delete(key);
    }

    if (db.isReady()) {
      await db.query(`DELETE FROM ${TABLE} WHERE day < ?`, [cutoff]).catch((error) =>
        console.error(`Opruimen van oude activiteit mislukt: ${error.message}`)
      );
    }
  }

  /** Totalen per lid over de laatste dagen, gesorteerd op activiteit. */
  summary(guildId, { days = 30, limit = 10 } = {}) {
    const cutoff = cutoffDay(Math.max(1, Math.min(90, days)));
    const perUser = new Map();

    for (const row of this.rows.values()) {
      if (row.guildId !== guildId || row.day < cutoff) continue;

      const entry =
        perUser.get(row.userId) ?? { userId: row.userId, messages: 0, voiceSeconds: 0, days: 0 };
      entry.messages += row.messages;
      entry.voiceSeconds += row.voiceSeconds;
      if (row.messages || row.voiceSeconds) entry.days += 1;
      perUser.set(row.userId, entry);
    }

    const score = (entry) => entry.messages + entry.voiceSeconds / 60;
    const all = [...perUser.values()].sort((a, b) => score(b) - score(a));

    return { total: all.length, top: all.slice(0, limit), all };
  }

  /** Cijfers van één lid over de laatste dagen. */
  forUser(guildId, userId, days = 30) {
    const { all } = this.summary(guildId, { days, limit: Number.MAX_SAFE_INTEGER });
    const index = all.findIndex((entry) => entry.userId === userId);

    return {
      entry: index === -1 ? { userId, messages: 0, voiceSeconds: 0, days: 0 } : all[index],
      position: index === -1 ? null : index + 1,
      total: all.length,
    };
  }
}

module.exports = new ActivityStore();
module.exports.ActivityStore = ActivityStore;
module.exports.dayOf = dayOf;
