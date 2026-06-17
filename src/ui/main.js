// main.js — simplified release. Two tabs:
//  - Results (landing): a small timeline showing the active-monitoring bar (drag its end, or
//    use ←/→) + a table of undetected symptomatic infections per 10,000, one row per profile.
//    The timeline is deliberately extensible — more interventions can be added as more bars.
//  - Traveler profiles: cards to create/edit profiles (name, exposure window, infection risk)
//    that feed the Results table.
// All numbers come from the validated core via scenario.js (undetectedForProfile).

import {
  store, clampProfile, newProfile, undetectedForProfile, PHI_LEVELS, EXP_MIN,
  customValid, customActive, customUncertain, customDraws, customP95, phiLabel, saveStore, resetStore,
} from "./scenario.js";
import { incubationSummary, incubationPoint } from "../core/incubation.js";
import { META, POST, KDE } from "./data.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// ───────────────────────── active-monitoring timeline (landing) ─────────────────────────
const AM_DMAX = 60, TL_AXIS_Y = 18, TL_BAND_H = 18, TL_LP = 12, TL_RP = 12;

function renderAmTimeline() {
  const tl = $("amTimeline");
  if (!tl) return;
  const W = Math.max(tl.clientWidth || 0, 320) || 700;
  const plotW = W - TL_LP - TL_RP;
  const sx = (d) => TL_LP + (Math.min(Math.max(d, 0), AM_DMAX) / AM_DMAX) * plotW;
  const len = store.amLength, lenC = Math.min(len, AM_DMAX);
  const bandY = TL_AXIS_Y + 14, H = bandY + TL_BAND_H + 14;
  const p = [];
  // arrival line + label
  p.push(`<line x1="${sx(0)}" y1="4" x2="${sx(0)}" y2="${H - 2}" stroke="#4F758B" stroke-width="1.5"/>`);
  p.push(`<text x="${sx(0)}" y="11" font-size="10.5" text-anchor="start" font-weight="600" fill="#24224C">arrival</text>`);
  // axis + day ticks/gridlines
  p.push(`<line x1="${sx(0)}" y1="${TL_AXIS_Y}" x2="${sx(AM_DMAX)}" y2="${TL_AXIS_Y}" stroke="#8a9bac" stroke-width="1.5"/>`);
  for (let d = 10; d <= AM_DMAX; d += 10) {
    const x = sx(d);
    p.push(`<line x1="${x}" y1="${TL_AXIS_Y}" x2="${x}" y2="${H - 2}" stroke="#e6eef4"/>`);
    p.push(`<line x1="${x}" y1="${TL_AXIS_Y}" x2="${x}" y2="${TL_AXIS_Y + 3}" stroke="#8a9bac"/>`);
    p.push(`<text x="${x}" y="11" font-size="10" text-anchor="middle" fill="#4F758B">${d}</text>`);
  }
  // active-monitoring bar
  p.push(`<rect x="${sx(0)}" y="${bandY}" width="${Math.max(sx(lenC) - sx(0), 1)}" height="${TL_BAND_H}" rx="4" fill="#065D89" fill-opacity="0.85"/>`);
  p.push(`<text x="${sx(0) + 6}" y="${bandY + TL_BAND_H / 2 + 4}" font-size="11" fill="#fff">active monitoring</text>`);
  // draggable end handle
  p.push(`<g id="amHandle" data-grip tabindex="0" role="slider" aria-label="Active-monitoring length in days" ` +
    `aria-valuemin="0" aria-valuemax="${AM_DMAX}" aria-valuenow="${len}" transform="translate(${sx(lenC)},0)">` +
    `<rect x="-7" y="${bandY - 4}" width="14" height="${TL_BAND_H + 8}" fill="transparent"/>` +
    `<line class="amtl-grip" x1="0" y1="${bandY - 3}" x2="0" y2="${bandY + TL_BAND_H + 3}" stroke="#24224C" stroke-width="2"/></g>`);
  tl.innerHTML = `<svg class="amtl-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" ` +
    `aria-label="Active monitoring ${len} days from arrival">${p.join("")}</svg>`;
  attachAmHandle(plotW, tl);
}

