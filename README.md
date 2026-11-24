# Paket

En PWA för att hålla koll på paket – inspirerad av appen Packages. Ren HTML/CSS/JS utan byggsteg, publiceras på GitHub Pages.

## Funktioner
- **Paketlista** med fraktbolagets märke, namn, status och spårningsnummer. Sök i namn, nummer och anteckningar.
- **Anteckningar** per paket (sparas automatiskt).
- **Arkiv** – arkivera levererade paket och återställ dem vid behov.
- **Streckkodsskanner** – inbyggd `BarcodeDetector` där den finns, annars ZXing (fungerar i Safari/iOS).
- **Igenkänning av fraktbolag** (PostNord, DHL, UPS, FedEx, Bring, DB Schenker, GLS, DPD, Budbee, Instabox, USPS, Royal Mail, Amazon, Cainiao, YunExpress). Kan alltid ändras manuellt; okända nummer öppnas via 17TRACK.
- **Ett tryck** öppnar bolagets spårningssida.
- Offline via service worker, ljust/mörkt läge, export/import av säkerhetskopia (JSON), dela-mål och genväg ”Lägg till paket”.

All data sparas lokalt i webbläsaren (`localStorage`).

## Livestatus (förberett)
Välj tjänst och skriv in API-nyckel under **Inställningar → Livestatus**. Nyckeln sparas bara i webbläsaren och finns aldrig i koden eller i exporterade säkerhetskopior.

Adaptrar finns för Ship24 och 17TRACK i `js/live.js`. Ny tjänst läggs till som ett objekt i `PROVIDERS` som returnerar ett normaliserat svar (status, händelser, beräknad leverans).
Många spårnings-API:er blockerar anrop direkt från webbläsaren (CORS) – ange i så fall en egen proxy-URL i inställningarna. Adaptrarna är inte testade mot riktiga konton än.

## Struktur
```
index.html            gränssnitt
css/style.css         stil (iOS-liknande, ljust/mörkt)
js/app.js             appens logik
js/carriers.js        fraktbolag, igenkänning och spårningslänkar
js/live.js            livestatus-adaptrar
js/scanner.js         streckkodsskanner
sw.js                 service worker (höj CACHE vid release)
vendor/zxing/         ZXing 0.21.3 (Apache-2.0)
```

## Publicering
`.github/workflows/pages.yml` publicerar på GitHub Pages vid push till `main`.
Första gången: **Settings → Pages → Source: GitHub Actions**.

Lokalt: `python3 -m http.server` och öppna http://localhost:8000.
