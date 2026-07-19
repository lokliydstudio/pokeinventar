# PokéInventar

En selvstendig, responsiv prototype for å finne Pokémon-kortprodukter hos norske butikker.

## Ny butikkoversikt per sett

Trykk på et settkort for å åpne en komplett detaljvisning. Forhandlerne som fører settet deles i to tydelige seksjoner:

- **På lager** – sortert med laveste pris først, med butikk, produkttype, pris, antall og oppdateringstid.
- **Utsolgt** – viser også forhandlere som fører settet, men ikke har det inne nå, inkludert sist registrerte pris.

Dette fungerer også når hele settet er utsolgt; detaljvisningen viser da fortsatt alle registrerte utsolgte forhandlere.

## Kjør lokalt

Server mappen over HTTPS eller en lokal utviklingsserver. Åpning direkte fra `file://` viser grensesnittet, men Service Worker og varsler krever en sikker webkontekst.

## Produksjonsdata

Butikkoversikten og prisene i denne prototypen er deterministiske eksempeldata bygget fra butikkatalogen. Grensesnitt og datamodell er klare for å byttes til autoriserte butikk-API-er, feeds eller en egen innhentingstjeneste. Pris og lager må verifiseres hos forhandleren.

## iPhone-varsler

Web Push på iPhone krever HTTPS, iOS/iPadOS 16.4 eller nyere, at nettappen installeres på hjemskjermen, og en backend som lagrer push-abonnementer og sender lagerhendelser.
