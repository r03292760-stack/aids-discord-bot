/** Kleine JSON-opslag: welke tickets staan open en welk nummer zijn we. */

const fs = require('node:fs');
const path = require('node:path');

const STORE_FILE = path.join(__dirname, '..', 'data', 'tickets.json');

class TicketStore {
  constructor(file = STORE_FILE) {
    this.file = file;
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

  save() {
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
    this.save();
    return ticket;
  }

  findByUser(userId) {
    for (const [channelId, ticket] of Object.entries(this.tickets)) {
      if (ticket.userId === userId) return { channelId, ticket };
    }
    return null;
  }
}

module.exports = new TicketStore();
