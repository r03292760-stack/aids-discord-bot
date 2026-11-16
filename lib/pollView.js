/**
 * Weergave van een peiling: vraag, opties met balken, en knoppen om te stemmen
 * of te sluiten. Gedeeld door het command en de knoppen, zodat de uitslag
 * overal hetzelfde is.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const COLOR = 0xd65c1e;

function tally(poll) {
  const votes = Object.values(poll.votes ?? {});
  const total = votes.length;
  const per = poll.options.map((_, index) => votes.filter((choice) => choice === index).length);
  return { total, per };
}

function bar(percent) {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}`;
}

function buildView(poll) {
  const { total, per } = tally(poll);

  const lines = poll.options.map((label, index) => {
    const count = per[index];
    const percent = total ? Math.round((count / total) * 100) : 0;
    return `**${index + 1}. ${label}**\n${bar(percent)} ${count} ${
      count === 1 ? 'stem' : 'stemmen'
    } (${percent}%)`;
  });

  const embed = new EmbedBuilder()
    .setTitle('📊 Peiling')
    .setColor(COLOR)
    .setDescription(`**${poll.question}**\n\n${lines.join('\n')}`)
    .setFooter({
      text: poll.closedAt
        ? `${total} ${total === 1 ? 'stem' : 'stemmen'} · peiling gesloten`
        : `${total} ${total === 1 ? 'stem' : 'stemmen'} · klik op een optie om te stemmen`,
    });

  if (poll.closedAt) {
    embed.addFields({ name: '🔒 Gesloten', value: `door <@${poll.closedBy}>` });
  }

  const optionRow = new ActionRowBuilder().addComponents(
    poll.options.map((label, index) =>
      new ButtonBuilder()
        .setCustomId(`aids:peiling:stem:${poll.id}:${index}`)
        .setLabel(`${index + 1}. ${label}`.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(Boolean(poll.closedAt))
    )
  );

  const components = [optionRow];

  if (!poll.closedAt) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aids:peiling:sluit:${poll.id}`)
          .setLabel('Sluiten')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  return { embeds: [embed], components };
}

module.exports = { buildView, tally };
