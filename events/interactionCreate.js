const { Events, MessageFlags } = require('discord.js');
const tickets = require('../lib/tickets');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
      }

      if (!interaction.isButton()) return;

      const [namespace, kind, action] = interaction.customId.split(':');
      if (namespace !== 'aids' || kind !== 'ticket') return;

      switch (action) {
        case 'open':
          return await tickets.createTicket(interaction);
        case 'claim':
          return await tickets.claimTicket(interaction);
        case 'close':
          return await tickets.askClose(interaction);
        case 'confirm':
          return await tickets.closeTicket(interaction, { confirmed: true });
        case 'cancel':
          return await tickets.cancelClose(interaction);
        default:
          return;
      }
    } catch (error) {
      console.error('Fout bij interactie:', error);

      const payload = {
        content: 'Er ging iets mis. Probeer het opnieuw of meld het bij de staf.',
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: payload.content }).catch(() => {});
      } else if (interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
