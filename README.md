# PokéInventar

En statisk, responsiv designprototype for visning av Pokémon TCG-lager i norske nettbutikker.

## Åpne lokalt

Åpne `index.html` direkte i nettleseren, eller kjør en enkel lokal server:

```bash
python -m http.server 8000
```

Gå deretter til `http://localhost:8000`.

## Innhold

- 71 sett og 34 butikker fra PokéSnag-snapshotet 19.07.2026 kl. 15:08
- Kortbasert thumbnail-visning
- Søk, statusfilter, prisfilter og flere sorteringer
- Separate visninger for sett, butikker og lagrede favoritter
- Responsivt oppsett og mørk modus
- Detaljdialog med tydelig markert prototypedata

## Viktig før produksjon

Settnavn, aggregerte lagertall, startpriser og butikkstatistikk er et statisk snapshot. Relasjonen mellom hvert sett og butikkene i detaljdialogen er illustrativ. En produksjonsversjon trenger en autorisert live API-/datakilde, feilhåndtering, cache, oppdateringstidspunkt per vare og korrekte direkte produktlenker.
