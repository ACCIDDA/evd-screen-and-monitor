// timeline.js — vertical intervention-timeline scenario builder (Phase 2a, UI shell).
//
// The axis AUTO-FITS its content with a ~10% buffer on each end, and re-fits LIVE while
// you drag (the timeline grows/shrinks as you pull an edge). To stay stable, the
// cursor→day mapping is frozen at the moment you grab a handle (using that frame's
// scale); only the *display* re-fits each frame. Without that freeze, re-scaling and
// re-mapping together form a feedback loop that makes the dragged edge run away.
//
//  - exposure window [begin, end], both before arrival, both draggable. Dragging the
//    BEGINNING earlier extends the timeline back. A risk selector sits in its card.
//  - arrival = day 0 (fixed). "at arrival" interventions (testing, fever screening) are
//    checkboxes that light a colored indicator on the arrival line.
//  - active monitoring / quarantine = bands after arrival, set by dragging their edges.
//
// IMPORTANT: this increment computes NO outcome numbers (incl. exposure risk, which is
// only recorded, not modeled). The validated core models only an intervention-AGNOSTIC
// metric, P(onset after the window closes) = phi * S(u+d). Outcomes come in a later
// phase (using the same cohort u-distribution as the "Undetected infections" tab).

const el = (id) => document.getElementById(id);

const EXP_MIN = -60, POST_MAX = 120;       // logical bounds (days relative to arrival)
const TOP_PAD = 20, BOT_PAD = 20;          // px padding above/below the axis
const COL = { test: "#d95f02", fever: "#e7298a", am: "#1b9e77", quarantine: "#7570b3", exp: "#9e2a2b" };
const LABEL = { exp: "Exposure", am: "Active monitoring", q: "Quarantine" };
// Exposure-risk options mirror the φ levels from the "Undetected infections" tab
// (the #r_phi <select>), so both share one source of truth. φ = probability a monitored
// individual develops symptoms — i.e. how risky the exposure was. Read at render time, so
// if that tab's levels change, this picks them up automatically.
function phiOptions() {
  const sel = el("r_phi");
  return sel ? [...sel.options].map((o) => ({ v: o.value, label: o.textContent })) : [];
}
const riskLabel = (v) => { const o = phiOptions().find((x) => x.v === v); return o ? o.label : v; };

const state = {
  exp: { start: -10, end: -2 },
  expRisk: "0.01", // overwritten from #r_phi's selection in initTimeline()
  test: false, fever: false,
  am: { on: false, start: 2, end: 16 },
  q: { on: false, start: 0, end: 10 },
};

let geom = null;
let dragCtx = null; // {key, edge, px0, dMin0, svgTop} while a handle is being dragged

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function segOf(key) { return key === "exp" ? state.exp : state[key]; }

// ───────────────────────── geometry / scale (auto-fit, ~10% buffer) ─────────────────────────
function computeGeom() {
  state.exp.start = clamp(state.exp.start, EXP_MIN, 0);
  state.exp.end = clamp(state.exp.end, state.exp.start, 0);
  for (const k of ["am", "q"]) {
    state[k].start = clamp(state[k].start, 0, POST_MAX);
    state[k].end = clamp(state[k].end, state[k].start, POST_MAX);
  }
  const contentMin = state.exp.start;
  let contentMax = 0; // arrival always visible
  if (state.am.on) contentMax = Math.max(contentMax, state.am.end);
  if (state.q.on) contentMax = Math.max(contentMax, state.q.end);

  const contentSpan = Math.max(contentMax - contentMin, 1);
  const buffer = Math.max(2, Math.round(0.1 * contentSpan)); // ~10% of length each end
  const dMin = contentMin - buffer, dMax = contentMax + buffer, span = dMax - dMin;
  const pxPerDay = clamp(440 / span, 6, 18);
  const H = Math.round(TOP_PAD + span * pxPerDay + BOT_PAD);
  const sy = (d) => TOP_PAD + (d - dMin) * pxPerDay;
  return { dMin, dMax, span, pxPerDay, H, sy, svgEl: null };
}

function scenarioView() {
  return {
    exp: { start: state.exp.start, end: state.exp.end }, expRisk: state.expRisk,
    test: state.test, fever: state.fever,
    am: { on: state.am.on, start: state.am.start, end: state.am.end },
    quarantine: { on: state.q.on, start: state.q.start, end: state.q.end },
  };
}

