// timeline.js — horizontal intervention-timeline scenario builder (landing tab).
//
// Reads/writes the shared scenario store (scenario.js); the Undetected-infections tab is
// linked to the same store (two-way). When active monitoring is selected, this page shows
// the validated undetected-per-10,000 figure for the monitoring window (the value at the
// risk curve's MAX duration). The figure depends only on when the window CLOSES (am.end);
// am.start cancels in the metric — so it's labelled by the end day. It reflects the
// active-monitoring/quarantine window only (testing / fever are not in this number).
//
// Layout: control panel grouped by period (pre-arrival / arrival / post-arrival), each
// group floating over its region of the timeline; draggable bars below the axis.

import {
  scenario as state, notify, subscribe, undetectedAt, amDuration,
  EXP_MIN, POST_MAX, MIN_EXP_W,
} from "./scenario.js";

const el = (id) => document.getElementById(id);

const MIN_POST = 10; // keep a little post-arrival timeline so that region always has room
const LEFT_PAD = 16, RIGHT_PAD = 16;
const AXIS_Y = 18, BAND_H = 16, LANE_GAP = 10;
const COL = { test: "#d95f02", fever: "#e7298a", am: "#1b9e77", testout: "#2c7fb8", exp: "#9e2a2b" };
const LABEL = { exp: "Exposure", am: "Active monitoring / quarantine" };

// Infection-risk options mirror the φ levels from the Undetected-infections tab (#r_phi).
function phiOptions() {
  const sel = el("r_phi");
  return sel ? [...sel.options].map((o) => ({ v: o.value, label: o.textContent })) : [];
}
const riskLabel = (v) => { const o = phiOptions().find((x) => Number(x.v) === Number(v)); return o ? o.label : v; };

let geom = null;
let dragCtx = null;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
function segOf(key) { return key === "exp" ? state.exp : state[key]; }
// active monitoring is anchored at arrival (day 0) — only its end edge is draggable.
function edgesFor(key) { return key === "am" ? ["bot"] : ["top", "bot"]; }

// ───────────────────────── geometry / scale (fit-to-width, ~10% buffer) ─────────────────────────
function computeGeom() {
  state.exp.start = clamp(state.exp.start, EXP_MIN, 0);
  state.exp.end = clamp(state.exp.end, state.exp.start, 0);
  state.am.start = clamp(state.am.start, 0, POST_MAX);
  state.am.end = clamp(state.am.end, state.am.start, POST_MAX);
  const width = Math.max((el("tl2") && el("tl2").clientWidth) || 0, 360) || 820;
  const contentMin = state.exp.start;
  let contentMax = MIN_POST;
  if (state.am.on) contentMax = Math.max(contentMax, state.am.end);

  const contentSpan = Math.max(contentMax - contentMin, 1);
  const buffer = Math.max(2, Math.round(0.1 * contentSpan));
  const dMin = contentMin - buffer, dMax = contentMax + buffer, span = dMax - dMin;
  const plotW = width - LEFT_PAD - RIGHT_PAD;
  const pxPerDay = plotW / span;
  const sx = (d) => LEFT_PAD + (d - dMin) * pxPerDay;

  const dotY = { test: AXIS_Y + 14, fever: AXIS_Y + 28 };
  const barsTop = AXIS_Y + 40;
  const bars = ["exp", ...(state.am.on ? ["am"] : [])];
  let y = barsTop;
  const bandY = {};
  for (const k of bars) { bandY[k] = y; y += BAND_H + LANE_GAP; }
  const H = y + 4;
  return { width, dMin, dMax, span, pxPerDay, sx, bars, bandY, dotY, H, svgEl: null };
}

function scenarioView() {
  return {
    exp: { start: state.exp.start, end: state.exp.end }, expRisk: state.expRisk,
    test: state.test, fever: state.fever, testOut: state.testOut,
    am: { on: state.am.on, start: state.am.start, end: state.am.end, reduction: state.am.reduction },
  };
}

