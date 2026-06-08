// main.js — dashboard wiring. All numbers come from the verified pure core (src/core/*),
// asserted against R fixtures. This file is DOM + Plotly only.
//
// The Undetected-infections tab is LINKED two-way to the intervention timeline via the
// shared scenario store (scenario.js): φ, the exposure window (→ u bounds) and the active-
// monitoring duration (= the curve's max duration) are shared. Its sliders are VIEWS of the
// store, written via plain .value (no input event) so there are no sync loops.

import Plotly from "plotly.js-dist-min";
import { incubationPoint } from "../core/incubation.js";
import { computeCosts } from "../core/cost.js";
import { computeRisk, riskTable, riskAxis } from "../core/risk.js";
import { scaleU } from "../core/rng.js";
import { POST, KDE, BASE_U, META } from "./data.js";
import { scenario, notify, subscribe, uBounds, amDuration } from "./scenario.js";
import { initTimeline } from "./timeline.js";

const COLORS = ["#1b9e77", "#d95f02", "#7570b3", "#0072B2", "#e7298a"];
const $ = (id) => document.getElementById(id);
const val = (id) => $(id).value;
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const NOBAR = { displayModeBar: false, responsive: true };
const panelActive = (id) => $("panel-" + id).classList.contains("active");

// ───────────────────────── Tab: incubation ─────────────────────────
function drawIncubation() {
  const pt = incubationPoint(POST);
  const traces = KDE.polygons.map((poly, i) => ({
    x: poly.x, y: poly.y, fill: "toself", fillcolor: hexA(COLORS[0], 0.25),
    line: { color: COLORS[0], width: 1.5 }, mode: "lines", hoverinfo: "skip",
    name: "KDE credible region", showlegend: i === 0,
  }));
  traces.push({
    x: [pt.median], y: [pt.p95], mode: "markers", marker: { color: COLORS[0], size: 11 },
    name: "Ebola point estimate",
    hovertemplate: `median ${pt.median.toFixed(2)} d<br>95th pct ${pt.p95.toFixed(2)} d<extra></extra>`,
  });
  Plotly.react("incubPlot", traces, {
    xaxis: { title: "median incubation period (days)" },
    yaxis: { title: "95th-percentile incubation period (days)" },
    legend: { x: 0.99, y: 0.01, xanchor: "right", yanchor: "bottom" },
    margin: { t: 20 },
  }, NOBAR);
  $("incubReadout").textContent =
    `median = ${pt.median.toFixed(2)} days · 95th percentile = ${pt.p95.toFixed(2)} days`;
}

// ───────────────────────── Tab: undetected infections (linked to the timeline) ─────────────────────────
function renderRisk() {
  const t0 = performance.now();
  const { uLo, uHi } = uBounds();
  const dHi = amDuration();                 // curve max = active-monitoring duration
  // reflect the store into the linked controls (plain .value => no input event => no loop)
  $("r_phi").value = String(scenario.expRisk);
  $("r_u_lo").value = uLo; $("r_u_hi").value = uHi;
  $("r_dur_hi").value = dHi;
  if (+val("r_dur_lo") > dHi) $("r_dur_lo").value = Math.max(0, dHi);
  $("r_ci").value = scenario.ci;
  $("r_redux").value = scenario.am.reduction;
  syncLabels();

  const phi = scenario.expRisk, ci = scenario.ci;
  const durLo = Math.max(0, Math.min(+val("r_dur_lo"), dHi));
  const durations = [];
  for (let d = durLo; d <= dHi; d++) durations.push(d);
  const u = scaleU(BASE_U, uLo, uHi);
  const res = computeRisk({ samples: POST, u, durations, phi, ci });

  // gate: when active monitoring isn't implemented, lock + grey the rest of the page
  const on = scenario.am.on;
  $("r_am_on").checked = on;
  $("riskBody").classList.toggle("locked", !on);
  ["r_phi", "r_u_lo", "r_u_hi", "r_dur_lo", "r_dur_hi", "r_ci", "r_redux",
   "c_sec", "c_cpc_lo", "c_cpc_hi", "c_cpd_lo", "c_cpd_hi", "c_fp_lo", "c_fp_hi", "c_haz"].forEach((id) => { $(id).disabled = !on; });
  $("riskBanner").innerHTML = on ? "" :
    `<p class="banner">Active monitoring is not implemented — these settings are locked. Check “Implement active monitoring” (here or on the timeline) to edit. Figures below are illustrative.</p>`;

  // table: bold the max-duration row (the value surfaced on the timeline)
  const rows = riskTable(res);
  $("riskTable").innerHTML =
    "<thead><tr><th>Duration (days)</th><th>Lower</th><th>Median</th><th>Upper</th></tr></thead><tbody>" +
    rows.map((r) => {
      const isMax = r["Duration, in days"] === dHi;
      const med = r["Median"].toFixed(2);
      return `<tr${isMax ? ' class="tl-maxdur"' : ""}><td>${r["Duration, in days"]}</td><td>${r["Lower bound"].toFixed(2)}</td>` +
        `<td>${isMax ? `<strong>${med}</strong>` : med}</td><td>${r["Upper bound"].toFixed(2)}</td></tr>`;
    }).join("") + "</tbody>";

  if (panelActive("risk")) drawRiskPlot(res, ci, dHi);
  $("riskTiming").textContent = `computed in ${(performance.now() - t0).toFixed(1)} ms (over ${POST.shape.length} posterior draws)`;
}

