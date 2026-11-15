/** Alle embeds op één plek, opgebouwd uit de instellingen van /beheer. */

const { EmbedBuilder } = require('discord.js');
const settings = require('./settings');
const ticketTypes = require('./ticketTypes');
const config = require('./config');

const ORANGE = 0xd65c1e;
const PANEL_FOOTER = 'Airborne Insertion Direct Seizure · tempo, initiatief en controle';

/** Zet een hexkleur om naar een getal; ongeldige waarden vallen terug op oranje. */
function parseColor(hex) {
  const clean = String(hex || '')
    .trim()
    .replace(/^#/, '')
    .replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return ORANGE;
  return parseInt(clean, 16);
}

/** Controleert een hexkleur en geeft hem netjes terug. */
function normalizeColor(value) {
  const clean = String(value || '')
    .trim()
    .replace(/^#/, '')
    .replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return clean.toUpperCase();
}

function panelEmbed() {
  const s = settings.panel;
  const embed = new EmbedBuilder()
    .setTitle(s.title)
    .setColor(parseColor(s.color))
    .setDescription(s.description);

  const buttons = ticketTypes.enabled();
  const stepOne =
    buttons.length === 1
      ? `Klik op **${buttons[0].buttonLabel || buttons[0].label}**`
      : 'Klik op de knop van jouw soort';

  embed.addFields({
    name: 'Zo werkt het',
    value: `1. ${stepOne}\n` + '2. Vul de vragen in — de staf ziet meteen waar het over gaat',
  });

  if (s.footer) embed.setFooter({ text: s.footer });
  return embed;
}

function ticketEmbed(number, member, staffRole, type = null, answers = []) {
  const padded = String(number).padStart(4, '0');
  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${padded}`)
    .setColor(ORANGE)
    .setDescription(
      `Welkom ${member}, je ticket staat open.\n\n` +
        'Vertel kort **wat** je nodig hebt, **waarom** en sinds **wanneer**. ' +
        'Hoe duidelijker je bent, hoe sneller we toeslaan.\n\n' +
        'De staf sluit het ticket als het klaar is; het gesprek wordt gearchiveerd.'
    )
    .addFields(
      { name: 'Geopend door', value: `${member}`, inline: true },
      { name: 'Nummer', value: `#${padded}`, inline: true }
    )
    .setFooter({ text: PANEL_FOOTER });

  if (staffRole) embed.addFields({ name: 'Staf', value: `${staffRole}`, inline: true });

  if (type) embed.addFields({ name: 'Type', value: `${type.emoji} ${type.label}`, inline: true });

  for (const answer of answers) {
    embed.addFields({
      name: String(answer.label).slice(0, 256),
      value: String(answer.value).slice(0, 1024),
    });
  }

  return embed;
}

function welcomeEmbed(member) {
  const s = settings.welcome;
  const embed = new EmbedBuilder()
    .setTitle(s.title)
    .setColor(parseColor(s.color))
    .setDescription(String(s.description).replaceAll('{lid}', `${member}`))
    .setTimestamp();

  if (s.footer) embed.setFooter({ text: s.footer });

  const image = s.imageUrl || config.welcomeImageUrl || '';
  if (image) embed.setImage(image);
  return embed;
}

function transcriptEmbed(ticket, closer) {
  return new EmbedBuilder()
    .setTitle(`🎫 Ticket #${String(ticket.number).padStart(4, '0')} gesloten`)
    .setColor(ORANGE)
    .setDescription(
      `**Opener:** <@${ticket.userId}>\n` +
        `**Geclaimd door:** ${ticket.claimedByName ?? 'niemand'}\n` +
        `**Gesloten door:** ${closer}`
    )
    .setFooter({ text: PANEL_FOOTER });
}

module.exports = {
  ORANGE,
  PANEL_FOOTER,
  parseColor,
  normalizeColor,
  panelEmbed,
  ticketEmbed,
  welcomeEmbed,
  transcriptEmbed,
};
