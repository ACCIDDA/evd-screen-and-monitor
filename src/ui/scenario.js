// scenario.js — simplified-release store: a list of traveler profiles + one shared
// active-monitoring length. Each profile's result is the VALIDATED undetected metric.
//
// Monitoring is anchored at arrival (starts day 0). For a profile, days-since-exposure at
// monitoring start, u, spans the exposure window: uLo = -expEnd, uHi = -expStart (expStart,
// expEnd are <= 0, days before arrival). Duration d = amLength. So
//   undetected per 10,000 = riskTable(computeRisk(u = scaleU(BASE_U, uLo, uHi),
//                                                  durations=[amLength], phi, ci))
// i.e. risk = phi * S(amLength + u) — exactly the validated metric (src/core/risk.js).

import { computeRisk, riskTable } from "../core/risk.js";
import { gammaFromQuantiles, incubationSummary, makeGammaSolver } from "../core/incubation.js";
import { quantile } from "../core/stats.js";
import { scaleU, baseNormals } from "../core/rng.js";
import { POST, BASE_U } from "./data.js";

export const EXP_MIN = -60;   // earliest exposure (days before arrival)
export const AM_MAX = 120;    // max active-monitoring length (days)
export const CI = 0.95;       // fixed credible-interval width (the validated default)
export const PHI_LEVELS = [
  { v: 1, label: "1/1" }, { v: 0.1, label: "1/10" }, { v: 0.01, label: "1/100" },
  { v: 0.001, label: "1/1,000" }, { v: 0.0001, label: "1/10,000" },
];
export const phiLabel = (v) => (PHI_LEVELS.find((o) => o.v === Number(v)) || {}).label || String(v);

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
let nextId = 1;

// keep a profile in-domain: expStart <= expEnd <= 0 (so u >= 0), phi numeric
export function clampProfile(p) {
  p.expStart = clamp(Math.round(p.expStart), EXP_MIN, 0);
  p.expEnd = clamp(Math.round(p.expEnd), p.expStart, 0);
  p.phi = Number(p.phi);
  return p;
}

// begin/end are DAYS BEFORE ARRIVAL (begin >= end >= 0); stored as negative offsets
export function newProfile(name, begin, end, phi) {
  return clampProfile({ id: nextId++, name, expStart: -begin, expEnd: -end, phi: Number(phi) });
}

// default incubation summary (posterior medians + CrIs) — prefills the custom inputs
const DEFAULT_INCUB = incubationSummary(POST);
const RATIO_DRAWS = POST.median.map((m, i) => POST.p95[i] / m); // per-draw p95/median
const r1 = (x) => Math.round(x * 10) / 10;
const N = POST.shape.length;

// default custom incubation: when enabled, results use the user's incubation
// distribution instead of the published posterior. With `uncertain` off it is a
// single gamma (point estimate); with it on, uncertainty is propagated over N draws
// by sampling the overall TIMING (median) and the tail-heaviness (95th÷median ratio)
// separately — the 95th percentile follows as median×ratio, so the two move together
// (positively correlated by construction). Yields a genuine credible interval + region.
function defaultCustom() {
  return {
    enabled: false,
    median: r1(DEFAULT_INCUB.median.point),
    ratio: r1(DEFAULT_INCUB.p95.point / DEFAULT_INCUB.median.point), // 95th÷median, central
    uncertain: false,
    // 95% ranges, prefilled from the published posterior (median CrI; ratio CrI)
    medianLo: r1(DEFAULT_INCUB.median.lower), medianHi: r1(DEFAULT_INCUB.median.upper),
    ratioLo: r1(quantile(RATIO_DRAWS, 0.025)), ratioHi: r1(quantile(RATIO_DRAWS, 0.975)),
  };
}

function defaultProfiles() {
  return [
    newProfile("Known exposure, no PPE", 5, 2, 0.1),
    newProfile("Health-care worker", 23, 2, 0.001),       // 21-day stint + 2-day travel buffer
    newProfile("Traveler, no known exposure", 16, 2, 0.0001), // 14-day stay + 2-day travel buffer
  ];
}

export const store = {
  amLength: 14,
  custom: defaultCustom(),
  profiles: defaultProfiles(),
};

// reset the editable scenario back to the seed defaults and persist it
export function resetStore() {
  store.amLength = 14;
  store.custom = defaultCustom();
  store.profiles = defaultProfiles();
  saveStore();
}

const finite = (...xs) => xs.every((x) => Number.isFinite(x));

// a custom edit is usable only if it describes a valid gamma: p95 > median > 0.
// With uncertainty on, the 95% ranges must also be positive and properly ordered.
export function customValid(c = store.custom) {
  if (!(finite(c.median, c.ratio) && c.median > 0 && c.ratio > 1)) return false;
  if (!c.uncertain) return true;
  return finite(c.medianLo, c.medianHi, c.ratioLo, c.ratioHi) &&
    c.medianLo > 0 && c.medianHi > c.medianLo && c.ratioLo > 1 && c.ratioHi > c.ratioLo;
}

// the central 95th percentile implied by the custom (median, ratio): p95 = median × ratio
export function customP95() {
  return store.custom.median * store.custom.ratio;
}

