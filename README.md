# A.I.D.S. Discord-bot 🛩️ (Node.js)

Bot voor **Airborne Insertion Direct Seizure**. Drie commands, de rest zit in knoppen:

| Command | Wie | Wat het doet |
|---|---|---|
| `/beheer` | beheerders | Paneel om het ticketpaneel en welkomstbericht te bewerken, leden en rollen te beheren en de rol voor `/paneel` te kiezen |
| `/paneel` | de rol die je in `/beheer` instelt | Plaatst het ticketpaneel, stuurt een embed (naar een kanaal naar keuze, daarna te bewerken of verwijderen), of maakt een opkomst of een agenda voor de groep |
| `/purge` | de rol van `/paneel` | Verwijdert tot 100 berichten in het kanaal, eventueel alleen die van één lid |

In een ticket staan de knoppen **🙋 Claimen** en **🔒 Sluiten** (met bevestiging).
Ledenaanmeldingen lopen via de knoppen op het paneel.

Elke soort heeft zijn eigen knop op het paneel, met een eigen tekst en kleur. Je
krijgt meteen alleen de vragen die erbij horen:

* **🎯 Sollicitatie** — je Arma-naam, ervaring met mods en rollen, wanneer je speelt.
* **⚠️ Klacht over een lid** — over wie, wat er gebeurde, wanneer en welk bewijs er is.
* **🔓 Unban-aanvraag** — je naam, Steam-ID of spelersnaam, en waarom je terug mag.
* **🛠️ Technisch probleem** — wat er misgaat, sinds wanneer en wat je al probeerde.

Dat zijn de standaardsoorten; namen, omschrijvingen, knoppen en vragen pas je zelf aan via
`/paneel` → **Ticketsoorten**, en daar maak je ook nieuwe soorten bij.

Het kanaal heet naar de soort (`unban-0007`, `klacht-0008`), de antwoorden staan in
de embed bovenaan en komen ook in het transcript terecht, zodat de staf later terug
kan lezen wat er gevraagd en geantwoord is.

Bij het sluiten gaat het gesprek als `ticket-0001.txt` naar je logkanaal, met een
embed erboven, en verdwijnt het kanaal na 5 seconden. Per persoon kan er maar
één ticket tegelijk open staan.

Nieuwe leden krijgen automatisch een welkomstbericht in het kanaal uit
`WELCOME_CHANNEL_ID`, met hun ping, de intake-tekst en (als je `WELCOME_IMAGE_URL`
invult) de A.I.D.S.-banner. Botaccounts worden overgeslagen.

Nieuwe leden krijgen meteen ook de instaprol uit `AUTO_ROLE_ID` (zonder die variabele
de rol `1459910402799435909`). De bot moet daarvoor **Rollen beheren** hebben en zijn
eigen rol moet hoger staan dan die instaprol; lukt het niet, dan gaat de rest gewoon
door en staat de reden in de console.

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
   | `AUTO_ROLE_ID` | nee | Rol die nieuwe leden automatisch krijgen (standaard `1459910402799435909`) |
   | `DB_HOST` | nee | Adres van je MySQL/MariaDB-database |
   | `DB_PORT` | nee | Poort van de database (standaard 3306) |
   | `DB_NAME` | nee | Naam van de database |
   | `DB_USER` | nee | Gebruikersnaam van de database |
   | `DB_PASSWORD` | nee | Wachtwoord van de database |

   \* Zonder stafrol kunnen alleen beheerders tickets zien en beheren.
   Zonder logkanaal wordt er geen transcript bewaard.

   Zet je `DB_HOST`, `DB_USER` en `DB_NAME` (en `DB_PORT`/`DB_PASSWORD` als je host
dat vraagt), dan maakt de bot bij de eerste start zelf de tabellen aan:
`tickets`, `opkomst` met `opkomst_answers`, `agenda` met `agenda_entries`, plus
`bot_state` voor de instellingen en ticketsoorten en `bot_counters` voor de
nummering. Wat er nog in `data/*.json` staat, zet hij dan eenmalig over. Bij het
starten ruimt de bot ook dode rijen op: tickets waarvan het kanaal is verwijderd
en opkomsten of agenda's waarvan kanaal of bericht niet meer bestaat. Is de
database even niet bereikbaar, dan start de bot door met de bestanden uit `data/`
en zegt hij dat in de console.

