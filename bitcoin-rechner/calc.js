/*
 * Bitcoin-Steuerrechner – Rechenkern (ohne DOM).
 * Läuft im Browser (window.BTCCalc) und in Node (module.exports) für Tests.
 * Alle Kurse intern in USD, Beträge in der Steuerrechnung in EUR.
 */
(function (root) {
  "use strict";

  const DAY = 86400000;
  const GENESIS = Date.UTC(2009, 0, 3);
  // Halvings (der nächste ist eine Schätzung anhand der Blockzeit).
  const HALVINGS = [
    Date.UTC(2012, 10, 28),
    Date.UTC(2016, 6, 9),
    Date.UTC(2020, 4, 11),
    Date.UTC(2024, 3, 20),
    Date.UTC(2028, 3, 15),
  ];

  const log10 = Math.log10;
  const utcDay = (ms) => Math.floor(ms / DAY) * DAY;
  const parseDate = (s) => Date.parse(s + "T00:00:00Z");
  const fmtISO = (ms) => new Date(ms).toISOString().slice(0, 10);

  function addYears(ms, years) {
    const d = new Date(ms);
    const whole = Math.trunc(years);
    const res = Date.UTC(d.getUTCFullYear() + whole, d.getUTCMonth(), d.getUTCDate());
    return res + Math.round((years - whole) * 365.25) * DAY;
  }

  /* ---------- Datenreihe ---------- */

  /** Baut eine lückenlose Tagesreihe aus eingebetteter Historie + Live-Tageskursen. */
  function buildSeries(history, live) {
    const start = parseDate(history.start);
    const t = [], usd = [], mvrv = [];
    history.usd.forEach((p, i) => {
      t.push(start + i * DAY);
      usd.push(p);
      mvrv.push(history.mvrv[i]);
    });
    const extra = (live || [])
      .map(([ms, p]) => [utcDay(ms), p])
      .filter(([ms, p]) => ms > t[t.length - 1] && p > 0)
      .sort((a, b) => a[0] - b[0]);
    for (const [ms, p] of extra) {
      const lastT = t[t.length - 1], lastP = usd[usd.length - 1];
      const gap = Math.round((ms - lastT) / DAY);
      if (gap <= 0) { usd[usd.length - 1] = p; continue; }
      for (let k = 1; k <= gap; k++) {
        // fehlende Tage geometrisch interpolieren
        t.push(lastT + k * DAY);
        usd.push(lastP * Math.pow(p / lastP, k / gap));
        mvrv.push(null);
      }
    }
    return { t, usd, mvrv };
  }

  function indexAt(series, ms) {
    const i = Math.round((utcDay(ms) - series.t[0]) / DAY);
    return Math.max(0, Math.min(series.t.length - 1, i));
  }

  /* ---------- Power-Law ---------- */

  const daysSinceGenesis = (ms) => (ms - GENESIS) / DAY;

  /** OLS-Fit log10(Kurs) = a + b·log10(Tage seit Genesis). */
  function fitPowerLaw(series, fromMs = Date.UTC(2010, 6, 18)) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    const xs = [], ys = [];
    for (let i = 0; i < series.t.length; i++) {
      if (series.t[i] < fromMs) continue;
      const x = log10(daysSinceGenesis(series.t[i]));
      const y = log10(series.usd[i]);
      xs.push(x); ys.push(y);
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const a = (sy - b * sx) / n;
    // Residuen erst ab 2012 auswerten – die ersten Monate sind sehr illiquide.
    const resid = [];
    for (let i = 0; i < xs.length; i++) {
      const ms = series.t[series.t.length - xs.length + i];
      if (ms >= Date.UTC(2012, 0, 1)) resid.push(ys[i] - (a + b * xs[i]));
    }
    resid.sort((p, q) => p - q);
    const q = (p) => resid[Math.min(resid.length - 1, Math.max(0, Math.floor(p * resid.length)))];
    let ssr = 0, sst = 0; const my = sy / n;
    for (let i = 0; i < xs.length; i++) { ssr += (ys[i] - a - b * xs[i]) ** 2; sst += (ys[i] - my) ** 2; }
    return {
      a, b, r2: 1 - ssr / sst,
      support: resid[0], q05: q(0.05), q95: q(0.95), top: resid[resid.length - 1],
    };
  }

  /** Power-Law-Wert in USD, offset = log10-Abstand zur Mittellinie. */
  function powerLaw(pl, ms, offset = 0) {
    return Math.pow(10, pl.a + pl.b * log10(daysSinceGenesis(ms)) + offset);
  }

  /* ---------- weitere Indikatoren ---------- */

  /** Gleitender Durchschnitt über `days` Tage (200 Wochen = 1400 Tage). */
  function sma(values, days) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= days) sum -= values[i - days];
      if (i >= days - 1) out[i] = sum / days;
    }
    return out;
  }

  /** Realized Price = Kurs / MVRV (nur wo MVRV vorhanden). */
  function realizedPrice(series) {
    return series.usd.map((p, i) => (series.mvrv[i] ? p / series.mvrv[i] : null));
  }

  /* ---------- Zyklen ---------- */

  /** Zyklushoch je Halving-Epoche und das anschließende Tief (max. 700 Tage danach). */
  function findCycles(series, wma) {
    const bounds = [series.t[0], ...HALVINGS.filter((h) => h < series.t[series.t.length - 1])];
    const last = series.t.length - 1;
    const cycles = [];
    for (let k = 0; k < bounds.length; k++) {
      const i0 = indexAt(series, bounds[k]);
      // Zyklushochs lagen bisher 12–18 Monate nach dem Halving → Fenster max. 2 Jahre
      const winEnd = k === 0 ? bounds[1] || series.t[last] : Math.min(bounds[k] + 730 * DAY, bounds[k + 1] || Infinity);
      const i1 = indexAt(series, winEnd);
      let ath = i0;
      for (let i = i0; i <= Math.min(i1, last); i++) if (series.usd[i] > series.usd[ath]) ath = i;
      // nur ein echtes neues Allzeithoch zählt
      let prevMax = 0;
      for (let i = 0; i < ath; i++) prevMax = Math.max(prevMax, series.usd[i]);
      if (series.usd[ath] <= prevMax) continue;
      if (cycles.length && cycles[cycles.length - 1].athIdx === ath) continue;
      const end = Math.min(last, ath + 700);
      let bot = ath;
      for (let i = ath; i <= end; i++) if (series.usd[i] < series.usd[bot]) bot = i;
      let mvrvMin = null;
      for (let i = ath; i <= end; i++) {
        const m = series.mvrv[i];
        if (m != null && (mvrvMin == null || m < mvrvMin)) mvrvMin = m;
      }
      const year = new Date(series.t[ath]).getUTCFullYear();
      cycles.push({
        label: String(year),
        athIdx: ath, athMs: series.t[ath], ath: series.usd[ath],
        botIdx: bot, botMs: series.t[bot], bottom: series.usd[bot],
        drawdown: 1 - series.usd[bot] / series.usd[ath],
        daysToBottom: bot - ath,
        complete: ath + 700 <= last,
        mvrvAtBottom: mvrvMin,
        wmaRatio: wma && wma[bot] ? series.usd[bot] / wma[bot] : null,
      });
    }
    return cycles;
  }

  function linFit(xs, ys) {
    const n = xs.length;
    const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    const b = den ? num / den : 0;
    return { a: my - b * mx, b };
  }

  const median = (arr) => {
    const s = arr.filter((v) => v != null && isFinite(v)).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;

  /** Tiefpunkt-Schätzungen verschiedener Modelle (USD). */
  function bottomModels(series, pl, cycles, wma, realized) {
    const done = cycles.filter((c) => c.complete);
    const cur = cycles[cycles.length - 1];
    const out = [];

    // 1) Zyklus-Drawdown: Trend der bisherigen Rücksetzer fortschreiben
    const ddFit = linFit(done.map((_, i) => i), done.map((c) => c.drawdown));
    const ddPred = Math.min(0.9, Math.max(0.5, ddFit.a + ddFit.b * done.length));
    const daysPred = Math.round(mean(done.slice(-3).map((c) => c.daysToBottom)));
    const botDate = cur.athMs + daysPred * DAY;
    out.push({
      key: "drawdown", name: "Zyklus-Rücksetzer",
      usd: cur.ath * (1 - ddPred), date: botDate,
      note: `Bisher ${done.map((c) => "−" + Math.round(c.drawdown * 100) + " %").join(", ")} vom Hoch – Trend ergibt ca. −${Math.round(ddPred * 100)} % vom Hoch ${fmtISO(cur.athMs)}. Tief kam im Schnitt ${daysPred} Tage nach dem Hoch.`,
    });

    // 2) Power-Law-Boden (Unterkante aller Kurse seit 2012) am geschätzten Tief-Datum
    out.push({
      key: "plSupport", name: "Power-Law-Boden",
      usd: powerLaw(pl, botDate, pl.support), date: botDate,
      note: `Unterkante des Power-Law-Kanals (log10-Abstand ${pl.support.toFixed(2)} zur Trendlinie). Wurde in jedem Zyklus nahe am Tief berührt.`,
    });

    // 3) Realized Price × MVRV an früheren Tiefs
    let rIdx = realized.length - 1;
    while (rIdx > 0 && realized[rIdx] == null) rIdx--;
    const mv = done.filter((c) => c.mvrvAtBottom).slice(-3).map((c) => c.mvrvAtBottom);
    if (realized[rIdx] && mv.length) {
      const m = mean(mv);
      out.push({
        key: "realized", name: "Realized Price (On-Chain)",
        usd: realized[rIdx] * m, date: null,
        note: `Durchschnittlicher Einstandspreis aller Coins: ${Math.round(realized[rIdx]).toLocaleString("de-DE")} $ (Stand ${fmtISO(series.t[rIdx])}). An den letzten Tiefs lag der Kurs beim ${mv.map((v) => v.toFixed(2)).join(" / ")}-fachen davon.`,
      });
    }

    // 4) 200-Wochen-Durchschnitt
    const wNow = wma[wma.length - 1];
    const wr = done.filter((c) => c.wmaRatio).slice(-3).map((c) => c.wmaRatio);
    if (wNow && wr.length) {
      const m = mean(wr);
      out.push({
        key: "wma", name: "200-Wochen-Linie",
        usd: wNow * m, date: null,
        note: `200-Wochen-Durchschnitt aktuell ${Math.round(wNow).toLocaleString("de-DE")} $. Frühere Tiefs lagen beim ${wr.map((v) => v.toFixed(2)).join(" / ")}-fachen davon.`,
      });
    }

    // 5) Halving-Timing (nur Datum)
    const nextHalving = HALVINGS.find((h) => h > cur.athMs);
    const before = done.slice(-3).map((c) => {
      const h = HALVINGS.find((x) => x > c.botMs);
      return h ? (h - c.botMs) / DAY : null;
    }).filter((v) => v != null);
    if (nextHalving && before.length) {
      const d = Math.round(mean(before));
      out.push({
        key: "halving", name: "Halving-Timing",
        usd: null, date: nextHalving - d * DAY,
        note: `Tiefs lagen ca. ${d} Tage vor dem nächsten Halving (nächstes ca. ${fmtISO(nextHalving)}).`,
      });
    }

    const consensus = {
      usd: median(out.map((m) => m.usd)),
      date: median(out.map((m) => m.date)),
      ddPred, daysPred,
    };
    return { models: out, consensus, current: cur };
  }

  /* ---------- Muster ---------- */

  /**
   * Projiziert den Verlauf eines früheren Zyklus (ab dessen Hoch) auf den aktuellen.
   * mode "trend": Abstand zum Power-Law-Trend wird wiederholt (berücksichtigt abnehmende Renditen).
   * mode "ratio": prozentualer Verlauf wird 1:1 wiederholt.
   * mode "damped": wie "ratio", aber auf die heutige Zyklusgröße gedämpft (Standard).
   * anchor "today": Projektion startet beim heutigen Kurs, "ath": beim aktuellen Hoch.
   */
  function projectPattern(series, pl, past, cur, opts) {
    const { mode = "damped", anchor = "today", nowMs, nowUsd, untilMs } = opts;
    let amp = opts.amp == null ? 1 : opts.amp;
    // "damped": Ausschläge so skalieren, dass der Rücksetzer des alten Zyklus
    // dem für heute erwarteten Rücksetzer entspricht (abnehmende Volatilität).
    if (mode === "damped" && opts.targetDrawdown && past.drawdown > 0) {
      amp *= Math.log(1 - opts.targetDrawdown) / Math.log(1 - past.drawdown);
    }
    const lastIdx = series.t.length - 1;
    const maxT = lastIdx - past.athIdx;
    const shape = (tDays) => {
      const i = past.athIdx + tDays;
      if (tDays < 0 || tDays > maxT) return null;
      const p = series.usd[i];
      return mode === "trend"
        ? log10(p) - log10(powerLaw(pl, series.t[i]))
        : log10(p / past.ath);
    };
    const base = (ms) => (mode === "trend" ? log10(powerLaw(pl, ms)) : log10(cur.ath));
    const tNow = Math.round((nowMs - cur.athMs) / DAY);
    let offset;
    if (anchor === "today" && shape(tNow) != null) {
      offset = log10(nowUsd) - base(nowMs) - amp * shape(tNow);
    } else {
      offset = log10(cur.ath) - base(cur.athMs) - amp * shape(0);
    }
    const pts = [];
    const startT = anchor === "today" ? tNow : 0;
    const endT = Math.round((untilMs - cur.athMs) / DAY);
    for (let tD = startT; tD <= endT; tD += 1) {
      const s = shape(tD);
      if (s == null) break;
      const ms = cur.athMs + tD * DAY;
      pts.push([ms, Math.pow(10, base(ms) + amp * s + offset)]);
    }
    return pts;
  }

  /**
   * Geometrisches Mittel mehrerer Projektionen (gleicher Starttag). Endet ein
   * Muster früher, wird mit den übrigen weitergerechnet – ohne Sprung im Verlauf.
   */
  function averagePaths(paths) {
    paths = paths.filter((p) => p.length);
    if (!paths.length) return [];
    const len = Math.max(...paths.map((p) => p.length));
    const out = [];
    let prevSet = "", offset = 0, prevRaw = null;
    for (let i = 0; i < len; i++) {
      const avail = paths.filter((p) => i < p.length);
      const set = avail.map((p) => paths.indexOf(p)).join(",");
      const raw = mean(avail.map((p) => log10(p[i][1])));
      if (prevSet && set !== prevSet) {
        // Wert des Vortags mit dem neuen Satz an Mustern neu berechnen → anschließen
        const before = mean(avail.map((p) => log10(p[i - 1][1])));
        offset += prevRaw - before;
      }
      out.push([avail[0][i][0], Math.pow(10, raw + offset)]);
      prevSet = set; prevRaw = raw;
    }
    return out;
  }

  function valueAt(path, ms) {
    if (!path.length || ms < path[0][0] || ms > path[path.length - 1][0]) return null;
    const i = Math.round((ms - path[0][0]) / DAY);
    return path[Math.max(0, Math.min(path.length - 1, i))][1];
  }

  /** Geometrische Interpolation durch Stützpunkte [[ms, kurs], ...] (Tagesraster). */
  function interpolatePath(points) {
    const out = [];
    for (let k = 0; k + 1 < points.length; k++) {
      const [t0, p0] = points[k], [t1, p1] = points[k + 1];
      const n = Math.max(1, Math.round((t1 - t0) / DAY));
      for (let i = k === 0 ? 0 : 1; i <= n; i++) out.push([t0 + i * DAY, p0 * Math.pow(p1 / p0, i / n)]);
    }
    return out;
  }

  /* ---------- Steuer ---------- */

  /** Tag, ab dem ein Verkauf steuerfrei ist (Haltefrist > 1 Jahr, § 23 EStG). */
  const taxFreeFrom = (buyMs) => addYears(buyMs, 1) + DAY;

  /**
   * Netto-Erlös eines Kaufs nach Steuer.
   * regime "alt": § 23 EStG – nach > 1 Jahr steuerfrei, sonst persönlicher Satz (Freigrenze).
   * regime "neu": Annahme Abgeltungsteuer ohne Haltefrist, mit Freibetrag.
   */
  function netResult({ invest, buyPrice, sellPrice, buyMs, sellMs, regime, tax }) {
    const coins = invest / buyPrice;
    const gross = coins * sellPrice;
    const gain = gross - invest;
    let taxDue = 0;
    if (gain > 0) {
      if (regime === "alt") {
        if (sellMs < taxFreeFrom(buyMs)) {
          taxDue = gain <= tax.freigrenze ? 0 : gain * tax.personal;
        }
      } else {
        taxDue = Math.max(0, gain - tax.allowance) * tax.rateNew;
      }
    }
    return { coins, gross, gain, tax: taxDue, net: gross - taxDue };
  }

  /**
   * Kaufkurs B (unter neuer Regel), ab dem das Warten genauso viel bringt wie
   * der Kauf heute (alte Regel). Liefert null, wenn kein Kurs > 0 reicht.
   */
  function breakEvenBuyPrice(p) {
    const a = netResult({ ...p, buyPrice: p.priceNow, buyMs: p.buyMsA, regime: "alt" });
    const netB = (pb) => netResult({ ...p, buyPrice: pb, buyMs: p.buyMsB, regime: "neu" }).net;
    let hi = p.priceNow * 50, lo = p.priceNow * 1e-6;
    if (netB(hi) >= a.net) return { price: hi, netA: a.net };
    if (netB(lo) < a.net) return { price: null, netA: a.net };
    for (let k = 0; k < 200; k++) {
      const mid = Math.sqrt(lo * hi);
      if (netB(mid) >= a.net) lo = mid; else hi = mid;
    }
    return { price: lo, netA: a.net };
  }

  const api = {
    DAY, GENESIS, HALVINGS, utcDay, parseDate, fmtISO, addYears,
    buildSeries, indexAt, fitPowerLaw, powerLaw, sma, realizedPrice,
    findCycles, bottomModels, projectPattern, averagePaths, valueAt, interpolatePath,
    taxFreeFrom, netResult, breakEvenBuyPrice, median,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BTCCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
