#!/usr/bin/env python3
"""Packt die App in EINE eigenständige HTML-Datei (CSS, Chart.js, Daten, Code inline).

Aufruf:  python3 scripts/build-single.py
Ergebnis: dist/bitcoin-steuerrechner.html – funktioniert per Doppelklick, auch am Handy.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "bitcoin-steuerrechner.html"


def inline_js(path: str) -> str:
    code = (ROOT / path).read_text()
    # "</script" darf im Inline-Code nicht vorkommen
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


def main() -> None:
    html = (ROOT / "index.html").read_text()
    css = (ROOT / "style.css").read_text()
    html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "\n</style>")
    for src in re.findall(r'<script src="([^"]+)"></script>', html):
        html = html.replace(f'<script src="{src}"></script>', inline_js(src))
    assert 'src="' not in re.sub(r"<script>.*?</script>", "", html, flags=re.S), "externe Datei übrig"
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html)
    print(f"{OUT}: {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
