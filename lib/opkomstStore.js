/** Kleine JSON-opslag voor opkomsten: wie doet er mee aan welke sessie. */

const fs = require('node:fs');
const path = require('node:path');

const STORE_FILE = path.join(__dirname, '..', 'data', 'opkomst.json');

class OpkomstStore {
  constructor(file = STORE_FILE) {
    this.file = file;
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

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ counter: this.counter, events: this.events }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error(`Kon ${this.file} niet opslaan: ${error.message}`);
    }
  }

  create({ guildId, channelId, messageId, title, when, notes, minimum, roles, createdBy }) {
    this.counter += 1;
    const entry = {
      id: String(this.counter),
      guildId,
      channelId,
      messageId,
      title,
      when,
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
