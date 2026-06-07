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
import { genreFamily, familyColor, genreColor, toggleFamily } from "../ui/palette.js";
import { PLAYHEAD_MS } from "../store.js";
import { createLegend } from "../ui/legend.js";
import { tooltip } from "../ui/tooltip.js";

const AMP = 2.4; // ridge amplitude as a multiple of row spacing
const NEUTRAL = "#cdc6bb";
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const REGION_LABEL = { na: "NA", jp: "JP", pal: "PAL", other: "Other", total: "Total" };
// 4-way region split colors for the side-panel mini bars.
const REGION_COLORS = { na: "#05d9e8", jp: "#ff2a6d", pal: "#b967ff", other: "#00f5a0" };

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

const CART_COLORS = {
  NES: "#8b8b8b",   // Classic NES gray
  SNES: "#8085a6",  // SNES lavender-blue
  N64: "#373737",   // N64 charcoal dark gray
  GC: "#52479a",    // GameCube Indigo purple
  Wii: "#e5e9ec",   // Wii gloss white
  WiiU: "#00aeef",  // Wii U cyan
  GB: "#8b956d",    // Game Boy screen pea green
  GBA: "#5c2d91",   // GBA launch violet
  DS: "#c0c5c8",    // DS silver
  "3DS": "#007ebb",  // 3DS Aqua Blue
  PS: "#bcc2c3",    // PlayStation retro gray
  PS2: "#1f1f1f",   // PS2 matte black
  PS3: "#121212",   // PS3 glossy black
  PS4: "#0037a5",   // PlayStation corporate blue
  PSP: "#0d0d0d",   // PSP piano black
  XB: "#107c10",    // Xbox green
  X360: "#f4f4f4",  // Xbox 360 matte white
  XOne: "#0c0c0c",  // Xbox One matte black
  GEN: "#002f6c",   // Sega Genesis / Sega Corporate Blue
  PC: "#e6dec9",    // Classic retro PC beige
};

const CONSOLE_FULL_NAMES = {
  NES: "Nintendo Entertainment System",
  SNES: "Super Nintendo Entertainment System",
  N64: "Nintendo 64",
  GC: "GameCube",
  Wii: "Nintendo Wii",
  WiiU: "Nintendo Wii U",
  GB: "Game Boy",
  GBA: "Game Boy Advance",
  DS: "Nintendo DS",
  "3DS": "Nintendo 3DS",
  PS: "PlayStation",
  PS2: "PlayStation 2",
  PS3: "PlayStation 3",
  PS4: "PlayStation 4",
  PSP: "PlayStation Portable",
  XB: "Xbox",
  X360: "Xbox 360",
  XOne: "Xbox One",
  GEN: "Sega Genesis",
  PC: "Personal Computer",
  Other: "Other Platforms",
};

