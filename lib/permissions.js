/**
 * Wie mag het beheerpaneel gebruiken? De rol uit BEHEER_ROLE_ID (of anders
 * STAFF_ROLE_ID). Is er geen rol ingesteld, dan blijven het de beheerders met
 * "Beheer server".
 */

const { PermissionFlagsBits } = require('discord.js');
const { beheerRoleId, staffRoleId } = require('./config');

const adminRoleId = beheerRoleId || staffRoleId;

function canBeheer(interaction) {
  const member = interaction.member;
  if (!member) return false;

  if (adminRoleId) {
    if (member.roles?.cache?.has(adminRoleId)) return true;
    // De servereigenaar houdt altijd toegang, anders sluit je jezelf buiten.
    if (interaction.guild && member.id === interaction.guild.ownerId) return true;
    return false;
  }

  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/** Uitleg voor iemand die het niet mag. */
function deniedMessage() {
  if (adminRoleId) return `Alleen de rol <@&${adminRoleId}> kan dit doen, soldaat.`;
  return 'Alleen beheerders kunnen dit doen, soldaat.';
}

module.exports = { canBeheer, deniedMessage, adminRoleId };