function drawRiskPlot(res, ci, dHi) {
  const xs = res.rows.map((r) => r.d), col = COLORS[3];
  const ax = riskAxis(res);
  Plotly.react("riskPlot", [
    {
      x: xs.concat([...xs].reverse()),
      y: res.rows.map((r) => r.ltp).concat([...res.rows].reverse().map((r) => r.utp)),
      fill: "toself", fillcolor: hexA(col, 0.2), line: { width: 0 }, hoverinfo: "skip", showlegend: false,
    },
    { x: xs, y: res.rows.map((r) => r.p50), mode: "lines", line: { color: col, width: 2 },
      name: "median", hovertemplate: "%{x} d<br>%{y:.2e}<extra></extra>" },
  ], {
    title: `${res.label} symptomatic · ${Math.round(ci * 100)}% CI`,
    xaxis: { title: "duration of active monitoring (days)" },
    yaxis: {
      title: "Pr(symptoms after active monitoring)", type: "log",
      tickvals: ax.breaks, ticktext: ax.labels, range: [Math.log10(ax.pMin), Math.log10(ax.pMax)],
    },
    margin: { t: 40 }, showlegend: false,
    shapes: [{ type: "line", x0: dHi, x1: dHi, yref: "paper", y0: 0, y1: 1, line: { color: "#999", width: 1, dash: "dot" } }],
    annotations: [{ x: dHi, yref: "paper", y: 1, yanchor: "bottom", text: "monitoring ends", showarrow: false, font: { size: 10, color: "#999" } }],
  }, NOBAR);
}

// ───────────────────────── Cost (same tab; shares φ via the store) ─────────────────────────
// Uses the single shared φ (scenario.expRisk), so the cost figure stays consistent with the
// undetected figure; the duration the AM bar ends at is marked, as on the undetected plot.
function renderCost() {
  if (!panelActive("risk")) return; // hidden -> skip Plotly; redrawn on tab show
  const t0 = performance.now();
  const params = {
    secondaryCases: +val("c_sec"),
    costPerCase: [+val("c_cpc_lo"), +val("c_cpc_hi")],
    costPerDay: [+val("c_cpd_lo"), +val("c_cpd_hi")],
    costFalsePos: [+val("c_fp_lo"), +val("c_fp_hi")],
    hazardDenom: +val("c_haz"),
  };
  const out = computeCosts({ samples: POST, phis: [scenario.expRisk], params });
  const dHi = amDuration(), s = out.series[0], o = out.optima[0], color = COLORS[2];
  // y-axis: always floor at $1,000, ticks every decade up to the next power of 10 above the data
  const yTop = Math.max(4, Math.ceil(Math.log10(Math.max(...s.hi))));
  Plotly.react("costPlot", [
    { x: s.xs.concat([...s.xs].reverse()), y: s.lo.concat([...s.hi].reverse()),
      fill: "toself", fillcolor: hexA(color, 0.45), line: { width: 0 }, hoverinfo: "skip", showlegend: false },
    { x: [o.durDays], y: [o.minCost], mode: "markers+text", marker: { color, size: 9 },
      text: [`opt ${Math.round(o.durDays)}d`], textposition: "top center", showlegend: false,
      hovertemplate: `optimal ${Math.round(o.durDays)} d<br>$${Math.round(o.minCost).toLocaleString()}<extra></extra>` },
  ], {
    title: `Cost per 100 monitored · ${s.label} symptomatic`,
    xaxis: { title: "duration of active monitoring (days)", range: [5, Math.max(43, dHi + 3)] },
    yaxis: { title: "cost range (100 individuals)", type: "log", range: [3, yTop], dtick: 1, tickprefix: "$", tickformat: "," },
    margin: { t: 40 }, showlegend: false,
    shapes: [{ type: "line", x0: dHi, x1: dHi, yref: "paper", y0: 0, y1: 1, line: { color: "#999", width: 1, dash: "dot" } }],
    annotations: [{ x: dHi, yref: "paper", y: 1, yanchor: "bottom", text: "monitoring ends", showarrow: false, font: { size: 10, color: "#999" } }],
  }, NOBAR);
  $("costTiming").textContent = `computed in ${(performance.now() - t0).toFixed(1)} ms`;
}

