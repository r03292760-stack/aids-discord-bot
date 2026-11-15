/** Leest de instellingen uit .env en uit de omgeving van je hosting. */

const envFile = require('./envFile');

// Zorgt dat code die rechtstreeks process.env leest ook de .env-waarden ziet.
require('dotenv').config();

/** Discord-ID's zijn te groot voor een JavaScript-getal: we houden ze als tekst. */
const warned = new Set();

function envId(name) {
  const raw = envFile.value(name);
  if (!raw) return null;
  if (!/^\d{15,25}$/.test(raw)) {
    if (!warned.has(`${name}:${raw}`)) {
      console.warn(`${name} is geen geldig ID (${raw}) - wordt genegeerd`);
      warned.add(`${name}:${raw}`);
    }
    return null;
  }
  return raw;
}

/** Instaprol die nieuwe leden automatisch krijgen. */
const DEFAULT_AUTO_ROLE_ID = '1459910402799435909';

/**
 * Elke instelling is een getter: de waarde wordt bij gebruik gelezen, zodat een
 * wijziging via /beheer meteen geldt in plaats van pas na een herstart.
 */
module.exports = {
  get token() {
    return envFile.value('DISCORD_TOKEN');
  },
  get guildId() {
    return envId('GUILD_ID');
  },
  get staffRoleId() {
    return envId('STAFF_ROLE_ID');
  },
  get ticketCategoryId() {
    return envId('TICKET_CATEGORY_ID');
  },
  get ticketLogChannelId() {
    return envId('TICKET_LOG_CHANNEL_ID');
  },
  get welcomeChannelId() {
    return envId('WELCOME_CHANNEL_ID');
  },
  get welcomeImageUrl() {
    return envFile.value('WELCOME_IMAGE_URL');
  },
  get autoRoleId() {
    return envId('AUTO_ROLE_ID') || DEFAULT_AUTO_ROLE_ID;
  },
};
