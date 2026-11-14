# A.I.D.S. Discord-bot 🛩️

Bot voor **Airborne Insertion Direct Seizure** met een compleet ticketsysteem.
Eén basis, modules erin — een nieuwe module toevoegen is drie regels werk.

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

Nieuwe leden krijgen automatisch een welkomstbericht in het kanaal uit
`WELCOME_CHANNEL_ID`, met hun ping, de intake-tekst en (als je `WELCOME_IMAGE_URL`
invult) de A.I.D.S.-banner. Botaccounts worden overgeslagen.

In een ticket staan ook knoppen: **🙋 Claimen** (staf pakt het ticket) en
**🔒 Sluiten** (met bevestiging). Die knoppen blijven werken, ook als de bot
herstart.

Bij het sluiten:

* het hele gesprek gaat als `ticket-0001.txt` naar je logkanaal, met een embed
  erboven (opener, geclaimd door, gesloten door);
* het kanaal verdwijnt na 5 seconden;
* per persoon kan er maar één ticket tegelijk open staan.

---

## Eenmalig opzetten

### 1. Bot aanmaken in Discord

1. Ga naar <https://discord.com/developers/applications> → **New Application**,
   naam bijvoorbeeld `A.I.D.S. Bot`.
2. Links naar **Bot** → **Reset Token** → kopieer het token (bewaar het veilig,
   je ziet het maar één keer).
3. Op dezelfde pagina onder **Privileged Gateway Intents**:
   * **Server Members Intent** → aan
   * **Message Content Intent** → aan (nodig om tickets te archiveren)
4. Links naar **OAuth2 → General** → kopieer de **Client ID**.
5. Nodig de bot uit met deze link (vervang `JOUW_CLIENT_ID`):

```
https://discord.com/api/oauth2/authorize?client_id=JOUW_CLIENT_ID&permissions=125968&scope=bot%20applications.commands
```

### 2. ID's opzoeken in Discord

Zet in Discord: **Instellingen → Geavanceerd → Ontwikkelaarsmodus** aan.
Dan kun je met rechtsklik → **ID kopiëren** de nummers pakken:

* je **server-ID** (rechtsklik op de servernaam)
* de **stafrol-ID** (Serverinstellingen → Rollen → rechtsklik op de rol)
* de **categorie-ID** waar tickets in moeten (rechtsklik op de categorie)
* de **logkanaal-ID** (rechtsklik op het kanaal)

### 3. Bot starten

**Windows:** dubbelklik op `start.bat`.
De eerste keer wordt alles geïnstalleerd en verschijnt er een `.env`-bestand.
Open `.env`, plak je token en ID's erin, sla op, start `start.bat` opnieuw.

**Mac/Linux:**

```bash
chmod +x start.sh
./start.sh
```

Of handmatig:

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # daarna .env invullen
python main.py
```

### 4. In Discord klaarzetten

1. Zorg dat de botrol **boven** de stafrol staat (Serverinstellingen → Rollen).
   Anders kan de bot de rechten van het ticketkanaal niet goed zetten.
2. Maak eventueel een categorie `Tickets` en een kanaal `#ticket-log`.
3. Ga naar het kanaal waar het paneel moet komen en typ `/ticketpanel`.
4. Klaar. Leden klikken op **Ticket aanmaken**.

---

## Instellingen (`.env`)

| Variabele | Verplicht | Betekenis |
|---|---|---|
| `DISCORD_TOKEN` | ja | Bot-token uit de Developer Portal |
| `GUILD_ID` | nee | Server-ID; commands staan dan direct klaar |
| `STAFF_ROLE_ID` | nee* | Rol die tickets ziet en beheert |
| `TICKET_CATEGORY_ID` | nee | Categorie voor ticketkanalen |
| `TICKET_LOG_CHANNEL_ID` | nee* | Kanaal voor de transcripts |
| `WELCOME_CHANNEL_ID` | nee | Kanaal voor het welkomstbericht van nieuwe leden |
| `WELCOME_IMAGE_URL` | nee | Link naar de afbeelding/banner in dat bericht |

\* Zonder stafrol kunnen alleen beheerders tickets zien en beheren.
Zonder logkanaal wordt er geen transcript bewaard.

---

## Een eigen `/`-command toevoegen

De hele bot is opgebouwd uit **cogs** (modules). Een nieuwe module = één bestand
plus één regel in `main.py`.

1. Maak `cogs/mijnmodule.py` (kopieer `cogs/algemeen.py` als voorbeeld):

```python
import discord
from discord import app_commands
from discord.ext import commands


class Welkom(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="helikopter", description="Roept de heli.")
    async def helikopter(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message("Rotors draaien. Instappen. 🚁")


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Welkom(bot))
```

2. Zet de module in de lijst bovenaan `main.py`:

```python
COGS = (
    "cogs.tickets",
    "cogs.algemeen",
    "cogs.mijnmodule",  # <- nieuw
)
```

3. Bot opnieuw starten. `/helikopter` staat erin.

Twee dingen om te onthouden:

* **Eenmalige dingen** (welkomstbericht, reactierollen, autorole) horen in een
  `@commands.Cog.listener()` binnen die cog.
* **Knoppen die na een restart moeten blijven werken** gebruik je met een vaste
  `custom_id` en je meldt de view aan met `self.bot.add_view(...)` in
  `cog_load`, precies zoals `cogs/tickets.py` doet.

---

## Bestanden

```
main.py              basis: intents, cogs laden, commands syncen
cogs/tickets.py      ticketsysteem (paneel, kanalen, claimen, transcript)
cogs/welkom.py       welkomstbericht voor nieuwe leden + /welkom-test
cogs/algemeen.py     /ping en /info + blauwdruk voor nieuwe commands
requirements.txt     discord.py en python-dotenv
.env.example         voorbeeld van alle instellingen
start.bat / start.sh eenmalig opzetten + starten
data/tickets.json    wordt automatisch gemaakt: open tickets en nummering
```

`data/tickets.json` mag je nooit zomaar weggooien als er tickets open staan —
dan is de bot ze "kwijt" (de kanalen blijven bestaan, maar tellen niet meer mee).

---

## Als iets niet werkt

**Commands verschijnen niet.**
Zet `GUILD_ID` in `.env` en herstart. Globale commands kunnen tot een uur duren.

**"Kon geen ticketkanaal maken (403)".**
De bot mist **Kanalen beheren**, of zijn rol staat te laag. Zet de botrol hoger
dan de stafrol.

**Transcript is leeg.**
**Message Content Intent** staat uit in de Developer Portal. Aanzetten en
herstarten.

**Er komt geen welkomstbericht.**
`WELCOME_CHANNEL_ID` ontbreekt of is geen tekstkanaal-ID waar de bot mag posten.

**Bot start niet: "Geen DISCORD_TOKEN gevonden".**
`.env` ontbreekt of `DISCORD_TOKEN=` is leeg.

**Ticketkanaal is voor niemand zichtbaar.**
De stafrol-ID klopt niet, of de bot kan de rechten van de categorie niet
overschrijven. Controleer `STAFF_ROLE_ID` en de rolvolgorde.
