const { ChannelType, Events, PermissionFlagsBits } = require('discord.js');
const config = require('../lib/config');
const { welcomeEmbed } = require('../lib/embeds');

/**
 * Geeft een nieuw lid meteen de instaprol (AUTO_ROLE_ID).
 * Gaat nooit stuk op rechten: dan staat er alleen een waarschuwing in de log.
 */
async function giveAutoRole(member) {
  const autoRoleId = config.autoRoleId;
  if (!autoRoleId) return false;

  try {
    const role =
      member.guild.roles.cache?.get(autoRoleId) ??
      (await member.guild.roles.fetch(autoRoleId).catch(() => null));
    if (!role) {
      console.warn(`Rol ${autoRoleId} (AUTO_ROLE_ID) niet gevonden - niemand krijgt automatisch een rol`);
      return false;
    }

    const me = member.guild.members.me ?? (await member.guild.members.fetchMe?.().catch(() => null));
    if (!me) return false;

    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      console.warn('De bot mist het recht **Rollen beheren** - instaprol overgeslagen');
      return false;
    }
    if (me.roles.highest.position <= role.position) {
      console.warn(
        `De botrol staat niet hoog genoeg voor ${role.name} - zet de botrol hoger in de rollenlijst`
      );
      return false;
    }

    await member.roles.add(role);
    console.log(`Instaprol ${role.name} gegeven aan ${member.user.username}`);
    return true;
  } catch (error) {
    console.error(`Kon de instaprol niet geven aan ${member.user.username}:`, error.message);
    return false;
  }
}

module.exports = {
  name: Events.GuildMemberAdd,

  async execute(member) {
    if (member.user.bot) return;

    const welcomeChannelId = config.welcomeChannelId;

    // Eerst de rol, zodat een ontbrekend welkomstkanaal dat niet tegenhoudt.
    await giveAutoRole(member);

    if (!welcomeChannelId) {
      console.warn(
        `WELCOME_CHANNEL_ID staat niet in .env - welkomstbericht voor ${member.user.username} overgeslagen`
      );
      return;
    }

    const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn(`Kanaal ${welcomeChannelId} (WELCOME_CHANNEL_ID) niet gevonden of geen tekstkanaal`);
      return;
    }

    try {
      await channel.send({ content: `${member}`, embeds: [welcomeEmbed(member)] });
      console.log(`Welkomstbericht gestuurd voor ${member.user.username} in #${channel.name}`);
    } catch (error) {
      console.error(`Kon welkomstbericht niet sturen in #${channel.name}:`, error.message);
    }
  },

  giveAutoRole,
};
