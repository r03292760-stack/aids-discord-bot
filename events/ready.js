const { ActivityType, Events } = require('discord.js');
const config = require('../lib/config');
const db = require('../lib/db');
const cleanup = require('../lib/cleanup');
const botLog = require('../lib/botLog');
const statsBoard = require('../lib/statsBoard');
const version = require('../lib/version');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    console.log(`Ingelogd als ${client.user.tag} (ID: ${client.user.id})`);

    const guildId = config.guildId;
    const commands = [...client.commands.values()].map((command) => command.data.toJSON());

    try {
      if (guildId) {
        await client.application.commands.set(commands, guildId);

        // Oude globale commands opruimen: die blijven naast de servercommands
        // staan, waardoor je alles dubbel ziet in Discord.
        await client.application.commands.set([]);

        console.log(`${commands.length} commands klaargezet op server ${guildId} (globale lijst geleegd)`);
      } else {
        await client.application.commands.set(commands);
        console.log(
          `${commands.length} globale commands klaargezet (kan tot een uur duren; ` +
            'zet GUILD_ID in .env om dat te versnellen)'
        );
      }
    } catch (error) {
      console.error('Synchroniseren van commands mislukt:', error.message);
    }

    // Eenmalig opruimen: tickets van verwijderde kanalen en opkomsten of
    // agenda's waarvan het bericht weg is.
    try {
      await cleanup.runCleanup(client);
    } catch (error) {
      console.error('Opruimen van oude rijen mislukt:', error.message);
    }

    await botLog.log(client, {
      title: '🤖 Bot online',
      description: `Ingelogd als ${client.user.tag}.`,
      color: botLog.GREEN,
      fields: [
        { name: 'Versie', value: `v${version.version}`, inline: true },
        { name: 'Database', value: db.isReady() ? 'verbonden' : 'niet verbonden (bestanden)', inline: true },
        { name: 'Servers', value: String(client.guilds.cache.size), inline: true },
      ],
    });

    // Het statistiekenbord blijft zichzelf bijwerken, ook na een herstart.
    statsBoard.start(client);

    client.user.setActivity('de rotors | /ticketpanel', { type: ActivityType.Watching });
  },
};
