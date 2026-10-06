const test = require("node:test");
const assert = require("node:assert");
const C = require("../calc.js");
global.window = {};
require("../data/btc-history.js");
const H = global.window.BTC_HISTORY;

const tax = { personal: 0.42, freigrenze: 1000, rateNew: 0.26375, allowance: 1000 };
const now = Date.UTC(2026, 9, 6);

test("Haltefrist: Verkauf nach > 1 Jahr steuerfrei, davor persönlicher Satz", () => {
  assert.strictEqual(C.fmtISO(C.taxFreeFrom(now)), "2027-10-07");
  const late = C.netResult({ invest: 10000, buyPrice: 50000, sellPrice: 100000, buyMs: now, sellMs: C.parseDate("2027-10-07"), regime: "alt", tax });
  assert.strictEqual(late.tax, 0);
  const early = C.netResult({ invest: 10000, buyPrice: 50000, sellPrice: 100000, buyMs: now, sellMs: C.parseDate("2027-10-06"), regime: "alt", tax });
  assert.strictEqual(Math.round(early.tax), 4200);
  const small = C.netResult({ invest: 1000, buyPrice: 50000, sellPrice: 75000, buyMs: now, sellMs: now + C.DAY, regime: "alt", tax });
  assert.strictEqual(small.tax, 0, "unter der Freigrenze steuerfrei");
});

test("Neue Regel: Gewinn minus Freibetrag × Steuersatz", () => {
  const r = C.netResult({ invest: 10000, buyPrice: 50000, sellPrice: 100000, buyMs: now, sellMs: now + 3000 * C.DAY, regime: "neu", tax });
  assert.ok(Math.abs(r.tax - 9000 * 0.26375) < 1e-6);
});

test("Break-even-Kaufkurs gleicht beide Wege aus", () => {
  const p = { invest: 10000, priceNow: 60000, sellPrice: 150000, buyMsA: now, buyMsB: C.parseDate("2027-01-01"), sellMs: C.parseDate("2030-01-01"), tax };
  const be = C.breakEvenBuyPrice(p);
  const b = C.netResult({ invest: 10000, buyPrice: be.price, sellPrice: 150000, buyMs: p.buyMsB, sellMs: p.sellMs, regime: "neu", tax });
  assert.ok(Math.abs(b.net - be.netA) < 0.01);
  assert.ok(Math.abs(be.price - 49974.55) < 1);
});

test("Historie lückenlos, Power-Law plausibel, Zyklen erkannt", () => {
  const s = C.buildSeries(H, []);
  assert.strictEqual(s.t.length, H.usd.length);
  const pl = C.fitPowerLaw(s);
  assert.ok(pl.b > 5 && pl.b < 6.5 && pl.r2 > 0.9);
  const cycles = C.findCycles(s, C.sma(s.usd, 1400));
  assert.deepStrictEqual(cycles.map((c) => c.label), ["2011", "2013", "2017", "2021", "2025"]);
  const bm = C.bottomModels(s, pl, cycles, C.sma(s.usd, 1400), C.realizedPrice(s));
  assert.ok(bm.consensus.usd > 10000 && bm.consensus.usd < 120000);
});

test("Live-Tage werden angehängt und Lücken interpoliert", () => {
  const end = C.parseDate(H.end);
  const s = C.buildSeries(H, [[end + 3 * C.DAY, 90000]]);
  assert.strictEqual(s.t.length, H.usd.length + 3);
  assert.strictEqual(s.usd[s.usd.length - 1], 90000);
});

test("Muster-Durchschnitt läuft ohne Sprung weiter, wenn ein Muster endet", () => {
  const a = [[0, 100], [1, 100], [2, 100]], b = [[0, 400], [1, 400]];
  const avg = C.averagePaths([a, b]);
  assert.strictEqual(avg.length, 3);
  assert.ok(Math.abs(avg[2][1] - avg[1][1]) < 1e-9);
});