// ───────────────────────── SVG timeline ─────────────────────────
function ariaSummary() {
  const parts = [`Horizontal traveler timeline. Exposure window ${-state.exp.start} to ${-state.exp.end} days before arrival, infection risk ${riskLabel(state.expRisk)}.`];
  if (state.test) parts.push("Testing at arrival.");
  if (state.fever) parts.push("Fever screening at arrival.");
  if (state.am.on) parts.push(`Active monitoring / quarantine for ${state.am.end - state.am.start} days.`);
  if (state.am.on && state.testOut) parts.push(`Test out at day ${state.am.end}.`);
  return parts.join(" ");
}

function handleMarkup(key, edge, g) {
  const seg = segOf(key);
  const day = edge === "top" ? seg.start : seg.end;
  const x = g.sx(day), bandY = g.bandY[key], id = `h_${key}_${edge}`;
  let aMin, aMax, aNow, aLabel;
  if (key === "exp") {
    aMin = 0; aMax = -EXP_MIN; aNow = -day;
    aLabel = `Exposure window ${edge === "top" ? "beginning" : "end"}: days before arrival`;
  } else {
    aMin = 0; aMax = POST_MAX; aNow = day;
    aLabel = `${LABEL[key]} ${edge === "top" ? "start" : "end"} day`;
  }
  return `<g id="${id}" data-grip role="slider" tabindex="0" transform="translate(${x},0)" ` +
    `aria-label="${aLabel}" aria-valuemin="${aMin}" aria-valuemax="${aMax}" aria-valuenow="${aNow}">` +
    `<rect x="-6" y="${bandY - 3}" width="12" height="${BAND_H + 6}" fill="transparent"/>` +
    `<line class="grip-line" x1="0" y1="${bandY - 2}" x2="0" y2="${bandY + BAND_H + 2}" stroke="#333" stroke-width="2"/>` +
    `</g>`;
}

function bandMarkup(key, color, g) {
  const seg = segOf(key), y = g.bandY[key];
  return `<rect id="b_${key}" x="${g.sx(seg.start)}" y="${y}" width="${Math.max(g.sx(seg.end) - g.sx(seg.start), 0)}" ` +
    `height="${BAND_H}" rx="3" fill="${color}" fill-opacity="0.85"/>`;
}

function buildSVG(g) {
  const p = [];
  const x0 = g.sx(0);
  p.push(`<line x1="${x0}" y1="4" x2="${x0}" y2="${g.H - 2}" stroke="#8a8a8a" stroke-width="1.5"/>`);
  p.push(`<line x1="${g.sx(g.dMin)}" y1="${AXIS_Y}" x2="${g.sx(g.dMax)}" y2="${AXIS_Y}" stroke="#888" stroke-width="1.5"/>`);
  const step = g.span > 40 ? 10 : g.span > 20 ? 5 : g.span > 10 ? 2 : 1;
  for (let d = Math.ceil(g.dMin / step) * step; d <= g.dMax; d += step) {
    const x = g.sx(d);
    if (d === 0) { p.push(`<text x="${x}" y="11" font-size="10.5" text-anchor="middle" font-weight="600" fill="#333">arrival</text>`); continue; }
    p.push(`<line x1="${x}" y1="${AXIS_Y}" x2="${x}" y2="${g.H - 2}" stroke="#e8e8e8"/>`);
    p.push(`<line x1="${x}" y1="${AXIS_Y}" x2="${x}" y2="${AXIS_Y + 3}" stroke="#888"/>`);
    p.push(`<text x="${x}" y="11" font-size="10" text-anchor="middle" fill="#666">${d}</text>`);
  }
  if (state.test) p.push(`<circle cx="${x0}" cy="${g.dotY.test}" r="5.5" fill="${COL.test}" stroke="#fff" stroke-width="1.5"/>`);
  if (state.fever) p.push(`<circle cx="${x0}" cy="${g.dotY.fever}" r="5.5" fill="${COL.fever}" stroke="#fff" stroke-width="1.5"/>`);
  for (const key of g.bars) {
    p.push(bandMarkup(key, COL[key], g));
    for (const edge of edgesFor(key)) p.push(handleMarkup(key, edge, g));
  }
  // test-to-exit: a marker at the end of the monitoring window (pointer-events off so it
  // doesn't block the bar's end-drag handle underneath it)
  if (state.am.on && state.testOut) {
    p.push(`<circle cx="${g.sx(state.am.end)}" cy="${g.bandY.am + BAND_H / 2}" r="4.5" fill="${COL.testout}" stroke="#fff" stroke-width="1.5" style="pointer-events:none"/>`);
  }
  return `<svg id="tl2svg" class="tl2-svg" width="${g.width}" height="${g.H}" viewBox="0 0 ${g.width} ${g.H}" ` +
    `role="img" aria-label="${esc(ariaSummary())}">${p.join("")}</svg>`;
}

