# evd-screen-and-monitor

A static, client-side JavaScript reimplementation of the **Ebola** screening-and-monitoring
science in the [`activemonitr`](https://github.com/reichlab/activemonitr) R package
(Reich et al. 2018, *Sci Rep* 8:1093, doi:10.1038/s41598-018-19406-x), with a **layered R
correctness oracle** so the JS provably reproduces the R math.

## Phase 1 (current)

A faithful parallel port of the three computational Ebola outputs of the original Shiny app:

1. **Incubation-period estimate** — median & 95th-percentile point + KDE credible-region polygon.
2. **Undetected infections** — risk-vs-duration plot + per-10,000 table.
3. **Cost of active monitoring** — cost-range plot + cost-optimal duration markers.

Gamma/Ebola only. New capability (other intervention strategies, onward-transmission metrics,
resource/staffing, scenario builder, other pathogens, entry screening) is **deferred** and will
build on this verified core.

## Verification

The JS model core (`src/core/`) is pure (no DOM) and verified two ways:

- **Golden fixtures** (`test/fixtures/`, asserted by `npm test`) — generated from the real
  `activeMonitr` R functions; CI needs no R.
- **Differential fuzz harness** (`R/oracle/diff_harness.R`) — runs R and JS on seeded random
  inputs and compares (nightly / on `activeMonitr` bump).

See [METHODS.md](./METHODS.md) for every formula, its R source, provenance, and the tolerance contract.

## Develop

```bash
npm install
npm test          # vitest vs committed fixtures (no R required)
npm run dev       # local dashboard
npm run build     # static build -> dist/
```

Regenerating fixtures/data (requires R 4.6 + the pinned `activeMonitr`):

```bash
Rscript scripts/export_posterior.R
Rscript scripts/export_kde_polygon.R
Rscript R/oracle/gen_fixtures.R
Rscript R/oracle/diff_harness.R
```

## License

GPL-3.0-or-later — a derivative of the GPL-licensed `activeMonitr` code and data.
Attribution: Reich NG, Lessler J, Varma JK, Vora NM (2018).
