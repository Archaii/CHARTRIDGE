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
  max as d3max,
  min as d3min,
  extent,
  quadtree as d3quadtree,
  format,
  forceSimulation,
  forceX,
  forceY,
  timer,
} from "d3";
import { GENRES, genreFamily, familyColor, genreColor, toggleFamily } from "../ui/palette.js";
import { createLegend } from "../ui/legend.js";
import { tooltip } from "../ui/tooltip.js";

const REGION_LABEL = { na: "NA", jp: "JP", pal: "PAL", other: "Other", total: "Total" };
const REGION_COLORS = { na: "#05d9e8", jp: "#ff2a6d", pal: "#b967ff", other: "#00f5a0" };
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
  let gStreamBands, gStreamBandsBg, gStreamAxis, gStreamSel;
  let gScatterAxis, gScatterHit;
  let xStream, xScatter, yScatter, streamT, streamB;
  let scL, scR, scT, scB;
  let qt = null;
  let dpr = 1;
  let ro = null;
  let unsub = null;
  let resizeRaf = 0;
  let prev = {};
  let streamDrag = null;
  let cachedSeries = null;
  let cachedPerYear = null;
  let cachedYStream = null;
  // physics / interaction state
  let simulation = forceSimulation().stop();
  let hoveredGenre = null;
  let pulseTimer = null;
  let pulsePhase = 0;
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
    gStreamSel = streamSvg.append("g").attr("class", "hs-stream-sel");

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

    // Stream hover + drag-to-select
    streamWrap.addEventListener("mousedown", onStreamDown);
    streamWrap.addEventListener("mousemove", onStreamMove);
    streamWrap.addEventListener("mouseleave", onStreamLeave);
    window.addEventListener("mouseup", onStreamUp);
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

    // Cache for stream hover tooltips
    cachedSeries = series;
    cachedPerYear = perYear;
    cachedYStream = yStream;
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

    const lit = [];
    const stateChanged = (state.region !== prev.region);

    for (const p of active) {
      p.sx = xScatter(regionVal(p, region)) + p.jx;
      p.sy = yScatter(p.score) + p.jy;
      
      const wasLit = p.isLit;
      p.inYear = p.year >= ys && p.year <= ye;
      p.inFocus = !hasFocus || focusList.includes(p.genre);
      p.isLit = p.inYear && p.inFocus;
      
      if (p.isLit) lit.push(p);

      const needsSpawn = stateChanged || (p.isLit && !wasLit);
      
      if (needsSpawn) {
         let spawnX = xStream ? xStream(p.year) : cw / 2;
         let spawnY = -20;
         if (cachedSeries && cachedYStream) {
           const yr = Math.max(yearMin, Math.min(yearMax, p.year));
           const idx = years.indexOf(yr);
           if (idx >= 0) {
              const s = cachedSeries.find(s => s.key === p.genre);
              if (s) {
                 spawnY = cachedYStream(s[idx][0]) - (streamWrap.clientHeight || 180);
              }
           }
         }
         p.x = spawnX;
         p.y = spawnY;
         p.vx = 0;
         p.vy = 0;
      } else if (p.x === undefined) {
         p.x = p.sx;
         p.y = p.sy;
      }
    }
    litPoints = lit;

    simulation
       .nodes(active)
       .force("x", forceX((d) => d.sx).strength(0.12))
       .force("y", forceY((d) => d.sy).strength(0.12))
       .alpha(1)
       .restart();
       
    simulation.on("tick", renderCanvasFrame);

    drawScatterAxes(cw, ch);
  }

  function renderCanvasFrame() {
    const state = store.get();
    const { colorblind: cb, region } = state;
    const hasSel = selected.size > 0;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;
    
    ctx.clearRect(0, 0, cw, ch);

    const active = simulation.nodes();
    
    // tier A: faded context (out of year / wrong focus)
    for (const p of active) {
      if (p.isLit) continue;
      const [r, g, b] = genreRgb(p.genre, cb);
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const opacity = !p.inYear ? 0.045 : 0.1;
      ctx.fillStyle = `rgba(${gray},${gray},${gray},${opacity})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, DOT_R, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // tier B: lit points
    for (const p of litPoints) {
      if (hasSel && selected.has(p)) continue;
      const [r, g, b] = genreRgb(p.genre, cb);
      
      let radius = DOT_R;
      let opacity = hasSel ? 0.1 : 0.82;
      
      if (hoveredGenre === p.genre) {
         radius += Math.sin(pulsePhase * Math.PI * 2) * 2;
         opacity = 1.0;
      }
      
      ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // tier C: selected points
    if (hasSel) {
      for (const p of litPoints) {
        if (!selected.has(p)) continue;
        const [r, g, b] = genreRgb(p.genre, cb);
        ctx.fillStyle = `rgba(${r},${g},${b},0.98)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, DOT_R + 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    
    qt = d3quadtree().x((d) => d.x).y((d) => d.y).addAll(litPoints);
  }

  function drawScatterAxes(cw, ch) {
    const region = store.get().region;
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
      .text(`${REGION_LABEL[region]} sales (log, M) →`);
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

  // ---------- stream selection + hover ----------
  function reflectSelection(state) {
    const [s, e] = state.yearRange;
    gStreamBands.attr("clip-path", "url(#hs-stream-clip)");
    gStreamBandsBg.style("display", null);
    const x0 = xStream(s);
    const x1 = xStream(e);
    streamSvg.select("#hs-stream-clip-rect")
      .attr("x", x0)
      .attr("width", Math.max(0, x1 - x0));
    // Selection edge indicators
    gStreamSel.selectAll(".hs-sel-edge").remove();
    if (s !== yearMin || e !== yearMax) {
      gStreamSel.append("line").attr("class", "hs-sel-edge")
        .attr("x1", x0).attr("x2", x0).attr("y1", streamT).attr("y2", streamB);
      gStreamSel.append("line").attr("class", "hs-sel-edge")
        .attr("x1", x1).attr("x2", x1).attr("y1", streamT).attr("y2", streamB);
    }
  }

  // ---------- stream hover + drag-to-select ----------
  function findGenreAtPoint(mx, my) {
    if (!cachedSeries || !cachedYStream) return null;
    const yr = Math.max(yearMin, Math.min(yearMax, Math.round(xStream.invert(mx))));
    const idx = years.indexOf(yr);
    if (idx < 0) return null;
    for (let i = cachedSeries.length - 1; i >= 0; i--) {
      const s = cachedSeries[i];
      const d = s[idx];
      const y1px = cachedYStream(d[1]);
      const y0px = cachedYStream(d[0]);
      if (my >= y1px && my <= y0px) return s.key;
    }
    return null;
  }

  function onStreamDown(event) {
    if (event.button !== 0) return;
    const [mx, my] = pointer(event, streamSvg.node());
    const [xL, xR] = xStream.range();
    if (mx < xL || mx > xR || my < streamT || my > streamB) return;
    streamDrag = { x0: mx, moved: false };
    tooltip.hide();
  }

  function setHoveredGenre(genre) {
    if (genre === hoveredGenre) return;
    hoveredGenre = genre;
    if (hoveredGenre && !pulseTimer) {
      pulseTimer = timer((elapsed) => {
        pulsePhase = (elapsed % 1000) / 1000;
        renderCanvasFrame();
      });
    } else if (!hoveredGenre && pulseTimer) {
      pulseTimer.stop();
      pulseTimer = null;
      pulsePhase = 0;
      renderCanvasFrame();
    }
  }

  function onStreamMove(event) {
    const [mx, my] = pointer(event, streamSvg.node());

    if (streamDrag) {
      if (Math.abs(mx - streamDrag.x0) > 3) streamDrag.moved = true;
      if (streamDrag.moved) {
        const [xL, xR] = xStream.range();
        const left = Math.max(xL, Math.min(streamDrag.x0, mx));
        const right = Math.min(xR, Math.max(streamDrag.x0, mx));
        gStreamSel.selectAll("rect.hs-stream-drag").data([0]).join("rect")
          .attr("class", "hs-stream-drag")
          .attr("x", left).attr("y", streamT)
          .attr("width", right - left).attr("height", streamB - streamT);
      }
      setHoveredGenre(null);
      return;
    }

    const [xL, xR] = xStream.range();
    if (mx < xL || mx > xR || my < streamT || my > streamB) {
      tooltip.hide();
      setHoveredGenre(null);
      return;
    }
    const genre = findGenreAtPoint(mx, my);
    setHoveredGenre(genre);
    
    if (!genre) { tooltip.hide(); return; }
    const yr = Math.max(yearMin, Math.min(yearMax, Math.round(xStream.invert(mx))));
    const idx = years.indexOf(yr);
    const val = idx >= 0 && cachedPerYear ? (cachedPerYear[idx]?.[genre] || 0) : 0;
    const region = store.get().region;
    const cb = store.get().colorblind;
    const color = genreColor(genre, cb);
    tooltip.show(
      `<div class="tooltip__title">${esc(genre)} · ${yr}</div>
       <div class="tooltip__row"><span><span class="tooltip__swatch" style="background:${color}"></span>${REGION_LABEL[region]} sales</span><b>${fmtSales(val)}</b></div>`,
      event.clientX,
      event.clientY
    );
  }

  function onStreamLeave() {
    if (!streamDrag) tooltip.hide();
    setHoveredGenre(null);
  }

  function onStreamUp(event) {
    if (!streamDrag) return;
    const d = streamDrag;
    streamDrag = null;
    gStreamSel.selectAll("rect.hs-stream-drag").remove();

    if (d.moved) {
      const [mx] = pointer(event, streamSvg.node());
      const [xL, xR] = xStream.range();
      let s = Math.round(xStream.invert(Math.max(xL, Math.min(d.x0, mx))));
      let e = Math.round(xStream.invert(Math.min(xR, Math.max(d.x0, mx))));
      s = Math.max(yearMin, Math.min(yearMax, s));
      e = Math.max(yearMin, Math.min(yearMax, e));
      if (s > e) [s, e] = [e, s];
      store.set({ yearRange: [s, e] });
    } else {
      const [mx, my] = pointer(event, streamSvg.node());
      const genre = findGenreAtPoint(mx, my);
      if (genre) {
        const current = store.get().focusedGenres || [];
        const updated = toggleFamily(current, genreFamily(genre));
        store.set({ focusedGenres: updated });
      }
    }
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
        const updated = toggleFamily(current, genreFamily(p.genre));
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
  // selected, the rail reflects the active filters.
  function syncSelectionUI() {
    const state = store.get();
    const region = state.region;
    const [ys, ye] = state.yearRange;
    const focusList = state.focusedGenres || [];
    const hasFocus = focusList.length > 0;

    const arr = [...selected];
    if (!arr.length) {
      selBadge.classList.remove("is-on");

      // Filter raw games from data.games using the active filters
      const filtered = (data.games || []).filter((g) => {
        if (g.year < ys || g.year > ye) return false;
        if (hasFocus && !focusList.includes(g.genre)) return false;
        const v = regionVal(g, region);
        return v > 0;
      });

      // Sort by the selected region's sales descending
      filtered.sort((a, b) => regionVal(b, region) - regionVal(a, region));

      // Get top 8
      const topGames = filtered.slice(0, 8).map((g) => ({
        title: g.title,
        console: g.console,
        genre: g.genre,
        year: g.year,
        sales: regionVal(g, region),
        score: g.score,
      }));

      const totalSales = filtered.reduce((acc, g) => acc + regionVal(g, region), 0);
      const summary = `${fmtInt(filtered.length)} titles · Σ ${fmtSales(totalSales)}`;

      shell?.setLeaderboard?.(topGames, {
        title: "HIGH SCORES",
        metric: "sales",
        summary: summary,
      });
      return;
    }
    const avg = arr.reduce((s, p) => s + p.score, 0) / arr.length;
    const tot = arr.reduce((s, p) => s + regionVal(p, region), 0);
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
    reflectSelection(state);
    syncSelectionUI();
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
    
    // update year range so scatter can tell what changed
    const ys = state.yearRange[0];
    const ye = state.yearRange[1];
    // a region switch re-weights the x-axis → an old pixel selection no
    // longer maps to the same titles, so drop it.
    if (state.region !== prev.region && selected.size) {
      selected = new Set();
      syncSelectionUI();
    }
    renderScatter(state); // cheap; reflects year/region/focus/selection
    reflectSelection(state);
    syncSelectionUI();
    prev = { 
      region: state.region, 
      focus: focusJSON, 
      cb: state.colorblind,
      yearRange: [ys, ye]
    };
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
      if (pulseTimer) pulseTimer.stop();
      simulation.stop();
      cancelAnimationFrame(resizeRaf);
      ro?.disconnect();
      unsub?.();
      legend?.destroy();
      tooltip.hide();
      scatterWrap.removeEventListener("mousedown", onScatterDown);
      scatterWrap.removeEventListener("mousemove", onScatterMove);
      scatterWrap.removeEventListener("mouseleave", onScatterLeave);
      window.removeEventListener("mouseup", onScatterUp);
      streamWrap.removeEventListener("mousedown", onStreamDown);
      streamWrap.removeEventListener("mousemove", onStreamMove);
      streamWrap.removeEventListener("mouseleave", onStreamLeave);
      window.removeEventListener("mouseup", onStreamUp);
      // Leaving the cartridge: hand the rail back to the all-time list.
      shell?.setLeaderboard?.(data.leaderboard);
      mountEl.innerHTML = "";
    },
  };
}
