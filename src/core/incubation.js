// incubation.js — Output 1: incubation-period estimate.
// The plotted point is the MEDIAN of the stored per-draw `median` and `p95`
// columns (activemonitr R/plot_risk.R:193, plot_modified_credible_regions).
// We read the stored columns directly — never recompute via qgamma.
// The credible region itself is the precomputed KDE polygon (data file).

import { quantile } from "./stats.js";

// samples: { median: number[], p95: number[] }  (the stored posterior columns)
// returns the plotted point { median, p95 } in days.
export function incubationPoint(samples) {
  return {
    median: quantile(samples.median, 0.5), // R median() == type-7 quantile @ .5
    p95: quantile(samples.p95, 0.5),
  };
}
