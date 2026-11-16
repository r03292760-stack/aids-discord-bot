/**
 * Peilingen: stemmen en sluiten via de knoppen op het bericht.
 */

const { MessageFlags } = require('discord.js');
const store = require('./pollStore');
const { buildView } = require('./pollView');
const botLog = require('./botLog');
const { canPaneel, deniedMessage } = require('./permissions');

async function handleButton(interaction, action, id, index) {
  const poll = store.get(id);

  if (!poll) {
    return interaction.reply({
      content: 'Deze peiling bestaat niet meer.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (poll.closedAt) {
    return interaction.reply({
      content: 'Deze peiling is al gesloten.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'stem') {
    const choice = Number(index);
    if (!Number.isInteger(choice) || !poll.options[choice]) {
      return interaction.reply({
        content: 'Die optie bestaat niet.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const updated = store.vote(poll.id, interaction.user.id, choice);
    if (!updated) {
      return interaction.reply({
        content: 'Stemmen lukte niet; probeer het opnieuw.',
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.update(buildView(updated));
  }

  if (action === 'sluit') {
    if (!canPaneel(interaction) && poll.createdBy !== interaction.user.id) {
      return interaction.reply({ content: deniedMessage(), flags: MessageFlags.Ephemeral });
    }

    const closed = store.close(poll.id, interaction.user.id);

    await botLog.log(interaction.client, {
      title: '📊 Peiling gesloten',
      description: `**${closed.question}** in <#${closed.channelId}> gesloten door <@${interaction.user.id}>.`,
    });

    return interaction.update(buildView(closed));
  }

  return undefined;
}

module.exports = { handleButton };