function attachAmHandle(plotW, tl) {
  const h = $("amHandle");
  if (!h) return;
  h.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const x0 = tl.querySelector("svg").getBoundingClientRect().left;
    const move = (ev) => setLen(Math.round(((ev.clientX - x0 - TL_LP) / plotW) * AM_DMAX));
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
  h.addEventListener("keydown", (e) => {
    let d = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") d = -1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") d = 1;
    else return;
    e.preventDefault(); setLen(store.amLength + d); $("amHandle")?.focus();
  });
}

function setLen(v) {
  store.amLength = Math.max(0, Math.min(Math.round(v), AM_DMAX));
  renderAmTimeline();
  renderResults();
}

// ───────────────────────── Result cards (landing) ─────────────────────────
// One wide, single-column card per profile (room to add more result info later).
function renderResults() {
  $("am_len_v").textContent = store.amLength;
  const cust = customActive();
  $("customNote").hidden = !cust;
  if (cust) {
    $("customNote").innerHTML = customUncertain()
      ? `Using a <strong>custom incubation period</strong> with propagated uncertainty — intervals are credible intervals over the specified 95% ranges.`
      : `Using a <strong>custom incubation period</strong> (point estimate) — the interval reflects only exposure-timing spread, not parameter uncertainty.`;
  }
  const has = store.profiles.length > 0;
  $("resultsEmpty").hidden = has;
  $("resultCards").hidden = !has;
  $("resultCards").innerHTML = !has ? "" : store.profiles.map((p) => {
    const r = undetectedForProfile(p);
    const begin = -p.expStart, end = -p.expEnd; // days before arrival (begin >= end)
    const len = begin - end;                    // length of the exposure window, days
    return `<div class="rcard">
      <div class="rcard-left">
        <div class="rcard-name">${esc(p.name)}</div>
        <div class="rcard-sub">Exposure length <strong>${len}</strong> d (${begin}–${end} d before arrival)<br>
          infection risk <strong>${phiLabel(p.phi)}</strong></div>
      </div>
      <div class="rcard-metric">
        <span class="rcard-mval"><strong>${r["Median"].toFixed(2)}</strong> <span class="rcard-ci">(${r["Lower bound"].toFixed(2)} – ${r["Upper bound"].toFixed(2)})</span></span>
        <span class="rcard-mlabel">Undetected symptomatic infections<br>per 10,000 monitored</span>
      </div>
    </div>`;
  }).join("");
  saveStore(); // persist after every state change (renderResults is the universal post-change hook)
}

// ───────────────────────── Traveler-profile cards ─────────────────────────
const phiOpts = (sel) =>
  PHI_LEVELS.map((o) => `<option value="${o.v}"${o.v === Number(sel) ? " selected" : ""}>${o.label}</option>`).join("");

// fill for a profile's two-anchor exposure slider. 0 (arrival) is on the RIGHT, so a value
// v (days before arrival) sits at (1 - v/max) from the left edge.
function updateExpFill(row, p) {
  const max = +row.querySelector(".dr2-lo").max;
  const begin = -p.expStart, end = -p.expEnd; // days before arrival; begin >= end
  const fill = row.querySelector(".dr2-fill");
  fill.style.left = `${(1 - begin / max) * 100}%`;
  fill.style.width = `${((begin - end) / max) * 100}%`;
}

