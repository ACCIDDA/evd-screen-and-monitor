// timeline-render.test.js — smoke test that the timeline actually renders with a mocked DOM.
// Catches DOM-render regressions (e.g. dangling element/state refs) that the pure-math
// tests miss. Uses a minimal getElementById stub; vitest's Vite transform handles the JSON
// imports that raw node can't.

import { it, expect, beforeEach } from "vitest";

function installDom() {
  const stubs = {};
  const stub = (id) => {
    if (stubs[id]) return stubs[id];
    const st = {}; let html = "";
    const s = {
      id, value: "", checked: false, textContent: "", disabled: false,
      options: id === "r_phi" ? [{ value: "0.01", textContent: "1/100" }] : undefined,
      get style() { return st; },
      get clientWidth() { return id === "tl2" ? 1148 : 0; },
      setAttribute() {}, getAttribute() {}, focus() {},
      getBoundingClientRect() { return { top: 0, left: 0 }; },
      addEventListener() {}, removeEventListener() {},
    };
    Object.defineProperty(s, "innerHTML", { get: () => html, set: (v) => { html = v; } });
    return (stubs[id] = s);
  };
  globalThis.window = { addEventListener() {} };
  globalThis.document = { getElementById: stub, addEventListener() {}, removeEventListener() {} };
  stub("r_phi").value = "0.01";
  return stub;
}

it("renders an SVG of sane dimensions without throwing", async () => {
  const stub = installDom();
  const { initTimeline } = await import("../../src/ui/timeline.js");
  expect(() => initTimeline()).not.toThrow();

  const svg = stub("tl2").innerHTML;
  expect(svg).toMatch(/<svg id="tl2svg"/);
  const w = +svg.match(/width="([\d.]+)"/)[1];
  const h = +svg.match(/height="([\d.]+)"/)[1];
  expect(w).toBe(1148);     // == container width, not blown up
  expect(h).toBeGreaterThan(40);
  expect(h).toBeLessThan(300);
});

it("draws the test-out marker only when active monitoring AND test-out are on", async () => {
  const stub = installDom();
  const { scenario } = await import("../../src/ui/scenario.js");
  const { initTimeline } = await import("../../src/ui/timeline.js");
  const MARK = /fill="#2c7fb8"/; // test-out colour
  const svg = () => stub("tl2").innerHTML;

  scenario.am.on = false; scenario.testOut = true;
  initTimeline();
  expect(MARK.test(svg())).toBe(false); // AM off → no marker even if test-out set

  scenario.am.on = true; scenario.testOut = true;
  initTimeline();
  expect(MARK.test(svg())).toBe(true);  // AM on + test-out → marker

  scenario.am.on = true; scenario.testOut = false;
  initTimeline();
  expect(MARK.test(svg())).toBe(false); // test-out off → no marker
});
