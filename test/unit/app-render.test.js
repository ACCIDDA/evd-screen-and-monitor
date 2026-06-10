// app-render.test.js — smoke test that the two simplified tabs render without throwing,
// using a minimal DOM stub (vitest's Vite transform handles the JSON imports).

import { it, expect } from "vitest";

it("renders the results table and the profiles editor without throwing", async () => {
  const stubs = {};
  const stub = (id) => {
    if (stubs[id]) return stubs[id];
    let html = "";
    const s = {
      id, value: "14", textContent: "", hidden: false,
      addEventListener() {}, querySelectorAll() { return []; },
      classList: { add() {}, remove() {} },
    };
    Object.defineProperty(s, "innerHTML", { get: () => html, set: (v) => { html = v; } });
    return (stubs[id] = s);
  };
  globalThis.window = { addEventListener() {} };
  globalThis.document = {
    getElementById: stub,
    querySelectorAll() { return []; }, // .tab / .panel — none wired in the test
  };

  const { init } = await import("../../src/ui/main.js");
  expect(() => init()).not.toThrow();

  // landing: one result CARD per seed profile, bold median + (lo – hi)
  const cards = stub("resultCards").innerHTML;
  expect(cards).toContain("High-risk contact");
  expect((cards.match(/class="rcard"/g) || []).length).toBe(3);
  expect(cards).toMatch(/<strong>[\d.]+<\/strong> <span class="rcard-ci">\([\d.]+ – [\d.]+\)/);

  // profiles editor: rows with a two-anchor exposure slider
  expect((stub("profileList").innerHTML.match(/class="prow"/g) || []).length).toBe(3);
  expect((stub("profileList").innerHTML.match(/class="dr2"/g) || []).length).toBe(3);
  expect((stub("profileList").innerHTML.match(/class="p-begin"/g) || []).length).toBe(3); // number boxes too

  // active-monitoring timeline rendered an SVG
  expect(stub("amTimeline").innerHTML).toMatch(/<svg class="amtl-svg"/);
});