function renderProfiles() {
  const M = -EXP_MIN; // slider max = days-before-arrival range
  $("profileList").innerHTML = store.profiles.map((p) => `
    <div class="prow" data-id="${p.id}">
      <input class="p-name" type="text" value="${esc(p.name)}" aria-label="Profile name">
      <div class="p-exp">
        <span class="p-exp-nums">exposed
          <input class="p-begin" type="number" min="0" max="${M}" value="${-p.expStart}" aria-label="exposure begins, days before arrival"> to
          <input class="p-end" type="number" min="0" max="${M}" value="${-p.expEnd}" aria-label="exposure ends, days before arrival"> d before arrival
          <span class="p-exp-len">(<strong class="p-exp-len-v">${-p.expStart + p.expEnd}</strong> d long)</span></span>
        <div class="dr2">
          <span class="dr2-track"></span><span class="dr2-fill"></span>
          <input class="dr2-lo" type="range" min="0" max="${M}" value="${-p.expEnd}" aria-label="exposure ends, days before arrival">
          <input class="dr2-hi" type="range" min="0" max="${M}" value="${-p.expStart}" aria-label="exposure begins, days before arrival">
        </div>
      </div>
      <label class="p-risk">infection risk <select class="p-phi">${phiOpts(p.phi)}</select></label>
      <button class="p-del" type="button" title="Remove profile" aria-label="Remove profile">✕</button>
    </div>`).join("");

  $("profileList").querySelectorAll(".prow").forEach((row) => {
    const p = store.profiles.find((x) => x.id === +row.dataset.id);
    const lo = row.querySelector(".dr2-lo"), hi = row.querySelector(".dr2-hi");
    const begin = row.querySelector(".p-begin"), end = row.querySelector(".p-end");
    const lenV = row.querySelector(".p-exp-len-v");
    const setSlider = () => { lo.value = -p.expEnd; hi.value = -p.expStart; };
    const setNums = () => { begin.value = -p.expStart; end.value = -p.expEnd; };
    const setLen = () => { lenV.textContent = -p.expStart + p.expEnd; }; // window length, days
    const fromSlider = (e) => {
      if (+lo.value > +hi.value) { if (e.target === lo) lo.value = hi.value; else hi.value = lo.value; } // no crossing
      p.expEnd = -(+lo.value); p.expStart = -(+hi.value); // lo = end (closer to arrival), hi = begin (further back)
      clampProfile(p); setNums(); setLen(); updateExpFill(row, p); renderResults();
    };
    const fromNums = () => {
      p.expStart = -(+begin.value); p.expEnd = -(+end.value);
      clampProfile(p); setSlider(); setLen(); updateExpFill(row, p); renderResults();
    };
    lo.addEventListener("input", fromSlider);
    hi.addEventListener("input", fromSlider);
    begin.addEventListener("input", fromNums);
    end.addEventListener("input", fromNums);
    begin.addEventListener("change", setNums); // snap to clamped values on blur
    end.addEventListener("change", setNums);
    row.querySelector(".p-name").addEventListener("input", (e) => { p.name = e.target.value; renderResults(); });
    row.querySelector(".p-phi").addEventListener("change", (e) => { p.phi = +e.target.value; renderResults(); });
    row.querySelector(".p-del").addEventListener("click", () => {
      store.profiles = store.profiles.filter((x) => x.id !== p.id);
      renderProfiles(); renderResults();
    });
    updateExpFill(row, p);
  });
}

// ───────────────────────── Disease parameters ─────────────────────────
function renderIncubTable() {
  const el = $("incubTable");
  if (!el || el.dataset.rendered) return; // posterior is fixed — render once
  const s = incubationSummary(POST);
  const ciPct = Math.round(s.ci * 100);
  const rows = [
    ["Median incubation period", s.median, "days"],
    ["95th percentile of incubation", s.p95, "days"],
    ["Gamma shape", s.shape, ""],
    ["Gamma scale", s.scale, ""],
  ];
  const cell = (r, u) =>
    `<strong>${r.point.toFixed(2)}</strong>${u ? " " + u : ""} ` +
    `<span class="dparam-ci">(${ciPct}% CrI ${r.lower.toFixed(2)}–${r.upper.toFixed(2)})</span>`;
  el.innerHTML = `<table class="dparam-table"><tbody>${
    rows.map(([label, r, u]) =>
      `<tr><th scope="row">${label}</th><td>${cell(r, u)}</td></tr>`).join("")
  }</tbody></table>`;
  el.dataset.rendered = "1";
}

