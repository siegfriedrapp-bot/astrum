# Bitcoin-Steuerrechner

Version: siehe [`VERSION`](VERSION) · Änderungen: [`CHANGELOG.md`](CHANGELOG.md)

Ein Programm, das im Browser läuft und die Frage beantwortet: **Lohnt es sich, heute Bitcoin zu kaufen,
solange der Gewinn nach einem Jahr Haltefrist noch steuerfrei ist, oder soll ich auf einen niedrigeren Kurs warten
und später Steuer zahlen?**

## Starten

**`dist/bitcoin-steuerrechner.html`** öffnen: eine einzige Datei mit allem drin. Du kannst sie herunterladen, per Mail schicken oder aufs Handy kopieren, und sie läuft per Doppelklick.
(`index.html` funktioniert nur zusammen mit den übrigen Dateien des Ordners.)
Nach Code-Änderungen neu bauen: `python3 scripts/build-single.py`.
Für den Live-Kurs braucht der Browser Internet; ohne Internet nimmt die App den letzten eingebetteten Kurs.

## Die Fenster

| Fenster | Inhalt |
| --- | --- |
| **1 · Steuer & Break-even** | Ab wann ein Kauf heute steuerfrei ist und wie weit der Kurs bis zum späteren Kauf fallen muss, damit die Steuer ausgeglichen wird |
| **2 · Szenario** | Eigene Annahmen (Kurs nächstes Jahr, Verkaufskurs, Haltedauer 1–10 Jahre) mit Diagramm des Depotwerts nach Steuer |
| **3 · Modelle & Tiefpunkt** | Power-Law, 200-Wochen-Linie, Realized Price, Zyklus-Rücksetzer und Halving-Timing zur Schätzung des Tiefpunkts |
| **4 · Zyklus-Muster** | Frühere Zyklen werden an den heutigen Kurs angehängt, mit dem Ergebnis für deinen Anlagehorizont |
| **Info** | Rechenweg, Datenquellen und Versionen |

## Annahmen (in Fenster 1 änderbar)

- Kauf heute: § 23 EStG, steuerfrei nach mehr als einem Jahr; davor persönlicher Steuersatz (Freigrenze 1.000 €).
- Kauf nach dem Stichtag (Standard 01.01.2027): Gewinn wird mit 26,375 % besteuert (Abgeltungsteuer + Soli), Freibetrag 1.000 €.
  **Das ist eine Annahme und keine geltende Rechtslage.** Bitte den aktuellen Stand prüfen.

Keine Steuer- oder Anlageberatung.

## Entwicklung

```bash
npm test                 # Rechenkern testen (Node ≥ 18)
python3 scripts/update-data.py   # eingebettete Kurshistorie aktualisieren
```

| Datei | Zweck |
| --- | --- |
| `index.html`, `style.css` | Oberfläche |
| `app.js` | Live-Daten, Eingaben, Diagramme |
| `calc.js` | Rechenkern ohne DOM (Steuer, Power-Law, Zyklen, Muster) |
| `data/btc-history.js` | Tägliche Kurse und MVRV seit 2010 (Coin Metrics, erzeugt) |
| `lib/chart.umd.min.js` | Chart.js 4.5.1 (MIT) |

**Neue Version:** Nummer in `VERSION`, `package.json` und `app.js` erhöhen, Eintrag in `CHANGELOG.md` (und `CHANGELOG` in `app.js`) ergänzen.