// ───────────────────────── SVG timeline ─────────────────────────
const AXIS_X = 84;
const ARR_X = { test: AXIS_X + 10, fever: AXIS_X + 22 };
const LANE_W = 20, LANE_GAP = 8;
const LANE_X = { exp: AXIS_X + 36, am: AXIS_X + 36 + (LANE_W + LANE_GAP), q: AXIS_X + 36 + 2 * (LANE_W + LANE_GAP) };
const SVG_W = LANE_X.q + LANE_W + 14;

function ariaSummary() {
  const parts = [`Vertical traveler timeline. Exposure window ${-state.exp.start} to ${-state.exp.end} days before arrival, exposure risk ${riskLabel(state.expRisk)}.`];
  if (state.test) parts.push("Testing at arrival.");
  if (state.fever) parts.push("Fever screening at arrival.");
  if (state.am.on) parts.push(`Active monitoring day ${state.am.start} to ${state.am.end}.`);
  if (state.q.on) parts.push(`Quarantine day ${state.q.start} to ${state.q.end}.`);
  return parts.join(" ");
}

function handleMarkup(key, edge, g) {
  const seg = segOf(key);
  const day = edge === "top" ? seg.start : seg.end;
  const x = LANE_X[key], y = g.sy(day), id = `h_${key}_${edge}`;
  let aMin, aMax, aNow, aLabel;
  if (key === "exp") {
    aMin = 0; aMax = -EXP_MIN; aNow = -day;
    aLabel = `Exposure window ${edge === "top" ? "beginning" : "end"}: days before arrival`;
  } else {
    aMin = 0; aMax = POST_MAX; aNow = day;
    aLabel = `${LABEL[key]} ${edge === "top" ? "start" : "end"} day`;
  }
  return `<g id="${id}" data-grip role="slider" tabindex="0" transform="translate(0,${y})" ` +
    `aria-label="${aLabel}" aria-valuemin="${aMin}" aria-valuemax="${aMax}" aria-valuenow="${aNow}">` +
    `<rect x="${x - 6}" y="-7" width="${LANE_W + 12}" height="14" fill="transparent"/>` +
    `<line class="grip-line" x1="${x + 1}" y1="0" x2="${x + LANE_W - 1}" y2="0" stroke="#333" stroke-width="2"/>` +
    `</g>`;
}

function bandMarkup(key, color, g) {
  const seg = segOf(key);
  return `<rect id="b_${key}" x="${LANE_X[key]}" y="${g.sy(seg.start)}" width="${LANE_W}" ` +
    `height="${Math.max(g.sy(seg.end) - g.sy(seg.start), 0)}" rx="4" fill="${color}" fill-opacity="0.85"/>`;
}

function buildSVG(g) {
  const p = [];
  p.push(`<line x1="${AXIS_X}" y1="${g.sy(0)}" x2="${SVG_W}" y2="${g.sy(0)}" stroke="#ccc" stroke-dasharray="2 3"/>`);
  p.push(`<line x1="${AXIS_X}" y1="${g.sy(g.dMin)}" x2="${AXIS_X}" y2="${g.sy(g.dMax)}" stroke="#888" stroke-width="1.5"/>`);

  const step = g.span > 40 ? 10 : g.span > 20 ? 5 : g.span > 10 ? 2 : 1;
  for (let d = Math.ceil(g.dMin / step) * step; d <= g.dMax; d += step) {
    const y = g.sy(d);
    p.push(`<line x1="${AXIS_X - 4}" y1="${y}" x2="${AXIS_X}" y2="${y}" stroke="#888"/>`);
    if (d === 0) p.push(`<text x="${AXIS_X - 8}" y="${y + 3.5}" font-size="10.5" text-anchor="end" font-weight="600" fill="#333">arrival</text>`);
    else p.push(`<text x="${AXIS_X - 8}" y="${y + 3.5}" font-size="10.5" text-anchor="end" fill="#666">${d}</text>`);
  }

  p.push(bandMarkup("exp", COL.exp, g));
  p.push(handleMarkup("exp", "top", g));
  p.push(handleMarkup("exp", "bot", g));

  for (const key of ["am", "q"]) {
    if (!state[key].on) continue;
    p.push(bandMarkup(key, key === "am" ? COL.am : COL.quarantine, g));
    p.push(handleMarkup(key, "top", g));
    p.push(handleMarkup(key, "bot", g));
  }

  if (state.test) p.push(`<circle cx="${ARR_X.test}" cy="${g.sy(0)}" r="5.5" fill="${COL.test}" stroke="#fff" stroke-width="1.5"/>`);
  if (state.fever) p.push(`<circle cx="${ARR_X.fever}" cy="${g.sy(0)}" r="5.5" fill="${COL.fever}" stroke="#fff" stroke-width="1.5"/>`);

  return `<svg id="tl2svg" class="tl2-svg" width="${SVG_W}" height="${g.H}" viewBox="0 0 ${SVG_W} ${g.H}" ` +
    `role="img" aria-label="${esc(ariaSummary())}">${p.join("")}</svg>`;
}

