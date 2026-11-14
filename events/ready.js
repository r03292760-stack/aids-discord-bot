const { ActivityType, Events } = require('discord.js');
const { guildId } = require('../lib/config');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    console.log(`Ingelogd als ${client.user.tag} (ID: ${client.user.id})`);

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

    client.user.setActivity('de rotors | /ticketpanel', { type: ActivityType.Watching });
  },
};
