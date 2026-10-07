# Changelog – Bitcoin-Steuerrechner

Versionierung nach [SemVer](https://semver.org/lang/de/): MAJOR.MINOR.PATCH.
Die Versionsnummer steht in `VERSION`, `package.json` und `app.js` (`VERSION`) und wird in der App angezeigt.

## 1.1.0 – 2026-10-07

- **Eine einzige Datei:** `dist/bitcoin-steuerrechner.html` enthält alles (Code, Kursdaten, Diagramm-Bibliothek). In 1.0.0 funktionierte `index.html` nur zusammen mit den übrigen Dateien des Ordners, deshalb lief allein geöffnet keine Berechnung.
- Neues Build-Skript `scripts/build-single.py`.
- Korrigiert: Beim Wechsel der Kursquelle (Modell/Muster) zeigten die Eingabefelder teils noch den alten Wert.

## 1.0.0 – 2026-10-06

Erste Version.

- **Live-Kurs** in EUR und USD (CoinGecko, ersatzweise Binance oder Kraken), Aktualisierung jede Minute, manueller Kurs möglich.
- **Fenster 1: Steuer & Break-even.** Kauf heute (Haltefrist nach § 23 EStG) gegen Kauf nach einem Stichtag (Annahme: Besteuerung ohne Haltefrist). Zeigt, wie weit der Kurs fallen muss, damit Warten die Steuer ausgleicht – als Kurve und als Tabelle.
- **Fenster 2: Szenario.** Kurs beim späteren Kauf, Verkaufskurs und Anlagehorizont (1–10 Jahre) frei wählbar oder aus Modellen/Mustern übernehmen. Diagramm mit dem Depotwert beider Wege nach Steuer.
- **Fenster 3: Modelle & Tiefpunkt.** Power-Law-Kanal (Trend, Boden, Decke), 200-Wochen-Linie, Realized Price, Zyklus-Rücksetzer, Halving-Timing und ein Konsens-Tief.
- **Fenster 4: Zyklus-Muster.** Die Zyklen 2011, 2013, 2017 und 2021 werden an den aktuellen Kurs angehängt (gedämpft, 1:1 oder relativ zum Power-Law-Trend). Zeigt, was bei deinem Anlagehorizont herauskäme, wenn sich die Vergangenheit wiederholt.
- Eingebettete Kurshistorie seit 18.07.2010 (Coin Metrics), Eingaben bleiben im Browser gespeichert, Hell- und Dunkelmodus, Handy-tauglich.