// Incubation figure: x = median, y = 95th-percentile incubation (days). Filled KDE
// credible region + default point; custom point overlaid when enabled. Hand-drawn SVG
// (no Plotly) to match the simplified release.
const FIG = { L: 50, R: 14, T: 12, B: 36, PAD: 0.06 };
const DEF_PT = incubationPoint(POST);
const niceTicks = (lo, hi, n = 4) => {
  const step = (hi - lo) / n, out = [];
  for (let i = 0; i <= n; i++) out.push(lo + i * step);
  return out;
};

function renderIncubFigure() {
  const host = $("incubPlot");
  if (!host) return;
  const W = Math.max(host.clientWidth || 0, 320) || 560, H = 300;
  const allX = KDE.polygons.flatMap((p) => p.x).concat(DEF_PT.median);
  const allY = KDE.polygons.flatMap((p) => p.y).concat(DEF_PT.p95);
  const cust = customActive() ? { median: store.custom.median, p95: customP95() } : null;
  const draws = customDraws(); // {median:[], p95:[]} when propagating uncertainty, else null
  if (cust) { allX.push(cust.median); allY.push(cust.p95); }
  if (draws) { allX.push(...draws.median); allY.push(...draws.p95); }
  const ext = (arr) => {
    let lo = Math.min(...arr), hi = Math.max(...arr), pad = (hi - lo) * FIG.PAD || 1;
    return [lo - pad, hi + pad];
  };
  const [x0, x1] = ext(allX), [y0, y1] = ext(allY);
  const px = (x) => FIG.L + ((x - x0) / (x1 - x0)) * (W - FIG.L - FIG.R);
  const py = (y) => H - FIG.B - ((y - y0) / (y1 - y0)) * (H - FIG.T - FIG.B);
  const s = [];
  // axes
  s.push(`<line x1="${FIG.L}" y1="${FIG.T}" x2="${FIG.L}" y2="${H - FIG.B}" stroke="#8a9bac"/>`);
  s.push(`<line x1="${FIG.L}" y1="${H - FIG.B}" x2="${W - FIG.R}" y2="${H - FIG.B}" stroke="#8a9bac"/>`);
  // gridlines + ticks
  for (const t of niceTicks(x0, x1)) {
    const x = px(t);
    s.push(`<line x1="${x}" y1="${FIG.T}" x2="${x}" y2="${H - FIG.B}" stroke="#e6eef4"/>`);
    s.push(`<text x="${x}" y="${H - FIG.B + 14}" font-size="10" text-anchor="middle" fill="#4F758B">${t.toFixed(1)}</text>`);
  }
  for (const t of niceTicks(y0, y1)) {
    const y = py(t);
    s.push(`<line x1="${FIG.L}" y1="${y}" x2="${W - FIG.R}" y2="${y}" stroke="#e6eef4"/>`);
    s.push(`<text x="${FIG.L - 6}" y="${y + 3}" font-size="10" text-anchor="end" fill="#4F758B">${t.toFixed(1)}</text>`);
  }
  // axis titles
  s.push(`<text x="${(FIG.L + W - FIG.R) / 2}" y="${H - 4}" font-size="11" text-anchor="middle" fill="#24224C">median incubation (days)</text>`);
  s.push(`<text transform="translate(12,${(FIG.T + H - FIG.B) / 2}) rotate(-90)" font-size="11" text-anchor="middle" fill="#24224C">95th percentile (days)</text>`);
  // KDE credible region
  for (const poly of KDE.polygons) {
    const pts = poly.x.map((x, i) => `${px(x).toFixed(1)},${py(poly.y[i]).toFixed(1)}`).join(" ");
    s.push(`<polygon points="${pts}" fill="#065D89" fill-opacity="0.18" stroke="#065D89" stroke-width="1.5"/>`);
  }
  // custom draw cloud (propagated uncertainty) — faint dots, subsampled for perf
  if (draws) {
    const step = Math.max(1, Math.ceil(draws.median.length / 600));
    for (let i = 0; i < draws.median.length; i += step) {
      s.push(`<circle cx="${px(draws.median[i]).toFixed(1)}" cy="${py(draws.p95[i]).toFixed(1)}" r="1.3" fill="#b10026" fill-opacity="0.12"/>`);
    }
  }
  // default point
  s.push(`<circle cx="${px(DEF_PT.median)}" cy="${py(DEF_PT.p95)}" r="5" fill="#065D89"/>`);
  // custom point
  if (cust) {
    s.push(`<line x1="${px(cust.median) - 7}" y1="${py(cust.p95)}" x2="${px(cust.median) + 7}" y2="${py(cust.p95)}" stroke="#b10026" stroke-width="2"/>`);
    s.push(`<line x1="${px(cust.median)}" y1="${py(cust.p95) - 7}" x2="${px(cust.median)}" y2="${py(cust.p95) + 7}" stroke="#b10026" stroke-width="2"/>`);
  }
  // legend
  let ly = FIG.T + 6;
  const legend = [["#065D89", "Default (Bayesian) estimate"]];
  if (cust) legend.push(["#b10026", draws ? "Custom estimate (draws)" : "Custom estimate"]);
  for (const [c, label] of legend) {
    s.push(`<circle cx="${W - FIG.R - 150}" cy="${ly}" r="4" fill="${c}"/>`);
    s.push(`<text x="${W - FIG.R - 142}" y="${ly + 3}" font-size="10.5" fill="#24224C">${label}</text>`);
    ly += 16;
  }
  host.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Incubation period: 95th percentile versus median, days">${s.join("")}</svg>`;
}

