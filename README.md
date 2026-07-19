# PokéInventar – live pris- og lagerkobling

PokéInventar er nå bygget som en liten fullstack-applikasjon. Nettleseren viser ikke genererte butikktilbud. Når et sett åpnes, spør den lokale API-serveren de konfigurerte butikkildene og returnerer bare eksakte produkt-URL-er på butikkens eget domene.

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