### Lokaal draaien

```bash
npm install
cp .env.example .env     # daarna .env invullen
npm start
```

Windows: gebruik dezelfde drie commando's in PowerShell of Git Bash; `npm start` start de bot.

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

`/beheer` (beheerders) opent een privépaneel met vijf knoppen:

* **Ticketpaneel** — je ziet direct hoe het paneel eruitziet (met per soort een knop).
  **Aanpassen** opent een
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
  daarmee het ticketpaneel in een kanaal zetten en embeds sturen. Zonder keuze geldt
  `STAFF_ROLE_ID`, en is die er ook niet, dan alleen beheerders.
* **Instellingen** — de kanaal- en rol-ID's en de databasegegevens uit `.env`, met per
  waarde waar hij vandaan komt. Wijzigingen gelden meteen (ook de database: de bot
  verbindt opnieuw); alleen een nieuwe `GUILD_ID` werkt pas na een herstart, omdat de
  commands dan opnieuw geplaatst worden. Waarden met **(hosting)** komen uit het
  paneel van je hosting en winnen van `.env`; die kun je daar aanpassen.

### /paneel

De rol die je bij **Toegang** hebt gekozen opent met `/paneel` een klein menu:

* **Ticketpaneel plaatsen** — zet het ticketbericht met per soort een eigen knop in dat
  kanaal. Die knop heeft de tekst en de kleur die je bij **Ticketsoorten** instelt.
* **Embed sturen** — vul titel, tekst, kleur (hex), afbeelding-URL en voettekst in. De
  embed komt in het kanaal waar je `/paneel` typte. Kleur en afbeelding mogen leeg;
  zonder kleur wordt het A.I.D.S.-oranje gebruikt.
* **Doelkanaal** — de dropdown onder de knoppen. Kies daar een tekstkanaal en het
  invulvenster opent meteen voor dát kanaal, zonder eerst zelf naar dat kanaal te
  gaan. De bot moet er berichten en embeds mogen plaatsen.
* **Opkomst** — eerst kies je met een **rollen-dropdown** welke rollen een ping
  krijgen (max 5, mag ook leeg blijven), daarna vul je de sessienaam, wanneer het
  is, een toelichting (kaart, modset, slot) en eventueel een minimum aantal spelers
  in. De bot plaatst het bericht met de gekozen rollen erin getagd, en met
  **✅ Aanwezig**, **❔ Misschien** en **❌ Afwezig**; iedereen op de server kan
  klikken, en de lijsten en tellers werken meteen bij. Nog eens op dezelfde knop
  klikken meldt je weer af. Haalt de groep het minimum, dan wordt de embed groen;
  anders staat er hoeveel spelers er nog nodig zijn.

Op het opkomstbericht zelf staan nog twee dingen voor de paneelrol:

* **✏️ Aanpassen** — titel, wanneer, toelichting en minimum wijzigen. De embed
  wordt bijgewerkt en de aanmeldingen blijven staan.
* **Rollen-dropdown** — kies rollen en de bot post een ping: "nog spelers nodig
  voor *sessie*", met alleen die rollen getagd. Handig een paar uur vooraf.

Met **🔒 Sluiten** zet je aanmeldingen stop; de dropdown gaat dan op grijs.

