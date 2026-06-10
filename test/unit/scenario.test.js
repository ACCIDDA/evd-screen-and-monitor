// scenario.test.js — locks the per-traveler-profile undetected figure to the validated core.

import { describe, it, expect } from "vitest";
import { store, newProfile, clampProfile, undetectedForProfile, CI } from "../../src/ui/scenario.js";
import { computeRisk, riskTable } from "../../src/core/risk.js";
import { scaleU } from "../../src/core/rng.js";
import { POST, BASE_U } from "../../src/ui/data.js";

// what the Undetected-infections table would compute directly for this profile + length
const direct = (p, len, ci) =>
  riskTable(computeRisk({ samples: POST, u: scaleU(BASE_U, -p.expEnd, -p.expStart), durations: [len], phi: p.phi, ci }))[0];

describe("traveler-profile undetected metric", () => {
  it("equals a direct computeRisk/riskTable call (byte-identical)", () => {
    const p = newProfile("t", 21, 2, 0.01); // exposed 21..2 days before arrival, φ 1/100
    for (const len of [0, 7, 14, 28]) {
      const a = undetectedForProfile(p, len, CI), b = direct(p, len, CI);
      expect(a["Median"]).toBe(b["Median"]);
      expect(a["Lower bound"]).toBe(b["Lower bound"]);
      expect(a["Upper bound"]).toBe(b["Upper bound"]);
    }
  });

  it("maps the exposure window to u bounds and is monotone in monitoring length", () => {
    const p = newProfile("t", 21, 2, 0.001);
    expect(p.expStart).toBe(-21);
    expect(p.expEnd).toBe(-2); // uLo = -expEnd = 2, uHi = -expStart = 21
    const m7 = undetectedForProfile(p, 7)["Median"], m28 = undetectedForProfile(p, 28)["Median"];
    expect(m28).toBeLessThanOrEqual(m7); // longer monitoring ⇒ no more undetected
  });

  it("treats a zero-width window (point exposure) as in-domain", () => {
    const p = newProfile("pt", 5, 5, 0.01); // expStart == expEnd == -5
    expect(() => undetectedForProfile(p, 14)).not.toThrow();
    expect(Number.isFinite(undetectedForProfile(p, 14)["Median"])).toBe(true);
  });

  it("clamps invalid windows (begin<end) and coerces φ to a number", () => {
    const p = clampProfile({ id: 9, name: "x", expStart: -2, expEnd: -10, phi: "0.01" });
    expect(p.expEnd).toBeGreaterThanOrEqual(p.expStart); // expEnd clamped up to expStart
    expect(typeof p.phi).toBe("number");
  });

  it("seeds three example profiles", () => {
    expect(store.profiles.length).toBe(3);
    expect(store.profiles.map((p) => p.name)).toContain("High-risk contact");
  });
});
