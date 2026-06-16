// incubation.js — Output 1: incubation-period estimate.
// The plotted point is the MEDIAN of the stored per-draw `median` and `p95`
// columns (activemonitr R/plot_risk.R:193, plot_modified_credible_regions).
// We read the stored columns directly — never recompute via qgamma.
// The credible region itself is the precomputed KDE polygon (data file).

import { quantile, qgamma } from "./stats.js";

// samples: { median: number[], p95: number[] }  (the stored posterior columns)
// returns the plotted point { median, p95 } in days.
export function incubationPoint(samples) {
  return {
    median: quantile(samples.median, 0.5), // R median() == type-7 quantile @ .5
    p95: quantile(samples.p95, 0.5),
  };
}

// Solve a gamma's (shape, scale) from two of its quantiles: the median and the
// 95th percentile (the two intuitive numbers a user edits). The ratio q.hi/q.lo of
// any two gamma quantiles depends on `shape` ALONE (scale cancels), and is monotone
// decreasing in shape — so we bisect on shape to match the target ratio, then set
// scale from the median. Requires p95 > median > 0.
export function gammaFromQuantiles(median, p95, pMed = 0.5, pHi = 0.95) {
  const ratio = p95 / median;
  const g = (k) => qgamma(pHi, k) / qgamma(pMed, k); // decreasing in k
  let lo = 1e-3, hi = 1e4;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);          // geometric bisection (shape spans orders of magnitude)
    if (g(mid) > ratio) lo = mid; else hi = mid;
  }
  const shape = Math.sqrt(lo * hi);
  const scale = median / qgamma(pMed, shape);
  return { shape, scale };
}

// Fast batch solver. gammaFromQuantiles is exact but ~4 ms/call (nested bisection),
// far too slow to run per draw when propagating uncertainty over thousands of pairs.
// Since the quantile ratio q_hi/q_med depends on shape ALONE and is monotone in it,
// we precompute a (shape → ratio, median-quantile) table ONCE, then map each
// (median, p95) pair to (shape, scale) by interpolation in microseconds.
export function makeGammaSolver(pMed = 0.5, pHi = 0.95) {
  const N = 600, kMin = 0.05, kMax = 500;
  const K = new Array(N), R = new Array(N), Q = new Array(N); // shape, ratio, unit median-quantile
  for (let i = 0; i < N; i++) {
    const k = kMin * Math.pow(kMax / kMin, i / (N - 1)); // log-spaced shape grid
    const qm = qgamma(pMed, k);
    K[i] = k; Q[i] = qm; R[i] = qgamma(pHi, k) / qm; // R is monotone DECREASING in k
  }
  const finish = (median, k, qm) => ({ shape: k, scale: median / qm });
  return function solve(median, p95) {
    const r = p95 / median;
    if (r >= R[0]) return finish(median, K[0], Q[0]);          // ratio off the skewed end
    if (r <= R[N - 1]) return finish(median, K[N - 1], Q[N - 1]); // ratio off the normal end
    let lo = 0, hi = N - 1;                                    // bracket r between R[lo] >= r >= R[hi]
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m] > r) lo = m; else hi = m; }
    const t = (r - R[lo]) / (R[hi] - R[lo]);
    const k = Math.exp(Math.log(K[lo]) + t * (Math.log(K[hi]) - Math.log(K[lo])));
    return finish(median, k, Q[lo] + t * (Q[hi] - Q[lo]));
  };
}

// posterior summary for the Disease Parameters view. For each stored quantity we
// report the point estimate (posterior median) with a 95% credible interval
// (2.5/97.5 type-7 quantiles of the per-draw column). ci sets the CrI width.
// samples: { median, p95, shape, scale } (stored posterior columns).
export function incubationSummary(samples, ci = 0.95) {
  const lo = (1 - ci) / 2, hi = 1 - lo;
  const row = (col) => ({
    point: quantile(col, 0.5),
    lower: quantile(col, lo),
    upper: quantile(col, hi),
  });
  return {
    ci,
    median: row(samples.median), // median incubation period (days)
    p95: row(samples.p95),       // 95th percentile of incubation period (days)
    shape: row(samples.shape),   // gamma shape
    scale: row(samples.scale),   // gamma scale
  };
}