function renderDisease() {
  renderIncubTable();
  renderIncubFigure();
}

const RANGE_IDS = ["customMedianLo", "customMedianHi", "customRatioLo", "customRatioHi"];

// grey out (rather than hide) a block + disable its inputs
function setBlockEnabled(block, ids, on) {
  if (on) block.classList.remove("is-off"); else block.classList.add("is-off");
  ids.forEach((id) => { $(id).disabled = !on; });
}

// push the current store.custom state INTO the disease-tab controls (inputs, checkboxes,
// derived readout, enabled/greyed state). Used on init and after Restore defaults.
function syncCustomUI() {
  $("customIncubChk").checked = store.custom.enabled;       // checkbox reflects persisted state
  $("customUncertainChk").checked = store.custom.uncertain;
  $("customMedian").value = store.custom.median;
  $("customRatio").value = store.custom.ratio;
  $("customMedianLo").value = store.custom.medianLo;
  $("customMedianHi").value = store.custom.medianHi;
  $("customRatioLo").value = store.custom.ratioLo;
  $("customRatioHi").value = store.custom.ratioHi;
  const p95 = customP95();
  $("customP95Derived").textContent = Number.isFinite(p95) ? p95.toFixed(1) : "—";
  setBlockEnabled($("customIncubFields"), ["customMedian", "customRatio", "customUncertainChk"], store.custom.enabled);
  setBlockEnabled($("customRangeFields"), RANGE_IDS, store.custom.enabled && store.custom.uncertain);
  $("customIncubErr").hidden = !(store.custom.enabled && !customValid());
}