// ───────────────────────── aligned control cards ─────────────────────────
const swatch = (c) => `<span class="tl2-sw" style="background:${c}"></span>`;

function roText(key) {
  if (key === "exp") return `(${-state.exp.start}–${-state.exp.end} d before arrival)`;
  const seg = state[key];
  return seg.on ? `(day ${seg.start} – ${seg.end})` : "off";
}

function expCard(top) {
  const opts = phiOptions().map((r) => `<option value="${r.v}"${state.expRisk === r.v ? " selected" : ""}>${esc(r.label)}</option>`).join("");
  return `<div class="tl2-card" id="card_exp" style="top:${top}px">` +
    `<div class="tl2-lbl">${swatch(COL.exp)}Exposure window</div>` +
    `<div class="tl2-ro tl2-ro-bare" id="ro_exp">${roText("exp")}</div>` +
    `<label class="tl2-sel"><span>Exposure risk</span> <select id="sel_exprisk">${opts}</select></label>` +
    `</div>`;
}

function arrivalCard(top) {
  return `<div class="tl2-card" id="card_arrival" style="top:${top}px">` +
    `<label class="opt">${swatch(COL.test)}<input type="checkbox" id="cb_test"${state.test ? " checked" : ""}> Testing at arrival</label>` +
    `<label class="opt">${swatch(COL.fever)}<input type="checkbox" id="cb_fever"${state.fever ? " checked" : ""}> Fever screening at arrival</label>` +
    `</div>`;
}

function periodCard(key, label, color, top) {
  const seg = state[key];
  return `<div class="tl2-card" id="card_${key}" style="top:${top}px">` +
    `<label class="opt">${swatch(color)}<input type="checkbox" id="cb_${key}"${seg.on ? " checked" : ""}> ${esc(label)}</label>` +
    `<div class="tl2-ro${seg.on ? "" : " off"}" id="ro_${key}">${roText(key)}</div>` +
    `</div>`;
}

// Lay out the aligned cards (with overlap avoidance) and report where the stack ends,
// so the axis can be grown to keep the cards from overrunning into the notes below.
function layoutCards(g) {
  const defs = [
    { anchor: g.sy(state.exp.start), h: 70, html: (t) => expCard(t) },
    { anchor: g.sy(0), h: 52, html: (t) => arrivalCard(t) },
    { anchor: g.sy(state.am.start), h: 42, html: (t) => periodCard("am", "Active monitoring", COL.am, t) },
    { anchor: g.sy(state.q.start), h: 42, html: (t) => periodCard("q", "Quarantine", COL.quarantine, t) },
  ];
  defs.sort((a, b) => a.anchor - b.anchor);
  let prevBottom = -1e9;
  const out = [];
  for (const d of defs) {
    const top = Math.max(Math.round(d.anchor - 8), prevBottom + 8);
    prevBottom = top + d.h;
    out.push(d.html(top));
  }
  return { html: out.join(""), bottom: prevBottom };
}

