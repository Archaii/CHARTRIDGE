// cartridges/consoleWars.js — CONSOLE WARS (Cartridge 02).
//
// A console-lifecycle ridgeline: one overlapping area row per console
// (top-15 by total_sales + "Other"), sorted by peak year so the rows
// cascade diagonally as platforms are born, peak, and die. Each row's
// fill is the dominant genre family that year (read *when* it peaked
// *and what drove it* together). The region toggle redraws heights; a
// year playhead sweeps a line and fills a "top games this year" panel;
// clicking a console shows its top titles. (Redesign spec §3.)
import "./consoleWars.css";
import {
  select,
  pointer,
  scaleLinear,
  area as d3area,
  curveBasis,
  axisBottom,
  easeLinear,
  max as d3max,
  format,
} from "d3";
import { genreFamily, familyColor } from "../ui/palette.js";
import { PLAYHEAD_MS } from "../store.js";
import { createLegend } from "../ui/legend.js";
import { tooltip } from "../ui/tooltip.js";

const AMP = 2.4; // ridge amplitude as a multiple of row spacing
const NEUTRAL = "#cdc6bb";
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const REGION_LABEL = { na: "NA", jp: "JP", pal: "PAL", other: "Other", total: "Total" };
// 4-way region split colors for the side-panel mini bars.
const REGION_COLORS = { na: "#3f88c5", jp: "#e4572e", pal: "#2a9d8f", other: "#9b5de5" };

const fmtSales = (v) => `${v.toFixed(v < 10 ? 1 : 0)}M`;
const fmtInt = format(",");
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

const dominantGenre = (byGenre) => {
  let best = null;
  let bv = -1;
  for (const g in byGenre) if (byGenre[g] > bv) (bv = byGenre[g]), (best = g);
  return best;
};

