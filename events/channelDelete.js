const { Events } = require('discord.js');
const store = require('../lib/ticketStore');

module.exports = {
  name: Events.ChannelDelete,

  async execute(channel) {
    if (store.get(channel.id)) {
      store.remove(channel.id);
      console.log(`Ticketkanaal ${channel.id} handmatig verwijderd - uit de lijst gehaald`);
    }
  },
};
