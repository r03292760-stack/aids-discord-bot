/**
 * Versie en commit van de code die nu draait. Wordt in /info getoond, zodat je
 * kunt zien of een update echt is doorgekomen.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function short(sha) {
  const clean = String(sha || '').trim();
  return /^[0-9a-f]{7,40}$/i.test(clean) ? clean.slice(0, 7) : null;
}

/** Leest de commit uit .git, ook als de ref in packed-refs staat. */
function readCommit() {
  const gitDir = path.join(ROOT, '.git');
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();

    // Losse checkout (geen branch): HEAD is dan de commit zelf.
    if (!head.startsWith('ref:')) return short(head);

    const ref = head.slice(4).trim();

    const refFile = path.join(gitDir, ref);
    if (fs.existsSync(refFile)) return short(fs.readFileSync(refFile, 'utf8'));

    const packed = path.join(gitDir, 'packed-refs');
    if (fs.existsSync(packed)) {
      for (const line of fs.readFileSync(packed, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('^')) continue;
        const [sha, name] = trimmed.split(' ');
        if (name === ref) return short(sha);
      }
    }

    return null;
  } catch {
    return null;
  }
}

const pkg = readJson(path.join(ROOT, 'package.json')) ?? {};
const version = pkg.version || '0.0.0';
const commit = readCommit();

module.exports = {
  version,
  commit,
  /** Regeltje voor in /info. */
  label: commit ? `v${version} · \`${commit}\`` : `v${version} · onbekend (geen .git)`,
};
