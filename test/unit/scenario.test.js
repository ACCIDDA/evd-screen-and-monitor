// scenario.test.js — locks the timeline ↔ Undetected-infections link to the validated core.
// The number shown on the timeline must equal the Undetected tab's max-duration row.

import { describe, it, expect } from "vitest";
import { scenario, undetectedAt, uBounds, amDuration, clampScenario, MIN_EXP_W } from "../../src/ui/scenario.js";
import { computeRisk, riskTable } from "../../src/core/risk.js";
import { scaleU } from "../../src/core/rng.js";
import { POST, BASE_U } from "../../src/ui/data.js";

const setScenario = (o) => Object.assign(scenario, o);

describe("timeline ↔ undetected-infections link", () => {
  it("anchored at arrival: duration == end day, with the right u bounds", () => {
    // active monitoring starts at arrival (am.start = 0), so duration = am.end (the end day)
    setScenario({ exp: { start: -10, end: -2 }, am: { on: true, start: 0, end: 28 } });
    expect(amDuration()).toBe(28);                  // duration == end day (no arrival gap)
    expect(uBounds()).toEqual({ uLo: 2, uHi: 10 }); // -exp.end ; -exp.start
  });

  it("timeline number == the Undetected tab's max-duration row (byte-identical)", () => {
    setScenario({ exp: { start: -10, end: -2 }, am: { on: true, start: 0, end: 16 }, expRisk: 0.01, ci: 0.95 });
    const { uLo, uHi } = uBounds();
    const dHi = amDuration();
    const durations = [];
    for (let d = 0; d <= dHi; d++) durations.push(d);
    const tab = riskTable(computeRisk({ samples: POST, u: scaleU(BASE_U, uLo, uHi), durations, phi: 0.01, ci: 0.95 }));
    const tabMax = tab[tab.length - 1];
    const tl = undetectedAt(dHi);
    expect(tabMax["Duration, in days"]).toBe(16);
    expect(tl["Median"]).toBe(tabMax["Median"]);
    expect(tl["Lower bound"]).toBe(tabMax["Lower bound"]);
    expect(tl["Upper bound"]).toBe(tabMax["Upper bound"]);
  });

  it("is start-invariant: the figure depends only on the window close (am.end)", () => {
    setScenario({ exp: { start: -10, end: -2 }, expRisk: 0.01, ci: 0.95, am: { on: true, start: 2, end: 16 } });
    const a = undetectedAt(amDuration());
    setScenario({ am: { on: true, start: 5, end: 16 } }); // same end, later start
    const b = undetectedAt(amDuration());
    expect(b["Median"]).toBe(a["Median"]);
    expect(b["Lower bound"]).toBe(a["Lower bound"]);
    expect(b["Upper bound"]).toBe(a["Upper bound"]);
  });

  it("enforces a minimum exposure-window width (keeps the pre-arrival label off arrival)", () => {
    setScenario({ exp: { start: -2, end: -1 } }); // 1 day — too short
    clampScenario();
    expect(scenario.exp.end - scenario.exp.start).toBeGreaterThanOrEqual(MIN_EXP_W);
    expect(scenario.exp.end).toBe(-1); // end preserved; start pushed back
  });

  it("onward-transmission reduction is parameter-only (does NOT change the detection figure)", () => {
    setScenario({ exp: { start: -10, end: -2 }, am: { on: true, start: 0, end: 16, reduction: 0 }, expRisk: 0.01, ci: 0.95 });
    const none = undetectedAt(16);
    setScenario({ am: { on: true, start: 0, end: 16, reduction: 80 } });
    const heavy = undetectedAt(16);
    expect(heavy["Median"]).toBe(none["Median"]);
    expect(heavy["Lower bound"]).toBe(none["Lower bound"]);
    expect(heavy["Upper bound"]).toBe(none["Upper bound"]);
  });

  it("the live CI flows through (narrower CI ⇒ tighter bounds)", () => {
    setScenario({ exp: { start: -10, end: -2 }, am: { on: true, start: 2, end: 16 }, expRisk: 0.01 });
    setScenario({ ci: 0.95 });
    const wide = undetectedAt(14);
    setScenario({ ci: 0.5 });
    const narrow = undetectedAt(14);
    expect(narrow["Upper bound"]).toBeLessThanOrEqual(wide["Upper bound"]);
    expect(narrow["Lower bound"]).toBeGreaterThanOrEqual(wide["Lower bound"]);
  });
});
