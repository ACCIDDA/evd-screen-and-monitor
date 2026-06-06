// cost.js — Output 3: cost of active monitoring (cost-range curve + optimal
// duration markers). Port of calc_monitoring_costs (activemonitr
// R/calc_monitoring_costs.R) plus the app's inline min_costs (server.R:48-57).
//
// NOTE the cost plot uses the MEAN of the posterior median/shape/scale
// (server.R:28-31) — distinct from Output 1, which uses the MEDIAN of the
// stored median/p95 columns. Optimal duration is server.R's argmin of maxcost
// over durs = seq(.1,10,.1), NOT get_optimal_durations.R.

import { pgamma } from "./stats.js";
import { fractionLabel, COST_MAXDEN } from "./labels.js";

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// gamma params for the cost plot = column means (server.R:29-31)
export function costGammaParams(samples) {
  return { median: mean(samples.median), shape: mean(samples.shape), scale: mean(samples.scale) };
}

// durs = seq(.1, 10, .1)  (server.R:35)
export function costDurations() {
  const d = [];
  for (let k = 1; k <= 100; k++) d.push(k / 10);
  return d;
}

// Faithful calc_monitoring_costs for one (phi, dur).  cost vectors are [lo,hi].
// Returns { mincost, maxcost }.
function durCost(phi, dur, gp, c, hazard, N) {
  const med = gp.median;
  const theta = 1 - Math.pow(1 - hazard, dur);
  const c1 = [c.cost_m[0] * dur * med, c.cost_m[1] * dur * med];
  const c1a = [c1[0] + c.cost_fp[0], c1[1] + c.cost_fp[1]];
  const c2 = [c1[0] + c.cost_trt[0], c1[1] + c.cost_trt[1]];
  const c3 = [c1[0] + c2[0] + c.cost_exp[0], c1[1] + c2[1] + c.cost_exp[1]];
  const cols = [c1, c1a, c2, c3];
  const ipProb = pgamma(dur * med, gp.shape, gp.scale); // lower tail
  const pi = [(1 - phi) * (1 - theta), (1 - phi) * theta, phi * ipProb, phi * (1 - ipProb)];
  const bound = (b) => N * cols.reduce((s, col, k) => s + col[b] * pi[k], 0);
  return { mincost: bound(0), maxcost: bound(1) };
}

// Assemble the raw cost components [lo,hi] from the UI-facing parameters
// (server.R:10-14). costPerCase in $millions, costFalsePos in $thousands.
function costComponents(p) {
  return {
    cost_m: p.costPerDay.slice(),                                  // $/person-day
    cost_trt: p.costPerCase.map((x) => x * 1e6),                   // $ per caught case
    cost_exp: [0, p.secondaryCases * p.costPerCase[1] * 1e6],      // $ per missed case
    cost_fp: p.costFalsePos.map((x) => x * 1000),                  // $ per false positive
  };
}

// Full cost output for a set of φ values.
//   samples : { median, shape, scale } posterior columns
//   phis    : number[]
//   params  : { costPerDay:[lo,hi], costPerCase:[lo,hi], secondaryCases,
//               costFalsePos:[lo,hi], hazardDenom }
// returns { gammaParams, series:[{phi,label,xs,lo,hi}], optima:[{phi,label,minCost,durMultiple,durDays}] }
export function computeCosts({ samples, phis, params }) {
  const gp = costGammaParams(samples);
  const c = costComponents(params);
  const hazard = 1 / params.hazardDenom, N = 100;
  const durs = costDurations();

  const series = phis.map((phi) => {
    const xs = [], lo = [], hi = [];
    let best = { maxcost: Infinity, dur: null };
    for (const dur of durs) {
      const { mincost, maxcost } = durCost(phi, dur, gp, c, hazard, N);
      xs.push(dur * gp.median);
      lo.push(mincost);
      hi.push(maxcost);
      if (maxcost < best.maxcost) best = { maxcost, dur };
    }
    return { phi, label: fractionLabel(phi, COST_MAXDEN), xs, lo, hi, best };
  });

  const optima = series.map((s) => ({
    phi: s.phi,
    label: s.label,
    minCost: s.best.maxcost,
    durMultiple: s.best.dur,
    durDays: s.best.dur * gp.median,
  }));

  return { gammaParams: gp, series: series.map(({ best, ...rest }) => rest), optima };
}
