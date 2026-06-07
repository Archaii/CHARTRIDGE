// cartridges/genreWarp.js — GENRE WARP (Cartridge 03).
//
// A single radial stacked-area "disc" (redesign spec §4):
//   • angle  = Year (1995 at top, clockwise to 2017 — one revolution)
//   • radius = total_sales, stacked by genre family (sqrt scale so
//              area ∝ value, countering radial outer-band exaggeration)
//   • labeled concentric rings state the sales scale (no guessing)
//   • center hub shows the active region + its total (no pie)
//
// Focus mode: click a band → it brightens, the rest fade, and a linear
// inset line chart of that family over time appears in the side panel
// (radial gestalt + linear precision together). Region toggle redraws;
// the year playhead drops a spoke at the current year.
import "./genreWarp.css";
import {
  select,
  pointer,
  scaleLinear,
  scaleSqrt,
  stack as d3stack,
  areaRadial,
  curveCardinal,
  line as d3line,
  area as d3area,
  axisBottom,
  axisLeft,
  easeLinear,
  max as d3max,
  sum as d3sum,
  format,
} from "d3";
import { GENRES, genreColor } from "../ui/palette.js";
import { PLAYHEAD_MS } from "../store.js";
import { createLegend } from "../ui/legend.js";
import { tooltip } from "../ui/tooltip.js";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ARC_FRACTION = 0.92; // leave a gap at the top between 2017 and 1995
const TAU = Math.PI * 2;
const fmtInt = format(",");
const fmtSales = (v) => `${v.toFixed(v < 10 ? 1 : 0)}M`;
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