// ───────────────────────── scenario notes ─────────────────────────
function buildNotes(sc) {
  const items = [];
  if (sc.test) items.push("Testing at arrival (day 0)");
  if (sc.fever) items.push("Fever screening at arrival (day 0)");
  if (sc.am.on) items.push(`Active monitoring, day ${sc.am.start}–${sc.am.end} (${sc.am.end - sc.am.start} days)`);
  if (sc.quarantine.on) items.push(`Quarantine, day ${sc.quarantine.start}–${sc.quarantine.end} (${sc.quarantine.end - sc.quarantine.start} days)`);
  const head = `<div class="tl-card"><strong>Scenario</strong>` +
    `<p class="tl2-exp-note">Exposure window: ${-sc.exp.start}–${-sc.exp.end} days before arrival · exposure risk ${esc(riskLabel(sc.expRisk))}.</p>`;
  if (!items.length) {
    return head + `<p class="tl-empty">No interventions selected. Toggle interventions to place them on the timeline.</p></div>`;
  }
  return head + `<ul>` + items.map((t) => `<li>${esc(t)}</li>`).join("") + `</ul>` +
    `<p class="tl-defer">Outcomes (risk, cost, staffing) are not computed yet — these are modeled in a later phase. ` +
    `This page builds the intervention scenario.</p></div>`;
}

// ───────────────────────── drag (live re-fit) / keyboard ─────────────────────────
function edgeVal(key, edge) { const s = segOf(key); return edge === "top" ? s.start : s.end; }

function setEdge(key, edge, day) {
  day = Math.round(day);
  if (key === "exp") {
    if (edge === "top") state.exp.start = clamp(day, EXP_MIN, state.exp.end);
    else state.exp.end = clamp(day, state.exp.start, 0);
    return;
  }
  const seg = state[key];
  if (edge === "top") seg.start = clamp(day, 0, seg.end);
  else seg.end = clamp(day, seg.start, POST_MAX);
}

// cursor→day uses the scale FROZEN at grab time (dragCtx), so live re-fit can't feed back
function dayAtClientY(clientY) {
  const c = dragCtx;
  return c.dMin0 + ((clientY - c.svgTop) - TOP_PAD) / c.px0;
}

function startDrag(key, edge) {
  dragCtx = { key, edge, px0: geom.pxPerDay, dMin0: geom.dMin, svgTop: geom.svgEl.getBoundingClientRect().top };
  const move = (ev) => { setEdge(key, edge, dayAtClientY(ev.clientY)); renderAll(); };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    dragCtx = null;
    renderAll();
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
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") delta = -1;
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") delta = 1;
    else return;
    e.preventDefault();
    setEdge(key, edge, edgeVal(key, edge) + delta);
    renderAll();
    el(`h_${key}_${edge}`)?.focus();
  });
}

function attachListeners() {
  for (const k of ["test", "fever"]) {
    const cb = el(`cb_${k}`);
    if (cb) cb.addEventListener("change", () => { state[k] = cb.checked; renderAll(); });
  }
  for (const k of ["am", "q"]) {
    const cb = el(`cb_${k}`);
    if (cb) cb.addEventListener("change", () => { state[k].on = cb.checked; renderAll(); });
  }
  const sel = el("sel_exprisk");
  if (sel) sel.addEventListener("change", () => { state.expRisk = sel.value; renderAll(); });
  attachHandle("exp", "top"); attachHandle("exp", "bot");
  for (const k of ["am", "q"]) if (state[k].on) { attachHandle(k, "top"); attachHandle(k, "bot"); }
}

function renderAll() {
  geom = computeGeom();
  const cards = layoutCards(geom); // depends on dMin & pxPerDay only (not dMax/H)
  const needed = cards.bottom + BOT_PAD;
  if (needed > geom.H) {
    // grow the axis downward to contain the card stack — keep scale & dMin so sy() (and
    // thus the cards) don't move; just draw more timeline past the last intervention.
    geom.dMax = geom.dMin + (needed - TOP_PAD) / geom.pxPerDay;
    geom.span = geom.dMax - geom.dMin;
    geom.H = Math.round(needed);
  }
  el("tl2").innerHTML = `${buildSVG(geom)}<div class="tl2-controls">${cards.html}</div>`;
  geom.svgEl = el("tl2svg");
  attachListeners();
  el("tlNotes").innerHTML = buildNotes(scenarioView());
}

export function initTimeline() {
  const phi = el("r_phi");
  if (phi) state.expRisk = phi.value; // default to the risk tab's current φ selection
  renderAll();
}
