// main.js — simplified release. Two tabs:
//  - Results (landing): a small timeline showing the active-monitoring bar (drag its end, or
//    use ←/→) + a table of undetected symptomatic infections per 10,000, one row per profile.
//    The timeline is deliberately extensible — more interventions can be added as more bars.
//  - Traveler profiles: cards to create/edit profiles (name, exposure window, infection risk)
//    that feed the Results table.
// All numbers come from the validated core via scenario.js (undetectedForProfile).

import {
  store, clampProfile, newProfile, undetectedForProfile, PHI_LEVELS, EXP_MIN,
} from "./scenario.js";
import { META } from "./data.js";

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
  const has = store.profiles.length > 0;
  $("resultsEmpty").hidden = has;
  $("resultCards").hidden = !has;
  $("resultCards").innerHTML = !has ? "" : store.profiles.map((p) => {
    const r = undetectedForProfile(p);
    return `<div class="rcard">
      <div class="rcard-name">${esc(p.name)}</div>
      <div class="rcard-metric">
        <span class="rcard-mlabel">Undetected symptomatic infections per 10,000 monitored</span>
        <span class="rcard-mval"><strong>${r["Median"].toFixed(2)}</strong> <span class="rcard-ci">(${r["Lower bound"].toFixed(2)} – ${r["Upper bound"].toFixed(2)})</span></span>
      </div>
    </div>`;
  }).join("");
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
          <input class="p-end" type="number" min="0" max="${M}" value="${-p.expEnd}" aria-label="exposure ends, days before arrival"> d before arrival</span>
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
    const setSlider = () => { lo.value = -p.expEnd; hi.value = -p.expStart; };
    const setNums = () => { begin.value = -p.expStart; end.value = -p.expEnd; };
    const fromSlider = (e) => {
      if (+lo.value > +hi.value) { if (e.target === lo) lo.value = hi.value; else hi.value = lo.value; } // no crossing
      p.expEnd = -(+lo.value); p.expStart = -(+hi.value); // lo = end (closer to arrival), hi = begin (further back)
      clampProfile(p); setNums(); updateExpFill(row, p); renderResults();
    };
    const fromNums = () => {
      p.expStart = -(+begin.value); p.expEnd = -(+end.value);
      clampProfile(p); setSlider(); updateExpFill(row, p); renderResults();
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

// ───────────────────────── wiring ─────────────────────────
function init() {
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    $("panel-" + t.dataset.tab).classList.add("active");
    if (t.dataset.tab === "results") { renderAmTimeline(); renderResults(); }
    else renderProfiles();
  }));

  $("addProfile").addEventListener("click", () => {
    store.profiles.push(newProfile(`Profile ${store.profiles.length + 1}`, 10, 2, 0.01));
    renderProfiles(); renderResults();
  });
  window.addEventListener("resize", () => { if ($("panel-results").classList.contains("active")) renderAmTimeline(); });

  $("provenance").textContent = `Data: ${META.object} (activeMonitr ${META.activeMonitrVersion}). ${META.citation}`;
  renderProfiles();
  renderAmTimeline();
  renderResults();
}

window.addEventListener("DOMContentLoaded", init);

export { init, renderResults, renderProfiles, renderAmTimeline }; // for tests
