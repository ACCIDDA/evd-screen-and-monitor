# CLAUDE.md — context for resuming work on evd-screen-and-monitor

> Read this first. It plus `docs/STATUS.md` (current state + next steps) and
> `docs/PHASE1_SPEC.md` (the approved plan) are everything needed to continue.

## What this project is

A static, client-side **JavaScript reimplementation of the Ebola screening-and-monitoring
science** from the `activemonitr` R package / Shiny app, with a **layered R correctness oracle**
so the JS provably reproduces the R math. New repo, GPL-3.

**Long-term goal:** an Ebola *importation planning dashboard* for state/local epidemiologists that
compares intervention strategies (active monitoring, quarantine/movement restriction, test-based
release) on **risk, cost, and staffing/resources**, with scenario building.

**Strategy (the user's, important):** build incrementally on a *proven* core. **Phase 1** (current)
is only a faithful parallel port of the **3 existing Ebola outputs** + verification. Everything else
is deliberately deferred — do not pull deferred work forward without checking. See "User working
preferences" below.

## Where the source science lives

The R package being reimplemented is a **sibling repo**: `~/Development/activemonitr`
(branch `jl-reimplement`). Key files:
- `R/calc_monitoring_costs.R`, `R/prob_of_missing_case.R`, `R/plot_risk.R`
  (`plot_risk_uncertainty`, `plot_modified_credible_regions`)
- `inst/shiny/active-monitoring/server.R` + `ui.R` (the outputs we reproduce)
- `inst/analysis-code/get_optimal_durations.R`, `make-app-data.R`, `inc-per-mcmc.R`
- A validated JS↔R bridge prototype: `~/Development/activemonitr/inst/prototype-js/`
  (`stats.js` matched R `pgamma` to ~5e-14). Our `src/core/stats.js` is the gamma-only descendant.

`activeMonitr` R package is installed locally (v0.0.3) and is the oracle's source of truth.

## The 3 Phase-1 outputs (and the subtle faithfulness points)

1. **Incubation estimate** — point = `median()` of the **stored** `median`/`p95` columns
   (NOT recomputed via qgamma) + KDE credible-region polygon (precomputed R-side, drawn in JS).
2. **Undetected infections** — `p = φ·S(d+u)`, type-7 quantiles, dynamic log axis (1e-6 floor),
   per-10,000 table `round(1e4·x, 2)`.
3. **Cost** — `calc_monitoring_costs` 4-outcome; optimal duration mirrors **server.R inline
   `min_costs`** (NOT `get_optimal_durations.R`); cost plot uses **mean** posterior params while
   output 1 uses the **median** of stored columns.

φ labels use a port of `MASS::fractions` (continued fraction), not `1/round(1/φ)`.
Full formula-by-formula provenance + tolerances are in `METHODS.md`.

## Architecture

```
src/core/    pure, DOM-free, R-validated: stats, labels, incubation, risk, cost, rng, cli
src/data/    ebola_posterior_small.json (verbatim 5000-row _small), ebola_kde_polygon.json
             — each has meta.sha256 over its payload; deterministic exports
src/ui/      Plotly dashboard (3 tabs)  +  index.html at repo root (Vite)
test/        fixtures/ (golden JSON from R) + unit/ (vitest asserts core vs fixtures)
R/oracle/    gen_fixtures.R (golden vectors), diff_harness.R (random fuzz, R↔JS via src/core/cli.js)
scripts/     export_posterior.R, export_kde_polygon.R  (+ _util.R)
docs/        PHASE1_SPEC.md (approved plan), STATUS.md (live state + next steps)
```

## Commands

```bash
npm test                              # vitest vs committed fixtures — no R needed (PRIMARY gate)
npm run dev                           # dashboard at localhost (Vite)
npm run build                         # static build -> dist/
Rscript scripts/export_posterior.R    # re-export posterior  (needs R + activeMonitr)
Rscript scripts/export_kde_polygon.R  # re-export KDE polygon
Rscript R/oracle/gen_fixtures.R       # regenerate golden fixtures (seeded; git diff must be clean)
Rscript R/oracle/diff_harness.R 200   # differential R↔JS fuzz (needs R + node)
```

## Determinism / oracle contract (don't break these)

- Fixtures embed their own `u` + sub-matrix, or pin the shipped posterior by `sha256`. Never
  regenerate `u` on one side (R `runif` ≠ JS `Math.random`).
- Quantile **type 7** on both sides. All R generators are **seeded**; re-running must leave
  `git diff` clean (drift guard).
- Tolerances: closed-form rel 1e-9 / abs 1e-12; posterior-integrated rel 1e-5 / abs 1e-10.
- **Determinism deviation:** the app does `slice_sample(n=1000)` per render (RNG). We use the full
  5000 rows deterministically; the dashboard's `u` is a seeded base sample affine-mapped to the
  slider range. So parity with the *live app's* risk plot is distributional, not exact.

## Gotchas

- **Vite/terminal:** running `vite build`/`vite` through the Bash tool can surface a spurious
  `undefined is not an object (evaluating 'H.replace')` — that's the *terminal harness* choking on
  Vite's progress spinner, NOT a build error. Redirect to a log and read the file; build exits 0.
- **License:** upstream `activeMonitr` DESCRIPTION says GPL-3 but its `LICENSE` file is GPL-2 text —
  unresolved; we license GPL-3. Confirm governance before publishing.
- **Bundle is ~5 MB** (Plotly). Phase-1 keeps it for visual parity; a uPlot swap (~50 KB) is a
  noted future option.

## User working preferences (carry these forward)

- **Prove the core first; build incrementally.** Start narrow (faithful reimplementation +
  verification), defer new features, "build from there." The user pushed back twice on plans that
  tried to do too much at once.
- **Review non-trivial plans with an independent agent** before executing — the user asked for this
  twice and each adversarial review caught real issues.

## Status & next steps

See `docs/STATUS.md`. Short version: core + both oracle layers + dashboard are **done and green**
(12/12 fixtures, 200-job fuzz 0 divergences). Remaining: **task 8 — CI workflow + GitHub Pages
deploy** (no GitHub remote exists yet; do not push without the user's go-ahead). Then later phases
per the spec's "deferred" list.