**Agenda** zet één gedeeld bericht neer waarin iedereen zelf invult wanneer hij kan.
Je geeft een titel en eventueel uitleg (welke week of operatie). Leden klikken op
**📝 Beschikbaarheid doorgeven** en krijgen een privéscherm: **dagen** aanklikken
(maandag t/m zondag) en **tijdsblokken van 2 uur** (10:00-12:00 t/m 00:00-02:00).
Met **📝 Opmerking** zet je er iets bij als "na 22:00 liever niet", met
**✅ Opslaan** staat het meteen in de embed — per weekdag, met ieders naam en
tijdvak erbij. Aaneensluitende blokken worden één tijdvak (18:00-20:00 +
20:00-22:00 wordt 18:00-22:00). Opnieuw invullen overschrijft je eigen invoer en
laat je eerdere keuzes al aangevinkt staan; **🧹 Mijn invoer wissen** haalt je weer weg.

**Ticketsoorten** opent een eigen scherm met alle soorten. Met **➕ Nieuwe soort** maak
je een compleet nieuwe soort: naam, emoji, omschrijving en de titel van het
invulvenster. Die staat meteen op het paneel met één beginvraag, die je daarna
aanpast. Kies een bestaande soort om hem te wijzigen: naam, emoji, omschrijving en
titel, en per vraag de tekst, **kort** of **lang** en verplicht of niet. Gebruik
**➕ Vraag toevoegen** of **🗑️ Laatste vraag weg** (maximaal 5 vragen, minstens 1). Met de
lijst **Kies een vraag om te verplaatsen** en de knoppen **⬆️ Omhoog** en **⬇️ Omlaag** zet je
de vragen in de volgorde die je wilt; die volgorde is precies de volgorde in het invulvenster.
Met **🎛️ Knop** stel je in hoe die soort op het paneel staat: de **tekst op de knop**
(leeg laten betekent: de naam van de soort) en de **kleur** — groen, blauw, rood of
grijs. Elke soort heeft zijn eigen knop, dus leden klikken meteen de juiste aan; vijf
knoppen per rij, dus er passen er twintig op het paneel.
Zet een soort met **✅** of **⛔** aan of uit. Wat uit staat, komt niet in de keuzelijst
en niet op het paneel. Er kunnen maximaal 20 soorten zijn, en alles wordt
bewaard in `data/ticketTypes.json`.

Na het sturen van een embed krijg je onder de bevestiging twee knoppen: **Bewerken**
opent hetzelfde invulvenster met de huidige tekst er al in, **Verwijderen** vraagt
eerst om bevestiging. Beide werken alleen voor jou (de bevestiging is privé), en ook
na een herstart — de knoppen onthouden om welk bericht het gaat.

De bot heeft **Rollen beheren** en **Leden kicken** nodig en moet hoger in de
rollenlijst staan dan de rollen die je uitgeeft. Keuzes en embeds worden bewaard in
`data/settings.json` en blijven dus na een herstart.

### /purge

`/purge` is voor dezelfde rol als `/paneel`: de rol die je bij **/beheer → Toegang**
kiest, anders `STAFF_ROLE_ID`, en is die er ook niet, dan beheerders. Die rol kan
opruimen in het kanaal waar hij het typt:

* `/purge aantal:25` — de laatste 25 berichten weg.
* `/purge aantal:100 gebruiker:@iemand` — alleen de berichten van dat lid, uit de
  laatste 100 berichten van het kanaal.