// read the disease-tab controls INTO store.custom (on user interaction)
function syncCustomIncub() {
  const customOn = $("customIncubChk").checked;
  const uncOn = $("customUncertainChk").checked;
  store.custom.enabled = customOn;
  store.custom.uncertain = uncOn;
  setBlockEnabled($("customIncubFields"), ["customMedian", "customRatio", "customUncertainChk"], customOn);
  setBlockEnabled($("customRangeFields"), RANGE_IDS, customOn && uncOn);
  // derived 95th percentile (median × ratio) — shown in days for interpretation
  const p95 = customP95();
  $("customP95Derived").textContent = Number.isFinite(p95) ? p95.toFixed(1) : "—";
  $("customIncubErr").hidden = !(customOn && !customValid());
  renderIncubFigure();
  renderResults();
}

// ───────────────────────── wiring ─────────────────────────
function init() {
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    $("panel-" + t.dataset.tab).classList.add("active");
    if (t.dataset.tab === "results") { renderAmTimeline(); renderResults(); }
    else if (t.dataset.tab === "disease") renderDisease();
    else renderProfiles();
  }));

  $("addProfile").addEventListener("click", () => {
    store.profiles.push(newProfile(`Profile ${store.profiles.length + 1}`, 10, 2, 0.01));
    renderProfiles(); renderResults();
  });

  $("restoreDefaults").addEventListener("click", () => {
    if (!confirm("Restore the default traveler profiles, monitoring length, and incubation settings? Your current scenario will be replaced.")) return;
    resetStore();
    syncCustomUI();
    renderProfiles(); renderAmTimeline(); renderResults(); renderIncubFigure();
  });

  // custom incubation period controls — populate from the (possibly restored) store
  syncCustomUI();
  $("customIncubChk").addEventListener("change", syncCustomIncub);
  $("customUncertainChk").addEventListener("change", syncCustomIncub);
  const bindNum = (id, key) => $(id).addEventListener("input", (e) => { store.custom[key] = parseFloat(e.target.value); syncCustomIncub(); });
  bindNum("customMedianLo", "medianLo"); bindNum("customMedianHi", "medianHi");
  bindNum("customRatioLo", "ratioLo"); bindNum("customRatioHi", "ratioHi");
  // editing a central value rescales its 95% range proportionally (keeps the relative width)
  const rnd = (x, d) => { const p = 10 ** d; return Math.round(x * p) / p; };
  const bindCentral = (id, key, loK, hiK, loId, hiId, dp) => $(id).addEventListener("input", (e) => {
    const old = store.custom[key], next = parseFloat(e.target.value);
    if (Number.isFinite(old) && old > 0 && Number.isFinite(next) && next > 0) {
      const f = next / old;
      store.custom[loK] = $(loId).value = rnd(store.custom[loK] * f, dp);
      store.custom[hiK] = $(hiId).value = rnd(store.custom[hiK] * f, dp);
    }
    store.custom[key] = next;
    syncCustomIncub();
  });
  bindCentral("customMedian", "median", "medianLo", "medianHi", "customMedianLo", "customMedianHi", 1);
  bindCentral("customRatio", "ratio", "ratioLo", "ratioHi", "customRatioLo", "customRatioHi", 2);
  window.addEventListener("resize", () => {
    if ($("panel-results").classList.contains("active")) renderAmTimeline();
    if ($("panel-disease").classList.contains("active")) renderIncubFigure();
  });

  const doiMatch = META.citation.match(/doi:(\S+)/i);
  if (doiMatch) {
    const doi = doiMatch[1];
    const linked = META.citation.replace(
      doiMatch[0],
      `<a href="https://doi.org/${doi}" target="_blank" rel="noopener">doi:${doi}</a>`
    );
    $("provenance").innerHTML = `Data and methods from ${linked}`;
  } else {
    $("provenance").textContent = `Data and methods from ${META.citation}`;
  }
  renderProfiles();
  renderAmTimeline();
  renderResults();
}

window.addEventListener("DOMContentLoaded", init);

export { init, renderResults, renderProfiles, renderAmTimeline }; // for tests