const Z95 = 1.959964; // standard-normal 97.5% point (maps a 95% range to a lognormal SD)
const solveGamma = makeGammaSolver();    // fast batch solver (built once)
const Z_MED = baseNormals(N, 0xA11CE);   // two independent seeded normal streams:
const Z_RATIO = baseNormals(N, 0xB0B);   // one for timing (median), one for tail (ratio)

// the custom posterior columns currently driving the results, as length-N arrays so
// the validated computeRisk path runs unchanged. Point estimate: a single gamma
// repeated. Uncertain: per-draw gammas solved from lognormal draws of (median, p95)
// whose central value and 95% range come from the user. Memoized on the inputs.
let _customCache = null;
function customSamples() {
  const c = store.custom;
  const p95 = c.median * c.ratio; // central 95th percentile
  const key = `${c.median}|${c.ratio}|${c.uncertain ? `${c.medianLo},${c.medianHi},${c.ratioLo},${c.ratioHi}` : "pt"}`;
  if (_customCache && _customCache.key === key) return _customCache;

  if (!c.uncertain) {
    const { shape, scale } = gammaFromQuantiles(c.median, p95);
    _customCache = {
      key, uncertain: false, point: { shape, scale }, draws: null,
      shape: new Array(N).fill(shape), scale: new Array(N).fill(scale),
    };
    return _customCache;
  }

  // Sample TIMING and TAIL separately, both lognormal (central value = point input,
  // 95% range fixes the log-scale SD). The 95th percentile follows as median×ratio, so
  // median and p95 are positively correlated and every draw is a valid gamma.
  const muM = Math.log(c.median), sdM = Math.log(c.medianHi / c.medianLo) / (2 * Z95);
  const muR = Math.log(c.ratio), sdR = Math.log(c.ratioHi / c.ratioLo) / (2 * Z95);
  const shape = new Array(N), scale = new Array(N);
  const drM = new Array(N), drQ = new Array(N);
  for (let i = 0; i < N; i++) {
    const m = Math.exp(muM + sdM * Z_MED[i]);
    const r = Math.max(Math.exp(muR + sdR * Z_RATIO[i]), 1 + 1e-6); // ratio > 1 (defensive)
    const q = m * r;                       // 95th percentile — always above the median
    const g = solveGamma(m, q);
    shape[i] = g.shape; scale[i] = g.scale; drM[i] = m; drQ[i] = q;
  }
  _customCache = { key, uncertain: true, point: gammaFromQuantiles(c.median, p95), draws: { median: drM, p95: drQ }, shape, scale };
  return _customCache;
}

// posterior columns currently driving the results: the published posterior, or the
// custom distribution when the user has enabled a valid custom incubation period.
export function activeSamples() {
  return customActive() ? customSamples() : POST;
}

// is a (valid) custom incubation period currently driving the results?
export function customActive() {
  return store.custom.enabled && customValid();
}

// is the active custom estimate propagating uncertainty (vs. a bare point estimate)?
export function customUncertain() {
  return customActive() && store.custom.uncertain;
}

// the per-draw (median, p95) cloud for the figure, or null when not propagating.
export function customDraws() {
  return customUncertain() ? customSamples().draws : null;
}

export function clampStore() {
  store.amLength = clamp(Math.round(store.amLength), 0, AM_MAX);
  store.profiles.forEach(clampProfile);
}

// ───────────────────────── persistence (localStorage) ─────────────────────────
// Persist the editable scenario (profiles + monitoring length + custom incubation)
// so it survives refresh/restart. Guarded for non-browser contexts (e.g. tests).
const STORE_KEY = "evd-screen-state-v1";
const hasLS = () => typeof localStorage !== "undefined";

export function saveStore() {
  if (!hasLS()) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      amLength: store.amLength, custom: store.custom, profiles: store.profiles,
    }));
  } catch { /* quota / unavailable — silently skip */ }
}

export function loadStore() {
  if (!hasLS()) return;
  let s;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); }
  catch { return; }                                   // corrupt JSON → keep defaults
  if (!s || typeof s !== "object") return;
  if (Number.isFinite(s.amLength)) store.amLength = s.amLength;
  if (s.custom && typeof s.custom === "object") Object.assign(store.custom, s.custom);
  if (Array.isArray(s.profiles)) {
    store.profiles = s.profiles
      .filter((p) => p && Number.isFinite(p.expStart) && Number.isFinite(p.expEnd) && Number.isFinite(p.phi))
      .map((p) => clampProfile({ id: nextId++, name: String(p.name ?? "Profile"), expStart: p.expStart, expEnd: p.expEnd, phi: p.phi }));
  }
  clampStore();
}

loadStore(); // rehydrate at module load, before the UI first renders

// undetected symptomatic infections per 10,000 monitored at a monitoring length, for one
// profile — the validated metric. Returns the riskTable row {Lower bound, Median, Upper bound}.
export function undetectedForProfile(p, amLength = store.amLength, ci = CI) {
  const u = scaleU(BASE_U, -p.expEnd, -p.expStart);
  return riskTable(computeRisk({ samples: activeSamples(), u, durations: [amLength], phi: p.phi, ci }))[0];
}
