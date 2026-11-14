const { ChannelType, Events } = require('discord.js');
const { welcomeChannelId } = require('../lib/config');
const { welcomeEmbed } = require('../lib/embeds');

module.exports = {
  name: Events.GuildMemberAdd,

  async execute(member) {
    if (member.user.bot) return;

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
};
