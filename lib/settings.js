/**
 * Instellingen voor de embeds. Worden bewaard in data/settings.json, zodat
 * aanpassingen via /beheer bewaard blijven na een herstart.
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'data', 'settings.json');

const DEFAULTS = {
  panel: {
    title: '🎫 A.I.D.S. — Support & Aanmeldingen',
    description:
      'Klik op **Ticket aanmaken** en je krijgt een eigen kanaal met de staf.\n' +
      'Gebruik het voor je **intake**, een **aanmelding**, een **vraag** of een **klacht**.\n\n' +
      'Eén ticket per persoon. Geen ticket-spam — de rotorbladen zijn al duur genoeg.',
    color: 'D65C1E',
    footer: 'Airborne Insertion Direct Seizure · tempo, initiatief en controle',
    buttonLabel: 'Ticket aanmaken',
  },
  welcome: {
    title: 'Welkom bij Airborne Insertion Direct Seizure!',
    description:
      'Welkom {lid}. Meld je bij de **intake** en probeer bij je eerste landing ' +
      'minstens één rotorblad heel te houden.\n\n' +
      'Snelheid boven alles. Hotdrops recht op het doel. En onthoud: sterven is ' +
      'onderdeel van de strategie — je impact is wat telt.',
    color: 'D65C1E',
    footer: 'Airborne Insertion Direct Seizure · Tempo, initiatief en controle',
    imageUrl: '',
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Vult ontbrekende sleutels aan met de standaardwaarden. */
function merge(base, extra) {
  for (const key of Object.keys(base)) {
    const value = extra ? extra[key] : undefined;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      base[key] = merge(base[key], value);
    } else if (value !== undefined) {
      base[key] = value;
    }
  }
  return base;
}

class Settings {
  constructor(file = FILE) {
    this.file = file;
    this.data = clone(DEFAULTS);
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = merge(clone(DEFAULTS), raw);
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
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error(`Kon ${this.file} niet opslaan: ${error.message}`);
    }
  }

  get panel() {
    return this.data.panel;
  }

  get welcome() {
    return this.data.welcome;
  }

  update(section, values) {
    if (!this.data[section]) throw new Error(`Onbekende sectie: ${section}`);
    Object.assign(this.data[section], values);
    this.save();
    return this.data[section];
  }

  reset(section) {
    if (!DEFAULTS[section]) throw new Error(`Onbekende sectie: ${section}`);
    this.data[section] = clone(DEFAULTS[section]);
    this.save();
    return this.data[section];
  }
}

module.exports = new Settings();
module.exports.DEFAULTS = DEFAULTS;
