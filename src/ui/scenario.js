// scenario.js — the shared, single-source-of-truth scenario for the linked tabs, plus the
// validated undetected-infections computation for the active-monitoring window.
//
// Both the timeline tab and the Undetected-infections tab read/write this object and
// subscribe to changes (two-way link). DOM controls/sliders are VIEWS of this data; they
// are written back via non-event-firing setters, and `notify()` has a reentrancy guard, so
// there are no update loops. phi is stored as a NUMBER (the risk core needs a number).
//
// Linked params: phi (expRisk), exposure window, active monitoring, and the CI used by the
// risk table. Mapping to the validated metric risk = phi * S(d + u) (src/core/risk.js):
//   u  = days since exposure at monitoring start, spans the exposure window:
//        uLo = am.start - exp.end ,  uHi = am.start - exp.start
//   d  = monitoring duration = am.end - am.start  (= the risk curve's max duration)
// The result depends only on the window CLOSE (am.end); am.start cancels in u + d.

import { computeRisk, riskTable } from "../core/risk.js";
import { scaleU } from "../core/rng.js";
import { POST, BASE_U } from "./data.js";

export const EXP_MIN = -60, POST_MAX = 120;
export const MIN_EXP_W = 4; // min exposure-window width (days) — keeps its label clear of arrival

export const scenario = {
  expRisk: 0.01,                  // phi (number) — mirrors the risk tab's #r_phi
  ci: 0.95,                       // CI width — mirrors the risk tab's #r_ci
  exp: { start: -10, end: -2 },   // exposure window (negative day offsets, before arrival)
  // single active-monitoring/quarantine intervention: anchored at arrival (day 0), only the
  // end is set; reduction = % reduction in onward transmission (0 = active monitoring …
  // 100 = strict quarantine). Recorded only — not yet fed into a computed outcome.
  am: { on: false, start: 0, end: 16, reduction: 0 },
  test: false, fever: false,
  testOut: false, // test-to-exit at the end of the monitoring window (parameter only for now)
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function clampScenario() {
  const s = scenario;
  s.exp.start = clamp(s.exp.start, EXP_MIN, 0);
  s.exp.end = clamp(s.exp.end, s.exp.start, 0);
  if (s.exp.end - s.exp.start < MIN_EXP_W) s.exp.start = Math.max(EXP_MIN, s.exp.end - MIN_EXP_W);
  s.am.start = clamp(s.am.start, 0, POST_MAX);
  s.am.end = clamp(s.am.end, s.am.start, POST_MAX);
  s.am.reduction = clamp(s.am.reduction, 0, 100);
  s.ci = clamp(s.ci, 0.5, 1);
}

const listeners = new Set();
let depth = 0;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Notify all views of a scenario change. `source` lets a view skip redundant self-work.
// The depth guard makes notifies fired *during* a notify no-ops, so view renders that
// (incorrectly) mutate state can't cause an infinite loop.
export function notify(source) {
  if (depth) return;
  depth++;
  try { clampScenario(); for (const fn of listeners) fn(source); } finally { depth = 0; }
}

// Active-monitoring duration = risk curve's max duration; the value surfaced on the timeline.
export function amDuration() { return scenario.am.end - scenario.am.start; }

// Days-since-exposure-at-monitoring-start bounds, derived from the exposure window.
export function uBounds() {
  return { uLo: scenario.am.start - scenario.exp.end, uHi: scenario.am.start - scenario.exp.start };
}

// Undetected symptomatic infections per 10,000 monitored, for a single duration d, using
// the validated core. Returns the riskTable row { "Lower bound","Median","Upper bound" }.
// Equals the Undetected tab's row at the same duration (same POST/BASE_U/ci → byte-identical).
export function undetectedAt(d) {
  const { uLo, uHi } = uBounds();
  const u = scaleU(BASE_U, uLo, uHi);
  const res = computeRisk({ samples: POST, u, durations: [d], phi: scenario.expRisk, ci: scenario.ci });
  return riskTable(res)[0];
}
