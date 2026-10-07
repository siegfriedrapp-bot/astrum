/* Bitcoin-Steuerrechner – Oberfläche */
(function () {
  "use strict";

  const VERSION = "1.2.0";
  const CHANGELOG = [
    ["1.2.0", "2026-10-07", "Alle Werte standardmäßig in US-Dollar (Kurse, Anlagebetrag, Ergebnisse, Diagramme). Euro bleibt unten umschaltbar."],
    ["1.1.0", "2026-10-07", "Komplett in einer einzigen HTML-Datei (dist/bitcoin-steuerrechner.html) – funktioniert ohne Zusatzdateien. Feld-Aktualisierung beim Wechsel der Kursquelle korrigiert."],
    ["1.0.0", "2026-10-06", "Erste Version: Live-Kurs, Steuer-Break-even, Szenario-Rechner, Power-Law & Boden-Modelle, Zyklus-Muster."],
  ];
  const C = window.BTCCalc;
  const H = window.BTC_HISTORY;
  const DAY = C.DAY;
  const FX_FALLBACK = 0.85; // EUR je USD, falls kein Live-Kurs erreichbar ist
  const STORE_KEY = "btc-steuerrechner-v1";

  const DEFAULTS = {
    invest: 10000, buyDateB: "2027-01-01", years: 4, pb: null, pt: null, source: "own",
    rateNew: 26.375, allowance: 1000, personal: 42, freigrenze: 1000,
    patMode: "damped", patAnchor: "today", amp: 100,
    cycles: { 2011: false, 2013: true, 2017: true, 2021: true },
    currency: "USD", manualPrice: null, range: "4", tab: "steuer", usdDefault: true,
  };

  /* ---------- Zustand ---------- */
  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const st = { ...DEFAULTS, ...JSON.parse(raw) };
        // ältere Versionen speicherten Euro-Beträge → einmalig auf Dollar umstellen
        if (!JSON.parse(raw).usdDefault) { st.currency = "USD"; st.pb = null; st.pt = null; st.manualPrice = null; st.usdDefault = true; }
        return st;
      }
    } catch (e) { /* ohne Speicher weiter */ }
    return structuredClone(DEFAULTS);
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* egal */ }
  }

  const live = { usd: null, eur: null, change: null, at: null, source: null, status: "loading" };
  let liveDaily = [];

  /* ---------- Hilfen ---------- */
  const $ = (id) => document.getElementById(id);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const usdFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const compactFmt = new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 });
  const money = (v) => (v == null || !isFinite(v) ? "–" : (state.currency === "EUR" ? eurFmt : usdFmt).format(v));
  const pct = (v, d = 1) => (v == null || !isFinite(v) ? "–" : (v * 100).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d }).replace("-", "−") + " %");
  const signed = (v) => (v >= 0 ? "+" : "−") + money(Math.abs(v)).replace("-", "");
  const dateDE = (ms) => (ms == null ? "–" : new Date(ms).toLocaleDateString("de-DE", { timeZone: "UTC" }));
  const monthDE = (ms) => new Date(ms).toLocaleDateString("de-DE", { timeZone: "UTC", month: "short", year: "numeric" });
  const fmtYears = (y) => (y === 1 ? "1 Jahr" : y.toLocaleString("de-DE") + " Jahren");
  const setVal = (el, v) => { if (document.activeElement !== el) el.value = v; };

  async function fetchJSON(url, ms = 9000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  /* ---------- Live-Daten ---------- */
  async function loadPrice() {
    const sources = [
      async () => {
        const j = await fetchJSON("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur,usd&include_24hr_change=true&include_last_updated_at=true");
        const b = j.bitcoin;
        return { eur: b.eur, usd: b.usd, change: b.eur_24h_change / 100, at: b.last_updated_at * 1000, source: "CoinGecko" };
      },
      async () => {
        const j = await fetchJSON("https://api.binance.com/api/v3/ticker/24hr?symbols=" + encodeURIComponent('["BTCEUR","BTCUSDT"]'));
        const e = j.find((x) => x.symbol === "BTCEUR"), u = j.find((x) => x.symbol === "BTCUSDT");
        return { eur: +e.lastPrice, usd: +u.lastPrice, change: +e.priceChangePercent / 100, at: Date.now(), source: "Binance" };
      },
      async () => {
        const j = await fetchJSON("https://api.kraken.com/0/public/Ticker?pair=XBTEUR,XBTUSD");
        const e = j.result.XXBTZEUR, u = j.result.XXBTZUSD;
        return { eur: +e.c[0], usd: +u.c[0], change: +e.c[0] / +e.o - 1, at: Date.now(), source: "Kraken" };
      },
    ];
    for (const src of sources) {
      try {
        const r = await src();
        if (r.eur > 0 && r.usd > 0) { Object.assign(live, r, { status: "ok" }); return; }
      } catch (e) { /* nächste Quelle */ }
    }
    live.status = live.usd ? "stale" : "offline";
  }

  async function loadGap() {
    const endMs = C.parseDate(H.end);
    if (Date.now() - endMs < 2 * DAY) return;
    try {
      const j = await fetchJSON("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily", 15000);
      liveDaily = j.prices.filter((p) => p[1] > 0);
      return;
    } catch (e) { /* Fallback */ }
    try {
      const j = await fetchJSON("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000", 15000);
      liveDaily = j.map((k) => [k[0], +k[4]]);
    } catch (e) { liveDaily = []; }
  }

  /* ---------- Modell ---------- */
  let model = null;
  let modelKey = "";

  function nowMs() { return C.utcDay(Date.now()); }
  function fx() { return live.eur && live.usd ? live.eur / live.usd : FX_FALLBACK; }
  /** Faktor USD → Anzeigewährung (1 bei Dollar). */
  function mf() { return state.currency === "EUR" ? fx() : 1; }
  function priceNowUsd(series) {
    if (state.manualPrice > 0) return state.manualPrice / mf();
    if (live.usd) return live.usd;
    return series ? series.usd[series.usd.length - 1] : H.usd[H.usd.length - 1];
  }

  function getModel() {
    const today = nowMs();
    const pNow = priceNowUsd(null);
    const key = [liveDaily.length, Math.round(pNow), today].join("|");
    if (model && key === modelKey) return model;
    const extra = liveDaily.filter(([ms]) => C.utcDay(ms) < today).concat([[today, pNow]]);
    const series = C.buildSeries(H, extra);
    const pl = C.fitPowerLaw(series);
    const wma = C.sma(series.usd, 1400);
    const realized = C.realizedPrice(series);
    const cycles = C.findCycles(series, wma);
    const bm = C.bottomModels(series, pl, cycles, wma, realized);
    const cur = cycles[cycles.length - 1];
    let lowIdx = cur.athIdx;
    for (let i = cur.athIdx; i < series.usd.length; i++) if (series.usd[i] < series.usd[lowIdx]) lowIdx = i;
    model = { series, pl, wma, realized, cycles, bm, cur, lowSinceAth: { ms: series.t[lowIdx], usd: series.usd[lowIdx] } };
    modelKey = key;
    return model;
  }

  function taxParams() {
    return {
      rateNew: (+state.rateNew || 0) / 100,
      allowance: (+state.allowance || 0) * mf() / fx(),
      personal: (+state.personal || 0) / 100,
      freigrenze: (+state.freigrenze || 0) * mf() / fx(),
    };
  }

  /** Projektionen aller vergangenen Zyklen (USD) bis `untilMs`. */
  function patterns(m, untilMs) {
    const out = [];
    const past = m.cycles.filter((c) => c !== m.cur);
    for (const c of past) {
      const path = C.projectPattern(m.series, m.pl, c, m.cur, {
        mode: state.patMode, anchor: state.patAnchor, amp: state.amp / 100,
        targetDrawdown: m.bm.consensus.ddPred,
        nowMs: nowMs(), nowUsd: priceNowUsd(m.series), untilMs,
      });
      out.push({ label: c.label, cycle: c, path, on: !!state.cycles[c.label] });
    }
    return out;
  }

  /** Alles, was die Tabs 1 und 2 brauchen (EUR). */
  function scenario() {
    const m = getModel();
    const f = mf();
    const today = nowMs();
    const P0 = priceNowUsd(m.series) * f;
    const endMs = C.addYears(today, +state.years);
    let buyB = C.parseDate(state.buyDateB);
    if (!isFinite(buyB) || buyB < today) buyB = today;
    const plFairEnd = C.powerLaw(m.pl, endMs) * f;

    const pats = patterns(m, Math.max(endMs, buyB) + DAY);
    const avgPath = C.averagePaths(pats.filter((p) => p.on && p.path.length).map((p) => p.path));
    const toEur = (path) => path.map(([t, v]) => [t, v * f]);

    let path, pb, pt, hint = "";
    const src = state.source;
    if (src === "plFair") {
      // Kurs nähert sich bis zum Verkauf geometrisch dem Power-Law-Trend an
      const startRatio = P0 / (C.powerLaw(m.pl, today) * f);
      path = [];
      for (let t = today; t <= endMs; t += DAY) {
        const w = (t - today) / (endMs - today);
        path.push([t, C.powerLaw(m.pl, t) * f * Math.pow(startRatio, 1 - w)]);
      }
      hint = "Der Kurs läuft vom heutigen Stand bis zum Verkaufstag auf die Power-Law-Trendlinie zu.";
    } else if (src === "patAvg" || src.startsWith("pat:")) {
      const p = src === "patAvg" ? avgPath : (pats.find((x) => "pat:" + x.label === src) || {}).path || [];
      path = toEur(p);
      hint = src === "patAvg" ? "Durchschnitt der ausgewählten Zyklus-Muster (Tab 4)." : `Muster des Zyklus ${src.slice(4)} (Tab 4).`;
    }
    if (path) {
      pb = C.valueAt(path, buyB);
      pt = C.valueAt(path, endMs);
      if (pt == null) hint += " Das Muster reicht nicht bis zum Verkaufstag – für diesen Zeitraum gibt es keine Vergleichsdaten.";
    } else {
      pb = state.pb > 0 ? +state.pb : Math.round((m.bm.consensus.usd || P0 / f * 0.8) * f / 100) * 100;
      pt = state.pt > 0 ? +state.pt : Math.round(plFairEnd / 1000) * 1000;
      const pts = [[today, P0]];
      if (buyB > today && buyB < endMs) pts.push([buyB, pb]);
      pts.push([endMs, pt]);
      path = C.interpolatePath(pts);
      hint = "Eigene Annahme: Verlauf wird zwischen heute, Kauftag und Verkaufstag geometrisch verbunden.";
    }

    const tax = taxParams();
    const invest = +state.invest || 0;
    const A = pt ? C.netResult({ invest, buyPrice: P0, sellPrice: pt, buyMs: today, sellMs: endMs, regime: "alt", tax }) : null;
    const B = pt && pb ? C.netResult({ invest, buyPrice: pb, sellPrice: pt, buyMs: buyB, sellMs: endMs, regime: "neu", tax }) : null;
    const be = pt ? C.breakEvenBuyPrice({ invest, priceNow: P0, sellPrice: pt, buyMsA: today, buyMsB: buyB, sellMs: endMs, tax }) : null;
    return { m, f, today, P0, endMs, buyB, plFairEnd, pats, avgPath, path, pb, pt, hint, A, B, be, tax, invest };
  }

  /* ---------- Charts ---------- */
  const charts = {};
  const vlines = {
    id: "vlines",
    afterDatasetsDraw(chart, _args, opts) {
      const lines = (opts && opts.lines) || [];
      const { ctx, chartArea, scales: { x } } = chart;
      lines.forEach((l, i) => {
        const px = x.getPixelForValue(l.x);
        if (px < chartArea.left || px > chartArea.right) return;
        ctx.save();
        ctx.strokeStyle = l.color; ctx.globalAlpha = 0.8; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(px, chartArea.top); ctx.lineTo(px, chartArea.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = l.color; ctx.globalAlpha = 1;
        ctx.font = "11px system-ui, sans-serif";
        const w = ctx.measureText(l.label).width;
        const tx = px + 4 + w > chartArea.right ? px - 4 - w : px + 4;
        ctx.fillText(l.label, tx, chartArea.top + 12 + i * 13);
        ctx.restore();
      });
    },
  };
  Chart.register(vlines);

  function draw(id, cfg) {
    const el = $(id);
    if (!el || !el.offsetParent) return;
    if (charts[id]) {
      charts[id].data = cfg.data;
      charts[id].options = cfg.options;
      charts[id].update("none");
    } else {
      charts[id] = new Chart(el, cfg);
    }
  }

  function axisColors() {
    return { tick: css("--muted"), grid: css("--grid"), text: css("--text") };
  }
  function timeAxis(min, max) {
    const c = axisColors();
    const span = max - min;
    return {
      type: "linear", min, max,
      // Ticks auf Jahres- bzw. Quartalsanfänge legen
      afterBuildTicks: (axis) => {
        const years = span / (365.25 * DAY);
        const months = years > 12 ? 24 : years > 6 ? 12 : years > 3 ? 6 : years > 1.5 ? 3 : 1;
        const ticks = [];
        const d = new Date(min);
        let y = d.getUTCFullYear(), mo = Math.ceil(d.getUTCMonth() / months) * months;
        for (let k = 0; k < 200; k++) {
          const t = Date.UTC(y, mo, 1);
          if (t > max) break;
          if (t >= min && (months < 24 || y % 2 === 0)) ticks.push({ value: t });
          mo += months; while (mo >= 12) { mo -= 12; y++; }
        }
        axis.ticks = ticks;
      },
      ticks: {
        color: c.tick, maxRotation: 0, autoSkip: true,
        callback: (v) => (span > 3 * 365 * DAY && new Date(v).getUTCMonth() === 0 ? new Date(v).getUTCFullYear() : monthDE(v)),
      },
      grid: { color: c.grid },
    };
  }
  function logAxis(sym, pos = "left") {
    const c = axisColors();
    return {
      type: "logarithmic", position: pos,
      ticks: {
        color: c.tick,
        callback: (v) => {
          const mant = v / Math.pow(10, Math.floor(Math.log10(v)));
          return [1, 2, 5].includes(Math.round(mant * 10) / 10) ? compactFmt.format(v) + " " + sym : "";
        },
      },
      grid: { color: c.grid },
    };
  }
  function baseOptions(extra) {
    const c = axisColors();
    return {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
      interaction: { mode: "x", intersect: false },
      elements: { point: { radius: 0, hitRadius: 3 }, line: { borderWidth: 1.6, tension: 0 } },
      plugins: {
        legend: { labels: { color: c.text, boxWidth: 14, usePointStyle: false } },
        tooltip: {
          filter: (item, idx, items) => items.findIndex((i) => i.datasetIndex === item.datasetIndex) === idx,
          callbacks: { title: (items) => (items.length ? dateDE(items[0].parsed.x) : "") },
        },
        vlines: { lines: [] },
      },
      ...extra,
    };
  }
  const xy = (pts, step = 1) => {
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push({ x: pts[i][0], y: pts[i][1] });
    if (pts.length && (pts.length - 1) % step) out.push({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] });
    return out;
  };
  const line = (label, data, color, more = {}) => ({ label, data, borderColor: color, backgroundColor: color, ...more });

  /* ---------- Rendern ---------- */
  function renderHeader() {
    const m = getModel();
    const pUsd = priceNowUsd(m.series);
    $("livePrice").textContent = money(pUsd * mf());
    $("liveUsd").textContent = state.currency === "EUR" ? usdFmt.format(pUsd) : eurFmt.format(pUsd * fx());
    const ch = $("liveChange");
    if (live.change != null && !(state.manualPrice > 0)) {
      ch.textContent = (live.change >= 0 ? "▲ " : "▼ ") + pct(Math.abs(live.change), 2) + " 24 h";
      ch.className = "chg " + (live.change >= 0 ? "up" : "down");
    } else { ch.textContent = ""; }
    const dot = $("liveDot");
    if (state.manualPrice > 0) {
      dot.className = "dot warn"; $("liveStatus").textContent = "manueller Kurs";
    } else if (live.status === "ok") {
      dot.className = "dot ok";
      $("liveStatus").textContent = `${live.source} · ${new Date(live.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    } else if (live.status === "loading") {
      dot.className = "dot"; $("liveStatus").textContent = "lädt …";
    } else {
      dot.className = "dot warn";
      $("liveStatus").textContent = `offline – letzter Kurs vom ${dateDE(C.parseDate(H.end))}, EUR/USD geschätzt`;
    }
  }

  function renderSteuer(s) {
    const { m, f, P0, endMs, buyB, pt, be, A, invest, tax } = s;
    setVal($("invest"), state.invest);
    setVal($("buyDateB"), state.buyDateB);
    setVal($("years1"), state.years);
    $("yearsLbl1").textContent = fmtYears(+state.years) + " (" + dateDE(endMs) + ")";
    (state.source === "own" ? setVal : (el, v) => { el.value = v; })($("pt1"), pt ? Math.round(pt) : "");
    ["rateNew", "allowance", "personal", "freigrenze"].forEach((k) => setVal($(k), state[k]));
    $("ptHint1").textContent = `Power-Law-Trend am Verkaufstag: ${money(s.plFairEnd)} · Quelle: ${sourceLabel(state.source)} (änderbar in Tab 2).`;

    const taxFree = C.taxFreeFrom(s.today);
    $("taxFreeDate").textContent = dateDE(taxFree);
    const cons = m.bm.consensus.usd * f;
    $("consTief").textContent = `${money(cons)} (${pct(cons / P0 - 1, 0)})`;

    if (!pt || !be) {
      $("beP").textContent = "–"; $("beDrop").textContent = "–"; $("beText").textContent = "Bitte einen Verkaufskurs eingeben.";
    } else if (be.price == null) {
      $("beP").textContent = "–"; $("beDrop").textContent = "nicht erreichbar";
      $("beText").textContent = "Selbst bei einem Kurs nahe null würde sich das Warten nicht lohnen.";
    } else {
      const drop = 1 - be.price / P0;
      $("beP").textContent = money(be.price);
      $("beDrop").textContent = drop > 0 ? "−" + pct(drop) : "keiner";
      let txt;
      if (endMs < C.taxFreeFrom(s.today)) {
        txt = `Achtung: Dein Verkauf am ${dateDE(endMs)} liegt vor dem Ende der Haltefrist – auch der Kauf heute wird dann besteuert. `;
      } else {
        txt = `Kaufst du heute für ${money(invest)} und verkaufst am ${dateDE(endMs)} bei ${money(pt)}, bleiben dir steuerfrei ${money(A.net)}. `;
      }
      if (drop > 0) {
        txt += `Damit sich das Warten bis ${dateDE(buyB)} lohnt, müsstest du dann für höchstens ${money(be.price)} kaufen können – ${pct(drop)} unter dem heutigen Kurs. `;
        const consDrop = 1 - cons / P0;
        if (consDrop > drop) txt += `Das Konsens-Tief der Modelle (${pct(consDrop, 0)} tiefer) läge darunter – historisch wäre so ein Rückgang also möglich, aber nicht sicher, und es müsste genau zu deinem Kaufzeitpunkt passen.`;
        else txt += `Das Konsens-Tief der Modelle (${pct(consDrop, 0)} tiefer) reicht dafür nicht – nach den Modellen spricht mehr für den Kauf heute.`;
      } else {
        txt += "Bei diesem Verkaufskurs entsteht kein steuerpflichtiger Gewinn – jeder niedrigere Kaufkurs später wäre ein Vorteil.";
      }
      $("beText").textContent = txt;
    }

    // Tabelle & Kurve
    const mults = [1.25, 1.5, 2, 3, 5, 10];
    const rows = mults.map((k) => ({ pt: P0 * k, mine: false }));
    if (pt) rows.push({ pt, mine: true });
    rows.sort((a, b) => a.pt - b.pt);
    const calc = (sell) => {
      const r = C.breakEvenBuyPrice({ invest, priceNow: P0, sellPrice: sell, buyMsA: s.today, buyMsB: buyB, sellMs: endMs, tax });
      const nb = r.price ? C.netResult({ invest, buyPrice: r.price, sellPrice: sell, buyMs: buyB, sellMs: endMs, regime: "neu", tax }) : null;
      return { ...r, drop: r.price ? 1 - r.price / P0 : null, taxB: nb ? nb.tax : null };
    };
    let html = "<thead><tr><th>Verkaufskurs</th><th>Kauf heute: netto</th><th>Break-even-Kauf später</th><th>Nötiger Rückgang</th><th>Steuer bei Kauf später</th></tr></thead><tbody>";
    for (const r of rows) {
      const c = calc(r.pt);
      html += `<tr class="${r.mine ? "hl" : ""}"><td>${money(r.pt)}${r.mine ? " (deine Annahme)" : ` (${(r.pt / P0).toLocaleString("de-DE")}×)`}</td><td>${money(c.netA)}</td><td>${money(c.price)}</td><td>${c.drop > 0 ? "−" + pct(c.drop) : "–"}</td><td>${money(c.taxB)}</td></tr>`;
    }
    $("tableBE").innerHTML = html + "</tbody>";

    const curve = [];
    for (let i = 0; i <= 60; i++) {
      const k = Math.pow(10, Math.log10(1.05) + (Math.log10(20) - Math.log10(1.05)) * (i / 60));
      const c = calc(P0 * k);
      if (c.drop != null) curve.push({ x: P0 * k, y: Math.max(0, c.drop * 100) });
    }
    const ax = axisColors();
    const datasets = [
      line("Nötiger Rückgang", curve, css("--b"), { fill: false, borderWidth: 2 }),
      line(`Steuersatz neue Regel (${(tax.rateNew * 100).toLocaleString("de-DE")} %)`, [{ x: curve[0].x, y: tax.rateNew * 100 }, { x: curve[curve.length - 1].x, y: tax.rateNew * 100 }], css("--muted"), { borderDash: [5, 5], borderWidth: 1 }),
    ];
    if (pt && be && be.price) {
      datasets.push(line("Deine Annahme", [{ x: pt, y: Math.max(0, (1 - be.price / P0) * 100) }], css("--a"), { pointRadius: 6, showLine: false }));
    }
    draw("chartBE", {
      type: "line", data: { datasets },
      options: baseOptions({
        interaction: { mode: "nearest", intersect: false },
        scales: {
          x: { type: "logarithmic", min: curve[0].x, max: curve[curve.length - 1].x, title: { display: true, text: "Kurs beim Verkauf", color: ax.tick },
            ticks: { color: ax.tick, callback: (v) => { const mm = v / Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 5].includes(Math.round(mm * 10) / 10) ? compactFmt.format(v) + " " + curSym() : ""; } }, grid: { color: ax.grid } },
          y: { min: 0, title: { display: true, text: "Rückgang bis zum Kauf (%)", color: ax.tick }, ticks: { color: ax.tick, callback: (v) => v + " %" }, grid: { color: ax.grid } },
        },
        plugins: {
          ...baseOptions().plugins,
          tooltip: { callbacks: { title: (it) => it.length ? "Verkauf bei " + money(it[0].parsed.x) : "", label: (it) => `${it.dataset.label}: ${it.parsed.y.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %` } },
        },
      }),
    });
  }

  function sourceOptions(s) {
    const opts = [["own", "Eigene Eingabe"], ["plFair", "Power-Law-Trend"], ["patAvg", "Durchschnitt der Zyklus-Muster"]];
    s.pats.forEach((p) => opts.push(["pat:" + p.label, "Muster Zyklus " + p.label]));
    return opts;
  }
  function sourceLabel(src) {
    if (src === "own") return "eigene Eingabe";
    if (src === "plFair") return "Power-Law-Trend";
    if (src === "patAvg") return "Durchschnitt der Muster";
    return "Muster " + src.slice(4);
  }

  function sideHtml(cls, title, sub, r, buyPrice) {
    if (!r) return `<h3>${title}</h3><p class="muted">keine Daten</p>`;
    return `<h3>${title}</h3><div class="muted">${sub}</div>
      <div class="net">${money(r.net)}</div>
      <dl><dt>Kaufkurs</dt><dd>${money(buyPrice)}</dd>
      <dt>Bitcoin</dt><dd>${r.coins.toLocaleString("de-DE", { maximumFractionDigits: 5 })}</dd>
      <dt>Wert vor Steuer</dt><dd>${money(r.gross)}</dd>
      <dt>Steuer</dt><dd>${money(r.tax)}</dd></dl>`;
  }

  function renderSzenario(s) {
    const sel = $("source");
    const opts = sourceOptions(s);
    if (sel.options.length !== opts.length) sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    sel.value = state.source;
    // Bei Modell-/Muster-Quelle immer den berechneten Wert zeigen, auch im fokussierten Feld
    const put = state.source === "own" ? setVal : (el, v) => { el.value = v; };
    put($("pb"), s.pb ? Math.round(s.pb) : "");
    put($("pt2"), s.pt ? Math.round(s.pt) : "");
    setVal($("years2"), state.years);
    $("yearsLbl2").textContent = fmtYears(+state.years) + " (" + dateDE(s.endMs) + ")";
    $("srcHint").textContent = s.hint + ` Später-Kauf am ${dateDE(s.buyB)}.`;

    $("sideA").className = "side a";
    $("sideA").innerHTML = sideHtml("a", "Heute kaufen", `${dateDE(s.today)} · alte Regel`, s.A, s.P0);
    $("sideB").className = "side b";
    $("sideB").innerHTML = sideHtml("b", "Später kaufen", `${dateDE(s.buyB)} · neue Regel`, s.B, s.pb);
    const d = $("diffText");
    if (s.A && s.B) {
      const diff = s.B.net - s.A.net;
      d.innerHTML = diff >= 0
        ? `Später kaufen bringt <span class="pos">${signed(diff)}</span> mehr – trotz Steuer.`
        : `Heute kaufen bringt <span class="pos">${money(-diff)}</span> mehr.`;
    } else d.textContent = "";

    // Verlauf
    const step = Math.max(1, Math.round(s.path.length / 400));
    const tax = s.tax, invest = s.invest;
    const pricePts = [], aPts = [], bPts = [];
    for (let i = 0; i < s.path.length; i += step) {
      const [t, p] = s.path[i];
      pricePts.push({ x: t, y: p });
      aPts.push({ x: t, y: C.netResult({ invest, buyPrice: s.P0, sellPrice: p, buyMs: s.today, sellMs: t, regime: "alt", tax }).net });
      if (t < s.buyB) bPts.push({ x: t, y: invest });
      else if (s.pb) bPts.push({ x: t, y: C.netResult({ invest, buyPrice: s.pb, sellPrice: p, buyMs: s.buyB, sellMs: t, regime: "neu", tax }).net });
    }
    const ax = axisColors();
    const end = s.path.length ? s.path[s.path.length - 1][0] : s.endMs;
    draw("chartSzen", {
      type: "line",
      data: {
        datasets: [
          line("Heute kaufen (netto)", aPts, css("--a"), { borderWidth: 2.2, yAxisID: "y" }),
          line("Später kaufen (netto)", bPts, css("--b"), { borderWidth: 2.2, yAxisID: "y" }),
          line("Bitcoin-Kurs (rechte Achse)", pricePts, css("--muted"), { borderDash: [3, 3], borderWidth: 1.2, yAxisID: "y1" }),
        ],
      },
      options: baseOptions({
        scales: {
          x: timeAxis(s.today, end),
          y: { ...logAxis(curSym()), title: { display: true, text: "Depotwert nach Steuer", color: ax.tick } },
          y1: { ...logAxis(curSym(), "right"), grid: { display: false }, title: { display: true, text: "Kurs", color: ax.tick } },
        },
        plugins: {
          ...baseOptions().plugins,
          tooltip: { ...baseOptions().plugins.tooltip, callbacks: { title: (it) => (it.length ? dateDE(it[0].parsed.x) : ""), label: (it) => `${it.dataset.label}: ${money(it.parsed.y)}` } },
          vlines: { lines: [
            { x: C.taxFreeFrom(s.today), label: "steuerfrei (heute-Kauf)", color: css("--a") },
            { x: s.buyB, label: "Kauf später", color: css("--b") },
          ] },
        },
      }),
    });
  }

  function cur(v) { return v * mf(); }
  function curFmt(v) { return money(v * mf()); }
  const curSym = () => (state.currency === "EUR" ? "€" : "$");

  function renderModelle(s) {
    const { m } = s;
    const today = s.today;
    const futureEnd = Math.max(s.endMs, C.addYears(today, 1));
    const startMs = state.range === "all" ? m.series.t[0] : C.addYears(today, -(+state.range));
    document.querySelectorAll("#rangeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.range === state.range));
    const step = state.range === "all" ? 4 : state.range === "8" ? 2 : 1;

    const i0 = C.indexAt(m.series, startMs);
    const price = [], wma = [], real = [];
    for (let i = i0; i < m.series.t.length; i += step) {
      const t = m.series.t[i];
      price.push({ x: t, y: cur(m.series.usd[i]) });
      if (m.wma[i]) wma.push({ x: t, y: cur(m.wma[i]) });
      if (m.realized[i]) real.push({ x: t, y: cur(m.realized[i]) });
    }
    const plLine = (off) => {
      const pts = [];
      const from = Math.max(startMs, Date.UTC(2010, 6, 18));
      const n = 300;
      for (let k = 0; k <= n; k++) {
        const t = from + (futureEnd - from) * (k / n);
        pts.push({ x: t, y: cur(C.powerLaw(m.pl, t, off)) });
      }
      return pts;
    };
    const cons = m.bm.consensus;
    const datasets = [
      line("Kurs", price, css("--text"), { borderWidth: 1.4 }),
      line("Power-Law-Trend", plLine(0), css("--c2"), { borderWidth: 1.6 }),
      line("Power-Law-Boden", plLine(m.pl.support), css("--good"), { borderDash: [6, 4] }),
      line("Power-Law-Decke", plLine(m.pl.top), css("--bad"), { borderDash: [6, 4] }),
      line("200-Wochen-Linie", wma, css("--c1")),
      line("Realized Price", real, css("--c3")),
    ];
    if (cons.usd && cons.date) {
      datasets.push(line("Konsens-Tief (Schätzung)", [{ x: cons.date, y: cur(cons.usd) }], css("--b"), { pointRadius: 7, pointStyle: "triangle", showLine: false }));
    }
    draw("chartModel", {
      type: "line", data: { datasets },
      options: baseOptions({
        scales: { x: timeAxis(startMs, futureEnd), y: logAxis(curSym()) },
        plugins: {
          ...baseOptions().plugins,
          tooltip: { ...baseOptions().plugins.tooltip, callbacks: { title: (it) => (it.length ? dateDE(it[0].parsed.x) : ""), label: (it) => `${it.dataset.label}: ${money(it.parsed.y)}` } },
          vlines: { lines: [
            { x: today, label: "heute", color: css("--muted") },
            { x: s.buyB, label: "Kauf später", color: css("--b") },
            { x: s.endMs, label: "Verkauf", color: css("--a") },
          ] },
        },
      }),
    });
    const pNow = priceNowUsd(m.series);
    const plNow = C.powerLaw(m.pl, today);
    $("plInfo").textContent = `Power-Law: Kurs = 10^${m.pl.a.toFixed(2)} × Tage^${m.pl.b.toFixed(2)} (R² ${m.pl.r2.toFixed(3)}). Heute: Trend ${curFmt(plNow)}, Boden ${curFmt(C.powerLaw(m.pl, today, m.pl.support))} – der Kurs liegt ${pct(pNow / plNow - 1, 0)} vom Trend entfernt.`;

    // Modelle
    let html = "<thead><tr><th>Modell</th><th>Tief-Schätzung</th><th>vs. heute</th><th>Zeitpunkt</th><th>Begründung</th></tr></thead><tbody>";
    for (const md of m.bm.models) {
      html += `<tr><td>${md.name}</td><td>${md.usd ? curFmt(md.usd) : "–"}</td><td>${md.usd ? pct(md.usd / pNow - 1, 0) : "–"}</td><td>${md.date ? monthDE(md.date) : "–"}</td><td class="note">${md.note}</td></tr>`;
    }
    html += `<tr class="hl"><td>Konsens (Median)</td><td>${curFmt(cons.usd)}</td><td>${pct(cons.usd / pNow - 1, 0)}</td><td>${cons.date ? monthDE(cons.date) : "–"}</td><td class="note">Tiefster Kurs seit dem Hoch bisher: ${curFmt(m.lowSinceAth.usd)} am ${dateDE(m.lowSinceAth.ms)}.</td></tr>`;
    $("tableModels").innerHTML = html + "</tbody>";

    html = "<thead><tr><th>Zyklus</th><th>Hoch</th><th>Tief</th><th>Rücksetzer</th><th>Tage bis Tief</th></tr></thead><tbody>";
    for (const c of m.cycles) {
      html += `<tr class="${c === m.cur ? "hl" : ""}"><td>${c.label}${c.complete ? "" : " (läuft)"}</td><td>${curFmt(c.ath)}<br><span class="muted">${dateDE(c.athMs)}</span></td><td>${curFmt(c.bottom)}<br><span class="muted">${dateDE(c.botMs)}</span></td><td>−${pct(c.drawdown, 0)}</td><td>${c.daysToBottom}</td></tr>`;
    }
    $("tableCycles").innerHTML = html + "</tbody>";
  }

  const PAT_COLORS = ["--c4", "--c1", "--c2", "--c3"];

  function renderMuster(s) {
    const { m } = s;
    setVal($("patMode"), state.patMode);
    setVal($("patAnchor"), state.patAnchor);
    setVal($("amp"), state.amp);
    $("ampLbl").textContent = state.amp + " %";
    const fs = $("cycleChecks");
    if (fs.querySelectorAll("input").length !== s.pats.length) {
      fs.innerHTML = "<legend>Zyklen</legend>" + s.pats.map((p) => `<label><input type="checkbox" data-cycle="${p.label}"> ${p.label}</label>`).join("");
    }
    fs.querySelectorAll("input").forEach((i) => { i.checked = !!state.cycles[i.dataset.cycle]; });

    const startMs = m.cur.athMs - 400 * DAY;
    const endMs = Math.max(s.endMs, s.buyB) + 30 * DAY;
    const i0 = C.indexAt(m.series, startMs);
    const actual = [];
    for (let i = i0; i < m.series.t.length; i++) actual.push({ x: m.series.t[i], y: cur(m.series.usd[i]) });
    const datasets = [line("Kurs bisher", actual, css("--text"), { borderWidth: 2 })];
    s.pats.forEach((p, k) => {
      if (!p.on || !p.path.length) return;
      datasets.push(line("Muster " + p.label, xy(p.path.map(([t, v]) => [t, cur(v)]), 2), css(PAT_COLORS[k % PAT_COLORS.length]), { borderWidth: 1.4 }));
    });
    if (s.avgPath.length) {
      datasets.push(line("Durchschnitt", xy(s.avgPath.map(([t, v]) => [t, cur(v)]), 2), css("--b"), { borderWidth: 2.6, borderDash: [7, 4] }));
    }
    draw("chartPat", {
      type: "line", data: { datasets },
      options: baseOptions({
        scales: { x: timeAxis(startMs, endMs), y: logAxis(curSym()) },
        plugins: {
          ...baseOptions().plugins,
          tooltip: { ...baseOptions().plugins.tooltip, callbacks: { title: (it) => (it.length ? dateDE(it[0].parsed.x) : ""), label: (it) => `${it.dataset.label}: ${money(it.parsed.y)}` } },
          vlines: { lines: [
            { x: s.today, label: "heute", color: css("--muted") },
            { x: s.buyB, label: "Kauf später", color: css("--b") },
            { x: s.endMs, label: "Verkauf", color: css("--a") },
          ] },
        },
      }),
    });

    $("patSub").textContent = `Kauf heute bei ${money(s.P0)} gegen Kauf am ${dateDE(s.buyB)}, Verkauf am ${dateDE(s.endMs)} (${fmtYears(+state.years)}), Anlage ${money(s.invest)}. Netto = nach Steuer.`;
    const f = s.f, tax = s.tax, invest = s.invest;
    const rowFor = (label, path, srcKey, hl) => {
      const pb = C.valueAt(path, s.buyB), pt = C.valueAt(path, s.endMs);
      let lo = null;
      for (const [t, v] of path) if (t >= s.today && t <= s.endMs && (!lo || v < lo[1])) lo = [t, v];
      const A = pt ? C.netResult({ invest, buyPrice: s.P0, sellPrice: pt * f, buyMs: s.today, sellMs: s.endMs, regime: "alt", tax }) : null;
      const B = pt && pb ? C.netResult({ invest, buyPrice: pb * f, sellPrice: pt * f, buyMs: s.buyB, sellMs: s.endMs, regime: "neu", tax }) : null;
      const diff = A && B ? B.net - A.net : null;
      return `<tr class="${hl ? "hl" : ""}"><td>${label}</td><td>${pb ? curFmt(pb) : "–"}</td><td>${lo ? curFmt(lo[1]) + `<br><span class="muted">${monthDE(lo[0])}</span>` : "–"}</td><td>${pt ? curFmt(pt) : "–"}</td><td>${A ? money(A.net) : "–"}</td><td>${B ? money(B.net) : "–"}</td><td class="${diff == null ? "" : diff >= 0 ? "pos" : "neg"}">${diff == null ? "reicht nicht" : diff >= 0 ? "später +" + money(diff) : "heute +" + money(-diff)}</td><td><button class="link" data-use="${srcKey}">übernehmen</button></td></tr>`;
    };
    let html = "<thead><tr><th>Muster</th><th>Kurs bei Kauf später</th><th>Tief im Zeitraum</th><th>Kurs bei Verkauf</th><th>Heute kaufen: netto</th><th>Später kaufen: netto</th><th>Vorteil</th><th></th></tr></thead><tbody>";
    s.pats.forEach((p) => { if (p.on) html += rowFor("Zyklus " + p.label, p.path, "pat:" + p.label, false); });
    if (s.avgPath.length) html += rowFor("Durchschnitt", s.avgPath, "patAvg", true);
    $("tablePat").innerHTML = html + "</tbody>";
  }

  function renderInfo() {
    $("dataInfo").textContent = `Historie: ${H.source}, tägliche Schlusskurse ${dateDE(C.parseDate(H.start))} bis ${dateDE(C.parseDate(H.end))} (eingebettet). Danach und live: CoinGecko, ersatzweise Binance oder Kraken. Aktualisieren der eingebetteten Historie: python3 scripts/update-data.py`;
    $("changelog").innerHTML = "<ul>" + CHANGELOG.map(([v, d, t]) => `<li><b>v${v}</b> (${dateDE(C.parseDate(d))}): ${t}</li>`).join("") + "</ul>";
  }

  function render() {
    renderHeader();
    const s = scenario();
    const tab = state.tab;
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== "tab-" + tab; });
    setVal($("currency"), state.currency);
    document.querySelectorAll(".cs").forEach((el) => { el.textContent = curSym(); });
    setVal($("manualPrice"), state.manualPrice || "");
    if (tab === "steuer") renderSteuer(s);
    if (tab === "szenario") renderSzenario(s);
    if (tab === "modelle") renderModelle(s);
    if (tab === "muster") renderMuster(s);
    if (tab === "info") renderInfo();
    save();
  }

  /* ---------- Eingaben ---------- */
  function bind() {
    $("version").textContent = "Version " + VERSION;
    $("footVer").textContent = "Bitcoin-Steuerrechner v" + VERSION + " · keine Anlage- oder Steuerberatung";
    document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.tab; render(); }));
    const num = (id, key) => $(id).addEventListener("input", (e) => { state[key] = e.target.value === "" ? null : +e.target.value; render(); });
    num("invest", "invest");
    ["rateNew", "allowance", "personal", "freigrenze"].forEach((k) => num(k, k));
    $("buyDateB").addEventListener("change", (e) => { if (e.target.value) { state.buyDateB = e.target.value; render(); } });
    ["years1", "years2"].forEach((id) => $(id).addEventListener("input", (e) => { state.years = +e.target.value; render(); }));
    // Eigene Kurse eintippen → Quelle wird "Eigene Eingabe"
    const own = (key) => (e) => {
      const s = scenario();
      if (state.source !== "own") { state.pb = s.pb ? Math.round(s.pb) : null; state.pt = s.pt ? Math.round(s.pt) : null; state.source = "own"; }
      state[key] = e.target.value === "" ? null : +e.target.value;
      render();
    };
    $("pt1").addEventListener("input", own("pt"));
    $("pt2").addEventListener("input", own("pt"));
    $("pb").addEventListener("input", own("pb"));
    $("source").addEventListener("change", (e) => { state.source = e.target.value; render(); });
    $("patMode").addEventListener("change", (e) => { state.patMode = e.target.value; render(); });
    $("patAnchor").addEventListener("change", (e) => { state.patAnchor = e.target.value; render(); });
    $("amp").addEventListener("input", (e) => { state.amp = +e.target.value; render(); });
    $("cycleChecks").addEventListener("change", (e) => {
      if (e.target.dataset.cycle) { state.cycles = { ...state.cycles, [e.target.dataset.cycle]: e.target.checked }; render(); }
    });
    $("tablePat").addEventListener("click", (e) => {
      const k = e.target.dataset && e.target.dataset.use;
      if (k) { state.source = k; state.tab = "szenario"; render(); }
    });
    $("rangeSeg").addEventListener("click", (e) => { if (e.target.dataset.range) { state.range = e.target.dataset.range; render(); } });
    $("currency").addEventListener("change", (e) => {
      const before = mf();
      if (document.activeElement && document.activeElement !== e.target) document.activeElement.blur();
      state.currency = e.target.value;
      const k = mf() / before;
      ["invest", "pb", "pt", "manualPrice"].forEach((key) => { if (state[key] > 0) state[key] = Math.round(state[key] * k); });
      render();
    });
    $("manualPrice").addEventListener("input", (e) => { state.manualPrice = +e.target.value || null; render(); });
    $("refresh").addEventListener("click", refresh);
    $("reset").addEventListener("click", () => {
      if (confirm("Alle Eingaben auf Standard zurücksetzen?")) { state = structuredClone(DEFAULTS); state.tab = "info"; render(); }
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      Object.values(charts).forEach((c) => c.destroy());
      Object.keys(charts).forEach((k) => delete charts[k]);
      render();
    });
  }

  async function refresh() {
    live.status = live.usd ? live.status : "loading";
    renderHeader();
    await loadPrice();
    render();
  }

  bind();
  render();
  Promise.all([loadPrice(), loadGap()]).then(render);
  setInterval(refresh, 60000);
})();
