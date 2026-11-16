/**
 * A.I.D.S. - Airborne Insertion Direct Seizure
 * Startpunt van de bot (Node.js / discord.js).
 *
 * Start met:  npm start   of   node index.js
 *
 * Nieuwe /-command toevoegen? Zet een bestand in commands/ en start opnieuw.
 * De bot laadt alles in die map automatisch.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { token } = require('./lib/config');
const db = require('./lib/db');
const storage = require('./lib/storage');
const activityStore = require('./lib/activityStore');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // Nodig voor de spreektijd in de activiteitenstatistiek.
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();

const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((name) => name.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  if (!command || !command.data || typeof command.execute !== 'function') {
    console.warn(`Command ${file} overgeslagen: data of execute ontbreekt.`);
    continue;
  }
  client.commands.set(command.data.name, command);
}

const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((name) => name.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  if (!event || !event.name || typeof event.execute !== 'function') {
    console.warn(`Event ${file} overgeslagen: name of execute ontbreekt.`);
    continue;
  }
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

if (!token) {
  console.error(
    '\nGeen DISCORD_TOKEN gevonden.\nKopieer .env.example naar .env en plak daar je bot-token in.\n'
  );
  process.exit(1);
}

/**
 * Leest eerst de database (als die is ingesteld) en logt daarna in. Zo staat
 * alles wat eerder bewaard is klaar voordat de eerste interactie binnenkomt.
 */
async function start() {
  await db.init();
  await storage.hydrateAll();

  try {
    await client.login(token);
  } catch (error) {
    console.error('Inloggen mislukt:', error.message);
    process.exit(1);
  }
}

start();

// Bij stoppen nog de laatste schrijfacties naar de database laten gaan.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    // Nog lopende spraaksessies en de teller van deze minuut veiligstellen.
    require('./events/voiceStateUpdate').flushAll();
    activityStore.stopTimer();
    require('./lib/statsBoard').stop();
    await activityStore.flush().catch(() => {});
    await db.close();
    client.destroy();
    process.exit(0);
  });
}
