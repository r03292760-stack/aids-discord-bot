/**
 * De ticketsoorten en hun vragen, bewaard in data/ticketTypes.json.
 * Zo kun je in Discord zelf soorten toevoegen, namen en vragen aanpassen; de
 * standaard hieronder wordt gebruikt zolang dat bestand er nog niet is.
 */

const fs = require('node:fs');
const path = require('node:path');
const { TextInputStyle } = require('discord.js');

const STORE_FILE = path.join(__dirname, '..', 'data', 'ticketTypes.json');
const MAX_QUESTIONS = 5;
const MAX_TYPES = 20;

const DEFAULTS = [
  {
    id: 'sollicitatie',
    label: 'Sollicitatie',
    emoji: '🎯',
    description: 'Je wilt lid worden of een rol oppakken',
    title: 'Aanvraag: sollicitatie',
    enabled: true,
    questions: [
      { label: 'Je Arma-naam en hoe we je kennen', style: TextInputStyle.Short, maxLength: 120, required: true },
      { label: 'Hoeveel uur Arma, welke mods en rollen?', style: TextInputStyle.Paragraph, maxLength: 900, required: true },
      { label: 'Wanneer kun je meestal spelen?', style: TextInputStyle.Short, maxLength: 200, required: false },
    ],
  },
  {
    id: 'klacht',
    label: 'Klacht over een lid',
    emoji: '⚠️',
    description: 'Iemand ging te ver, of je wilt iets melden',
    title: 'Aanvraag: klacht',
    enabled: true,
    questions: [
      { label: 'Over wie gaat het (Arma- of Discord-naam)?', style: TextInputStyle.Short, maxLength: 120, required: true },
      { label: 'Wat is er precies gebeurd?', style: TextInputStyle.Paragraph, maxLength: 1200, required: true },
      { label: 'Wanneer was het, en heb je bewijs (clip/screenshot)?', style: TextInputStyle.Short, maxLength: 300, required: false },
    ],
  },
  {
    id: 'unban',
    label: 'Unban-aanvraag',
    emoji: '🔓',
    description: 'Je bent geband en vraagt om terug te mogen',
    title: 'Aanvraag: unban',
    enabled: true,
    questions: [
      { label: 'Je Arma- en Discord-naam', style: TextInputStyle.Short, maxLength: 120, required: true },
      { label: 'Steam-ID of spelersnaam op de server', style: TextInputStyle.Short, maxLength: 120, required: true },
      { label: 'Waarom zou je unbanned mogen worden?', style: TextInputStyle.Paragraph, maxLength: 1200, required: true },
    ],
  },
  {
    id: 'technisch',
    label: 'Technisch probleem',
    emoji: '🛠️',
    description: 'Mods, crashes, verbinding of de server',
    title: 'Aanvraag: technisch probleem',
    enabled: true,
    questions: [
      { label: 'Wat gaat er mis? (foutmelding mag je plakken)', style: TextInputStyle.Paragraph, maxLength: 1200, required: true },
      { label: 'Sinds wanneer, en bij welke kaart of mod?', style: TextInputStyle.Short, maxLength: 200, required: false },
      { label: 'Wat heb je zelf al geprobeerd?', style: TextInputStyle.Paragraph, maxLength: 900, required: false },
    ],
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** "Technisch probleem" → "technisch-probleem" (ook bruikbaar als kanaalnaam). */
function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
}

/** Zorgt dat een type uit het bestand alle velden heeft. */
function normaliseType(type, index) {
  const fallback = DEFAULTS[index] ?? DEFAULTS[0];
  const id = String(type?.id || fallback.id).replace(/[^a-z0-9-]/g, '') || `type${index + 1}`;

  const questions = Array.isArray(type?.questions) ? type.questions : fallback.questions;
  const cleanQuestions = questions
    .slice(0, MAX_QUESTIONS)
    .map((question, position) => ({
      id: `v${position + 1}`,
      label: String(question?.label || `Vraag ${position + 1}`).slice(0, 45),
      style: question?.style === TextInputStyle.Paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short,
      maxLength:
        Number(question?.maxLength) > 0 && Number(question?.maxLength) <= 4000
          ? Number(question.maxLength)
          : question?.style === TextInputStyle.Paragraph
            ? 1200
            : 200,
      required: question?.required !== false,
    }));

  if (!cleanQuestions.length) {
    cleanQuestions.push({
      id: 'v1',
      label: 'Waar kunnen we je mee helpen?',
      style: TextInputStyle.Paragraph,
      maxLength: 1200,
      required: true,
    });
  }

  return {
    id,
    label: String(type?.label || fallback.label).slice(0, 80),
    emoji: String(type?.emoji || fallback.emoji).slice(0, 8),
    description: String(type?.description || fallback.description).slice(0, 100),
    title: String(type?.title || fallback.title).slice(0, 45),
    enabled: type?.enabled !== false,
    questions: cleanQuestions,
  };
}

class TicketTypeStore {
  constructor(file = STORE_FILE) {
    this.file = file;
    this.types = [];
    this.load();
  }

  load() {
    let data = null;
    try {
      data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error(`Kon ${this.file} niet lezen: ${error.message}`);
    }

    const source = Array.isArray(data?.types) && data.types.length ? data.types : DEFAULTS;
    this.types = clone(source).map(normaliseType);
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ types: this.types }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error(`Kon ${this.file} niet opslaan: ${error.message}`);
    }
  }

  list() {
    return this.types;
  }

  get(id) {
    return this.types.find((type) => type.id === String(id)) ?? null;
  }

  /** Naam, omschrijving, emoji, titel of aan/uit. */
  setField(id, patch) {
    const type = this.get(id);
    if (!type) return null;

    if (patch.label !== undefined) type.label = String(patch.label).slice(0, 80) || type.label;
    if (patch.emoji !== undefined) type.emoji = String(patch.emoji).slice(0, 8) || type.emoji;
    if (patch.description !== undefined) type.description = String(patch.description).slice(0, 100);
    if (patch.title !== undefined) type.title = String(patch.title).slice(0, 45) || type.title;
    if (patch.enabled !== undefined) type.enabled = Boolean(patch.enabled);

    this.save();
    return type;
  }

  /** Een compleet nieuwe soort, met één beginvraag. */
  addType({ label, emoji, description, title }) {
    if (this.types.length >= MAX_TYPES) {
      return { error: `Er kunnen maximaal ${MAX_TYPES} soorten zijn (Discord-limiet).` };
    }

    const cleanLabel = String(label || '').trim().slice(0, 80);
    if (!cleanLabel) return { error: 'Geef de soort een naam.' };

    const base = slugify(cleanLabel) || 'ticket';
    let id = base;
    let counter = 2;
    while (this.get(id)) {
      id = `${base}-${counter}`.slice(0, 24);
      counter += 1;
    }

    const type = {
      id,
      label: cleanLabel,
      emoji: String(emoji || '🎫').slice(0, 8),
      description: String(description || '').slice(0, 100),
      title: String(title || cleanLabel).slice(0, 45),
      enabled: true,
      questions: [
        {
          id: 'v1',
          label: 'Waar kunnen we je mee helpen?',
          style: TextInputStyle.Paragraph,
          maxLength: 1200,
          required: true,
        },
      ],
    };

    this.types.push(type);
    this.save();
    return { type };
  }

  /** Eén vraag aanpassen (label, soort, verplicht). */
  setQuestion(id, index, patch) {
    const type = this.get(id);
    const question = type?.questions?.[Number(index)];
    if (!question) return null;

    if (patch.label !== undefined) {
      question.label = String(patch.label).slice(0, 45) || question.label;
    }
    if (patch.style !== undefined) {
      question.style = patch.style;
      question.maxLength = patch.style === TextInputStyle.Paragraph ? 1200 : 200;
    }
    if (patch.required !== undefined) question.required = Boolean(patch.required);

    this.save();
    return question;
  }

  addQuestion(id, { label, style, required }) {
    const type = this.get(id);
    if (!type) return { error: 'Dat tickettype bestaat niet.' };
    if (type.questions.length >= MAX_QUESTIONS) {
      return { error: `Een soort kan maximaal ${MAX_QUESTIONS} vragen hebben (Discord-limiet).` };
    }

    type.questions.push({
      id: `v${type.questions.length + 1}`,
      label: String(label || '').slice(0, 45) || 'Nieuwe vraag',
      style: style ?? TextInputStyle.Short,
      maxLength: style === TextInputStyle.Paragraph ? 1200 : 200,
      required: required !== false,
    });

    this.save();
    return { type };
  }

  /** Schuift een vraag een plek omhoog of omlaag. */
  moveQuestion(id, index, direction) {
    const type = this.get(id);
    if (!type) return { error: 'Dat tickettype bestaat niet.' };

    const from = Number(index);
    if (!type.questions[from]) return { error: 'Die vraag bestaat niet.' };

    const to = from + (direction === 'up' ? -1 : 1);
    if (to < 0) return { error: 'Deze vraag staat al bovenaan.' };
    if (to >= type.questions.length) return { error: 'Deze vraag staat al onderaan.' };

    const [question] = type.questions.splice(from, 1);
    type.questions.splice(to, 0, question);
    type.questions.forEach((item, position) => {
      item.id = `v${position + 1}`;
    });

    this.save();
    return { type, index: to };
  }

  removeQuestion(id, index) {
    const type = this.get(id);
    if (!type) return { error: 'Dat tickettype bestaat niet.' };
    if (type.questions.length <= 1) {
      return { error: 'Er moet minstens één vraag overblijven.' };
    }

    type.questions.splice(Number(index), 1);
    type.questions.forEach((question, position) => {
      question.id = `v${position + 1}`;
    });

    this.save();
    return { type };
  }
}

module.exports = {
  MAX_QUESTIONS,
  MAX_TYPES,
  slugify,
  DEFAULTS,
  normaliseType,
  TicketTypeStore,
  store: new TicketTypeStore(),
};
