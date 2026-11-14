/** Leest de instellingen uit .env (of uit de omgeving van je hosting). */

require('dotenv').config();

/** Discord-ID's zijn te groot voor een JavaScript-getal: we houden ze als tekst. */
function envId(name) {
  const raw = (process.env[name] || '').trim();
  if (!raw) return null;
  if (!/^\d{15,25}$/.test(raw)) {
    console.warn(`${name} is geen geldig ID (${raw}) - wordt genegeerd`);
    return null;
  }
  return raw;
}

module.exports = {
  token: (process.env.DISCORD_TOKEN || '').trim(),
  guildId: envId('GUILD_ID'),
  staffRoleId: envId('STAFF_ROLE_ID'),
  ticketCategoryId: envId('TICKET_CATEGORY_ID'),
  ticketLogChannelId: envId('TICKET_LOG_CHANNEL_ID'),
  welcomeChannelId: envId('WELCOME_CHANNEL_ID'),
  welcomeImageUrl: (process.env.WELCOME_IMAGE_URL || '').trim(),
};
