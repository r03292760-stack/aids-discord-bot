const { Events, MessageFlags } = require('discord.js');
const tickets = require('../lib/tickets');
const admin = require('../lib/adminPanel');
const members = require('../lib/members');

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

      if (interaction.isModalSubmit()) {
        const [namespace, area, kind, which] = interaction.customId.split(':');
        if (namespace !== 'aids' || area !== 'beheer' || kind !== 'modal') return;
        return await admin.handleModal(interaction, which);
      }

      if (!interaction.isButton()) return;

      const [namespace, area, action, ...rest] = interaction.customId.split(':');
      if (namespace !== 'aids') return;

      if (area === 'ticket') {
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
        }
        return;
      }

      if (area === 'beheer') return await admin.handleButton(interaction, action, rest);
      if (area === 'leden') return await members.handleButton(interaction, action, rest);
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