// ───────────────────────── wiring ─────────────────────────
function syncLabels() {
  const m = {
    r_u_lo: "r_u_lo_v", r_u_hi: "r_u_hi_v", r_dur_lo: "r_dur_lo_v", r_dur_hi: "r_dur_hi_v", r_ci: "r_ci_v", r_redux: "r_redux_v",
    c_sec: "c_sec_v", c_cpc_lo: "c_cpc_lo_v", c_cpc_hi: "c_cpc_hi_v", c_cpd_lo: "c_cpd_lo_v",
    c_cpd_hi: "c_cpd_hi_v", c_fp_lo: "c_fp_lo_v", c_fp_hi: "c_fp_hi_v", c_haz: "c_haz_v",
  };
  for (const [src, dst] of Object.entries(m)) if ($(dst)) $(dst).textContent = $(src).value;
}

function drawForTab(name) {
  if (name === "incub") drawIncubation();
  else if (name === "risk") { renderRisk(); renderCost(); }
}

function init() {
  // tabs
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    $("panel-" + t.dataset.tab).classList.add("active");
    drawForTab(t.dataset.tab);           // (re)draw now that the panel has real width
    window.dispatchEvent(new Event("resize"));
  }));

  // risk controls — write the shared store, then notify (sliders/select are views)
  $("r_am_on").addEventListener("change", () => { scenario.am.on = $("r_am_on").checked; notify("risk"); });
  $("r_phi").addEventListener("change", () => { scenario.expRisk = +val("r_phi"); notify("risk"); });
  $("r_u_lo").addEventListener("input", () => { scenario.exp.end = scenario.am.start - +val("r_u_lo"); notify("risk"); });
  $("r_u_hi").addEventListener("input", () => { scenario.exp.start = scenario.am.start - +val("r_u_hi"); notify("risk"); });
  $("r_dur_hi").addEventListener("input", () => { scenario.am.end = scenario.am.start + +val("r_dur_hi"); notify("risk"); });
  $("r_dur_lo").addEventListener("input", () => { syncLabels(); renderRisk(); }); // curve view-window (tab-local)
  $("r_ci").addEventListener("input", () => { scenario.ci = +val("r_ci"); notify("risk"); });
  $("r_redux").addEventListener("input", () => { scenario.am.reduction = +val("r_redux"); notify("risk"); }); // parameter only

  // cost controls — cost-specific params only (φ is shared via the store); redraw the cost figure
  ["c_sec", "c_cpc_lo", "c_cpc_hi", "c_cpd_lo", "c_cpd_hi", "c_fp_lo", "c_fp_hi", "c_haz"].forEach((id) =>
    $(id).addEventListener("input", () => { syncLabels(); renderCost(); }));

  $("provenance").textContent =
    `Data: ${META.object} (activeMonitr ${META.activeMonitrVersion}). ${META.citation}`;

  subscribe(renderRisk);                 // undetected figure — in sync with the timeline
  subscribe(renderCost);                 // cost figure — shares φ via the store
  syncLabels();
  drawIncubation();
  initTimeline();                        // landing tab; also triggers the first renderRisk via the store
  renderRisk();
  renderCost();
}

window.addEventListener("DOMContentLoaded", init);
