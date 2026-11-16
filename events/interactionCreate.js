const { Events, MessageFlags } = require('discord.js');
const tickets = require('../lib/tickets');
const admin = require('../lib/adminPanel');
const memberPanel = require('../lib/memberPanel');
const embedComposer = require('../lib/embedComposer');
const opkomst = require('../lib/opkomst');
const agenda = require('../lib/agenda');
const ticketEditor = require('../lib/ticketEditor');
const botLog = require('../lib/botLog');
const polls = require('../lib/polls');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);

        await botLog.log(client, {
          title: '⌨️ Commando',
          description:
            `**/${interaction.commandName}** door ${botLog.who(interaction.user)}` +
            (interaction.guild ? ` in **${interaction.guild.name}**` : '') +
            (interaction.channel ? ` / ${interaction.channel}` : ''),
        });
        return;
      }

      const parts = interaction.customId ? interaction.customId.split(':') : [];
      const [namespace, area, action, ...rest] = parts;
      if (namespace !== 'aids') return;

      if (interaction.isModalSubmit()) return await handleModal(interaction, area, action, rest);

      if (interaction.isChannelSelectMenu()) {
        if (area === 'paneel') return await embedComposer.handleSelect(interaction, action, rest);
        if (area === 'beheer' && action === 'envpick') {
          return await admin.handleEnvSelect(interaction, rest[0]);
        }
        if (area === 'beheer' && action === 'logpick') {
          return await admin.handleLogSelect(interaction);
        }
        return;
      }

      if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) {
        if (area === 'opkomst') return await opkomst.handleSelect(interaction, action, rest[0]);
        if (area === 'ticket') return await tickets.chooseType(interaction);
        if (area === 'memb') return await memberPanel.handleSelect(interaction, action);
        if (area === 'beheer' && action === 'envpick') {
          return await admin.handleEnvSelect(interaction, rest[0]);
        }
        if (area === 'beheer') return await admin.handleSelect(interaction, action);
        if (area === 'agenda') return await agenda.handleSelect(interaction, action, rest[0]);
        if (area === 'paneel') return await embedComposer.handleSelect(interaction, action, rest);
        return;
      }

      if (!interaction.isButton()) return;

      if (area === 'opkomst') return await opkomst.handleButton(interaction, action, rest[0]);
      if (area === 'agenda') return await agenda.handleButton(interaction, action, rest[0]);

      if (area === 'ticket') {
        switch (action) {
          case 'open':
            return await tickets.openTypes(interaction);
          case 'soort':
            return await tickets.openType(interaction, rest[0]);
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
      if (area === 'memb') return await memberPanel.handleButton(interaction, action, rest);
      if (area === 'peiling') {
        return await polls.handleButton(interaction, action, rest[0], rest[1]);
      }
      if (area === 'paneel') return await embedComposer.handleButton(interaction, action, rest);
    } catch (error) {
      console.error('Fout bij interactie:', error);

      await botLog.log(client, {
        title: '⚠️ Fout bij interactie',
        description:
          '```' +
          String(error.message).slice(0, 1000) +
          '```' +
          (interaction.customId ? `\n\`${interaction.customId}\`` : ''),
        color: botLog.RED,
      });

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

async function handleModal(interaction, area, action, rest) {
  if (area === 'beheer' && action === 'modal') {
    return await admin.handleModal(interaction, rest[0]);
  }
  if (area === 'beheer' && action === 'envmodal') {
    return await admin.handleEnvModal(interaction, rest[0]);
  }
  if (area === 'memb' && action === 'search') {
    return await memberPanel.handleModal(interaction);
  }
  if (area === 'paneel' && action === 'modal') {
    return await embedComposer.handleModal(interaction, rest[0], rest[1]);
  }
  if (
    area === 'paneel' &&
    ['nieuwtype', 'typeinfo', 'vraagplus', 'vraag', 'knop'].includes(action)
  ) {
    return await ticketEditor.handleModal(interaction, action, rest);
  }
  if (area === 'opkomst' && (action === 'nieuw' || action === 'bewerk')) {
    return await opkomst.handleModal(interaction, action, rest[0]);
  }
  if (area === 'agenda' && (action === 'maak' || action === 'notitie')) {
    return await agenda.handleModal(interaction, action, rest[0]);
  }
  if (area === 'ticket' && action === 'form') {
    return await tickets.createFromForm(interaction, rest[0]);
  }
}
