# evd-screen-and-monitor — Phase 1 Spec

## Context

We want a JavaScript implementation of the Ebola screening-and-monitoring science currently in the
`activemonitr` R package / Shiny app, in a new standalone repo **`evd-screen-and-monitor`**
(`~/Development/evd-screen-and-monitor`). Rather than designing a new dashboard up front, **Phase 1
is a faithful parallel JS reimplementation of all the Ebola-related features and current outputs**,
backed by a comprehensive R verification suite. Once that proven core exists, new capability
(other strategies, transmission modeling, resource/staffing, scenario builder, other pathogens)
builds on top of it — out of scope here.

Head start in `activemonitr/inst/prototype-js/`: `stats.js` reproduces R's `pgamma`/`quantile`
(matched to ~5e-14 / 1e-9 against R for the gamma path), and faithful ports of the cost and risk
computations. Phase 1 productizes that into the new repo, **adds the missing incubation-estimate
output**, fixes the faithfulness gaps below, and wraps everything in a layered R oracle.

> **Revised twice after independent review.** This version corrects concrete faithfulness bugs in the
> prior draft — see the inline ⚠ notes (posterior provenance, runtime resampling determinism, the
> incubation point-estimate, KDE contour rendering, and which "optimal duration" the app actually uses).

### Scope — the current Ebola outputs to reproduce (from `inst/shiny/active-monitoring/server.R`)
| # | Current output | R source | Notes |
|---|---|---|---|
| 1 | **Incubation-period estimate**: Ebola median & 95th-pct **point** + KDE credible-region polygon | `plot_modified_credible_regions` + `kde_ebola` | point = `median()` of stored `median`/`p95` cols (⚠C3) |
| 2 | **Undetected infections**: risk-vs-duration plot + per-10,000 **table** | `plot_risk_uncertainty` / `prob_of_missing_case` | dynamic log axis + `MASS::fractions` labels (⚠S1/S2) |
| 3 | **Cost of active monitoring**: cost-range plot + optimal-duration markers | `calc_monitoring_costs` + **server.R inline `min_costs`** | NOT `get_optimal_durations.R` (⚠C5) |

**Phase 1 is gamma/Ebola-only.** The COVID `lnorm` branch and MERS/Smallpox are deferred; the dormant
`plnorm` path is stripped from the Phase-1 core (re-added later with an `erf` upgrade — see N2). Engine
is disease-generic in shape, but only Ebola is wired + verified.

---

## Architecture

Pure-function **model core** (no DOM) + thin **UI** reproducing current outputs + **R oracle**.

```
evd-screen-and-monitor/
  package.json   LICENSE(GPL-3)   README.md   METHODS.md
  src/
    core/                       # PURE, R-validated
      stats.js                  # pgamma + quantileSorted(type7)  (from prototype; lnorm stripped for now)
      labels.js                 # MASS::fractions continued-fraction port (⚠S1) + 1/500 special case
      incubation.js             # point estimate = median(median), median(p95) over stored cols (⚠C3)
      risk.js                   # prob_of_missing_case (φ·S(d+u)) + type-7 quantiles + dynamic axis (⚠S2)
      cost.js                   # calc_monitoring_costs 4-outcome + server.R inline optimal duration (⚠C5)
    data/
      ebola_posterior_small.json # the CANONICAL 5000-row _small object, verbatim (⚠C1) — cols shape,scale,median,p95
      ebola_kde_polygon.json     # marching-squares CONTOUR POLYGON vertices, precomputed in R (⚠C4)
      defaults.json              # default sliders (from get_optimal_durations.R) + INLINE citations
                                 # every data file: scienceVersion, citation, exportDate, sha256
    ui/  index.html main.js charts.js controls.js
  test/ fixtures/*.json  unit/*.test.js
  R/oracle/ gen_fixtures.R  diff_harness.R
  scripts/ export_posterior.R  export_kde_polygon.R
  .github/workflows/ci.yml
```

**Tooling:** Vite (static → GitHub Pages), Vitest. Charts: keep the prototype's lib for parity first.
Node 26 (pinned) + R 4.6 + `activeMonitr` (pin commit/version) installed.