// ───────────────────────── readouts, result, notes ─────────────────────────
function roText(key) {
  if (key === "exp") return `(${-state.exp.start}–${-state.exp.end} d before arrival)`;
  const seg = state[key];
  if (!seg.on) return "";
  if (key === "am") return `(${seg.end - seg.start} days)`; // anchored at arrival → duration
  return `(day ${seg.start} – ${seg.end})`;
}

function renderResult() {
  if (!state.am.on) {
    el("tlResult").innerHTML = `<div class="tl-result tl-result-off">Select <strong>active monitoring</strong> to estimate undetected infections per 10,000 monitored.</div>`;
    return;
  }
  const r = undetectedAt(amDuration());
  el("tlResult").innerHTML =
    `<div class="tl-result"><span class="tl-result-head">Undetected symptomatic infections per 10,000 monitored:</span> ` +
    `<strong class="tl-result-num">${r["Median"].toFixed(2)}</strong> ` +
    `<span class="tl-result-ci">(${r["Lower bound"].toFixed(2)}–${r["Upper bound"].toFixed(2)}, ${Math.round(state.ci * 100)}% CI)</span>` +
    `<div class="tl-result-note">for ${state.am.end - state.am.start} days of active monitoring / quarantine · infection risk ${esc(riskLabel(state.expRisk))}. ` +
    `Detection figure only — it depends on monitoring duration and exposure; arrival testing, fever screening and test-out are not reflected here.</div></div>`;
}

function buildNotes(sc) {
  const items = [];
  if (sc.test) items.push("Testing at arrival (day 0)");
  if (sc.fever) items.push("Fever screening at arrival (day 0)");
  if (sc.am.on) items.push(`Active monitoring / quarantine, ${sc.am.end - sc.am.start} days`);
  if (sc.am.on && sc.testOut) items.push(`Test out at day ${sc.am.end} (end of monitoring)`);
  const head = `<div class="tl-card"><strong>Scenario</strong>` +
    `<p class="tl2-exp-note">Exposure window: ${-sc.exp.start}–${-sc.exp.end} days before arrival · infection risk ${esc(riskLabel(sc.expRisk))}.</p>`;
  if (!items.length) {
    return head + `<p class="tl-empty">No interventions selected. Check interventions above to place them on the timeline.</p></div>`;
  }
  return head + `<ul>` + items.map((t) => `<li>${esc(t)}</li>`).join("") + `</ul></div>`;
}

// ───────────────────────── drag / keyboard ─────────────────────────
function edgeVal(key, edge) { const s = segOf(key); return edge === "top" ? s.start : s.end; }

function setEdge(key, edge, day) {
  day = Math.round(day);
  if (key === "exp") {
    // keep the window at least MIN_EXP_W wide so its label stays clear of arrival
    if (edge === "top") state.exp.start = clamp(day, EXP_MIN, state.exp.end - MIN_EXP_W);
    else state.exp.end = clamp(day, state.exp.start + MIN_EXP_W, 0);
    return;
  }
  const seg = state[key];
  if (edge === "top") seg.start = clamp(day, 0, seg.end);
  else seg.end = clamp(day, seg.start, POST_MAX);
}