function getControllerLayout(consoleName, topGenres, cb) {
  const isWii = consoleName.includes("Wii");
  const isHandheld = consoleName.includes("DS") || consoleName.includes("3DS") || consoleName.includes("PSP") || consoleName.includes("GBA") || consoleName.includes("GB");
  
  const btnColors = Array(8).fill("#232230");
  const btnLabels = Array(8).fill("");
  
  topGenres.forEach((g, idx) => {
    if (idx < 8) {
      btnColors[idx] = genreColor(g.genre, cb);
      btnLabels[idx] = g.genre;
    }
  });

  const btnClass = (idx) => btnLabels[idx] ? "cw-ctrl-btn is-active" : "cw-ctrl-btn-inactive";

  if (isWii) {
    return {
      type: "wiimote",
      svg: `
        <rect x="80" y="10" width="40" height="100" rx="6" fill="#1b1a24" stroke="#3b374d" stroke-width="2" />
        <path class="${btnClass(0)}" data-genre="${btnLabels[0]}" style="fill:${btnColors[0]}" d="M 97,16 L 103,16 L 103,22 L 97,22 Z" />
        <path class="${btnClass(1)}" data-genre="${btnLabels[1]}" style="fill:${btnColors[1]}" d="M 103,22 L 109,22 L 109,28 L 103,28 Z" />
        <path class="${btnClass(2)}" data-genre="${btnLabels[2]}" style="fill:${btnColors[2]}" d="M 97,28 L 103,28 L 103,34 L 97,34 Z" />
        <path class="${btnClass(3)}" data-genre="${btnLabels[3]}" style="fill:${btnColors[3]}" d="M 91,22 L 97,22 L 97,28 L 91,28 Z" />
        <circle class="${btnClass(4)}" data-genre="${btnLabels[4]}" style="fill:${btnColors[4]}" cx="100" cy="48" r="7" />
        <circle cx="92" cy="64" r="3.5" fill="#3b374d" />
        <circle cx="108" cy="64" r="3.5" fill="#3b374d" />
        <circle cx="100" cy="74" r="4.5" fill="#3b374d" />
        <circle class="${btnClass(5)}" data-genre="${btnLabels[5]}" style="fill:${btnColors[5]}" cx="100" cy="88" r="3.5" />
        <circle class="${btnClass(6)}" data-genre="${btnLabels[6]}" style="fill:${btnColors[6]}" cx="100" cy="99" r="3.5" />
      `
    };
  } else if (isHandheld) {
    return {
      type: "handheld",
      svg: `
        <rect x="25" y="20" width="150" height="80" rx="10" fill="#1b1a24" stroke="#3b374d" stroke-width="2" />
        <rect x="65" y="28" width="70" height="52" rx="3" fill="#0d0a15" stroke="#252233" stroke-width="1.5" />
        <path class="${btnClass(0)}" data-genre="${btnLabels[0]}" style="fill:${btnColors[0]}" d="M 41,36 L 47,36 L 47,42 L 41,42 Z" />
        <path class="${btnClass(1)}" data-genre="${btnLabels[1]}" style="fill:${btnColors[1]}" d="M 47,45 L 53,45 L 53,51 L 47,51 Z" />
        <path class="${btnClass(2)}" data-genre="${btnLabels[2]}" style="fill:${btnColors[2]}" d="M 41,54 L 47,54 L 47,60 L 41,60 Z" />
        <path class="${btnClass(3)}" data-genre="${btnLabels[3]}" style="fill:${btnColors[3]}" d="M 35,45 L 41,45 L 41,51 L 35,51 Z" />
        <circle class="${btnClass(4)}" data-genre="${btnLabels[4]}" style="fill:${btnColors[4]}" cx="155" cy="42" r="4.5" />
        <circle class="${btnClass(5)}" data-genre="${btnLabels[5]}" style="fill:${btnColors[5]}" cx="167" cy="54" r="4.5" />
        <circle class="${btnClass(6)}" data-genre="${btnLabels[6]}" style="fill:${btnColors[6]}" cx="155" cy="66" r="4.5" />
        <circle class="${btnClass(7)}" data-genre="${btnLabels[7]}" style="fill:${btnColors[7]}" cx="143" cy="54" r="4.5" />
      `
    };
  } else {
    return {
      type: "gamepad",
      svg: `
        <path d="M 50,25 L 150,25 C 175,25 185,45 185,65 C 185,95 160,105 145,95 L 125,85 L 75,85 L 55,95 C 40,105 15,95 15,65 C 15,45 25,25 50,25 Z" fill="#1b1a24" stroke="#3b374d" stroke-width="2" />
        <circle cx="85" cy="70" r="10" fill="#100f17" stroke="#252233" stroke-width="1.5" />
        <circle cx="115" cy="70" r="10" fill="#100f17" stroke="#252233" stroke-width="1.5" />
        <path class="${btnClass(0)}" data-genre="${btnLabels[0]}" style="fill:${btnColors[0]}" d="M 44,37 L 52,37 L 52,45 L 44,45 Z" />
        <path class="${btnClass(1)}" data-genre="${btnLabels[1]}" style="fill:${btnColors[1]}" d="M 52,45 L 60,45 L 60,53 L 52,53 Z" />
        <path class="${btnClass(2)}" data-genre="${btnLabels[2]}" style="fill:${btnColors[2]}" d="M 44,53 L 52,53 L 52,61 L 44,61 Z" />
        <path class="${btnClass(3)}" data-genre="${btnLabels[3]}" style="fill:${btnColors[3]}" d="M 36,45 L 44,45 L 44,53 L 36,53 Z" />
        <circle class="${btnClass(4)}" data-genre="${btnLabels[4]}" style="fill:${btnColors[4]}" cx="148" cy="42" r="5.5" />
        <circle class="${btnClass(5)}" data-genre="${btnLabels[5]}" style="fill:${btnColors[5]}" cx="160" cy="55" r="5.5" />
        <circle class="${btnClass(6)}" data-genre="${btnLabels[6]}" style="fill:${btnColors[6]}" cx="148" cy="68" r="5.5" />
        <circle class="${btnClass(7)}" data-genre="${btnLabels[7]}" style="fill:${btnColors[7]}" cx="136" cy="55" r="5.5" />
      `
    };
  }
}

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
        .attr("fill", (d) => (d.domGenre ? genreColor(d.domGenre, store.get().colorblind) : NEUTRAL));

      const outline = gRow.append("path").attr("class", "cw-outline");

      gRow
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

  // ---------- honor the shared focusedGenres (coordination, M6) ----------
  // When a genre is focused elsewhere (HIGH SCORE / GENRE WARP), dim the
  // per-year bands whose dominant genre isn't in the selection — so the focused genres
  // "stay isolated" when you jump into CONSOLE WARS (redesign §5).
  function applyFocus(focusList = []) {
    const hasFocus = focusList.length > 0;
    rowEls.forEach((re, i) => {
      re.gRow
        .select(".cw-bands")
        .selectAll("rect")
        .data(rows[i].series)
        .style("opacity", (d) => (hasFocus && !focusList.includes(d.domGenre) ? 0.12 : 1))
        .style("filter", (d) => (hasFocus && !focusList.includes(d.domGenre) ? "grayscale(100%)" : "none"));
    });
  }

  // Recolor the per-year bands when the colorblind palette flips.
  function recolorBands(cb) {
    rowEls.forEach((re, i) => {
      re.gRow
        .select(".cw-bands")
        .selectAll("rect")
        .data(rows[i].series)
        .attr("fill", (d) => (d.domGenre ? genreColor(d.domGenre, cb) : NEUTRAL));
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
  function gameItem(g, rank, sub, region) {
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
    
    const val = region === "total" ? g.sales : g[region];

    return `
      <li class="cw__game">
        <div class="cw__game-top">
          <span class="cw__game-rank">${rank}</span>
          <span class="cw__game-title" title="${esc(g.title)}">${esc(g.title)}</span>
          <span class="cw__game-sales">${fmtSales(val)}</span>
        </div>
        <div class="cw__game-sub">${esc(sub)}</div>
        ${split}
      </li>`;
  }

  function renderPanelYear(yr) {
    const state = store.get();
    const region = state.region;
    const focusList = state.focusedGenres || [];
    const hasFocus = focusList.length > 0;

    // Dynamically filter data.games for the active year + genre focus
    const regionVal = (g) => region === "total" ? (g.sales || 0) : (g[region] || 0);
    const filtered = (data.games || []).filter((g) => {
      if (g.year !== yr) return false;
      if (hasFocus && !focusList.includes(g.genre)) return false;
      return regionVal(g) > 0;
    });
    filtered.sort((a, b) => regionVal(b) - regionVal(a));
    const topGames = filtered.slice(0, 8).map((g) => ({
      title: g.title, console: g.console, genre: g.genre,
      year: g.year, sales: regionVal(g), score: g.score,
      na: g.na, jp: g.jp, pal: g.pal, other: g.other,
    }));

    const list = topGames.length
      ? `<ul class="cw__list">${topGames
          .map((g, i) => gameItem(g, i + 1, `${g.console} · ${g.genre}`, region))
          .join("")}</ul>`
      : `<p class="cw__empty">No ranked sales this year.</p>`;

    // Push filtered year top sellers to the right-rail leaderboard
    const totalSales = filtered.reduce((acc, g) => acc + regionVal(g), 0);
    shell?.setLeaderboard?.(topGames, {
      title: `TOP · ${yr}`,
      metric: "sales",
      summary: `${filtered.length} titles · Σ ${fmtSales(totalSales)}`,
    });

    const cartridgesHtml = rows.map((row) => {
      const color = CART_COLORS[row.name] || "#555555";
      const fullName = CONSOLE_FULL_NAMES[row.name] || row.name;
      return `
        <div class="cw__cartridge" draggable="true" data-console="${row.name}" style="background:${color}" title="Drag or click to load ${fullName}">
          <div class="cw__cart-label">${row.name}</div>
          <div class="cw__cart-ridges"></div>
        </div>
      `;
    }).join("");

    panelEl.innerHTML = `
      <div class="cw__panel-head">
        <span class="cw__panel-title">SYSTEM DECK</span>
      </div>
      
      <div class="cw__slot-container">
        <div class="cw__slot-receptacle">
          <div class="cw__slot-flap"></div>
          <span class="cw__slot-prompt">DRAG / CLICK CART TO LOAD</span>
        </div>
      </div>

      <div class="cw__rack-title">Cartridge Rack</div>
      <div class="cw__rack">
        ${cartridgesHtml}
      </div>

      <div class="cw__game-list-title">Top games · ${yr}</div>
      ${list}
    `;

    const carts = panelEl.querySelectorAll(".cw__cartridge");
    carts.forEach((c) => {
      c.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", c.dataset.console);
        e.dataTransfer.effectAllowed = "move";
      });
      c.addEventListener("click", () => {
        selectConsole(c.dataset.console);
      });
    });

    const slot = panelEl.querySelector(".cw__slot-receptacle");
    if (slot) {
      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        slot.classList.add("is-dragover");
      });
      slot.addEventListener("dragleave", () => {
        slot.classList.remove("is-dragover");
      });
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("is-dragover");
        const name = e.dataTransfer.getData("text/plain");
        if (name) selectConsole(name);
      });
    }
  }

  function renderPanelConsole(name) {
    const state = store.get();
    const region = state.region;
    const cb = state.colorblind;
    const yr = playYear(state);
    const focusList = state.focusedGenres || [];
    const hasFocus = focusList.length > 0;

    // Dynamically filter data.games for this console + current playhead year + genre focus
    const regionVal = (g) => region === "total" ? (g.sales || 0) : (g[region] || 0);
    const filtered = (data.games || []).filter((g) => {
      const consoleName = cy.order.includes(g.console) ? g.console : "Other";
      if (consoleName !== name) return false;
      if (g.year !== yr) return false;
      if (hasFocus && !focusList.includes(g.genre)) return false;
      return regionVal(g) > 0;
    });
    filtered.sort((a, b) => regionVal(b) - regionVal(a));
    const topGames = filtered.slice(0, 8).map((g) => ({
      title: g.title, console: g.console, genre: g.genre,
      year: g.year, sales: regionVal(g), score: g.score,
      na: g.na, jp: g.jp, pal: g.pal, other: g.other,
    }));

    const list = topGames.length
      ? `<ul class="cw__list">${topGames
          .map((g, i) => gameItem(g, i + 1, g.genre, region))
          .join("")}</ul>`
      : `<p class="cw__empty">No releases this year.</p>`;

    // Check if we already have this console loaded in the panel to avoid re-triggering insertion animations
    const existingCart = panelEl.querySelector(".cw__cartridge.is-inserted");
    if (existingCart && existingCart.dataset.console === name) {
      const titleEl = panelEl.querySelector(".cw__game-list-title");
      if (titleEl) titleEl.textContent = `Top Titles · ${yr}`;
      
      const containerEl = panelEl.querySelector(".cw__game-list-container");
      if (containerEl) containerEl.innerHTML = list;

      const totalSales = filtered.reduce((acc, g) => acc + regionVal(g), 0);
      shell?.setLeaderboard?.(topGames, {
        title: `TOP · ${name} · ${yr}`,
        metric: "sales",
        summary: `${filtered.length} titles · Σ ${fmtSales(totalSales)}`,
      });
      return;
    }

    // Push to right-rail leaderboard
    const totalSales = filtered.reduce((acc, g) => acc + regionVal(g), 0);
    shell?.setLeaderboard?.(topGames, {
      title: `TOP · ${name} · ${yr}`,
      metric: "sales",
      summary: `${filtered.length} titles · Σ ${fmtSales(totalSales)}`,
    });

    const genreTotals = {};
    const cData = cy.table[name] || {};
    for (const y in cData) {
      const byGenre = cData[y].byGenre || {};
      for (const genre in byGenre) {
        genreTotals[genre] = (genreTotals[genre] || 0) + byGenre[genre];
      }
    }

    const regionRatio = region === "na" ? 0.49 : region === "jp" ? 0.12 : region === "pal" ? 0.29 : region === "other" ? 0.10 : 1.0;

    const topGenres = Object.entries(genreTotals)
      .map(([genre, sales]) => ({ genre, sales: sales * regionRatio }))
      .sort((a, b) => b.sales - a.sales);

    const layoutInfo = getControllerLayout(name, topGenres, cb);

    const genresListHtml = topGenres.slice(0, 8).map((g, idx) => {
      const color = genreColor(g.genre, cb);
      let btnLabel = "";
      if (layoutInfo.type === "wiimote") {
        btnLabel = idx === 4 ? "A" : idx === 5 ? "1" : idx === 6 ? "2" : ["U", "R", "D", "L"][idx] || "";
      } else {
        btnLabel = idx === 4 ? "X" : idx === 5 ? "A" : idx === 6 ? "B" : idx === 7 ? "Y" : ["U", "R", "D", "L"][idx] || "";
      }
      return `
        <li class="cw__genre-item" data-genre="${g.genre}" style="cursor:pointer">
          <span class="cw__genre-btn-key">${btnLabel}</span>
          <span class="cw__genre-color-dot" style="background:${color}"></span>
          <span class="cw__genre-name" title="${g.genre}">${g.genre}</span>
          <span class="cw__genre-sales">${fmtSales(g.sales)}</span>
        </li>
      `;
    }).join("");

    const cartColor = CART_COLORS[name] || "#555555";

    panelEl.innerHTML = `
      <div class="cw__panel-head">
        <span class="cw__panel-title">SYSTEM DECK</span>
        <button class="cw__panel-back" aria-label="Eject cartridge">✕ Eject</button>
      </div>

      <div class="cw__loaded-slot">
        <div class="cw__cartridge is-inserted" data-console="${name}" style="background:${cartColor}">
          <div class="cw__cart-label">${name}</div>
          <div class="cw__cart-ridges"></div>
        </div>
      </div>

      <div class="cw__controller-wrap">
        <svg class="cw__controller" viewBox="0 0 200 120">
          ${layoutInfo.svg}
        </svg>
      </div>

      <div class="cw__genre-list-title">Console Genre Breakdown</div>
      <ul class="cw__genre-list">
        ${genresListHtml}
      </ul>

      <div class="cw__game-list-title">Top Titles · ${yr}</div>
      <div class="cw__game-list-container">${list}</div>
    `;

    panelEl.querySelector(".cw__panel-back").addEventListener("click", clearSelection);

    attachConsolePanelEvents();
  }

  function applyConsolePanelFocus(focusedGenres = []) {
    if (panelMode !== "console") return;
    const hasFocus = focusedGenres.length > 0;
    
    // Update controller buttons
    const btns = panelEl.querySelectorAll(".cw-ctrl-btn");
    btns.forEach((btn) => {
      const genre = btn.dataset.genre;
      if (!genre) return;
      const isFocused = !hasFocus || focusedGenres.includes(genre);
      btn.classList.toggle("is-focused", isFocused && hasFocus);
      btn.style.opacity = isFocused ? 1 : 0.25;
      btn.style.filter = isFocused ? "none" : "grayscale(100%)";
    });

    // Update genre list items
    const items = panelEl.querySelectorAll(".cw__genre-item");
    items.forEach((item) => {
      const genre = item.dataset.genre;
      if (!genre) return;
      const isFocused = !hasFocus || focusedGenres.includes(genre);
      item.classList.toggle("is-focused", isFocused && hasFocus);
      item.style.opacity = isFocused ? 1 : 0.25;
      item.style.filter = isFocused ? "none" : "grayscale(100%)";
    });
  }

  function toggleGenreFocus(genre) {
    const current = store.get().focusedGenres || [];
    let updated;
    if (current.includes(genre)) {
      updated = current.filter((g) => g !== genre);
    } else {
      updated = [...current, genre];
    }
    store.set({ focusedGenres: updated });
  }

  function attachConsolePanelEvents() {
    const state = store.get();
    applyConsolePanelFocus(state.focusedGenres);

    const btns = panelEl.querySelectorAll(".cw-ctrl-btn");
    btns.forEach((btn) => {
      const genre = btn.dataset.genre;
      if (!genre) return;
      
      btn.addEventListener("mousemove", (e) => {
        const item = panelEl.querySelector(`.cw__genre-item[data-genre="${genre}"]`);
        const salesValText = item ? item.querySelector(".cw__genre-sales").textContent : "";
        tooltip.show(
          `<div class="tooltip__title">${genre}</div>
           <div class="tooltip__row"><span>Lifetime Sales</span><b>${salesValText}</b></div>`,
          e.clientX,
          e.clientY
        );
      });
      
      btn.addEventListener("mouseleave", () => {
        tooltip.hide();
      });

      btn.addEventListener("click", () => {
        toggleGenreFocus(genre);
      });
    });

    const items = panelEl.querySelectorAll(".cw__genre-item");
    items.forEach((item) => {
      const genre = item.dataset.genre;
      if (!genre) return;

      item.addEventListener("click", () => {
        toggleGenreFocus(genre);
      });
    });
  }

  function selectConsole(name) {
    selectedConsole = name;
    panelMode = "console";
    rowEls.forEach((re) => {
      re.gRow.classed("is-dimmed", re.name !== name);
      re.gRow.classed("is-active", re.name === name);
    });
    renderPanelConsole(name);
  }

  function clearSelection() {
    const loadedCart = panelEl.querySelector(".cw__cartridge.is-inserted");
    if (loadedCart && !REDUCED_MOTION) {
      loadedCart.classList.remove("is-inserted");
      loadedCart.classList.add("is-ejecting");
      loadedCart.addEventListener("animationend", () => {
        executeClear();
      }, { once: true });
    } else {
      executeClear();
    }
  }

  function executeClear() {
    selectedConsole = null;
    panelMode = "year";
    rowEls.forEach((re) => {
      re.gRow.classed("is-dimmed", false);
      re.gRow.classed("is-active", false);
    });
    renderPanelYear(playYear(store.get()));
  }

  function onHover(event, row) {
    const [mx] = pointer(event, svg.node());
    const yr = Math.max(yearMin, Math.min(yearMax, Math.round(x.invert(mx))));
    const d = row.series.find((s) => s.year === yr);
    if (!d) return;
    const region = store.get().region;
    const color = d.domGenre ? genreColor(d.domGenre, store.get().colorblind) : NEUTRAL;
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
    let regionChanged = false;
    if (state.region !== prevRegion) {
      renderRidges(state, true);
      prevRegion = state.region;
      regionChanged = true;
    }
    if (state.colorblind !== prevCb) {
      recolorBands(state.colorblind);
      prevCb = state.colorblind;
    }
    const focusJSON = JSON.stringify(state.focusedGenres || []);
    const focusChanged = focusJSON !== prevFocus;
    if (focusChanged) {
      applyFocus(state.focusedGenres);
      applyConsolePanelFocus(state.focusedGenres);
      prevFocus = focusJSON;
    }
    const yr = playYear(state);
    const yearChanged = yr !== prevPlayYear;
    if (yearChanged || regionChanged) {
      renderPlayhead(state);
      prevPlayYear = yr;
    }
    // Re-render panels when region, year, or genre focus changes
    if (regionChanged || focusChanged || yearChanged) {
      if (panelMode === "console" && selectedConsole) {
        renderPanelConsole(selectedConsole);
      } else if (panelMode === "year") {
        renderPanelYear(playYear(state));
      }
    }
  }

  function measureAndBuild() {
    const w = chartWrap.clientWidth || 600;
    const h = chartWrap.clientHeight || 360;
    rebuild(w, h);
    const state = store.get();
    renderRidges(state, false);

    // Re-apply console selection classes if a console is currently selected
    if (selectedConsole) {
      rowEls.forEach((re) => {
        re.gRow.classed("is-dimmed", re.name !== selectedConsole);
        re.gRow.classed("is-active", re.name === selectedConsole);
      });
    }

    applyFocus(state.focusedGenres); // bands are rebuilt on resize → reapply
    renderPlayhead(state);
  }

  return {
    id: "consoleWars",
    title: "CONSOLE WARS",

    mount() {
      buildDom();
      shell?.setSampleSize?.(`${fmtInt(data.meta.window.withSales)} TITLES`);
      // Initialize leaderboard with all-time top sellers for this view
      shell?.setLeaderboard?.(data.leaderboard);

      const state = store.get();
      prevRegion = state.region;
      prevPlayYear = playYear(state);
      prevFocus = JSON.stringify(state.focusedGenres || []);
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
      // Restore the all-time leaderboard when leaving this view
      shell?.setLeaderboard?.(data.leaderboard);
      mountEl.innerHTML = "";
    },
  };
}
