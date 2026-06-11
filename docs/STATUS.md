# STATUS — evd-screen-and-monitor

_Last updated: 2026-06-10._

## Snapshot

**v0.1.0 is live and public** → **https://accidda.github.io/evd-screen-and-monitor/**

A simplified **traveler-profiles active-monitoring** tool. The validated, R-checked core
underneath is unchanged (12/12 fixtures green). The earlier full multi-tab dashboard is
**archived** (branch `archive/full-tabs`, tag `v0.2-full-tabs`) to bring back later.

## Live app (v0.1.0)

Two tabs:
- **Results** — an active-monitoring-length timeline (drag the bar's end) + result cards:
  undetected symptomatic infections per 10,000 monitored, one card per traveler profile
  (bold median with the 95% credible interval).
- **Traveler profiles** — editor (name, exposure window via a two-anchor slider + number
  boxes with 0 = arrival on the right, infection risk φ) that feeds the Results cards.

Plotly removed (card/table UI) → bundle ~180 KB. Look & feel adapted from the IDCUP26
screening dashboard (ACCIDDA × Insight Net × epiEngage palette + logos).

**Faithfulness:** each profile figure is the validated metric (`undetectedForProfile`),
locked byte-identical to a direct `computeRisk`/`riskTable` call in
`test/unit/scenario.test.js`; DOM render smoke test in `test/unit/app-render.test.js`.
**18/18 tests green.**

## Task 8 — CI + deploy: ✅ DONE

- `.github/workflows/ci.yml` — `npm test` + build on every push/PR.
- `.github/workflows/pages.yml` — builds and deploys `dist/` to GitHub Pages on every push
  to `main` (auto-deploy) / manual dispatch.
- `vite.config.js` — `base: /evd-screen-and-monitor/` on build (root on dev).
- Repo is **public**; Pages source = GitHub Actions; site verified HTTP 200.
- ⏳ (optional, deferred) R drift layer in CI: nightly `gen_fixtures.R` drift-check +
  `diff_harness.R` + assert `src/data/*.json` sha256.

## Verified core (Phase 1 — unchanged)

- `npm test` core fixtures: **12/12** (incubation, labels×2, cost×4, risk×5 incl. edges:
  φ→0, single draw, large u, ci=50%).
- `Rscript R/oracle/diff_harness.R 200` → 200 jobs, 0 divergences, worst rel 7.5e-9.
- Known-case parity: incubation median **8.873 d** / p95 **20.247 d**; risk (φ=1/100, d=14)
  per-10,000 **{0.53, 3.73, 16.32}**.

## Open / flagged

- License: published GPL-3 (repo now public). Upstream GPL-2 `LICENSE` text vs GPL-3
  `DESCRIPTION` mismatch noted — confirm governance.
- Determinism deviation (full 5000 rows vs the original app's seeded 1000-row resample) —
  accepted.

## Archived full dashboard + still-deferred work

The full multi-tab dashboard (intervention timeline; disease-parameters & test-characteristics
placeholders; two-way-linked active-monitoring + cost; onward-transmission reduction; test-out)
lives at **`archive/full-tabs` / `v0.2-full-tabs`** — restore from there when reintroducing tabs.
Still-deferred science (do NOT pull forward without checking): onward-transmission risk metric;
the test-based-release/quarantine distinction (the "P(onset after window)" metric can't tell them
apart — revisit the metric when adding strategies); resource/staffing model; multi-importation
scenario builder; other pathogens (COVID `lnorm` + `erf`, MERS/Smallpox); entry screening.
