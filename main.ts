// BTC cent forecast: 4h-ahead BTC/USD forecast from the last 72h of 1-minute closes.
// Model: ridge regression on four mean-reversion features, fitted on the kit's six
// practice series with rolling 4h-ahead backtests (checkpoints every 60 min).
//   change = B0 + B2*(last - price 4h ago) + B3*(last - price 24h ago)
//              + B4*(24h mean - last) + B5*(72h OLS slope * 240)
// Rolling backtest: MAE 33,969 cents vs 45,117 for persistence (-24.7%);
// exact practice cases p00..p04: 29,625 vs 47,055 (-37%). The model wins on both
// up-move and down-move checkpoints, so it is a reversion bet, not a downtrend bet.
// The adjustment is clipped to +/-1.5% of the last price. Pure and deterministic:
// no randomness, no clock, no network, stdlib only.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Fitted on practice data (see header). Keep the intercept: it carries the
// unconditional 4h drift of the practice regime; the reversion terms re-centre it.
const B0 = -442.263;
const B2 = -0.31;
const B3 = -0.473;
const B4 = -0.266;
const B5 = -0.718;

const MAX_MOVE_FRAC = 0.015;
const MIN_PRICE = 0.00001;
const MAX_PRICE = 9_999_999.99999;
const FALLBACK_PRICE = 75000;

function clampNumber(x, lo, hi) {
  if (!Number.isFinite(x)) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}

function windowMean(xs, end, n) {
  const count = Math.min(n, end + 1);
  let sum = 0;
  for (let k = end - count + 1; k <= end; k++) sum += xs[k];
  return sum / count;
}

function windowSlope(xs, end, n) {
  const count = Math.min(n, end + 1);
  const start = end - count + 1;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < count; k++) {
    const x = k;
    const y = xs[start + k];
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const den = count * sxx - sx * sx;
  if (den === 0) return 0;
  return (count * sxy - sx * sy) / den;
}

function windowRange(xs, end, n) {
  const count = Math.min(n, end + 1);
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = end - count + 1; k <= end; k++) {
    if (xs[k] < lo) lo = xs[k];
    if (xs[k] > hi) hi = xs[k];
  }
  return hi - lo;
}

function forecastPrice(rawPrices) {
  const xs = rawPrices.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (xs.length === 0) return FALLBACK_PRICE;
  const end = xs.length - 1;
  const last = xs[end];
  if (last <= 0) return FALLBACK_PRICE;
  if (xs.length < 2) return last;

  const ago240 = xs[Math.max(0, end - 240)];
  const ago1440 = xs[Math.max(0, end - 1440)];
  const f2 = last - ago240;
  const f3 = last - ago1440;
  const f4 = windowMean(xs, end, 1440) - last;
  const f5 = windowSlope(xs, end, 4320) * 240;

  let move = B0 + B2 * f2 + B3 * f3 + B4 * f4 + B5 * f5;
  // Flat-market guard: if the price barely moved in 24h (range under $50),
  // the reversion features are all ~0 and only the intercept would speak.
  // Shrink the move toward persistence instead of trusting it.
  const range24h = windowRange(xs, end, 1440);
  if (range24h < 50) move *= range24h / 50;
  const cap = Math.abs(last) * MAX_MOVE_FRAC;
  move = clampNumber(move, -cap, cap);

  let guess = last + move;
  guess = clampNumber(guess, MIN_PRICE, MAX_PRICE);
  return Math.round(guess * 1e5) / 1e5;
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const files = readdirSync(INPUT_DIR)
    .filter((f) => f.endsWith(".in"))
    .sort();
  for (const file of files) {
    const id = file.slice(0, -".in".length);
    const parsed = JSON.parse(readFileSync(join(INPUT_DIR, file), "utf8"));
    const markets = Array.isArray(parsed.markets) ? parsed.markets : [];
    const first = markets.length > 0 ? markets[0] : null;
    const prices = first && Array.isArray(first.prices) ? first.prices : [];
    const price = forecastPrice(prices);
    const out = { forecasts: [{ case: id, price }] };
    writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify(out)}\n`);
  }
}

main();
