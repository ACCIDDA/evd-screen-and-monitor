// timeline.js — horizontal intervention-timeline scenario builder (Phase 2a, UI shell).
//
// Layout: a static control panel (checkboxes + exposure-risk selector) sits ABOVE the
// timeline; the draggable bars appear BELOW the axis (exposure window always; active
// monitoring / quarantine when checked; testing / fever as dots on the arrival line).
// Time runs left→right: (earlier) → exposure window → arrival (day 0) → after arrival.
//
// The axis fits the container width with a ~10% buffer each end and re-fits live while you
// drag. To stay stable, the cursor→day mapping is frozen at the moment you grab a handle
// (using that frame's scale); only the display re-fits each frame. Without that freeze,
// re-scaling and re-mapping together form a feedback loop that runs the dragged edge away.
//
// IMPORTANT: this increment computes NO outcome numbers (incl. exposure risk, which is
// only recorded, not modeled). The validated core models only an intervention-AGNOSTIC
// metric, P(onset after the window closes) = phi * S(u+d). Outcomes come in a later phase
// (using the same cohort u-distribution as the "Undetected infections" tab).

const el = (id) => document.getElementById(id);

const EXP_MIN = -60, POST_MAX = 120;
const MIN_POST = 10; // keep a little post-arrival timeline so that region (and its controls) always has room
const LEFT_PAD = 16, RIGHT_PAD = 16;
const AXIS_Y = 18, BAND_H = 16, LANE_GAP = 10;
const COL = { test: "#d95f02", fever: "#e7298a", am: "#1b9e77", quarantine: "#7570b3", exp: "#9e2a2b" };
const LABEL = { exp: "Exposure", am: "Active monitoring", q: "Quarantine" };

function phiOptions() {
  const sel = el("r_phi");
  return sel ? [...sel.options].map((o) => ({ v: o.value, label: o.textContent })) : [];
}
const riskLabel = (v) => { const o = phiOptions().find((x) => x.v === v); return o ? o.label : v; };

const state = {
  exp: { start: -10, end: -2 },
  expRisk: "0.01",
  test: false, fever: false,
  am: { on: false, start: 2, end: 16 },
  q: { on: false, start: 0, end: 10 },
};

let geom = null;
let dragCtx = null;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
function segOf(key) { return key === "exp" ? state.exp : state[key]; }