function dayAtClientX(clientX) {
  const c = dragCtx;
  return c.dMin0 + ((clientX - c.svgLeft) - LEFT_PAD) / c.px0;
}

function startDrag(key, edge) {
  dragCtx = { key, edge, px0: geom.pxPerDay, dMin0: geom.dMin, svgLeft: geom.svgEl.getBoundingClientRect().left };
  const move = (ev) => { setEdge(key, edge, dayAtClientX(ev.clientX)); renderTimeline(); }; // live, cheap
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    dragCtx = null;
    notify("timeline"); // sync the linked Undetected tab once, on release
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

function attachHandle(key, edge) {
  const h = el(`h_${key}_${edge}`);
  if (!h) return;
  h.addEventListener("pointerdown", (e) => { e.preventDefault(); startDrag(key, edge); });
  h.addEventListener("keydown", (e) => {
    let delta = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 1;
    else return;
    e.preventDefault();
    setEdge(key, edge, edgeVal(key, edge) + delta);
    notify("timeline");
    el(`h_${key}_${edge}`)?.focus();
  });
}

// ───────────────────────── render ─────────────────────────
function positionGroups(g) {
  const W = g.width;
  const cx = (d) => clamp(Math.round(g.sx(d)), 55, W - 55);
  const halfW = (id) => { const e = el(id); return (e && e.offsetWidth ? e.offsetWidth : 180) / 2; };
  const gap = 8;
  const arrivalX = cx(0);
  // pre group: keep its right edge clear of arrival's left edge (groups are translateX(-50%))
  let preX = Math.min(cx((state.exp.start + state.exp.end) / 2), arrivalX - halfW("grp_arrival") - halfW("grp_pre") - gap);
  // post group: keep its left edge clear of arrival's right edge
  let postX = Math.max(cx(g.dMax / 2), arrivalX + halfW("grp_arrival") + halfW("grp_post") + gap);
  el("grp_pre").style.left = `${Math.max(Math.round(preX), 2)}px`;
  el("grp_arrival").style.left = `${arrivalX}px`;
  el("grp_post").style.left = `${Math.min(Math.round(postX), W - 2)}px`;
}

function renderTimeline() {
  geom = computeGeom();
  el("tl2").innerHTML = buildSVG(geom);
  geom.svgEl = el("tl2svg");
  for (const edge of edgesFor("exp")) attachHandle("exp", edge);
  if (state.am.on) for (const edge of edgesFor("am")) attachHandle("am", edge);
  el("ro_exp").textContent = roText("exp");
  el("ro_am").textContent = roText("am");
  el("sel_exprisk").value = String(state.expRisk); // reflect store (may have changed on the AM tab)
  el("cb_test").checked = state.test;              // reflect store (e.g. AM toggled from the AM tab)
  el("cb_fever").checked = state.fever;
  el("cb_am").checked = state.am.on;
  el("cb_testout").checked = state.testOut;
  el("cb_testout").disabled = !state.am.on; // test-to-exit only applies during a monitoring window
  positionGroups(geom);
  renderResult();
  el("tlNotes").innerHTML = buildNotes(scenarioView());
}

export function initTimeline() {
  const phi = el("r_phi");
  if (phi) state.expRisk = +phi.value;

  const sel = el("sel_exprisk");
  sel.innerHTML = phiOptions().map((r) => `<option value="${r.v}">${esc(r.label)}</option>`).join("");
  sel.value = String(state.expRisk);
  sel.addEventListener("change", () => { state.expRisk = +sel.value; notify("timeline"); });
  for (const k of ["test", "fever"]) el(`cb_${k}`).addEventListener("change", (e) => { state[k] = e.target.checked; notify("timeline"); });
  el("cb_am").addEventListener("change", (e) => { state.am.on = e.target.checked; notify("timeline"); });
  el("cb_testout").addEventListener("change", (e) => { state.testOut = e.target.checked; notify("timeline"); });

  subscribe(renderTimeline);
  window.addEventListener("resize", renderTimeline);
  renderTimeline();
}
