/**
 * Toegang tot de panels.
 *
 * - /beheer is voor beheerders (Beheer server).
 * - /paneel is voor de rol die je in /beheer instelt (valt terug op
 *   STAFF_ROLE_ID; is die er ook niet, dan beheerders).
 */

const { PermissionFlagsBits } = require('discord.js');
const settings = require('./settings');
const config = require('./config');

function isManager(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/** De rol die /paneel mag gebruiken. */
function panelRoleId() {
  return settings.access.panelRoleId || config.staffRoleId || null;
}

function canBeheer(interaction) {
  return isManager(interaction);
}

function canPaneel(interaction) {
  const roleId = panelRoleId();
  if (!roleId) return isManager(interaction);
  const hasRole = interaction.member?.roles?.cache?.has(roleId) ?? false;
  return hasRole || isManager(interaction);
}

/** Uitleg voor iemand die het niet mag. */
function deniedMessage(kind) {
  if (kind === 'paneel') {
    const roleId = panelRoleId();
    return roleId
      ? `Alleen de rol <@&${roleId}> kan het ticketpaneel plaatsen, soldaat.`
      : 'Alleen beheerders kunnen het ticketpaneel plaatsen, soldaat.';
  }
  if (kind === 'purge') {
    const roleId = panelRoleId();
    return roleId
      ? `Alleen de rol <@&${roleId}> kan /purge gebruiken, soldaat.`
      : 'Alleen beheerders kunnen /purge gebruiken, soldaat.';
  }
  return 'Alleen beheerders kunnen dit doen, soldaat.';
}

module.exports = { canBeheer, canPaneel, deniedMessage, panelRoleId };
