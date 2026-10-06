#!/usr/bin/env python3
"""Erzeugt data/btc-history.js aus dem öffentlichen Coin-Metrics-Datensatz.

Aufruf:  python3 scripts/update-data.py [pfad/zu/btc.csv]
Ohne Pfad wird die CSV von GitHub geladen:
https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv

Gespeichert werden tägliche Schlusskurse in USD und die MVRV-Ratio
(daraus berechnet die App den "Realized Price" = Kurs / MVRV).
"""
import csv
import io
import json
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

URL = "https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv"
OUT = Path(__file__).resolve().parent.parent / "data" / "btc-history.js"


def sig(x: float, digits: int = 5) -> float:
    """Auf signifikante Stellen runden, damit die Datei klein bleibt."""
    if x == 0:
        return 0.0
    return float(f"{x:.{digits}g}")


def main() -> None:
    if len(sys.argv) > 1:
        text = Path(sys.argv[1]).read_text()
    else:
        with urllib.request.urlopen(URL, timeout=120) as r:
            text = r.read().decode()

    rows = [r for r in csv.DictReader(io.StringIO(text)) if r.get("PriceUSD")]
    start = date.fromisoformat(rows[0]["time"])
    usd, mvrv = [], []
    expected = start
    for r in rows:
        d = date.fromisoformat(r["time"])
        if d != expected:
            raise SystemExit(f"Lücke in den Daten bei {expected} (gefunden {d})")
        expected = date.fromordinal(d.toordinal() + 1)
        usd.append(sig(float(r["PriceUSD"])))
        mvrv.append(round(float(r["CapMVRVCur"]), 3) if r.get("CapMVRVCur") else None)

    payload = {
        "source": "Coin Metrics Community Data (github.com/coinmetrics/data)",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "start": start.isoformat(),
        "end": rows[-1]["time"],
        "usd": usd,
        "mvrv": mvrv,
    }
    OUT.write_text(
        "// Automatisch erzeugt von scripts/update-data.py – nicht von Hand bearbeiten.\n"
        "window.BTC_HISTORY = " + json.dumps(payload, separators=(",", ":")) + ";\n"
    )
    print(f"{OUT}: {len(usd)} Tage, {payload['start']} bis {payload['end']}")


if __name__ == "__main__":
    main()
