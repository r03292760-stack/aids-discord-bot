/** Alle embeds op één plek, in de A.I.D.S.-stijl. */

const { EmbedBuilder } = require('discord.js');
const { welcomeImageUrl } = require('./config');

const ORANGE = 0xd65c1e;
const PANEL_FOOTER = 'Airborne Insertion Direct Seizure · tempo, initiatief en controle';

function panelEmbed() {
  return new EmbedBuilder()
    .setTitle('🎫 A.I.D.S. — Support & Aanmeldingen')
    .setColor(ORANGE)
    .setDescription(
      'Klik op **Ticket aanmaken** en je krijgt een eigen kanaal met de staf.\n' +
        'Gebruik het voor je **intake**, een **aanmelding**, een **vraag** of een **klacht**.\n\n' +
        'Eén ticket per persoon. Geen ticket-spam — de rotorbladen zijn al duur genoeg.'
    )
    .addFields({
      name: 'Zo werkt het',
      value:
        '1. Klik op **Ticket aanmaken**\n' +
        '2. Beschrijf kort wat je nodig hebt\n' +
        '3. De staf claimt je ticket en pakt het op',
    })
    .setFooter({ text: PANEL_FOOTER });
}

function ticketEmbed(number, member, staffRole) {
  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${String(number).padStart(4, '0')}`)
    .setColor(ORANGE)
    .setDescription(
      `Welkom ${member}, je ticket staat open.\n\n` +
        'Vertel kort **wat** je nodig hebt, **waarom** en sinds **wanneer**. ' +
        'Hoe duidelijker je bent, hoe sneller we toeslaan.\n\n' +
        'De staf sluit het ticket als het klaar is; het gesprek wordt gearchiveerd.'
    )
    .addFields(
      { name: 'Geopend door', value: `${member}`, inline: true },
      { name: 'Nummer', value: `#${String(number).padStart(4, '0')}`, inline: true }
    )
    .setFooter({ text: PANEL_FOOTER });

  if (staffRole) embed.addFields({ name: 'Staf', value: `${staffRole}`, inline: true });
  return embed;
}

function welcomeEmbed(member) {
  const embed = new EmbedBuilder()
    .setTitle('Welkom bij Airborne Insertion Direct Seizure!')
    .setColor(ORANGE)
    .setDescription(
      `Welkom ${member}. Meld je bij de **intake** en probeer bij je eerste landing ` +
        'minstens één rotorblad heel te houden.\n\n' +
        'Snelheid boven alles. Hotdrops recht op het doel. En onthoud: sterven is ' +
        'onderdeel van de strategie — je impact is wat telt.'
    )
    .setTimestamp()
    .setFooter({ text: PANEL_FOOTER });

  if (welcomeImageUrl) embed.setImage(welcomeImageUrl);
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

module.exports = { ORANGE, PANEL_FOOTER, panelEmbed, ticketEmbed, welcomeEmbed, transcriptEmbed };
