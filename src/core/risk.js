// risk.js — Output 2: undetected infections (risk-vs-duration + per-10,000 table).
// prob_of_missing_case: p = φ · S(d+u), S = pgamma(d+u, shape, scale, lower=FALSE)
// (activemonitr R/prob_of_missing_case.R:21). Per (d,φ) we take type-7 quantiles
// (ltp,p50,utp) over the posterior sample (R/plot_risk.R:106-110).
//
// DEVIATION (determinism, see METHODS.md): the app does slice_sample(n=1000) of
// the 5000 rows with R's RNG every render. Here the core consumes an explicit
// posterior sub-matrix + paired u vector (one u per row) and is deterministic.

import { pgamma, quantileSorted } from "./stats.js";
import { fractionLabel, RISK_MAXDEN } from "./labels.js";

// Compute the per-duration risk summary for a single φ.
//   samples : { shape: number[], scale: number[] }
//   u       : number[]  (length === samples.shape.length; one per posterior row)
//   durations : number[]  (integer days, e.g. 1..28)
//   phi     : number
//   ci      : confidence-interval width (e.g. 0.95)
// returns { phi, label, ci, rows: [{ d, ltp, p50, utp }] }   (rows unrounded)
export function computeRisk({ samples, u, durations, phi, ci }) {
  const shape = samples.shape, scale = samples.scale, n = shape.length;
  if (u.length !== n) throw new Error(`u length ${u.length} != samples ${n}`);
  const loQ = (1 - ci) / 2, hiQ = 1 - loQ;
  const rows = durations.map((d) => {
    const p = new Array(n);
    for (let i = 0; i < n; i++) {
      p[i] = pgamma(d + u[i], shape[i], scale[i], false) * phi;
    }
    p.sort((a, b) => a - b);
    return { d, ltp: quantileSorted(p, loQ), p50: quantileSorted(p, 0.5), utp: quantileSorted(p, hiQ) };
  });
  return { phi, label: fractionLabel(phi, RISK_MAXDEN), ci, rows };
}

// Per-10,000 table (server.R:198-200): round(1e4 · {ltp,p50,utp}, 2) per duration.
export function riskTable(result) {
  return result.rows.map((r) => ({
    "Duration, in days": r.d,
    "Lower bound": round2(1e4 * r.ltp),
    "Median": round2(1e4 * r.p50),
    "Upper bound": round2(1e4 * r.utp),
  }));
}

// Dynamic log y-axis derivation (server.R:142-155), based on the p50 series.
export function riskAxis(result) {
  const p50 = result.rows.map((r) => r.p50);
  const pMin = Math.max(Math.pow(10, Math.floor(Math.log10(Math.min(...p50)))), 1e-6);
  const pMax = Math.pow(10, Math.ceil(Math.log10(Math.max(...p50))));
  const lo = Math.round(Math.log10(pMin)), hi = Math.round(Math.log10(pMax));
  const breaks = [], labels = [];
  for (let e = lo; e <= hi; e++) {
    breaks.push(Math.pow(10, e));
    labels.push("1/" + Math.round(Math.pow(10, Math.abs(e))).toLocaleString("en-US"));
  }
  return { pMin, pMax, breaks, labels };
}

// R round() uses round-half-to-even (banker's rounding); match it for the table.
function round2(x) {
  const scaled = x * 100;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let r;
  if (diff > 0.5) r = floor + 1;
  else if (diff < 0.5) r = floor;
  else r = floor % 2 === 0 ? floor : floor + 1; // half -> even
  return r / 100;
}