Je krijgt een privébevestiging met hoeveel er weg zijn. Discord staat maximaal 100
berichten per keer toe en weigert alles ouder dan 14 dagen; de bot zegt het als er
iets blijft staan. In threads werkt het niet. De bot heeft **Berichten beheren** en
**Kanaalgeschiedenis lezen** nodig in dat kanaal. Leden zonder de paneelrol krijgen
een privébericht dat ze het niet mogen.

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
lib/ticketTypes.js           de ticketsoorten en hun vragen (keuzelijst en formulier)
lib/ticketTypeStore.js       data/ticketTypes.json: de soorten, vragen, knoptekst en kleur
lib/ticketEditor.js          /paneel → Ticketsoorten: soorten, knoppen en vragen beheren
lib/settings.js              data/settings.json: embeds en de rol voor /paneel
lib/adminPanel.js            beheerpaneel: embeds, toegang, previews
lib/embedComposer.js         het /paneel-menu: embed maken, bewerken en verwijderen
lib/opkomst.js               opkomst: aanmeldbericht, aanpassen en rollen pingen
lib/opkomstStore.js          data/opkomst.json: wie doet mee aan welke sessie
lib/agenda.js                agenda: dagen en tijdsblokken van 2 uur per lid
lib/agendaStore.js           data/agenda.json: wie kan wanneer
lib/purge.js                 /purge: berichten in bulk verwijderen
lib/memberPanel.js           ledenpaneel: bladeren, keuzelijsten, kicken
lib/members.js               hulpjes: leden zoeken, rolhoogte, rolwijzigingen
lib/permissions.js           wie /beheer en /paneel mogen gebruiken
lib/embeds.js                alle embeds in de A.I.D.S.-stijl
lib/config.js                .env uitlezen en ID's controleren
lib/db.js                    MySQL/MariaDB-opslag, met data/*.json als terugval
lib/cleanup.js               opruimen bij het starten: dode tickets, opkomsten en agenda's
lib/envFile.js               .env lezen en schrijven (voor /beheer → Instellingen)
lib/storage.js               alle stores inlezen en na een .env-wijziging herverbinden
lib/version.js               versie en commit (staat in /beheer)
commands/*.js                alle slash commands (automatisch geladen)
events/*.js                  ready, interactionCreate, guildMemberAdd, channelDelete
data/tickets.json            wordt automatisch gemaakt
data/opkomst.json            wordt automatisch gemaakt
data/agenda.json             wordt automatisch gemaakt
data/ticketTypes.json        wordt automatisch gemaakt
```

Met een database (zie **Op je hosting zetten**) staan tickets, opkomsten en de
agenda in hun eigen tabellen en zijn de bestanden in `data/` alleen nog terugval:
handig lokaal, en als de database even niet bereikbaar is. Zonder database mag je `data/` niet weggooien als
er tickets of opkomsten open staan of als je je embeds hebt aangepast.

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

**De opkomstknoppen reageren niet.** Meestal is de bot offline of is `data/opkomst.json`
weg (dan bestaat die opkomst niet meer). Maak in dat geval een nieuwe opkomst aan.

**De ping bij de opkomst komt niet aan.** De bot moet de rechten **Rollen vermelden**
en **Berichten sturen** hebben in dat kanaal; anders plaatst hij de melding zonder ping.

**Nieuwe leden krijgen geen rol.** De bot mist **Rollen beheren**, of zijn rol staat
niet hoog genoeg in de rollenlijst, of de rol uit `AUTO_ROLE_ID` bestaat niet meer.
In de console staat welke van de drie het is.

**Er staat geen knop op het ticketpaneel.** Zet een soort aan via **/paneel → Ticketsoorten**.
Zonder soorten weigert de bot het paneel te plaatsen, anders zouden er geen knoppen zijn.

**/purge verwijdert niets.** De bot mist **Berichten beheren** of
**Kanaalgeschiedenis lezen**, of de berichten zijn ouder dan 14 dagen — die kan
Discord niet in bulk verwijderen.

**De agenda reageert niet meer.** Dan is `data/agenda.json` weg of de bot is herstart
zonder die map. Plaats in dat geval een nieuwe agenda.

**"Geen DISCORD_TOKEN gevonden".** De variabele staat niet in de omgeving of
`.env` ontbreekt.

**Is mijn update gelukt?** In `/beheer` staat de versie in de voettekst, bijvoorbeeld
`v1.20.0`. Zie je een oude versie of "geen .git", dan heeft de bot de nieuwe code
niet opgehaald — kijk dan of de `git pull` bij het starten gelukt is.
