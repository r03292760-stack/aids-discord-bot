# A.I.D.S. Discord-bot 🛩️ (Node.js)

Bot voor **Airborne Insertion Direct Seizure** met een compleet ticketsysteem.
Geschreven in **Node.js** met **discord.js**, dus klaar voor je hosting met Node 25.

`index.js` in de hoofdmap is het startpunt. Een nieuwe `/`-command toevoegen is
één bestandje in `commands/`.

---

## Wat de bot doet

| Command | Wie | Wat het doet |
|---|---|---|
| `/ticketpanel` | beheer/staf | Zet het paneel met de knop **Ticket aanmaken** in het kanaal |
| `/lid-toevoegen @lid` | staf | Geeft een extra lid toegang tot het huidige ticket |
| `/lid-verwijderen @lid` | staf | Haalt een lid weer uit het ticket |
| `/sluit` | staf of opener | Sluit het ticket, archiveert het gesprek en verwijdert het kanaal |
| `/welkom-test` | beheer/staf | Laat zien hoe het welkomstbericht eruitziet |
| `/ping` | iedereen | Check of de bot wakker is |
| `/info` | iedereen | Bot-info en alle commands |

In een ticket staan knoppen: **🙋 Claimen** en **🔒 Sluiten** (met bevestiging).

Bij het sluiten gaat het gesprek als `ticket-0001.txt` naar je logkanaal, met een
embed erboven, en verdwijnt het kanaal na 5 seconden. Per persoon kan er maar
één ticket tegelijk open staan.

Nieuwe leden krijgen automatisch een welkomstbericht in het kanaal uit
`WELCOME_CHANNEL_ID`, met hun ping, de intake-tekst en (als je `WELCOME_IMAGE_URL`
invult) de A.I.D.S.-banner. Botaccounts worden overgeslagen.

---

## Op je hosting zetten

1. Zet de bestanden op je hosting (of laat de hosting je GitHub-repo gebruiken).
2. Startcommando: `node index.js` of `npm start`.
3. Zorg dat deze omgevingsvariabelen in het hostingpaneel staan (of in `.env`):

   | Variabele | Verplicht | Betekenis |
   |---|---|---|
   | `DISCORD_TOKEN` | ja | Bot-token uit de Discord Developer Portal |
   | `GUILD_ID` | nee | Server-ID; commands staan dan direct klaar |
   | `STAFF_ROLE_ID` | nee* | Rol die tickets ziet en beheert |
   | `TICKET_CATEGORY_ID` | nee | Categorie voor ticketkanalen |
   | `TICKET_LOG_CHANNEL_ID` | nee* | Kanaal voor de transcripts |
   | `WELCOME_CHANNEL_ID` | nee | Kanaal voor het welkomstbericht |
   | `WELCOME_IMAGE_URL` | nee | Link naar de banner in dat bericht |

   \* Zonder stafrol kunnen alleen beheerders tickets zien en beheren.
   Zonder logkanaal wordt er geen transcript bewaard.

### Lokaal draaien

```bash
npm install
cp .env.example .env     # daarna .env invullen
npm start
```

Windows: dubbelklik `start.bat` — die installeert alles en maakt een `.env` aan.

### In Discord eenmalig klaarzetten

1. **Server Members Intent** en **Message Content Intent** aanzetten in de
   Developer Portal (Bot → Privileged Gateway Intents). Message Content is nodig
   om tickets te archiveren.
2. Nodig de bot uit met de scopes `bot` en `applications.commands` en de rechten
   Kanalen beheren, Berichten beheren, Embed Links, Bestanden versturen.
3. Zet de botrol **boven** de stafrol in de rollenlijst.
4. Typ `/ticketpanel` in het kanaal waar het paneel moet komen.

---

## Een eigen `/`-command toevoegen

Zet een bestand in `commands/` — de bot laadt de map automatisch, je hoeft niets
te registreren.

```js
// commands/helikopter.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('helikopter').setDescription('Roept de heli.'),
  async execute(interaction) {
    await interaction.reply('Rotors draaien. Instappen. 🚁');
  },
};
```

Bot opnieuw starten en `/helikopter` staat erin.

* **Eenmalige dingen** (welkomstbericht, reactierollen, autorole) horen in een
  event-bestand in `events/`, zoals `guildMemberAdd.js`.
* **Knoppen die na een restart moeten blijven werken** gebruik je met een vaste
  `customId`; de afhandeling staat in `events/interactionCreate.js`, precies
  zoals de ticketknoppen.

---

## Bestanden

```
index.js                     startpunt: intents, commands en events laden
lib/tickets.js               ticketlogica (kanaal, claimen, sluiten, transcript)
lib/ticketStore.js           data/tickets.json: open tickets en nummering
lib/embeds.js                alle embeds in de A.I.D.S.-stijl
lib/config.js                .env uitlezen en ID's controleren
commands/*.js                alle slash commands (automatisch geladen)
events/*.js                  ready, interactionCreate, guildMemberAdd, channelDelete
data/tickets.json            wordt automatisch gemaakt
```

`data/tickets.json` mag je niet weggooien als er tickets open staan — dan is de
bot ze "kwijt" (de kanalen blijven bestaan, maar tellen niet meer mee).
Zet je hosting geen bestanden vast? Dan is het verstandig om de ticketdata in een
database te zetten; vraag dat na bij je host.

---

## Als iets niet werkt

**Commands verschijnen niet.** Zet `GUILD_ID` in de omgeving en herstart.
Globale commands kunnen tot een uur duren.

**"Kon geen ticketkanaal maken".** De bot mist **Kanalen beheren**, of zijn rol
staat te laag. Zet de botrol hoger dan de stafrol.

**Transcript is leeg.** **Message Content Intent** staat uit.

**Er komt geen welkomstbericht.** `WELCOME_CHANNEL_ID` ontbreekt of is geen
tekstkanaal waar de bot mag posten.

**"Geen DISCORD_TOKEN gevonden".** De variabele staat niet in de omgeving of
`.env` ontbreekt.
