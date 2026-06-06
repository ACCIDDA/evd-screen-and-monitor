// main.js — dashboard wiring. All numbers come from the verified pure core
// (src/core/*), which is asserted against R fixtures. This file is just DOM + Plotly.

import Plotly from "plotly.js-dist-min";
import posteriorFile from "../data/ebola_posterior_small.json";
import kdeFile from "../data/ebola_kde_polygon.json";

import { incubationPoint } from "../core/incubation.js";
import { computeCosts } from "../core/cost.js";
import { computeRisk, riskTable, riskAxis } from "../core/risk.js";
import { baseUniforms, scaleU } from "../core/rng.js";

const POST = posteriorFile.data.columns;
const KDE = kdeFile.data;
const BASE_U = baseUniforms(POST.shape.length); // fixed seeded base sample for u

const COLORS = ["#1b9e77", "#d95f02", "#7570b3", "#0072B2", "#e7298a"];
const $ = (id) => document.getElementById(id);
const val = (id) => $(id).value;
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const NOBAR = { displayModeBar: false, responsive: true };

// ───────────────────────── Tab 1: incubation ─────────────────────────
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

// ───────────────────────── Tab 2: undetected infections ─────────────────────────
function drawRisk() {
  const t0 = performance.now();
  const phi = +val("r_phi"), ci = +val("r_ci");
  const uLo = +val("r_u_lo"), uHi = +val("r_u_hi");
  const durLo = +val("r_dur_lo"), durHi = +val("r_dur_hi");
  const durations = [];
  for (let d = durLo; d <= durHi; d++) durations.push(d);
  const u = scaleU(BASE_U, uLo, uHi);

  const res = computeRisk({ samples: POST, u, durations, phi, ci });
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
  }, NOBAR);

  const rows = riskTable(res);
  $("riskTable").innerHTML =
    "<thead><tr><th>Duration (days)</th><th>Lower</th><th>Median</th><th>Upper</th></tr></thead><tbody>" +
    rows.map((r) => `<tr><td>${r["Duration, in days"]}</td><td>${r["Lower bound"].toFixed(2)}</td>` +
      `<td>${r["Median"].toFixed(2)}</td><td>${r["Upper bound"].toFixed(2)}</td></tr>`).join("") +
    "</tbody>";
  $("riskTiming").textContent = `computed in ${(performance.now() - t0).toFixed(1)} ms (over ${POST.shape.length} posterior draws)`;
}

// ───────────────────────── Tab 3: cost ─────────────────────────
function drawCost() {
  const t0 = performance.now();
  const phis = [...document.querySelectorAll('input[name="c_phi"]:checked')].map((e) => +e.value).sort((a, b) => b - a);
  if (!phis.length) { Plotly.purge("costPlot"); $("costTiming").textContent = "select at least one φ"; return; }
  const params = {
    secondaryCases: +val("c_sec"),
    costPerCase: [+val("c_cpc_lo"), +val("c_cpc_hi")],
    costPerDay: [+val("c_cpd_lo"), +val("c_cpd_hi")],
    costFalsePos: [+val("c_fp_lo"), +val("c_fp_hi")],
    hazardDenom: +val("c_haz"),
  };
  const out = computeCosts({ samples: POST, phis, params });
  const traces = [];
  out.series.forEach((s, i) => {
    const color = COLORS[i % COLORS.length];
    traces.push({
      x: s.xs.concat([...s.xs].reverse()), y: s.lo.concat([...s.hi].reverse()),
      fill: "toself", fillcolor: hexA(color, 0.7), line: { width: 0 }, hoverinfo: "skip",
      name: s.label, legendgroup: s.label,
    });
    const o = out.optima[i];
    traces.push({
      x: [o.durDays], y: [o.minCost], mode: "markers+text", marker: { color, size: 9 },
      text: [`${Math.round(o.durDays)}d`], textposition: "top center",
      legendgroup: s.label, showlegend: false,
      hovertemplate: `φ=${s.label}<br>optimal ${Math.round(o.durDays)} d<br>$${Math.round(o.minCost).toLocaleString()}<extra></extra>`,
    });
  });
  Plotly.react("costPlot", traces, {
    title: "Model-based cost range for monitoring 100 individuals",
    xaxis: { title: "duration of active monitoring (days)", range: [5, 43] },
    yaxis: { title: "cost range (100 individuals)", type: "log", tickprefix: "$", tickformat: "," },
    legend: { x: 0.99, y: 0.99, xanchor: "right", yanchor: "top", title: { text: "Pr(symptoms)" } },
    margin: { t: 40 },
  }, NOBAR);
  $("costTiming").textContent = `computed in ${(performance.now() - t0).toFixed(1)} ms`;
}

// ───────────────────────── wiring ─────────────────────────
function syncLabels() {
  const m = {
    r_u_lo: "r_u_lo_v", r_u_hi: "r_u_hi_v", r_dur_lo: "r_dur_lo_v", r_dur_hi: "r_dur_hi_v", r_ci: "r_ci_v",
    c_sec: "c_sec_v", c_cpc_lo: "c_cpc_lo_v", c_cpc_hi: "c_cpc_hi_v", c_cpd_lo: "c_cpd_lo_v",
    c_cpd_hi: "c_cpd_hi_v", c_fp_lo: "c_fp_lo_v", c_fp_hi: "c_fp_hi_v", c_haz: "c_haz_v",
  };
  for (const [src, dst] of Object.entries(m)) if ($(dst)) $(dst).textContent = $(src).value;
}

function init() {
  // tabs
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    $("panel-" + t.dataset.tab).classList.add("active");
    window.dispatchEvent(new Event("resize"));
  }));
  // risk controls
  ["r_phi", "r_u_lo", "r_u_hi", "r_dur_lo", "r_dur_hi", "r_ci"].forEach((id) =>
    $(id).addEventListener("input", () => { syncLabels(); drawRisk(); }));
  // cost controls
  document.querySelectorAll('input[name="c_phi"]').forEach((e) => e.addEventListener("change", drawCost));
  ["c_sec", "c_cpc_lo", "c_cpc_hi", "c_cpd_lo", "c_cpd_hi", "c_fp_lo", "c_fp_hi", "c_haz"].forEach((id) =>
    $(id).addEventListener("input", () => { syncLabels(); drawCost(); }));

  $("provenance").textContent =
    `Data: ${posteriorFile.meta.object} (activeMonitr ${posteriorFile.meta.activeMonitrVersion}). ` +
    `${posteriorFile.meta.citation}`;

  syncLabels();
  drawIncubation();
  drawRisk();
  drawCost();
}

window.addEventListener("DOMContentLoaded", init);
