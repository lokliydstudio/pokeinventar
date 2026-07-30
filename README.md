# PokéInventar – live pris- og lagerkobling

PokéInventar er nå bygget som en liten fullstack-applikasjon. Nettleseren viser ikke genererte butikktilbud. Når et sett åpnes, spør den lokale API-serveren de konfigurerte butikkildene og returnerer bare eksakte produkt-URL-er på butikkens eget domene.

## Produktfilter

Prisoversikten inkluderer kun forseglede produkter i disse fire kategoriene:

- Booster Pack
- Booster Bundle
- Elite Trainer Box
- Booster Display Box

Singlekort, graded cards, collections, tins, blisterpakker, album, sleeves og andre tilbehørsprodukter blir filtrert bort på serversiden før pris, lagerstatus og laveste pris beregnes.


## Start løsningen

Node.js 20 eller nyere kreves. Det er ingen eksterne npm-avhengigheter.

```bash
cd pokeinventar
npm start
```

Åpne deretter `http://localhost:4173`. Ikke åpne `index.html` direkte fra filsystemet; live API, Service Worker og iPhone-varsler krever at siden serveres over HTTP/HTTPS.

## Hvordan live-data hentes

Serveren prøver kildene i denne rekkefølgen:

1. Shopify sitt prediktive produktsøk og produkt-JSON for målrettede oppslag, samt `/products.json` når butikken eksponerer en offentlig katalog.
2. WooCommerce Store API (`/wp-json/wc/store/v1/products`) når denne er aktivert.
3. Adobe Commerce/Magento GraphQL (`/graphql`) for målrettede settsøk.
4. Butikkens egen søkeside og produktets strukturerte `Product`/`Offer`-data som kontrollert reserve.

Produktlenker valideres mot butikkens eget domene. Eksterne søkemotorlenker blir avvist i både server og nettleser.

## Oppdatering og cache

Standard oppdateringsintervall er 15 minutter. Dermed betyr «live» siste vellykkede innhenting innenfor dette cachevinduet, ikke en garantert sanntidsstrøm fra kassen til butikken. Det kan endres med `REFRESH_MINUTES`. Serveren mellomlagrer katalogene for å unngå unødvendig trafikk mot butikkene. Første oppslag kan derfor være tregere enn senere oppslag.

Statusendepunkter:

- `GET /api/health`
- `GET /api/stores`
- `GET /api/offers?set=Destined%20Rivals`

En beskyttet manuell oppdatering kan aktiveres med `ADMIN_REFRESH_TOKEN` og `POST /api/refresh` med `Authorization: Bearer <token>`.

## Butikkatalog

`store-sources.js` inneholder 81 butikkoppføringer. Domener og integrasjoner må kontrolleres fortløpende, fordi butikker kan bytte domene, handelsplattform, robots-regler eller stenge produktfeeden. En mislykket feed vises som utilgjengelig og blir aldri omgjort til et oppdiktet tilbud eller en falsk utsolgtstatus.

## Viktig før produksjonslansering

Offentlig tilgjengelige endepunkter betyr ikke automatisk at ubegrenset kommersiell innhenting er tillatt. Avklar vilkår og innhent samtykke fra hver forhandler, identifiser tjenesten med en korrekt `CRAWLER_USER_AGENT`, bruk lav forespørselsfrekvens og respekter blokkeringer. For butikker uten tillatt offentlig feed bør det opprettes en partnerfeed eller API-avtale.

## iPhone-varsler

Web Push krever HTTPS, iOS/iPadOS 16.4 eller nyere, at nettappen er lagt til på hjemskjermen, og en push-tjeneste som lagrer abonnementer. Service Workeren er klargjort for å åpne URL-en som følger med lagerhendelsen.

## Docker

```bash
docker build -t pokeinventar .
docker run --rm -p 4173:4173 --env-file .env pokeinventar
```

`live-cache.json` opprettes ved kjøring og er utelatt fra prosjektpakken, slik at en ny installasjon starter med en ren cache.

## Verifiseringsstatus

Adapterne er syntaks- og enhetstestet. Kjøremiljøet som bygget denne pakken hadde ikke utgående DNS-tilgang til butikkene, så alle 81 domener og plattformvarianter er ikke ende-til-ende-verifisert her. Ved produksjonssetting må `/api/stores` overvåkes, og butikkilder som returnerer feil må få en eksplisitt adapter eller partnerfeed.

## Versjon 6 – samlet liveoppdatering

Denne versjonen henter den samlede livekatalogen automatisk. Brukeren trenger ikke åpne et sett før pris og lagerstatus vises på settkortet.

- `GET /api/catalog` returnerer sammendrag og butikktilbud for alle sett i én respons.
- `GET /api/events` bruker Server-Sent Events for å varsle åpne nettlesere straks en ny katalog er klar eller et sett går fra utsolgt til på lager.
- Frontend synkroniserer dessuten hvert 30. sekund som reserve.
- Standard intervall for butikkinnhenting er 120 sekunder og kan endres med `REFRESH_SECONDS`.
- Bare Booster Pack, Booster Bundle, Elite Trainer Box og Booster Display Box inngår.

Et svært lavt intervall kan belaste eller føre til blokkering hos butikkene. Bruk partner-API eller produktfeed for virkelig øyeblikkelig oppdatering. For vanlige offentlige butikkfeeds er 1–5 minutter et mer ansvarlig utgangspunkt.

### Drift uten egen PC

Applikasjonen må fortsatt ha en alltid-på Node-prosess for prisinnhenting og varsler, men den trenger ikke kjøre hjemme. Dockerfile og `render.yaml` gjør prosjektet klart for en vanlig Node/Docker-host. Raspberry Pi-oppsett er med vilje ikke inkludert i denne builden.