export function createConsoleWars({ mountEl, data, store, shell }) {
  const cy = data.consoleYear;
  const years = cy.years;
  const yearMin = years[0];
  const yearMax = years[years.length - 1];

  // Build the rows once: each console's per-year region values +
  // dominant genre family (the latter is region-independent, so colors
  // stay put while the region toggle only changes heights).
  const rows = cy.consoles
    .filter((c) => cy.table[c.name])
    .sort((a, b) => a.peakYear - b.peakYear || b.total - a.total)
    .map((c) => ({
      name: c.name,
      peakYear: c.peakYear,
      series: years.map((y) => {
        const cell = cy.table[c.name]?.[y];
        const dom = cell ? dominantGenre(cell.byGenre) : null;
        return {
          year: y,
          values: {
            na: cell?.na || 0,
            jp: cell?.jp || 0,
            pal: cell?.pal || 0,
            other: cell?.other || 0,
            total: cell?.total || 0,
          },
          domGenre: dom,
          domFamily: dom ? genreFamily(dom) : null,
        };
      }),
    }));
  const nRows = rows.length;

  // mutable view state (rebuilt geometry + render scales)
  let root, chartWrap, panelEl, svg, gRows, gAxis, gSweep, legend;
  let x, amp, rowStep, maxAmp, marginTop, marginLeft, innerW;
  let rowEls = []; // per-row selections + yBase
  let ro = null;
  let unsub = null;
  let resizeRaf = 0;
  let panelMode = "year"; // "year" | "console"
  let selectedConsole = null;
  let prevRegion = null;
  let prevPlayYear = null;
  let prevFocus = undefined;
  let prevCb = undefined;

  const marginRight = 16;
  const marginBottom = 28;

  function playYear(state) {
    return Math.max(yearMin, Math.min(yearMax, Math.round(state.yearRange[1])));
  }

  // ---------- build DOM skeleton ----------
  function buildDom() {
    mountEl.innerHTML = `
      <div class="screen__view cw">
        <div class="cw__main">
          <div class="cw__head">
            <span class="cw__title">CONSOLE WARS · LIFECYCLES</span>
            <span class="cw__legend"></span>
          </div>
          <div class="cw__chartwrap"></div>
        </div>
        <aside class="cw__panel" aria-label="Details panel"></aside>
      </div>`;
    root = mountEl.querySelector(".cw");
    chartWrap = mountEl.querySelector(".cw__chartwrap");
    panelEl = mountEl.querySelector(".cw__panel");
    legend = createLegend({ mountEl: mountEl.querySelector(".cw__legend"), store });
    svg = select(chartWrap)
      .append("svg")
      .attr("role", "img")
      .attr(
        "aria-label",
        "Ridgeline of console sales per year, one row per console sorted by peak year, filled by dominant genre family."
      );
    gRows = svg.append("g").attr("class", "cw-rows");
    gAxis = svg.append("g").attr("class", "cw-axis");
    gSweep = svg.append("g").attr("class", "cw-sweep-g");
  }

  // ---------- (re)build chart geometry for a given size ----------
  function rebuild(w, h) {
    svg.attr("width", w).attr("height", h);
    gRows.selectAll("*").remove();
    gAxis.selectAll("*").remove();
    gSweep.selectAll("*").remove();
    rowEls = [];

    marginLeft = Math.min(96, Math.max(64, w * 0.18));
    innerW = w - marginLeft - marginRight;

    // Headroom so the topmost (earliest-peak) ridge isn't clipped.
    const a = (AMP - 1) / nRows;
    marginTop = (a * (h - marginBottom) + 8) / (1 + a);
    const plotH = h - marginTop - marginBottom;
    rowStep = plotH / nRows;
    maxAmp = rowStep * AMP;

    x = scaleLinear().domain([yearMin, yearMax]).range([marginLeft, marginLeft + innerW]);
    const bandW = (innerW / (yearMax - yearMin)) * 1.05;
    amp = scaleLinear().range([0, maxAmp]); // domain set per-region in renderRidges

    const defs = svg.selectAll("defs").data([0]).join("defs");
    defs.selectAll("*").remove();

    rows.forEach((row, i) => {
      const yBase = marginTop + (i + 1) * rowStep;
      const clipId = `cw-clip-${i}`;

      const clipPath = defs.append("clipPath").attr("id", clipId).append("path");

      const gRow = gRows
        .append("g")
        .attr("class", "cw-row")
        .attr("data-name", row.name);

      // colored per-year bands, shaped by the ridge via the clip path
      const bands = gRow
        .append("g")
        .attr("class", "cw-bands")
        .attr("clip-path", `url(#${clipId})`);
      bands
        .selectAll("rect")
        .data(row.series)
        .join("rect")
        .attr("x", (d) => x(d.year) - bandW / 2)
        .attr("y", yBase - maxAmp)
        .attr("width", bandW)
        .attr("height", maxAmp)
        .attr("fill", (d) => (d.domFamily ? familyColor(d.domFamily, store.get().colorblind) : NEUTRAL));

      const outline = gRow.append("path").attr("class", "cw-outline");

      gRows
        .append("text")
        .attr("class", "cw-rowlabel")
        .attr("x", marginLeft - 8)
        .attr("y", yBase)
        .text(row.name);

      // hover + click on the visible ridge
      gRow
        .on("mousemove", (event) => onHover(event, row))
        .on("mouseleave", () => tooltip.hide())
        .on("click", () => selectConsole(row.name));

      rowEls.push({ name: row.name, yBase, clipPath, outline, gRow });
    });

    // x axis
    const ticks = years.filter((y) => y % 5 === 0 || y === yearMin || y === yearMax);
    gAxis
      .attr("transform", `translate(0,${marginTop + nRows * rowStep})`)
      .call(axisBottom(x).tickValues(ticks).tickFormat(format("d")).tickSizeOuter(0));

    // sweep line + label
    gSweep
      .append("line")
      .attr("class", "cw-sweep")
      .attr("y1", marginTop - 4)
      .attr("y2", marginTop + nRows * rowStep);
    gSweep
      .append("text")
      .attr("class", "cw-sweep-label")
      .attr("y", marginTop - 8);
  }

  // ---------- render ridge heights for the active region ----------
  function renderRidges(state, animate) {
    const region = state.region;
    const domainMax =
      d3max(rows, (r) => d3max(r.series, (d) => d.values[region])) || 1;
    amp.domain([0, domainMax]);

    rowEls.forEach((re, i) => {
      const gen = d3area()
        .x((d) => x(d.year))
        .y0(re.yBase)
        .y1((d) => re.yBase - amp(d.values[region]))
        .curve(curveBasis);
      const d = gen(rows[i].series);
      const dur = animate && !REDUCED_MOTION ? 450 : 0;
      if (dur) {
        re.clipPath.transition().duration(dur).attr("d", d);
        re.outline.transition().duration(dur).attr("d", d);
      } else {
        re.clipPath.attr("d", d);
        re.outline.attr("d", d);
      }
    });
  }

  // ---------- honor the shared focusedFamily (coordination, M6) ----------
  // When a family is focused elsewhere (HIGH SCORE / GENRE WARP), dim the
  // per-year bands whose dominant family isn't it — so the focused genre
  // "stays isolated" when you jump into CONSOLE WARS (redesign §5).
  function applyFocus(focus) {
    rowEls.forEach((re, i) => {
      re.gRow
        .select(".cw-bands")
        .selectAll("rect")
        .data(rows[i].series)
        .style("opacity", (d) => (focus && d.domFamily !== focus ? 0.12 : 1));
    });
  }

  // Recolor the per-year bands when the colorblind palette flips.
  function recolorBands(cb) {
    rowEls.forEach((re, i) => {
      re.gRow
        .select(".cw-bands")
        .selectAll("rect")
        .data(rows[i].series)
        .attr("fill", (d) => (d.domFamily ? familyColor(d.domFamily, cb) : NEUTRAL));
    });
  }

  // ---------- render the playhead + (year-mode) panel ----------
  function renderPlayhead(state) {
    const yr = playYear(state);
    const sweep = gSweep.select(".cw-sweep");
    const label = gSweep.select(".cw-sweep-label");
    label.text(yr);
    // While the playhead sweeps, glide the line over the dwell so it
    // reads as continuous motion instead of frame-by-frame snapping.
    const dur = state.playing && !REDUCED_MOTION ? PLAYHEAD_MS : 0;
    if (dur) {
      sweep.transition().duration(dur).ease(easeLinear).attr("x1", x(yr)).attr("x2", x(yr));
      label.transition().duration(dur).ease(easeLinear).attr("x", x(yr));
    } else {
      sweep.interrupt().attr("x1", x(yr)).attr("x2", x(yr));
      label.interrupt().attr("x", x(yr));
    }
    if (panelMode === "year") renderPanelYear(yr);
  }

  // ---------- side panel ----------
  function gameItem(g, rank, sub) {
    const parts = ["na", "jp", "pal", "other"];
    const sum = parts.reduce((s, k) => s + (g[k] || 0), 0);
    const split =
      sum > 0
        ? `<div class="cw__split">${parts
            .map(
              (k) =>
                `<span title="${REGION_LABEL[k]} ${fmtSales(g[k] || 0)}" style="width:${
                  ((g[k] || 0) / sum) * 100
                }%;background:${REGION_COLORS[k]}"></span>`
            )
            .join("")}</div>`
        : "";
    return `
      <li class="cw__game">
        <div class="cw__game-top">
          <span class="cw__game-rank">${rank}</span>
          <span class="cw__game-title" title="${esc(g.title)}">${esc(g.title)}</span>
          <span class="cw__game-sales">${fmtSales(g.sales)}</span>
        </div>
        <div class="cw__game-sub">${esc(sub)}</div>
        ${split}
      </li>`;
  }

  function renderPanelYear(yr) {
    const games = data.topGamesByYear[yr] || [];
    const list = games.length
      ? `<ul class="cw__list">${games
          .map((g, i) => gameItem(g, i + 1, `${g.console} · ${g.genre}`))
          .join("")}</ul>`
      : `<p class="cw__empty">No ranked sales this year.</p>`;
    panelEl.innerHTML = `
      <div class="cw__panel-head">
        <span class="cw__panel-title">Top games</span>
        <span class="cw__panel-year">${yr}</span>
      </div>
      ${list}
      <p class="cw__empty" style="margin-top:auto">▶ Play the timeline, or click a console row.</p>`;
  }

  function renderPanelConsole(name) {
    const games = data.topGamesByConsole[name] || [];
    const list = games.length
      ? `<ul class="cw__list">${games
          .map((g, i) => gameItem(g, i + 1, `${g.year} · ${g.genre}`))
          .join("")}</ul>`
      : `<p class="cw__empty">No ranked sales.</p>`;
    panelEl.innerHTML = `
      <div class="cw__panel-head">
        <span class="cw__panel-title">${esc(name)} · Top titles</span>
        <button class="cw__panel-back" aria-label="Back to year view">✕</button>
      </div>
      ${list}`;
    panelEl.querySelector(".cw__panel-back").addEventListener("click", clearSelection);
  }

  function selectConsole(name) {
    selectedConsole = name;
    panelMode = "console";
    rowEls.forEach((re) =>
      re.gRow.classed("is-dimmed", re.name !== name)
    );
    renderPanelConsole(name);
  }

  function clearSelection() {
    selectedConsole = null;
    panelMode = "year";
    rowEls.forEach((re) => re.gRow.classed("is-dimmed", false));
    renderPanelYear(playYear(store.get()));
  }

  function onHover(event, row) {
    const [mx] = pointer(event, svg.node());
    const yr = Math.max(yearMin, Math.min(yearMax, Math.round(x.invert(mx))));
    const d = row.series.find((s) => s.year === yr);
    if (!d) return;
    const region = store.get().region;
    const color = d.domFamily ? familyColor(d.domFamily, store.get().colorblind) : NEUTRAL;
    tooltip.show(
      `<div class="tooltip__title">${esc(row.name)} · ${yr}</div>
       <div class="tooltip__row"><span>${REGION_LABEL[region]} sales</span><b>${fmtSales(d.values[region])}</b></div>
       <div class="tooltip__row"><span><span class="tooltip__swatch" style="background:${color}"></span>Top genre</span><b>${esc(d.domGenre || "—")}</b></div>`,
      event.clientX,
      event.clientY
    );
  }

  // ---------- store subscription ----------
  function onState(state) {
    if (state.region !== prevRegion) {
      renderRidges(state, true);
      prevRegion = state.region;
    }
    if (state.colorblind !== prevCb) {
      recolorBands(state.colorblind);
      prevCb = state.colorblind;
    }
    if (state.focusedFamily !== prevFocus) {
      applyFocus(state.focusedFamily);
      prevFocus = state.focusedFamily;
    }
    const yr = playYear(state);
    if (yr !== prevPlayYear) {
      renderPlayhead(state);
      prevPlayYear = yr;
    }
  }

  function measureAndBuild() {
    const w = chartWrap.clientWidth || 600;
    const h = chartWrap.clientHeight || 360;
    rebuild(w, h);
    const state = store.get();
    renderRidges(state, false);
    applyFocus(state.focusedFamily); // bands are rebuilt on resize → reapply
    renderPlayhead(state);
  }

  return {
    id: "consoleWars",
    title: "CONSOLE WARS",

    mount() {
      buildDom();
      shell?.setSampleSize?.(`${fmtInt(data.meta.window.withSales)} TITLES`);

      const state = store.get();
      prevRegion = state.region;
      prevPlayYear = playYear(state);
      prevFocus = state.focusedFamily;
      prevCb = state.colorblind;
      measureAndBuild();

      // recompute scales on resize (architecture §12)
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(measureAndBuild);
      });
      ro.observe(chartWrap);

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
