/**
 * Leest en schrijft .env, zodat /beheer de kanaal- en rol-ID's en de
 * databasegegevens kan aanpassen zonder dat je een bestand hoeft te openen.
 *
 * Waarden die je hosting als omgevingsvariabele meegeeft, winnen van .env. Dat
 * kan de bot laten zien (isExternal), zodat je niet zoekt naar een wijziging die
 * nooit aankomt.
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '.env');

/** Sleutels die al in de omgeving stonden voordat .env geladen werd (hosting). */
const external = new Set(Object.keys(process.env));

const PAIR = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

let cache = null;

function readFile() {
  try {
    return fs.readFileSync(FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function unquote(raw) {
  const text = String(raw ?? '').trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1);
  }
  return text;
}

/** Zet een waarde netjes in het bestand: quotes alleen als het nodig is. */
function quote(value) {
  const text = String(value ?? '');
  if (!/[\s"'#\\]/.test(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function parse(text) {
  const entries = [];
  const values = new Map();

  for (const line of text.split(/\r?\n/)) {
    const match = PAIR.exec(line);
    if (!match) {
      entries.push({ type: 'raw', raw: line });
      continue;
    }
    const key = match[1];
    const value = unquote(match[2]);
    entries.push({ type: 'pair', key, value });
    values.set(key, value);
  }

  return { entries, values };
}

function data() {
  if (!cache) cache = parse(readFile());
  return cache;
}

/** De waarde die de bot gebruikt: hosting gaat voor .env, daarna de omgeving. */
function value(name) {
  if (external.has(name)) return (process.env[name] ?? '').trim();
  if (data().values.has(name)) return (data().values.get(name) ?? '').trim();
  return (process.env[name] ?? '').trim();
}

/** Staat deze sleutel in de omgeving van de hosting (en wint die van .env)? */
function isExternal(name) {
  return external.has(name);
}

/** Waar komt de waarde vandaan: 'hosting', '.env' of null. */
function source(name) {
  if (external.has(name)) return 'hosting';
  if (data().values.has(name)) return '.env';
  return null;
}

/** Schrijft de opgegeven sleutels weg en houdt de rest van het bestand intact. */
function setValues(patch) {
  const { entries } = data();
  const pending = new Map(Object.entries(patch).map(([key, value]) => [key, String(value ?? '')]));
  const seen = new Set();

  for (const entry of entries) {
    if (entry.type !== 'pair' || !pending.has(entry.key)) continue;
    entry.value = pending.get(entry.key);
    seen.add(entry.key);
  }

  for (const [key, value] of pending) {
    if (seen.has(key)) continue;
    entries.push({ type: 'pair', key, value });
  }

  const text = entries
    .map((entry) => (entry.type === 'pair' ? `${entry.key}=${quote(entry.value)}` : entry.raw))
    .join('\n');

  fs.writeFileSync(FILE, text.endsWith('\n') ? text : `${text}\n`);
  cache = null;

  return [...pending.keys()];
}

module.exports = { FILE, value, isExternal, source, setValues, parse };
