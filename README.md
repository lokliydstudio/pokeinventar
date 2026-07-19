# PokéInventar

En selvstendig, responsiv PWA-prototype for å vise Pokémon TCG-sett og norske forhandlere som visuelle kort.

## Innhold

- 124 registrerte sett gruppert etter serie
- 78 kontrollerte norske butikkoppføringer, pluss tre nye kandidater funnet i research
- Boosterpakkegrafikk som eksterne bildereferanser, med logo-/lokal fallback
- Søk, sortering, serie-, pris- og lagerfilter
- Favoritter lagret i nettleseren
- Web App Manifest og Service Worker
- Varseltillatelse, testvarsler og push-handler for iPhone/PWA
- Egen PokéInventar-logo og appikoner

## Kjøring

Service Worker og varsler krever en lokal webserver eller HTTPS. For eksempel:

```bash
python -m http.server 8080 --directory pokeinventar
```

Åpne `http://localhost:8080`.

## Ekte lageralarmer

Den statiske prototypen kan vise lokale testvarsler. For sanntidsvarsler må en backend:

1. hente lagerdata fra butikkene med tillatelse,
2. lagre brukerens `PushSubscription`,
3. sammenligne nye og gamle lagerdata,
4. sende Web Push med VAPID når en favoritt endres.

På iPhone krever Web Push iOS/iPadOS 16.4+, HTTPS og at nettappen er lagt til på hjemskjermen.

## Bilder og rettigheter

Produktbildene lastes fra eksterne kilder og er ikke pakket inn i prosjektet. Avklar lisens, hotlinking, varemerkebruk og krediteringskrav før offentlig eller kommersiell publisering.