export function createGenreWarp({ mountEl, data, store, shell }) {
  const gyr = data.genreYearRegion;
  const years = gyr.years;
  const yearMin = years[0];
  const yearMax = years[years.length - 1];

  // angle scale: year → radians, 0 = top, clockwise (d3 radial convention)
  const angle = scaleLinear().domain([yearMin, yearMax]).range([0, TAU * ARC_FRACTION]);

  let discWrap, sideEl, svg, gRings, gCdBg, gBands, gSpoke, gYearLabels, gHub, legend, insetEl;
  let cx, cy, innerR, outerR, radius;
  let ro = null;
  let unsub = null;
  let resizeRaf = 0;
  let prev = {};

  // Roll the raw-genre table into genre totals per year for a region.
  function perYearFor(region) {
    return years.map((y) => {
      const cell = gyr.table[region]?.[y] || {};
      const o = { year: y };
      for (const g of GENRES) {
        o[g] = cell[g] || 0;
      }
      return o;
    });
  }

  // ---------- DOM ----------
  function buildDom() {
    mountEl.innerHTML = `
      <div class="screen__view gw">
        <div class="gw__main">
          <div class="gw__head">
            <span class="gw__title">GENRE WARP · THE DISC</span>
          </div>
          <div class="gw__discwrap"></div>
        </div>
        <aside class="gw__side" aria-label="Genre focus panel">
          <span class="gw__legend"></span>
          <p class="gw__note">Rings = cumulative sales (√ scale). Angle = year, 1995 at top → clockwise.</p>
          <div class="gw__inset"></div>
        </aside>
      </div>`;
    discWrap = mountEl.querySelector(".gw__discwrap");
    sideEl = mountEl.querySelector(".gw__side");
    insetEl = mountEl.querySelector(".gw__inset");
    legend = createLegend({ mountEl: mountEl.querySelector(".gw__legend"), store });

    svg = select(discWrap)
      .append("svg")
      .attr("role", "img")
      .attr(
        "aria-label",
        "Radial stacked-area disc: angle is year (1995 at top, clockwise), radius is sales stacked by genre family."
      );
    
    svg.append("defs").attr("class", "gw-defs");

    const g = svg.append("g").attr("class", "gw-root");
    gRings = g.append("g").attr("class", "gw-rings");
    gCdBg = g.append("g").attr("class", "gw-cd-bg");
    gBands = g.append("g").attr("class", "gw-bands");
    gSpoke = g.append("g").attr("class", "gw-spoke-g");
    gYearLabels = g.append("g").attr("class", "gw-yearlabels");
    gHub = g.append("g").attr("class", "gw-hub-g");

    select(discWrap).append("div").attr("class", "gw__disc-overlay");
  }

  // ---------- layout ----------
  function layout() {
    const w = discWrap.clientWidth || 480;
    const h = discWrap.clientHeight || 420;
    svg.attr("width", w).attr("height", h);
    cx = w / 2;
    cy = h / 2;
    outerR = Math.min(w, h) / 2 - 30;
    innerR = Math.max(26, outerR * 0.16);
    svg.select(".gw-root").attr("transform", `translate(${cx},${cy})`);
    radius = scaleSqrt().range([innerR, outerR]);

    const overlay = discWrap.querySelector(".gw__disc-overlay");
    if (overlay) {
      overlay.style.width = `${outerR * 2}px`;
      overlay.style.height = `${outerR * 2}px`;
      overlay.style.display = "block";
    }
  }

  // ---------- disc ----------
  function renderDisc(state) {
    const { region, focusedGenre: focus, colorblind: cb } = state;
    const perYear = perYearFor(region);
    const series = d3stack().keys(GENRES)(perYear);
    const maxTotal = d3max(perYear, (o) => d3sum(GENRES, (g) => o[g])) || 1;
    radius.domain([0, maxTotal]);

    gCdBg
      .selectAll("circle")
      .data([0])
      .join("circle")
      .attr("class", "gw-cd-body")
      .attr("r", outerR);

    const areaGen = areaRadial()
      .angle((d) => angle(d.data.year))
      .innerRadius((d) => radius(d[0]))
      .outerRadius((d) => radius(d[1]))
      .curve(curveCardinal);

    gBands
      .selectAll("path")
      .data(series, (s) => s.key)
      .join((enter) => enter.append("path").attr("class", "gw-band"))
      .attr("fill", (s) => genreColor(s.key, cb))
      .classed("is-faded", (s) => focus && s.key !== focus)
      .on("click", (_e, s) =>
        store.set({ focusedGenre: store.get().focusedGenre === s.key ? null : s.key })
      )
      .on("mousemove", (event, s) => onBandHover(event, s.key, perYear, region))
      .on("mouseleave", () => tooltip.hide())
      .attr("d", areaGen);

    renderRings();
    renderHub(region, maxTotal, perYear);
    renderYearLabels();
  }

  function renderRings() {
    const ticks = radius.ticks(4).filter((t) => t > 0);
    gRings
      .selectAll("circle")
      .data(ticks)
      .join("circle")
      .attr("class", "gw-ring")
      .attr("r", (t) => radius(t));
    gRings
      .selectAll("text")
      .data(ticks)
      .join("text")
      .attr("class", "gw-ring-label")
      .attr("x", 0)
      .attr("y", (t) => -radius(t) - 2)
      .text((t) => `${fmtInt(Math.round(t))}M`);
  }

  function renderHub(region, _maxTotal, perYear) {
    const total = d3sum(perYear, (o) => d3sum(GENRES, (g) => o[g]));

    const defs = svg.select(".gw-defs");
    defs.selectAll("*").remove();
    
    const rText = innerR + 10;
    // Top arc (left-to-right, upward)
    defs.append("path")
      .attr("id", "gw-text-path-top")
      .attr("d", `M ${-rText},0 A ${rText},${rText} 0 0,1 ${rText},0`);
    // Bottom arc (right-to-left, downward)
    defs.append("path")
      .attr("id", "gw-text-path-bottom")
      .attr("d", `M ${rText},0 A ${rText},${rText} 0 0,1 ${-rText},0`);

    gHub.selectAll("*").remove();
    
    // 1. CD Outer Rim
    gHub.append("circle")
      .attr("class", "gw-cd-outer-rim")
      .attr("r", outerR);

    // 2. CD Clamping ring
    gHub.append("circle")
      .attr("class", "gw-hub-silver")
      .attr("r", innerR);

    // 3. CD Plastic clamping center ring
    gHub.append("circle")
      .attr("class", "gw-hub-plastic")
      .attr("r", innerR * 0.65);

    // 4. Black center spindle hole
    gHub.append("circle")
      .attr("class", "gw-hub-hole")
      .attr("r", innerR * 0.32);

    // 5. Clamping notches / teeth
    const teethCount = 6;
    const teethRadius = innerR * 0.32;
    for (let i = 0; i < teethCount; i++) {
      const angleRad = (i * 2 * Math.PI) / teethCount;
      const x1 = Math.sin(angleRad) * (teethRadius - 1);
      const y1 = -Math.cos(angleRad) * (teethRadius - 1);
      const x2 = Math.sin(angleRad) * (teethRadius + 3);
      const y2 = -Math.cos(angleRad) * (teethRadius + 3);
      gHub.append("line")
        .attr("class", "gw-hub-tooth")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2);
    }

    // 6. Text paths
    gHub.append("text")
      .attr("class", "gw-hub-text-top")
      .append("textPath")
      .attr("href", "#gw-text-path-top")
      .attr("startOffset", "50%")
      .attr("text-anchor", "middle")
      .text(`REGION: ${region.toUpperCase()}`);

    gHub.append("text")
      .attr("class", "gw-hub-text-bottom")
      .append("textPath")
      .attr("href", "#gw-text-path-bottom")
      .attr("startOffset", "50%")
      .attr("text-anchor", "middle")
      .text(`TOTAL SALES: ${fmtInt(Math.round(total))}M`);
  }

  // year tick labels around the rim (every 5 years)
  function renderYearLabels() {
    const yticks = years.filter((y) => y % 5 === 0 || y === yearMin || y === yearMax);
    gYearLabels
      .selectAll("text")
      .data(yticks)
      .join("text")
      .attr("class", "gw-yearlabel")
      .attr("x", (y) => Math.sin(angle(y)) * (outerR + 14))
      .attr("y", (y) => -Math.cos(angle(y)) * (outerR + 14) + 3)
      .text((y) => y);
  }

  // ---------- playhead spoke ----------
  function renderSpoke(state) {
    const yr = Math.max(yearMin, Math.min(yearMax, Math.round(state.yearRange[1])));
    const a = angle(yr);
    const coords = {
      x1: Math.sin(a) * innerR,
      y1: -Math.cos(a) * innerR,
      x2: Math.sin(a) * outerR,
      y2: -Math.cos(a) * outerR,
    };
    const sel = gSpoke.selectAll("line").data([0]).join("line").attr("class", "gw-spoke");
    // Glide the spoke around the disc while the playhead sweeps.
    const dur = state.playing && !REDUCED_MOTION ? PLAYHEAD_MS : 0;
    (dur ? sel.transition().duration(dur).ease(easeLinear) : sel.interrupt()).attr(coords);
  }

  // ---------- side panel inset ----------
  function renderInset(state) {
    const focus = state.focusedGenre;
    if (!focus) {
      insetEl.innerHTML = `<p class="gw__hint">Click a band (or its legend hue) to focus a genre and see its trend.</p>`;
      return;
    }
    const region = state.region;
    const cb = state.colorblind;
    
    const color = genreColor(focus, cb);
    const label = focus;

    const seriesData = years.map((y) => {
      const cell = gyr.table[region]?.[y] || {};
      const v = cell[focus] || 0;
      return { year: y, v };
    });

    const peak = seriesData.reduce((a, b) => (b.v > a.v ? b : a), seriesData[0]);
    const tot = d3sum(seriesData, (d) => d.v);

    insetEl.innerHTML = `
      <div class="gw__inset-title">
        <span class="gw__inset-swatch" style="background:${color}"></span>${label}
      </div>
      <div class="gw__inset-chart"></div>
      <p class="gw__inset-stat">Peak <b>${peak.year}</b> · ${fmtSales(peak.v)} &nbsp;·&nbsp; Total <b>${fmtSales(tot)}</b></p>
      <button class="gw__clear" aria-label="Clear focus">✕ Clear focus</button>`;
    insetEl.querySelector(".gw__clear").addEventListener("click", () =>
      store.set({ focusedGenre: null })
    );

    // the linear line chart (Cleveland–McGill precision beside the disc)
    const host = insetEl.querySelector(".gw__inset-chart");
    const w = host.clientWidth || sideEl.clientWidth - 28 || 200;
    const h = 130;
    const mL = 30, mR = 8, mT = 8, mB = 18;
    const xx = scaleLinear().domain([yearMin, yearMax]).range([mL, w - mR]);
    const yy = scaleLinear().domain([0, d3max(seriesData, (d) => d.v) || 1]).range([h - mB, mT]).nice();
    const isvg = select(host).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    isvg
      .append("path")
      .attr("class", "gw-inset-area")
      .attr("fill", color)
      .attr(
        "d",
        d3area().x((d) => xx(d.year)).y0(h - mB).y1((d) => yy(d.v))(seriesData)
      );
    isvg
      .append("path")
      .attr("class", "gw-inset-line")
      .attr("stroke", color)
      .attr("d", d3line().x((d) => xx(d.year)).y((d) => yy(d.v))(seriesData));
    isvg
      .append("g")
      .attr("class", "gw-inset-axis")
      .attr("transform", `translate(0,${h - mB})`)
      .call(axisBottom(xx).tickValues([yearMin, 2006, yearMax]).tickFormat(format("d")).tickSizeOuter(0));
    isvg
      .append("g")
      .attr("class", "gw-inset-axis")
      .attr("transform", `translate(${mL},0)`)
      .call(axisLeft(yy).ticks(3).tickFormat((v) => `${v}M`).tickSizeOuter(0));
  }

  // ---------- hover ----------
  function onBandHover(event, genre, perYear, region) {
    const [mx, my] = pointer(event, svg.node());
    const dx = mx - cx;
    const dy = my - cy;
    let a = Math.atan2(dx, -dy); // clockwise from top
    if (a < 0) a += TAU;
    if (a > angle.range()[1]) return;
    const yr = Math.max(yearMin, Math.min(yearMax, Math.round(angle.invert(a))));
    const row = perYear.find((o) => o.year === yr);
    if (!row) return;
    tooltip.show(
      `<div class="tooltip__title">${genre} · ${yr}</div>
       <div class="tooltip__row"><span>${region.toUpperCase()} sales</span><b>${fmtSales(row[genre] || 0)}</b></div>`,
      event.clientX,
      event.clientY
    );
  }

  // ---------- orchestration ----------
  function onState(state) {
    // The disc + inset depend on region/focus/colorblind — not on the
    // year — so during playback only the spoke needs to move.
    const visualChanged =
      state.focusedGenre !== prev.focus ||
      state.region !== prev.region ||
      state.colorblind !== prev.cb;
    if (visualChanged) {
      renderDisc(state);
      renderInset(state);
    }
    renderSpoke(state);
    prev = { focus: state.focusedGenre, region: state.region, cb: state.colorblind };
  }

  function measureAndRender() {
    layout();
    const state = store.get();
    renderDisc(state);
    renderSpoke(state);
    renderInset(state);
    prev = { focus: state.focusedGenre, region: state.region, cb: state.colorblind };
  }

  return {
    id: "genreWarp",
    title: "GENRE WARP",

    mount() {
      buildDom();
      shell?.setSampleSize?.(`${fmtInt(data.meta.window.withSales)} TITLES`);
      measureAndRender();
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(measureAndRender);
      });
      ro.observe(discWrap);
      unsub = store.subscribe(onState);
    },

    update(state) {
      onState(state);
    },

    destroy() {
      cancelAnimationFrame(resizeRaf);
      ro?.disconnect();
      unsub?.();
      legend?.destroy();
      tooltip.hide();
      mountEl.innerHTML = "";
    },
  };
}