// ───────────────────────── geometry / scale (fit-to-width, ~10% buffer) ─────────────────────────
function computeGeom() {
  state.exp.start = clamp(state.exp.start, EXP_MIN, 0);
  state.exp.end = clamp(state.exp.end, state.exp.start, 0);
  for (const k of ["am", "q"]) {
    state[k].start = clamp(state[k].start, 0, POST_MAX);
    state[k].end = clamp(state[k].end, state[k].start, POST_MAX);
  }
  const width = Math.max((el("tl2") && el("tl2").clientWidth) || 0, 360) || 820;
  const contentMin = state.exp.start;
  let contentMax = MIN_POST;
  if (state.am.on) contentMax = Math.max(contentMax, state.am.end);
  if (state.q.on) contentMax = Math.max(contentMax, state.q.end);

  const contentSpan = Math.max(contentMax - contentMin, 1);
  const buffer = Math.max(2, Math.round(0.1 * contentSpan));
  const dMin = contentMin - buffer, dMax = contentMax + buffer, span = dMax - dMin;
  const plotW = width - LEFT_PAD - RIGHT_PAD;
  const pxPerDay = plotW / span;
  const sx = (d) => LEFT_PAD + (d - dMin) * pxPerDay;

  // testing / fever sit as dots ON the arrival line in FIXED slots (reserved whether or not
  // checked), so toggling them never shifts the bars below.
  const dotY = { test: AXIS_Y + 14, fever: AXIS_Y + 28 };
  const barsTop = AXIS_Y + 40;

  // bars below the axis: exposure always; AM / quarantine when on
  const bars = ["exp", ...(state.am.on ? ["am"] : []), ...(state.q.on ? ["q"] : [])];
  let y = barsTop;
  const bandY = {};
  for (const k of bars) { bandY[k] = y; y += BAND_H + LANE_GAP; }
  const H = y + 4;
  return { width, dMin, dMax, span, pxPerDay, sx, bars, bandY, dotY, H, svgEl: null };
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
function ariaSummary() {
  const parts = [`Horizontal traveler timeline. Exposure window ${-state.exp.start} to ${-state.exp.end} days before arrival, infection risk ${riskLabel(state.expRisk)}.`];
  if (state.test) parts.push("Testing at arrival.");
  if (state.fever) parts.push("Fever screening at arrival.");
  if (state.am.on) parts.push(`Active monitoring day ${state.am.start} to ${state.am.end}.`);
  if (state.q.on) parts.push(`Quarantine day ${state.q.start} to ${state.q.end}.`);
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
  // prominent arrival line, running the full height
  p.push(`<line x1="${x0}" y1="4" x2="${x0}" y2="${g.H - 2}" stroke="#8a8a8a" stroke-width="1.5"/>`);
  // axis
  p.push(`<line x1="${g.sx(g.dMin)}" y1="${AXIS_Y}" x2="${g.sx(g.dMax)}" y2="${AXIS_Y}" stroke="#888" stroke-width="1.5"/>`);
  // ticks + labels above the axis; day 0 shown as "arrival"
  const step = g.span > 40 ? 10 : g.span > 20 ? 5 : g.span > 10 ? 2 : 1;
  for (let d = Math.ceil(g.dMin / step) * step; d <= g.dMax; d += step) {
    const x = g.sx(d);
    if (d === 0) { p.push(`<text x="${x}" y="11" font-size="10.5" text-anchor="middle" font-weight="600" fill="#333">arrival</text>`); continue; }
    p.push(`<line x1="${x}" y1="${AXIS_Y}" x2="${x}" y2="${g.H - 2}" stroke="#e8e8e8"/>`); // light gridline
    p.push(`<line x1="${x}" y1="${AXIS_Y}" x2="${x}" y2="${AXIS_Y + 3}" stroke="#888"/>`);
    p.push(`<text x="${x}" y="11" font-size="10" text-anchor="middle" fill="#666">${d}</text>`);
  }

  // testing / fever as dots ON the arrival line
  if (state.test) p.push(`<circle cx="${x0}" cy="${g.dotY.test}" r="5.5" fill="${COL.test}" stroke="#fff" stroke-width="1.5"/>`);
  if (state.fever) p.push(`<circle cx="${x0}" cy="${g.dotY.fever}" r="5.5" fill="${COL.fever}" stroke="#fff" stroke-width="1.5"/>`);

  // bars below the axis
  for (const key of g.bars) {
    p.push(bandMarkup(key, COL[key === "q" ? "quarantine" : key], g));
    p.push(handleMarkup(key, "top", g));
    p.push(handleMarkup(key, "bot", g));
  }

  return `<svg id="tl2svg" class="tl2-svg" width="${g.width}" height="${g.H}" viewBox="0 0 ${g.width} ${g.H}" ` +
    `role="img" aria-label="${esc(ariaSummary())}">${p.join("")}</svg>`;
}

// ───────────────────────── readouts + notes ─────────────────────────
function roText(key) {
  if (key === "exp") return `(${-state.exp.start}–${-state.exp.end} d before arrival)`;
  const seg = state[key];
  return seg.on ? `(day ${seg.start} – ${seg.end})` : "";
}

function buildNotes(sc) {
  const items = [];
  if (sc.test) items.push("Testing at arrival (day 0)");
  if (sc.fever) items.push("Fever screening at arrival (day 0)");
  if (sc.am.on) items.push(`Active monitoring, day ${sc.am.start}–${sc.am.end} (${sc.am.end - sc.am.start} days)`);
  if (sc.quarantine.on) items.push(`Quarantine, day ${sc.quarantine.start}–${sc.quarantine.end} (${sc.quarantine.end - sc.quarantine.start} days)`);
  const head = `<div class="tl-card"><strong>Scenario</strong>` +
    `<p class="tl2-exp-note">Exposure window: ${-sc.exp.start}–${-sc.exp.end} days before arrival · infection risk ${esc(riskLabel(sc.expRisk))}.</p>`;
  if (!items.length) {
    return head + `<p class="tl-empty">No interventions selected. Check interventions above to place them on the timeline.</p></div>`;
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

function dayAtClientX(clientX) {
  const c = dragCtx;
  return c.dMin0 + ((clientX - c.svgLeft) - LEFT_PAD) / c.px0;
}

function startDrag(key, edge) {
  dragCtx = { key, edge, px0: geom.pxPerDay, dMin0: geom.dMin, svgLeft: geom.svgEl.getBoundingClientRect().left };
  const move = (ev) => { setEdge(key, edge, dayAtClientX(ev.clientX)); renderTimeline(); };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    dragCtx = null;
    renderTimeline();
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
    renderTimeline();
    el(`h_${key}_${edge}`)?.focus();
  });
}

// ───────────────────────── render ─────────────────────────
// position each control group over the center of its timeline region (tracks the scale)
function positionGroups(g) {
  const place = (id, dayCenter) => {
    const e = el(id);
    if (e) e.style.left = `${clamp(Math.round(g.sx(dayCenter)), 55, g.width - 55)}px`;
  };
  place("grp_pre", (state.exp.start + state.exp.end) / 2);
  place("grp_arrival", 0);
  place("grp_post", g.dMax / 2);
}

function renderTimeline() {
  geom = computeGeom();
  el("tl2").innerHTML = buildSVG(geom);
  geom.svgEl = el("tl2svg");
  attachHandle("exp", "top"); attachHandle("exp", "bot");
  for (const k of ["am", "q"]) if (state[k].on) { attachHandle(k, "top"); attachHandle(k, "bot"); }
  el("ro_exp").textContent = roText("exp");
  el("ro_am").textContent = roText("am");
  el("ro_q").textContent = roText("q");
  positionGroups(geom);
  el("tlNotes").innerHTML = buildNotes(scenarioView());
}

export function initTimeline() {
  const phi = el("r_phi");
  if (phi) state.expRisk = phi.value;

  // populate + wire the static control panel once
  const sel = el("sel_exprisk");
  sel.innerHTML = phiOptions().map((r) => `<option value="${r.v}">${esc(r.label)}</option>`).join("");
  sel.value = state.expRisk;
  sel.addEventListener("change", () => { state.expRisk = sel.value; renderTimeline(); });
  for (const k of ["test", "fever"]) el(`cb_${k}`).addEventListener("change", (e) => { state[k] = e.target.checked; renderTimeline(); });
  for (const k of ["am", "q"]) el(`cb_${k}`).addEventListener("change", (e) => { state[k].on = e.target.checked; renderTimeline(); });

  window.addEventListener("resize", renderTimeline); // re-measure width (also fired on tab show)
  renderTimeline();
}
