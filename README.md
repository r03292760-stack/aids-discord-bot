# A.I.D.S. Discord-bot 🛩️ (Node.js)

Bot voor **Airborne Insertion Direct Seizure**. Twee commands, de rest zit in knoppen:

| Command | Wie | Wat het doet |
|---|---|---|
| `/beheer` | beheerders | Paneel om het ticketpaneel en welkomstbericht te bewerken, leden en rollen te beheren en de rol voor `/paneel` te kiezen |
| `/paneel` | de rol die je in `/beheer` instelt | Plaatst het ticketpaneel in het kanaal waar je het typt |

In een ticket staan de knoppen **🙋 Claimen** en **🔒 Sluiten** (met bevestiging).
Ledenaanmeldingen lopen via de knop **Ticket aanmaken** op het paneel.

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
   Developer Portal (Bot → Privileged Gateway Intents). Server Members is nodig
   voor de ledenlijst, Message Content om tickets te archiveren.
2. Nodig de bot uit met de scopes `bot` en `applications.commands` en de rechten
   Kanalen beheren, Berichten beheren, Rollen beheren, Leden kicken, Embed Links
   en Bestanden versturen.
3. Zet de botrol **boven** de stafrol en boven de rollen die je wilt uitdelen.
4. Typ `/paneel` in het kanaal waar het ticketpaneel moet komen.

---

## Beheer in Discord

`/beheer` (beheerders) opent een privépaneel met vier knoppen:

* **Ticketpaneel** — je ziet direct hoe het paneel eruitziet. **Aanpassen** opent een
  invulvenster met titel, beschrijving, kleur (hex zoals `D65C1E`), voettekst en de
  tekst op de knop. **Plaats hier** zet het paneel in het kanaal waar je het commando gaf.
* **Welkomstbericht** — dezelfde editor, met `{lid}` als ping van het nieuwe lid en een
  veld voor de afbeelding-URL. **Stuur testbericht** stuurt een voorbeeld naar je
  welkomstkanaal.
* **Leden** — een keuzelijst met de leden, 25 per pagina, met **Vorige** en **Volgende**
  om door iedereen te bladeren. Zoek iemand direct op (een deel van) de naam met
  **Zoeken**. Kies een lid en je ziet zijn rollen, wanneer hij op de server kwam en hoe
  oud het account is. Met de **roldropdown** vink je aan welke rollen hij moet hebben:
  aangevinkt is geven, uitgevinkt is afnemen, en je ziet meteen wat er is aangepast.
  **Kicken** vraagt eerst om bevestiging.
* **Toegang** — kies met de roldropdown welke rol `/paneel` mag gebruiken. Die rol kan
  daarmee het ticketpaneel in een kanaal zetten. Zonder keuze geldt `STAFF_ROLE_ID`,
  en is die er ook niet, dan alleen beheerders.

De bot heeft **Rollen beheren** en **Leden kicken** nodig en moet hoger in de
rollenlijst staan dan de rollen die je uitgeeft. Keuzes en embeds worden bewaard in
`data/settings.json` en blijven dus na een herstart.

---

## Een eigen `/`-command toevoegen

Zet een bestand in `commands/` — de bot laadt de map automatisch.

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

* **Eenmalige dingen** (welkomstbericht, autorole) horen in een event-bestand in
  `events/`, zoals `guildMemberAdd.js`.
* **Knoppen die na een restart moeten blijven werken** gebruik je met een vaste
  `customId`; de afhandeling staat in `events/interactionCreate.js`.

---

## Bestanden

```
index.js                     startpunt: intents, commands en events laden
lib/tickets.js               ticketlogica (kanaal, claimen, sluiten, transcript)
lib/ticketStore.js           data/tickets.json: open tickets en nummering
lib/settings.js              data/settings.json: embeds en de rol voor /paneel
lib/adminPanel.js            beheerpaneel: embeds, toegang, previews
lib/memberPanel.js           ledenpaneel: bladeren, keuzelijsten, kicken
lib/members.js               hulpjes: leden zoeken, rolhoogte, rolwijzigingen
lib/permissions.js           wie /beheer en /paneel mogen gebruiken
lib/embeds.js                alle embeds in de A.I.D.S.-stijl
lib/config.js                .env uitlezen en ID's controleren
lib/version.js               versie en commit (staat in /beheer)
commands/*.js                alle slash commands (automatisch geladen)
events/*.js                  ready, interactionCreate, guildMemberAdd, channelDelete
data/tickets.json            wordt automatisch gemaakt
```

`data/` mag je niet weggooien als er tickets open staan of als je je embeds hebt
aangepast. Zet je hosting geen bestanden vast? Dan is het verstandig om de data in
een database te zetten; vraag dat na bij je host.

---

## Als iets niet werkt

**Commands verschijnen niet.** Zet `GUILD_ID` in de omgeving en herstart.
Globale commands kunnen tot een uur duren.

**Ik zie dubbele commands.** Er staan dan nog globale commands naast de
servercommands. De bot maakt de globale lijst bij elke start leeg; blijft het
hangen, wis ze dan via **Serverinstellingen → Integraties**.

**"Kon geen ticketkanaal maken".** De bot mist **Kanalen beheren**, of zijn rol
staat te laag. Zet de botrol hoger dan de stafrol.

**Transcript is leeg.** **Message Content Intent** staat uit.

**Er komt geen welkomstbericht.** `WELCOME_CHANNEL_ID` ontbreekt of is geen
tekstkanaal waar de bot mag posten.

**De ledenlijst is leeg of kort.** **Server Members Intent** staat uit, of de bot
miste rechten om de leden op te halen.

**"Geen DISCORD_TOKEN gevonden".** De variabele staat niet in de omgeving of
`.env` ontbreekt.

**Is mijn update gelukt?** In `/beheer` staat de versie in de voettekst, bijvoorbeeld
`v1.3.0`. Zie je een oude versie of "geen .git", dan heeft de bot de nieuwe code
niet opgehaald — kijk dan of de `git pull` bij het starten gelukt is.
