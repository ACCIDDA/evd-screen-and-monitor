# STATUS — evd-screen-and-monitor (Phase 1)

_Last updated: 2026-06-06._

## Snapshot

Core + verification + dashboard are **built and green**. Only CI/deploy remains in Phase 1.

| # | Task | State |
|---|---|---|
| 1 | Scaffold repo (Vite + Vitest, GPL-3, dirs) | ✅ done |
| 2 | R exports: posterior (verbatim 5000-row `_small`) + KDE polygon | ✅ done — deterministic, checksummed |
| 3 | `stats.js` (gamma-only) + `labels.js` (`MASS::fractions` port) | ✅ done — labels match R exactly |
| 4 | `incubation.js`, `risk.js`, `cost.js` | ✅ done — match R to machine precision |
| 5 | R oracle: `gen_fixtures.R` + `diff_harness.R` | ✅ done |
| 6 | Vitest suite vs fixtures | ✅ **12/12 passing** |
| 7 | Dashboard UI (3 tabs, Plotly) | ✅ builds + serves; **pending user visual confirmation** |
| 8 | CI workflow + GitHub Pages deploy | ⏳ **next** |

## Verification evidence

- `npm test` → **12/12 fixtures pass** (incubation, labels×2, cost×4, risk×5 incl. edges:
  φ→0, single draw, large u, ci=50%).
- `Rscript R/oracle/diff_harness.R 200` → **200 random jobs, 0 divergences**, worst rel 7.5e-9.
- Known-case parity (JS core vs real R, exact):
  - Incubation point: median **8.873 d**, p95 **20.247 d**
  - Cost (Ebola, φ=1/1000, default sliders): optimal **30.19 d** at **$580,031**
  - Risk (Ebola, φ=1/100, d=14): per-10,000 table **{0.53, 3.73, 16.32}**

## Immediate next steps

1. **User confirms** the 3 tabs render correctly (`npm run dev`).
2. **Task 8 — CI + deploy:**
   - `.github/workflows/ci.yml`: run `npm test` on every push (no R needed); on a nightly schedule
     or when the pinned `activeMonitr` version bumps, also run `gen_fixtures.R` drift-check +
     `diff_harness.R` + assert `src/data/*.json` sha256.
   - GitHub Pages from `vite build` (`dist/`). **No GitHub remote exists yet — get user go-ahead
     before creating a remote / pushing.**
3. **Initial commit** is local-only so far (no remote).

## Open confirmations (flagged, not blockers)

- Risk-plot determinism deviation (full 5000 rows vs the app's seeded 1000-row resample) — confirm acceptable.
- License governance: upstream GPL-2 `LICENSE` file vs GPL-3 `DESCRIPTION`.
- Distributional acceptance threshold for the risk plot vs the live app.

## Deferred to later phases (do NOT pull forward without checking)

Other strategies (quarantine, test-based release); onward-transmission risk metric; resource/staffing
model; scenario builder (N importations across CDC risk tiers); COVID `lnorm` path (+ `erf` upgrade)
and MERS/Smallpox; entry "screening" component. The independent review noted the current
"P(onset after window)" metric can't distinguish quarantine from active monitoring — revisit the
**risk metric definition** when adding strategies (it changes the core interface).
