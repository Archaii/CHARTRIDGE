// cartridges/highScore.js — HIGH SCORE (Cartridge 01).
//
// Two coordinated panels (redesign spec §2):
//   TOP  — genre-family streamgraph of total_sales over 1995–2017
//          (d3.stack + stackOffsetWiggle, curveBasis). A brush selects
//          a year range.
//   BOTTOM — canvas scatter of the ~4,126 scored games: x = sales
//          (log), y = critic_score, color = genre family, slight jitter.
//
// Coordination via the shared store:
//   • brushing the stream  → store.yearRange → fades out-of-range points
//   • clicking a family    → store.focusedFamily → both panels isolate it
//   • region buttons       → restack the stream + reweight the scatter x
import "./highScore.css";
import {
  select,
  pointer,
  scaleLinear,
  scaleLog,
  stack as d3stack,
  stackOffsetWiggle,
  area as d3area,
  curveBasis,
  axisBottom,
  axisLeft,
  brushX,
  max as d3max,
  min as d3min,
  extent,
  quadtree as d3quadtree,
  format,
} from "d3";
import { GENRES, genreFamily, familyColor, genreColor } from "../ui/palette.js";
import { createLegend } from "../ui/legend.js";
import { tooltip } from "../ui/tooltip.js";

const REGION_LABEL = { na: "NA", jp: "JP", pal: "PAL", other: "Other", total: "Total" };
const REGION_COLORS = { na: "#3f88c5", jp: "#e4572e", pal: "#2a9d8f", other: "#9b5de5" };
const DOT_R = 2.6;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmtInt = format(",");
const fmtSales = (v) => `${v.toFixed(v < 10 ? 2 : 1)}M`;
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function createHighScore({ mountEl, data, store, shell }) {
  const gyr = data.genreYearRegion;
  const years = gyr.years;
  const yearMin = years[0];
  const yearMax = years[years.length - 1];

  // Deterministic ±1 jitter from a cheap hash (stable across redraws).
  const jitter = (i, salt) => {
    const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1; // → [-1, 1]
  };

  // Scored games → scatter points with stable per-point jitter (px).
  const points = data.scoredGames.map((g, i) => ({
    title: g.title,
    console: g.console,
    genre: g.genre,
    year: g.year,
    score: g.score,
    sales: g.sales,
    na: g.na,
    jp: g.jp,
    pal: g.pal,
    other: g.other,
    family: genreFamily(g.genre),
    jx: jitter(i, 1) * 2.2,
    jy: jitter(i, 2) * 2.2,
  }));

  // cache rgb per genre+colorblind for fast canvas fills
  const rgbCache = new Map();
  const genreRgb = (genre, cb) => {
    const key = `${genre}-${cb}`;
    if (!rgbCache.has(key)) rgbCache.set(key, hexToRgb(genreColor(genre, cb)));
    return rgbCache.get(key);
  };

  // view state
  let streamWrap, scatterWrap, streamSvg, scatterSvg, canvas, ctx, legend;
  let gStreamBands, gStreamBandsBg, gStreamAxis, gBrush, brush;
  let gScatterAxis, gScatterHit;
  let xStream, xScatter, yScatter, streamT, streamB;
  let scL, scR, scT, scB;
  let qt = null;
  let dpr = 1;
  let ro = null;
  let unsub = null;
  let resizeRaf = 0;
  let suppressBrush = false;
  let prev = {};
  // marquee (click-drag) selection on the scatter
  let gSel, selBadge;
  let selected = new Set(); // selected point refs (empty = none)
  let litPoints = []; // currently-visible (in-year, in-focus) points
  let drag = null; // { x0, y0, moved } while dragging a rectangle

  const regionVal = (p, region) => (region === "total" ? p.sales : p[region]);

  // ---------- DOM ----------
  function buildDom() {
    mountEl.innerHTML = `
      <div class="screen__view hs">
        <div class="hs__head">
          <span class="hs__title">HIGH SCORE · QUALITY × SALES</span>
          <span class="hs__legend"></span>
        </div>
        <div class="hs__paneltag">Genre share of sales — brush a year range</div>
        <div class="hs__stream"></div>
        <div class="hs__paneltag">Critic score × sales — each dot is a scored title</div>
        <div class="hs__scatter"></div>
      </div>`;
    streamWrap = mountEl.querySelector(".hs__stream");
    scatterWrap = mountEl.querySelector(".hs__scatter");
    legend = createLegend({ mountEl: mountEl.querySelector(".hs__legend"), store });

    streamSvg = select(streamWrap)
      .append("svg")
      .attr("role", "img")
      .attr("aria-label", "Streamgraph of genre-family share of sales by year. Brush to select a year range.");
    
    const defs = streamSvg.append("defs");
    defs.append("clipPath")
      .attr("id", "hs-stream-clip")
      .append("rect")
      .attr("id", "hs-stream-clip-rect")
      .attr("y", 0)
      .attr("height", "100%");

    gStreamBandsBg = streamSvg.append("g").attr("class", "hs-bands-bg");
    gStreamBands = streamSvg.append("g").attr("class", "hs-bands");
    gStreamAxis = streamSvg.append("g").attr("class", "hs-axis");
    gBrush = streamSvg.append("g").attr("class", "hs-brush");

    canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Scatter plot of scored titles: x is total sales on a log scale, y is critic score, colored by genre family."
    );
    scatterWrap.appendChild(canvas);
    ctx = canvas.getContext("2d");
    scatterSvg = select(scatterWrap).append("svg");
    gScatterAxis = scatterSvg.append("g").attr("class", "hs-axis");
    gScatterHit = scatterSvg.append("g");
    gSel = scatterSvg.append("g"); // marquee rectangle layer (on top)

    // selection summary badge (top-left of the scatter)
    selBadge = document.createElement("div");
    selBadge.className = "hs-selbadge";
    selBadge.addEventListener("mousedown", (e) => e.stopPropagation());
    scatterWrap.appendChild(selBadge);

    // hover, click-to-focus and click-drag marquee selection
    scatterWrap.addEventListener("mousedown", onScatterDown);
    scatterWrap.addEventListener("mousemove", onScatterMove);
    scatterWrap.addEventListener("mouseleave", onScatterLeave);
    window.addEventListener("mouseup", onScatterUp);
  }

  // ---------- layout ----------
  function layout() {
    // stream
    const sw = streamWrap.clientWidth || 600;
    const sh = streamWrap.clientHeight || 180;
    streamSvg.attr("width", sw).attr("height", sh);
    const sL = 44, sR = 14, sTop = 8, sBot = 20;
    streamT = sTop;
    streamB = sh - sBot;
    xStream = scaleLinear().domain([yearMin, yearMax]).range([sL, sw - sR]);

    const ticks = years.filter((y) => y % 5 === 0 || y === yearMin || y === yearMax);
    gStreamAxis
      .attr("transform", `translate(0,${streamB})`)
      .call(axisBottom(xStream).tickValues(ticks).tickFormat(format("d")).tickSizeOuter(0));

    brush = brushX()
      .extent([[sL, streamT], [sw - sR, streamB]])
      .on("brush end", onBrush);
    gBrush.call(brush);

    // scatter canvas (device-pixel-ratio aware)
    const cw = scatterWrap.clientWidth || 600;
    const ch = scatterWrap.clientHeight || 220;
    dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scatterSvg.attr("width", cw).attr("height", ch);
    scL = 46; scR = 16; scT = 24; scB = 30;
    // x/y ranges in CSS px (canvas is pre-scaled by dpr)
    yScatter = scaleLinear().domain([0, 10]).range([ch - scB, scT]);
  }

  // ---------- streamgraph ----------
  function renderStream(state) {
    const { region, colorblind: cb } = state;
    const focusList = state.focusedGenres || [];
    const hasFocus = focusList.length > 0;
    const perYear = years.map((y) => {
      const cell = gyr.table[region]?.[y] || {};
      const o = { year: y };
      for (const g of GENRES) o[g] = cell[g] || 0;
      return o;
    });
    const series = d3stack().keys(GENRES).offset(stackOffsetWiggle)(perYear);
    const lo = d3min(series, (s) => d3min(s, (d) => d[0]));
    const hi = d3max(series, (s) => d3max(s, (d) => d[1]));
    const yStream = scaleLinear().domain([lo, hi]).range([streamB, streamT]);
    const areaGen = d3area()
      .x((d) => xStream(d.data.year))
      .y0((d) => yStream(d[0]))
      .y1((d) => yStream(d[1]))
      .curve(curveBasis);

    gStreamBands
      .selectAll("path")
      .data(series, (s) => s.key)
      .join((enter) => enter.append("path").attr("class", "hs-band"))
      .attr("fill", (s) => genreColor(s.key, cb))
      .classed("is-faded", (s) => hasFocus && !focusList.includes(s.key))
      .on("click", (_e, s) => {
        const current = store.get().focusedGenres || [];
        const updated = current.includes(s.key)
          ? current.filter((g) => g !== s.key)
          : [...current, s.key];
        store.set({ focusedGenres: updated });
      })
      .transition()
      .duration(prev.region === region || REDUCED_MOTION ? 0 : 400)
      .attr("d", areaGen);

    gStreamBandsBg
      .selectAll("path")
      .data(series, (s) => s.key)
      .join((enter) => enter.append("path").attr("class", "hs-band-bg"))
      .attr("fill", (s) => genreColor(s.key, cb))
      .classed("is-faded", (s) => hasFocus && !focusList.includes(s.key))
      .transition()
      .duration(prev.region === region || REDUCED_MOTION ? 0 : 400)
      .attr("d", areaGen);
  }

  // ---------- scatter (canvas) ----------
  function renderScatter(state) {
    const { region, colorblind: cb, yearRange } = state;
    const focusList = state.focusedGenres || [];
    const hasFocus = focusList.length > 0;
    const [ys, ye] = yearRange;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;

    const active = points.filter((p) => regionVal(p, region) > 0);
    const xdom = extent(active, (p) => regionVal(p, region));
    xScatter = scaleLog()
      .domain([Math.max(0.01, xdom[0] || 0.01), xdom[1] || 1])
      .range([scL, cw - scR])
      .clamp(true);

    // project + classify which points are "lit" (in year & in focus)
    const lit = [];
    for (const p of active) {
      p.sx = xScatter(regionVal(p, region)) + p.jx;
      p.sy = yScatter(p.score) + p.jy;
      p.inYear = p.year >= ys && p.year <= ye;
      p.inFocus = !hasFocus || focusList.includes(p.genre);
      if (p.inYear && p.inFocus) lit.push(p);
    }
    litPoints = lit;
    const hasSel = selected.size > 0;

    ctx.clearRect(0, 0, cw, ch);
    // tier A: faded context (out of year / wrong focus)
    for (const p of active) {
      if (p.inYear && p.inFocus) continue;
      const [r, g, b] = genreRgb(p.genre, cb);
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const opacity = !p.inYear ? 0.045 : 0.1;
      ctx.fillStyle = `rgba(${gray},${gray},${gray},${opacity})`;
      dot(p);
    }
    // tier B: lit points — dim when a selection is active and excludes them
    for (const p of lit) {
      if (hasSel && selected.has(p)) continue; // drawn bright in tier C
      const [r, g, b] = genreRgb(p.genre, cb);
      ctx.fillStyle = `rgba(${r},${g},${b},${hasSel ? 0.1 : 0.82})`;
      dot(p);
    }
    // tier C: selected points — bright, larger, with a white halo
    if (hasSel) {
      for (const p of lit) {
        if (!selected.has(p)) continue;
        const [r, g, b] = genreRgb(p.genre, cb);
        ctx.fillStyle = `rgba(${r},${g},${b},0.98)`;
        dot(p, DOT_R + 1.6);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    qt = d3quadtree().x((d) => d.sx).y((d) => d.sy).addAll(lit);
    drawScatterAxes(cw, ch);
  }

  function dot(p, r = DOT_R) {
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawScatterAxes(cw, ch) {
    gScatterAxis.selectAll("*").remove();
    // y (score)
    gScatterAxis
      .append("g")
      .attr("class", "hs-axis")
      .attr("transform", `translate(${scL},0)`)
      .call(axisLeft(yScatter).ticks(5).tickSizeOuter(0));
    // x (sales, log)
    gScatterAxis
      .append("g")
      .attr("class", "hs-axis")
      .attr("transform", `translate(0,${ch - scB})`)
      .call(axisBottom(xScatter).ticks(5, "~g").tickSizeOuter(0));
    // axis labels
    gScatterAxis
      .append("text")
      .attr("class", "hs-axis-label")
      .attr("x", cw - scR)
      .attr("y", ch - scB + 26)
      .attr("text-anchor", "end")
      .text("Total sales (log, M) →");
    gScatterAxis
      .append("text")
      .attr("class", "hs-axis-label")
      .attr("transform", `translate(12,${scT + 4}) rotate(-90)`)
      .attr("text-anchor", "end")
      .text("← Critic score");

    // quadrant guides: vertical at 1M, horizontal at score 7
    const xq = xScatter.domain()[0] <= 1 && xScatter.domain()[1] >= 1 ? xScatter(1) : null;
    const yq = yScatter(7);
    if (xq != null) {
      gScatterAxis.append("line").attr("class", "hs-quad")
        .attr("x1", xq).attr("x2", xq).attr("y1", scT).attr("y2", ch - scB);
    }
    gScatterAxis.append("line").attr("class", "hs-quad")
      .attr("x1", scL).attr("x2", cw - scR).attr("y1", yq).attr("y2", yq);
    gScatterAxis.append("text").attr("class", "hs-quad-label")
      .attr("x", scL + 6).attr("y", scT - 6).text("hidden gems");
    gScatterAxis.append("text").attr("class", "hs-quad-label")
      .attr("x", cw - scR - 4).attr("y", scT - 6).attr("text-anchor", "end").text("blockbusters");
  }

  // ---------- brush ----------
  function onBrush(event) {
    if (suppressBrush || !event.selection) return;
    const [x0, x1] = event.selection;
    let s = Math.round(xStream.invert(x0));
    let e = Math.round(xStream.invert(x1));
    s = Math.max(yearMin, Math.min(yearMax, s));
    e = Math.max(yearMin, Math.min(yearMax, e));
    if (s > e) [s, e] = [e, s];
    const [cs, ce] = store.get().yearRange;
    if (s !== cs || e !== ce) store.set({ yearRange: [s, e] });
  }

  function reflectBrush(state) {
    if (!brush) return;
    const [s, e] = state.yearRange;
    suppressBrush = true;
    if (s === e) gBrush.call(brush.move, null);
    else gBrush.call(brush.move, [xStream(s), xStream(e)]);
    suppressBrush = false;

    gStreamBands.attr("clip-path", "url(#hs-stream-clip)");
    gStreamBandsBg.style("display", null);
    const x0 = xStream(s);
    const x1 = xStream(e);
    streamSvg.select("#hs-stream-clip-rect")
      .attr("x", x0)
      .attr("width", Math.max(0, x1 - x0));
  }

  // ---------- scatter hover / click / marquee selection ----------
  const localXY = (event) => {
    const rect = scatterWrap.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  function nearest(event) {
    if (!qt) return null;
    const [mx, my] = localXY(event);
    return qt.find(mx, my, 10);
  }

  function onScatterDown(event) {
    if (event.button !== 0) return;
    const [x0, y0] = localXY(event);
    drag = { x0, y0, moved: false };
    tooltip.hide();
    gScatterHit.selectAll("*").remove();
  }

  function onScatterMove(event) {
    // dragging → draw the marquee rectangle, suppress hover
    if (drag) {
      const [mx, my] = localXY(event);
      if (Math.hypot(mx - drag.x0, my - drag.y0) > 3) drag.moved = true;
      gSel
        .selectAll("rect")
        .data([0])
        .join("rect")
        .attr("class", "hs-marquee")
        .attr("x", Math.min(drag.x0, mx))
        .attr("y", Math.min(drag.y0, my))
        .attr("width", Math.abs(mx - drag.x0))
        .attr("height", Math.abs(my - drag.y0));
      return;
    }
    // hover → highlight ring + tooltip
    const p = nearest(event);
    gScatterHit.selectAll("*").remove();
    if (!p) {
      tooltip.hide();
      return;
    }
    gScatterHit.append("circle").attr("class", "hs-hit")
      .attr("cx", p.sx).attr("cy", p.sy).attr("r", 5.5);
    const parts = ["na", "jp", "pal", "other"];
    const sum = parts.reduce((a, k) => a + (p[k] || 0), 0);
    const split = sum > 0
      ? `<div style="display:flex;height:5px;border-radius:3px;overflow:hidden;margin-top:5px">${parts
          .map((k) => `<span style="display:block;height:100%;width:${((p[k] || 0) / sum) * 100}%;background:${REGION_COLORS[k]}"></span>`)
          .join("")}</div>`
      : "";
    tooltip.show(
      `<div class="tooltip__title">${esc(p.title)}</div>
       <div class="tooltip__row"><span>${esc(p.console)} · ${p.year}</span><b>${esc(p.genre)}</b></div>
       <div class="tooltip__row"><span>Score</span><b>${p.score.toFixed(1)}</b></div>
       <div class="tooltip__row"><span>Sales</span><b>${fmtSales(p.sales)}</b></div>${split}`,
      event.clientX,
      event.clientY
    );
  }

  function onScatterLeave() {
    if (drag) return; // keep drawing while dragging outside
    tooltip.hide();
    gScatterHit.selectAll("*").remove();
  }

  function onScatterUp(event) {
    if (!drag) return;
    const d = drag;
    drag = null;
    gSel.selectAll("*").remove();
    if (d.moved) {
      // finalize the rectangle → select the visible points inside it
      const [mx, my] = localXY(event);
      const x0 = Math.min(d.x0, mx), x1 = Math.max(d.x0, mx);
      const y0 = Math.min(d.y0, my), y1 = Math.max(d.y0, my);
      selected = new Set(
        litPoints.filter((p) => p.sx >= x0 && p.sx <= x1 && p.sy >= y0 && p.sy <= y1)
      );
      renderScatter(store.get());
      syncSelectionUI();
    } else {
      // plain click → toggle genre focus, or clear an active selection
      const p = nearest(event);
      if (p) {
        const current = store.get().focusedGenres || [];
        const updated = current.includes(p.genre)
          ? current.filter((g) => g !== p.genre)
          : [...current, p.genre];
        store.set({ focusedGenres: updated });
      } else if (selected.size) {
        clearSelection();
      }
    }
  }

  function clearSelection() {
    selected = new Set();
    syncSelectionUI();
    renderScatter(store.get());
  }

  // Reflect the current selection into the on-canvas badge AND the
  // cabinet's HIGH SCORES rail (ranked by critic score). With nothing
  // selected, the rail reverts to the all-time top sellers.
  function syncSelectionUI() {
    const arr = [...selected];
    if (!arr.length) {
      selBadge.classList.remove("is-on");
      shell?.setLeaderboard?.(data.leaderboard);
      return;
    }
    const avg = arr.reduce((s, p) => s + p.score, 0) / arr.length;
    const tot = arr.reduce((s, p) => s + regionVal(p, store.get().region), 0);
    selBadge.innerHTML =
      `<span><b>${arr.length}</b> TITLES SELECTED · AVG ${avg.toFixed(1)} · Σ ${fmtSales(tot)}</span>` +
      `<button type="button" aria-label="Clear selection">✕</button>`;
    selBadge.querySelector("button").addEventListener("click", clearSelection);
    selBadge.classList.add("is-on");

    const ranked = arr
      .slice()
      .sort((a, b) => b.score - a.score || b.sales - a.sales)
      .slice(0, 10);
    shell?.setLeaderboard?.(ranked, {
      title: "HIGH SCORES",
      metric: "score",
      summary: `${arr.length} titles · avg ${avg.toFixed(1)} · Σ ${fmtSales(tot)}`,
    });
  }

  // ---------- orchestration ----------
  function renderAll(state) {
    const focusJSON = JSON.stringify(state.focusedGenres || []);
    renderStream(state);
    renderScatter(state);
    reflectBrush(state);
    prev = { region: state.region, focus: focusJSON, cb: state.colorblind };
  }

  function onState(state) {
    const focusJSON = JSON.stringify(state.focusedGenres || []);
    // stream only needs a redraw on region/focus/colorblind change
    if (
      state.region !== prev.region ||
      focusJSON !== prev.focus ||
      state.colorblind !== prev.cb
    ) {
      renderStream(state);
    }
    // a region switch re-weights the x-axis → an old pixel selection no
    // longer maps to the same titles, so drop it.
    if (state.region !== prev.region && selected.size) {
      selected = new Set();
      syncSelectionUI();
    }
    renderScatter(state); // cheap; reflects year/region/focus/selection
    reflectBrush(state);
    prev = { region: state.region, focus: focusJSON, cb: state.colorblind };
  }

  function measureAndRender() {
    layout();
    renderAll(store.get());
  }

  return {
    id: "highScore",
    title: "HIGH SCORE",

    mount() {
      buildDom();
      shell?.setSampleSize?.(`${fmtInt(points.length)} SCORED`);
      prev = {};
      measureAndRender();
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(measureAndRender);
      });
      ro.observe(mountEl);
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
      scatterWrap.removeEventListener("mousedown", onScatterDown);
      scatterWrap.removeEventListener("mousemove", onScatterMove);
      scatterWrap.removeEventListener("mouseleave", onScatterLeave);
      window.removeEventListener("mouseup", onScatterUp);
      // Leaving the cartridge: hand the rail back to the all-time list.
      shell?.setLeaderboard?.(data.leaderboard);
      mountEl.innerHTML = "";
    },
  };
}
