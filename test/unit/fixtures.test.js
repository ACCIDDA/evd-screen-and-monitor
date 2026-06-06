// Asserts the JS core against the golden fixtures emitted by R/oracle/gen_fixtures.R.
// No R needed at test time. Tolerances come from each fixture (rel + abs floor).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { incubationPoint } from "../../src/core/incubation.js";
import { computeCosts } from "../../src/core/cost.js";
import { computeRisk, riskTable, riskAxis } from "../../src/core/risk.js";
import { fractionLabel } from "../../src/core/labels.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const FIX = join(ROOT, "test", "fixtures");

const posterior = JSON.parse(
  readFileSync(join(ROOT, "src/data/ebola_posterior_small.json"), "utf8")
);
const POST = posterior.data.columns;
const POST_SHA = posterior.meta.sha256;

const load = (f) => JSON.parse(readFileSync(join(FIX, f), "utf8"));
const fixtures = readdirSync(FIX).filter((f) => f.endsWith(".json"));

// rel-with-absolute-floor closeness
function close(a, e, tol) {
  return Math.abs(a - e) <= tol.abs + tol.rel * Math.abs(e);
}
function expectArr(actual, expected, tol, label) {
  expect(actual.length, `${label} length`).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (!close(actual[i], expected[i], tol)) {
      throw new Error(`${label}[${i}]: got ${actual[i]} expected ${expected[i]} (tol rel ${tol.rel} abs ${tol.abs})`);
    }
  }
}

// Resolve the posterior sub-matrix a fixture uses: inline samples, or the shipped file.
function samplesFor(fx) {
  if (fx.inputs.samples) return fx.inputs.samples;
  expect(fx.posteriorSha256, "fixture pins shipped posterior").toBe(POST_SHA);
  return POST;
}

describe("golden fixtures", () => {
  for (const file of fixtures) {
    const fx = load(file);
    it(`${fx.output}: ${file}`, () => {
      if (fx.output === "labels") {
        const got = fx.inputs.values.map((v) => fractionLabel(v, fx.inputs.maxDenominator));
        expect(got).toEqual(fx.expected.labels);

      } else if (fx.output === "incubation") {
        const pt = incubationPoint(samplesFor(fx));
        expect(close(pt.median, fx.expected.median, fx.tol)).toBe(true);
        expect(close(pt.p95, fx.expected.p95, fx.tol)).toBe(true);

      } else if (fx.output === "cost") {
        const out = computeCosts({ samples: samplesFor(fx), phis: fx.inputs.phis, params: fx.inputs.params });
        expect(out.series.length).toBe(fx.expected.series.length);
        fx.expected.series.forEach((es, k) => {
          const s = out.series[k];
          expect(s.phi).toBe(es.phi);
          expectArr(s.xs, es.xs, fx.tol, `${file} xs`);
          expectArr(s.lo, es.mincost, fx.tol, `${file} mincost`);
          expectArr(s.hi, es.maxcost, fx.tol, `${file} maxcost`);
          const o = out.optima[k];
          expect(close(o.durMultiple, es.optimum.durMultiple, fx.tol), `${file} opt durMultiple`).toBe(true);
          expect(close(o.durDays, es.optimum.durDays, fx.tol), `${file} opt durDays`).toBe(true);
          expect(close(o.minCost, es.optimum.minCost, fx.tol), `${file} opt minCost`).toBe(true);
        });

      } else if (fx.output === "risk") {
        const s = samplesFor(fx);
        const res = computeRisk({ samples: s, u: fx.inputs.u, durations: fx.inputs.durations, phi: fx.inputs.phi, ci: fx.inputs.ci });
        // rows
        expectArr(res.rows.map((r) => r.ltp), fx.expected.rows.map((r) => r.ltp), fx.tol, `${file} ltp`);
        expectArr(res.rows.map((r) => r.p50), fx.expected.rows.map((r) => r.p50), fx.tol, `${file} p50`);
        expectArr(res.rows.map((r) => r.utp), fx.expected.rows.map((r) => r.utp), fx.tol, `${file} utp`);
        expect(res.label).toBe(fx.expected.label);
        // table (rounded to 2 dp)
        const tbl = riskTable(res);
        const TBL_TOL = { rel: 0, abs: 1e-9 };
        fx.expected.table.forEach((er, i) => {
          expect(tbl[i]["Duration, in days"]).toBe(er["Duration, in days"]);
          for (const col of ["Lower bound", "Median", "Upper bound"]) {
            expect(close(tbl[i][col], er[col], TBL_TOL), `${file} table ${col}[${i}] got ${tbl[i][col]} exp ${er[col]}`).toBe(true);
          }
        });
        // dynamic axis (only present when all p50 > 0)
        if (fx.expected.axis) {
          const ax = riskAxis(res);
          expect(close(ax.pMin, fx.expected.axis.pMin, fx.tol)).toBe(true);
          expect(close(ax.pMax, fx.expected.axis.pMax, fx.tol)).toBe(true);
          expectArr(ax.breaks, fx.expected.axis.breaks, fx.tol, `${file} breaks`);
          expect(ax.labels).toEqual(fx.expected.axis.labels);
        }
      } else {
        throw new Error(`unknown output ${fx.output}`);
      }
    });
  }
});
