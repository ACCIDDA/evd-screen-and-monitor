// cli.js — batch JSON-in/JSON-out bridge for the differential harness.
// Reads one JSON array of jobs from stdin, computes each via the pure core,
// writes a JSON array of results to stdout. Full-precision floats (JSON
// preserves doubles). One process handles the whole batch.
//
//   echo '[{"id":0,"output":"risk","inputs":{...},"samples":{...}}]' | node src/core/cli.js

import { incubationPoint } from "./incubation.js";
import { computeCosts } from "./cost.js";
import { computeRisk } from "./risk.js";

function run(job) {
  const { output, inputs, samples } = job;
  if (output === "incubation") {
    return incubationPoint(samples);
  }
  if (output === "cost") {
    const out = computeCosts({ samples, phis: inputs.phis, params: inputs.params });
    return {
      series: out.series.map((s) => ({ lo: s.lo, hi: s.hi, xs: s.xs })),
      optima: out.optima.map((o) => ({ durMultiple: o.durMultiple, durDays: o.durDays, minCost: o.minCost })),
    };
  }
  if (output === "risk") {
    const res = computeRisk({ samples, u: inputs.u, durations: inputs.durations, phi: inputs.phi, ci: inputs.ci });
    return { rows: res.rows };
  }
  throw new Error(`unknown output ${output}`);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  const jobs = JSON.parse(buf);
  const out = jobs.map((j) => ({ id: j.id, result: run(j) }));
  process.stdout.write(JSON.stringify(out));
});
