/** Kleine JSON-opslag voor de agenda: wie kan wanneer. */

const fs = require('node:fs');
const path = require('node:path');

const STORE_FILE = path.join(__dirname, '..', 'data', 'agenda.json');

class AgendaStore {
  constructor(file = STORE_FILE) {
    this.file = file;
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

  save() {
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
