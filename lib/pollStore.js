/**
 * Peilingen: de vraag, de opties en wie wat stemde.
 *
 * Bewaard als document in bot_state (zonder database in data/polls.json), zodat
 * stemmen na een herstart blijven staan. Peilingen ouder dan 30 dagen worden
 * opgeruimd.
 */

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

const FILE = path.join(__dirname, '..', 'data', 'polls.json');
const NAME = 'polls';
const KEEP_DAYS = 30;

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

class PollStore {
  constructor(file = FILE) {
    this.file = file;
    this.name = NAME;
    this.polls = {};
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.polls = (raw && raw.polls) || {};
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Kon ${this.file} niet lezen: ${error.message}`);
      }
    }
  }

  async hydrate() {
    try {
      const doc = await db.readDoc(this.name);
      if (!doc.found) {
        // Eerste start met een database: wat er lokaal staat erin zetten.
        await db.writeDoc(this.name, { polls: this.polls });
        return;
      }
      this.polls = doc.data.polls || {};
      this.prune();
      this.save();
    } catch (error) {
      console.error(
        `Kon de peilingen niet uit de database laden - ik gebruik ${this.file}: ${error.message}`
      );
    }
  }

  save() {
    db.persist(this.name, { polls: this.polls }, () => this.saveFile());
  }

  saveFile() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ polls: this.polls }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error(`Kon ${this.file} niet opslaan: ${error.message}`);
    }
  }

  create({ guildId, channelId, question, options, createdBy }) {
    const poll = {
      id: newId(),
      guildId,
      channelId,
      messageId: null,
      question,
      options,
      votes: {},
      createdBy,
      createdAt: new Date().toISOString(),
      closedAt: null,
      closedBy: null,
    };

    this.polls[poll.id] = poll;
    this.save();
    return poll;
  }

  get(id) {
    return this.polls[String(id)] ?? null;
  }

  all() {
    return Object.values(this.polls);
  }

  /** Open peilingen van dit lid, voor de limiet. */
  openBy(userId) {
    return this.all().filter((poll) => !poll.closedAt && poll.createdBy === userId);
  }

  setMessage(id, messageId) {
    const poll = this.get(id);
    if (!poll) return null;
    poll.messageId = messageId;
    this.save();
    return poll;
  }

  /** Stem opslaan; nog eens op dezelfde optie klikken trekt de stem in. */
  vote(id, userId, choice) {
    const poll = this.get(id);
    if (!poll || poll.closedAt) return null;

    if (poll.votes[userId] === choice) delete poll.votes[userId];
    else poll.votes[userId] = choice;

    this.save();
    return poll;
  }

  close(id, userId) {
    const poll = this.get(id);
    if (!poll) return null;

    poll.closedAt = new Date().toISOString();
    poll.closedBy = userId;
    this.save();
    return poll;
  }

  remove(id) {
    const poll = this.get(id);
    if (!poll) return null;
    delete this.polls[poll.id];
    this.save();
    return poll;
  }

  prune() {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;

    for (const [id, poll] of Object.entries(this.polls)) {
      const created = new Date(poll.createdAt).getTime();
      if (!Number.isFinite(created) || created < cutoff) delete this.polls[id];
    }
  }
}

module.exports = new PollStore();
module.exports.PollStore = PollStore;
