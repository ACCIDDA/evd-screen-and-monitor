# METHODS — formulas, sources, and the verification contract

Every quantity below is reproduced faithfully from `activemonitr` unless a **deviation** is noted.
Time origin is **exposure = day 0** throughout: `u` = days exposure→monitoring start, `d` = monitoring
duration (window ends at `u+d`), `T` = incubation period (onset time) ~ posterior.

## Data provenance

- **Posterior:** `src/data/ebola_posterior_small.json` is the published `pstr_gamma_params_ebola_small`
  object shipped **verbatim** — the seeded artifact from `make-app-data.R`
  (`set.seed(20200205); slice_sample(n=5000)`), 5000 rows × `{shape, scale, idx, median, p95}`.
  The full 3M-draw MCMC chain is never used (the app never loads it).
- **KDE region:** `src/data/ebola_kde_polygon.json` holds polygon vertices from running
  `grDevices::contourLines` on `kde_ebola$contour_df` (151×151 grid) at `kde_ebola$contour_level`.
  This is precomputed R-side so the browser only draws paths.
- Each data file carries `scienceVersion`, `citation`, `exportDate`, and a `sha256` asserted in CI.

## Output 1 — incubation-period estimate (`src/core/incubation.js`)

Point estimate = `median(stored median column)`, `median(stored p95 column)` over the posterior —
matching `plot_modified_credible_regions` (`activemonitr/R/plot_risk.R:193`). The per-draw `median`/`p95`
are read from the stored columns; **not** recomputed via `qgamma`. The credible region is the KDE
polygon above.

## Output 2 — undetected infections (`src/core/risk.js`)

`prob_of_missing_case`: `p = φ · S(d+u)` where `S(t) = pgamma(t, shape, scale, lower.tail=FALSE)`
(`activemonitr/R/prob_of_missing_case.R:21`). Per `(d, φ)` we take **type-7** quantiles
`(ltp, p50, utp)` at `((1-ci)/2, 0.5, 1-(1-ci)/2)` over the posterior sample
(`R/plot_risk.R:106-110`). Dynamic y-axis: `p_min = max(10^floor(log10 min p50), 1e-6)`,
`p_max = 10^ceil(log10 max p50)`, decade breaks labelled `1/n` with thousands separators
(`server.R:142-155`). Table = `round(1e4 · {ltp, p50, utp}, 2)` for every duration row
(`server.R:198-200`).

> **Deviation (determinism):** the original `plot_risk_uncertainty` does `slice_sample(n=1000)` of the
> 5000 rows with R's RNG on **every render**, so it is non-reproducible. Here the core uses the **full
> 5000 rows deterministically**. The oracle feeds R the same 5000 rows with `slice_sample` bypassed, so
> R and JS compute over identical data. Parity with the *deployed* app's risk plot is therefore
> **distributional, not exact**.

## Output 3 — cost of active monitoring (`src/core/cost.js`)

`calc_monitoring_costs` four-outcome expectation (`activemonitr/R/calc_monitoring_costs.R`), with
`[lower, upper]` cost bounds. **Optimal duration** mirrors the app's inline `min_costs`
(`server.R:50-57`): `durs = seq(.1, 10, .1)`, user-set `per_day_hazard`, slider cost matrix, optimum =
`dur[which.min(maxcost)]`. This is **not** `get_optimal_durations.R` (different durations/hazard/costs);
that file only sources default slider values. x-axis = `dur · median`; the visible `xlim = c(5, 43)` is
a per-disease render parameter, not a constant.

## φ labels (`src/core/labels.js`)

φ is labelled via a port of `MASS::fractions` (continued-fraction rational approximation with a
`max.denominator`), matching `server.R:47,57,144` — **not** `1/round(1/φ)`. Includes the hardcoded
`phi == 1/500` label for `2e-3` (`R/plot_risk.R:114-117`).

## Verification tolerances

Relative with an absolute floor (risks span 1e-2…1e-7 on log axes):

| Path | Relative | Absolute floor |
|---|---|---|
| Closed-form (cost, survival, point estimates) | 1e-9 | 1e-12 |
| Posterior-integrated (risk quantiles) | 1e-5 | 1e-10 |

Determinism: fixtures embed their own `u` vector and posterior sub-matrix (never regenerated);
quantile type 7 pinned on both sides; all generators seeded; R 4.6 + `activeMonitr` commit + `MASS`
version pinned and checksummed in CI.

## Known limitations

- **Gamma only.** The COVID `lnorm` path (and its higher-precision `erf`) is stripped in Phase 1; the
  ~1e-7 Abramowitz-Stegun `erf` in the prototype would not meet the 1e-9 tolerance and is deferred.
- **License:** upstream `activeMonitr` DESCRIPTION says GPL-3 but its `LICENSE` file is GPL-2 text;
  governance to be confirmed.