### Core computations (faithful — exact R semantics)
- **Posterior data (⚠C1):** ship `pstr_gamma_params_ebola_small` **verbatim** — the published, seeded
  artifact (`make-app-data.R`: `set.seed(20200205); slice_sample(n=5000)`), 5000 rows × `{shape,scale,
  idx,median,p95}`. The full 3M chain and any "re-thinning to 10k" are **not** used (the app never loads
  3M). `median`/`p95` columns are shipped (output #1 reads them directly; JS never recomputes via `qgamma`).
- **incubation.js (output #1) (⚠C3):** point = `median(stored median col)`, `median(stored p95 col)` —
  matching `plot_modified_credible_regions:193`. No survival/`qgamma` here; `S(t)` is risk-only.
- **risk.js (output #2):** `p = φ·S(d+u)`, `S=pgamma(d+u,shape,scale,lower=FALSE)`; per-(d,φ) **type-7**
  quantiles `(ltp,p50,utp)`. Faithful extras the prior draft missed: dynamic y-axis
  `p_min=max(10^floor(log10 min p50),1e-6)`, `p_max=10^ceil(...)`, decade breaks + `"1/n"` `big.mark`
  labels, `ylim=(p_min,p_max)` (⚠S2). Table = `round(1e4·{ltp,p50,utp}, 2)` over **every** duration row;
  fixture stores **unrounded** quantiles as the oracle target and asserts the rounding rule separately
  (⚠S3). Capture `return_data` frame columns + order incl. `phi_lab`.
- **cost.js (output #3):** `calc_monitoring_costs` 4-outcome expectation, `[lo,hi]` bounds; **optimal
  duration mirrors `server.R:50-57` inline `min_costs`** (`durs=seq(.1,10,.1)`, user `per_day_hazard`,
  slider cost matrix, `dur[which.min(maxcost)]`) — **not** `get_optimal_durations.R`, which uses different
  durs/hazard/costs (⚠C5). x-axis = `dur*median`; visible `xlim=c(5,43)` is a **per-disease render
  param**, not a constant (⚠S5). `get_optimal_durations.R` is used only to source default slider values.
- **labels.js (⚠S1):** port `MASS::fractions` (continued-fraction rational approx with `max.denominator`)
  — the app labels φ this way (`server.R:47,57,144`), NOT `1/round(1/p)`; include the hardcoded
  `phi==1/500` case for 2e-3 (`plot_risk.R:114-117`).
- **KDE (output #1 region) (⚠C4):** the contour is **not** a data dump. Precompute the **polygon
  vertices** R-side: run `grDevices::contourLines` on `kde_ebola$contour_df` (151×151 grid) at
  `kde_ebola$contour_level` and ship the resulting paths (possibly multiple disjoint polygons). JS draws
  the paths; oracle = vertex equality. This replaces ggplot's runtime `stat_contour(geom="polygon")`.

---

## R oracle contract (layered + deterministic)

**Determinism rules (mandatory):**
1. **Resampling (⚠C2):** the app is itself nondeterministic — `plot_risk_uncertainty` does
   `slice_sample(n=1000)` of the 5000 rows **with R's RNG every render** (`plot_risk.R:100`). So "exact
   parity with a live render" is impossible. **Decision:** the Phase-1 core uses the **full 5000-row
   `_small` matrix deterministically (no resample)** for the risk quantiles — a documented, deterministic
   improvement. The oracle feeds R the **same 5000 rows with `slice_sample` bypassed** so R and JS compute
   over identical data. Parity with the *deployed app's* risk plot is therefore **distributional, not
   exact** (state this in METHODS + acceptance criteria N4).
2. The `u` vector is committed *inside each fixture*, never regenerated (R `runif` ≠ JS `Math.random`).
   The dashboard uses a fixed/committed `u` draw (or a seeded JS RNG documented as a deviation).
3. Quantile **type 7** pinned both sides; JS comparator is numeric and input pre-sorted (⚠S6).
4. `export_*.R` + `gen_fixtures.R` call `set.seed(<committed>)`; pin R 4.6 + `activeMonitr` commit +
   `MASS` version (labels depend on it). Exported JSON + the installed package carry **sha256** asserted in CI.
5. Tolerances **relative + absolute floor** (risks span 1e-2…1e-7): closed-form (cost/survival/point)
   rel 1e-9 / abs 1e-12; posterior-integrated (risk quantiles) rel 1e-5 / abs 1e-10.

**Layer 1 — Golden fixtures (every CI run, no R):** `gen_fixtures.R` calls real
`activeMonitr::prob_of_missing_case`/`calc_monitoring_costs` + stored-column summaries + the contour
export, writing `test/fixtures/<output>__<case>.json` over grids + edges (φ→0, d→0, large u, **single
posterior draw**, duplicate-p ties — ⚠S4). Vitest asserts JS core vs fixtures.

**Layer 2 — Differential fuzz (nightly / on R or core change):** `diff_harness.R` draws seeded random
inputs, **batches** them through one `node` process via JSON stdin (17-sig-digit floats), compares.

**Drift guard:** CI re-runs `gen_fixtures.R`; fails if committed fixtures change (sound — generation is
seeded + version-pinned). "On R change" = pinned `activeMonitr` commit bump.

---

## Reuse map
- **From `inst/prototype-js/`:** `stats.js` (gamma path verbatim — R-validated); `calcCosts`/`calcRisk`
  seed `cost.js`/`risk.js`; `data.json` export pattern → `export_posterior.R`. **Do not** reuse
  `app.js:10 fmtFrac` (wrong labels — ⚠S1) or the all-1000-rows risk sampling (⚠C1/C2).
- **From `activeMonitr`:** `prob_of_missing_case()`, `calc_monitoring_costs()` as oracle sources; the
  `_small` posterior + `median`/`p95` cols; `kde_ebola` → contour polygons; `get_optimal_durations.R`
  for default slider values only; cost ranges + `per_day_hazard` defaults, each cited inline.

## Licensing
New repo **GPL-3** (derivative of GPL'd code AND redistributed `.rda` data; attribute Reich et al. 2018).
Resolve the upstream discrepancy first — DESCRIPTION says GPL-3, `LICENSE` file is GPL-2 text.

---

## Phased roadmap (Phase 1 only)
1. **Scaffold + bridge:** repo, Vite/Vitest, GPL-3 LICENSE, METHODS skeleton; seeded
   `export_posterior.R` (verbatim `_small`) + `export_kde_polygon.R`; port `stats.js` (gamma-only) +
   `labels.js`; first survival/label fixtures green.
2. **Port + verify the 3 outputs:** `incubation.js`, `risk.js` (incl. dynamic axis + table rounding +
   return_data shape), `cost.js` (server.R-inline optimal dur); `gen_fixtures.R` covering all three +
   edges; vitest green within tolerance; `diff_harness.R` zero divergences.
3. **UI parity:** reproduce the 3 outputs (KDE polygon region, risk plot+table, cost markers) + static
   Overview/Model copy. Acceptance per N4 (numeric parity on deterministic outputs; distributional on risk).
4. **CI + deploy:** GH Actions (JS tests every push; differential + drift + sha256 nightly/on `activeMonitr`
   bump), GitHub Pages, README/METHODS finalized.

### Explicitly deferred (build on this core)
Quarantine / test-based release; onward-transmission metric; resource/staffing; scenario builder;
COVID `lnorm` + `erf` upgrade + MERS/Smallpox; entry "screening" component.

---

## Verification
- `npm test` — Vitest vs committed fixtures (no R). Primary gate.
- `Rscript R/oracle/gen_fixtures.R` then `git diff` clean (drift guard) — needs R + pinned `activeMonitr`.
- `Rscript R/oracle/diff_harness.R` — seeded random R↔JS fuzz; zero divergences > tol.
- **Acceptance / parity (N4):** numeric parity (≤tol) on deterministic outputs — cost curve + optimal
  markers, incubation point + contour vertices; **distributional** parity on the risk plot (e.g. p50
  within X% across N seeds) since the live app reseeds. Define X before sign-off.
- `npm run build` + sha256 assert on data files; smoke-test, then Pages.

## Open confirmations (not code blockers)
- Risk-plot deterministic-full-5000 vs seeded-1000 deviation (rule 1) — confirm acceptable.
- License governance (GPL-2 file vs GPL-3 DESCRIPTION).
- Distributional acceptance threshold X for the risk plot.
