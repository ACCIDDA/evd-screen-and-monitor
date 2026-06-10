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
import { scaleU } from "../core/rng.js";
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

export const store = {
  amLength: 14,
  profiles: [
    newProfile("High-risk contact", 21, 2, 0.01),
    newProfile("Some risk", 14, 2, 0.001),
    newProfile("Low risk", 10, 1, 0.0001),
  ],
};

export function clampStore() {
  store.amLength = clamp(Math.round(store.amLength), 0, AM_MAX);
  store.profiles.forEach(clampProfile);
}

// undetected symptomatic infections per 10,000 monitored at a monitoring length, for one
// profile — the validated metric. Returns the riskTable row {Lower bound, Median, Upper bound}.
export function undetectedForProfile(p, amLength = store.amLength, ci = CI) {
  const u = scaleU(BASE_U, -p.expEnd, -p.expStart);
  return riskTable(computeRisk({ samples: POST, u, durations: [amLength], phi: p.phi, ci }))[0];
}
