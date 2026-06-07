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
import { GENRES, genreColor, genreFamily, toggleFamily, familyGenres } from "../ui/palette.js";
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

  let discWrap, sideEl, svg, gDisc, gRings, gCdBg, gBands, gSpoke, gYearLabels, gHub, gSpindle, legend, insetEl;
  let cx, cy, innerR, outerR, radius;
  let ro = null;
  let unsub = null;
  let resizeRaf = 0;
  let prev = {};
  let isMounted = false;
  let prevSpokeYear = null;

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
    gDisc = g.append("g").attr("class", "gw-disc-group");
    gCdBg = gDisc.append("g").attr("class", "gw-cd-bg");
    gRings = gDisc.append("g").attr("class", "gw-rings");
    gBands = gDisc.append("g").attr("class", "gw-bands");
    gYearLabels = gDisc.append("g").attr("class", "gw-yearlabels");
    gSpindle = gDisc.append("g").attr("class", "gw-spindle");
    
    gSpoke = g.append("g").attr("class", "gw-spoke-g");
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
  function renderDisc(state, forceNoTransition = false) {
    const { region, colorblind: cb } = state;
    const focusList = state.focusedGenres || [];
    const hasFocus = focusList.length > 0;

    // Clamp year range to dataset bounds
    const [ys, ye] = state.yearRange;
    const startYear = Math.max(yearMin, Math.min(yearMax, ys));
    const endYear   = Math.max(startYear, Math.min(yearMax, ye));

    // Keep the angle scale domain fixed to [yearMin, yearMax] so the disc layout is stable
    // and the playback/dragging animation moves clockwise in a natural, easy-to-follow way.
    angle.domain([yearMin, yearMax]);

    // Filter data to selected range
    const perYear = perYearFor(region).filter((d) => d.year >= startYear && d.year <= endYear);
    const series = d3stack().keys(GENRES)(perYear);
    const maxTotal = d3max(perYear, (o) => d3sum(GENRES, (g) => o[g])) || 1;
    radius.domain([0, maxTotal]);

    gCdBg
      .selectAll("circle")
      .data([0])
      .join("circle")
      .attr("class", "gw-cd-body")
      .attr("r", outerR);

    const areaInit = areaRadial()
      .angle((d) => angle(d.data.year))
      .innerRadius(innerR)
      .outerRadius(innerR)
      .curve(curveCardinal);

    const areaGen = areaRadial()
      .angle((d) => angle(d.data.year))
      .innerRadius((d) => radius(d[0]))
      .outerRadius((d) => radius(d[1]))
      .curve(curveCardinal);

    let dur = 0;
    let easeFunc = null;

    if (!REDUCED_MOTION && !forceNoTransition) {
      if (state.playing) {
        dur = PLAYHEAD_MS;
        easeFunc = easeLinear;
      } else {
        const ysChanged = prev.ys !== undefined && ys !== prev.ys;
        const yeChanged = prev.ye !== undefined && ye !== prev.ye;
        if (!isMounted) {
          dur = 800;
        } else if (!ysChanged && !yeChanged) {
          dur = 600;
        }
      }
    }

    const paths = gBands
      .selectAll("path")
      .data(series, (s) => s.key);

    const activePaths = paths.join(
      (enter) => enter.append("path")
        .attr("class", "gw-band")
        .attr("d", areaInit)
    );

    activePaths
      .attr("fill", (s) => genreColor(s.key, cb))
      .classed("is-faded", (s) => hasFocus && !focusList.includes(s.key))
      .on("click", (_e, s) => {
        const current = store.get().focusedGenres || [];
        const updated = toggleFamily(current, genreFamily(s.key));
        store.set({ focusedGenres: updated });
      })
      .on("mousemove", (event, s) => onBandHover(event, s.key, perYear, region))
      .on("mouseleave", () => tooltip.hide());

    if (dur > 0) {
      let t = activePaths.transition().duration(dur);
      if (easeFunc) {
        t = t.ease(easeFunc);
      }
      t.attr("d", areaGen);
    } else {
      activePaths.interrupt().attr("d", areaGen);
    }

    renderRings(dur, easeFunc);
    renderHub(region, maxTotal, perYear);
    renderYearLabels(startYear, endYear, dur, easeFunc);
  }

  function renderRings(dur, easeFunc) {
    const ticks = radius.ticks(4).filter((t) => t > 0);

    const circles = gRings
      .selectAll("circle")
      .data(ticks, (d) => d);

    const activeCircles = circles.join(
      (enter) => enter.append("circle")
        .attr("class", "gw-ring")
        .attr("r", (t) => radius(t))
        .attr("opacity", 0),
      (update) => update,
      (exit) => {
        if (dur > 0) {
          return exit.transition().duration(dur).ease(easeFunc || easeLinear)
            .attr("opacity", 0)
            .remove();
        } else {
          return exit.remove();
        }
      }
    );

    if (dur > 0) {
      activeCircles.transition().duration(dur).ease(easeFunc || easeLinear)
        .attr("r", (t) => radius(t))
        .attr("opacity", 1);
    } else {
      activeCircles.interrupt()
        .attr("r", (t) => radius(t))
        .attr("opacity", 1);
    }

    const labels = gRings
      .selectAll("text")
      .data(ticks, (d) => d);

    const activeLabels = labels.join(
      (enter) => enter.append("text")
        .attr("class", "gw-ring-label")
        .attr("x", 0)
        .attr("y", (t) => -radius(t) - 2)
        .attr("opacity", 0)
        .text((t) => `${fmtInt(Math.round(t))}M`),
      (update) => update,
      (exit) => {
        if (dur > 0) {
          return exit.transition().duration(dur).ease(easeFunc || easeLinear)
            .attr("opacity", 0)
            .remove();
        } else {
          return exit.remove();
        }
      }
    );

    if (dur > 0) {
      activeLabels.transition().duration(dur).ease(easeFunc || easeLinear)
        .attr("y", (t) => -radius(t) - 2)
        .attr("opacity", 1);
    } else {
      activeLabels.interrupt()
        .attr("y", (t) => -radius(t) - 2)
        .attr("opacity", 1);
    }
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
    gSpindle.selectAll("*").remove();
    const teethCount = 6;
    const teethRadius = innerR * 0.32;
    for (let i = 0; i < teethCount; i++) {
      const angleRad = (i * 2 * Math.PI) / teethCount;
      const x1 = Math.sin(angleRad) * (teethRadius - 1);
      const y1 = -Math.cos(angleRad) * (teethRadius - 1);
      const x2 = Math.sin(angleRad) * (teethRadius + 3);
      const y2 = -Math.cos(angleRad) * (teethRadius + 3);
      gSpindle.append("line")
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
  function renderYearLabels(startYear, endYear, dur, easeFunc) {
    const inRange = years.filter((y) => y >= startYear && y <= endYear);
    const yticks = inRange.filter((y) => y % 5 === 0 || y === startYear || y === endYear);

    const labels = gYearLabels
      .selectAll("text")
      .data(yticks, (d) => d);

    const activeLabels = labels.join(
      (enter) => enter.append("text")
        .attr("class", "gw-yearlabel")
        .attr("x", (y) => Math.sin(angle(y)) * (outerR + 14))
        .attr("y", (y) => -Math.cos(angle(y)) * (outerR + 14) + 3)
        .attr("opacity", 0)
        .text((y) => y),
      (update) => update,
      (exit) => {
        if (dur > 0) {
          return exit.transition().duration(dur).ease(easeFunc || easeLinear)
            .attr("opacity", 0)
            .remove();
        } else {
          return exit.remove();
        }
      }
    );

    if (dur > 0) {
      activeLabels.transition().duration(dur).ease(easeFunc || easeLinear)
        .attr("x", (y) => Math.sin(angle(y)) * (outerR + 14))
        .attr("y", (y) => -Math.cos(angle(y)) * (outerR + 14) + 3)
        .attr("opacity", 1);
    } else {
      activeLabels.interrupt()
        .attr("x", (y) => Math.sin(angle(y)) * (outerR + 14))
        .attr("y", (y) => -Math.cos(angle(y)) * (outerR + 14) + 3)
        .attr("opacity", 1);
    }
  }

  // Build an SVG donut-segment path between two angles.
  function arcBetween(a0, a1, r0, r1) {
    const x0i = Math.sin(a0) * r0, y0i = -Math.cos(a0) * r0;
    const x1i = Math.sin(a1) * r0, y1i = -Math.cos(a1) * r0;
    const x0o = Math.sin(a0) * r1, y0o = -Math.cos(a0) * r1;
    const x1o = Math.sin(a1) * r1, y1o = -Math.cos(a1) * r1;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    return `M${x0o},${y0o} A${r1},${r1} 0 ${large},1 ${x1o},${y1o} L${x1i},${y1i} A${r0},${r0} 0 ${large},0 ${x0i},${y0i} Z`;
  }

  // ---------- playhead spokes (start + end) and range arc ----------
  function renderSpoke(state) {
    const [ys, ye] = state.yearRange;
    const startYr = Math.max(yearMin, Math.min(yearMax, Math.round(ys)));
    const endYr   = Math.max(yearMin, Math.min(yearMax, Math.round(ye)));

    const startAng = angle(startYr);
    const endAng   = angle(endYr);

    // Keep the disc stationary
    gDisc.interrupt().attr("transform", null);

    const isStep = prevSpokeYear !== null && (endYr - prevSpokeYear === 1);
    const dur = state.playing && isStep && !REDUCED_MOTION ? PLAYHEAD_MS : 0;
    prevSpokeYear = endYr;

    // 1. Shaded arc between the two year spokes
    const arcPath = gSpoke.selectAll(".gw-range-arc").data([0]).join("path")
      .attr("class", "gw-range-arc");

    const prevStartAng = arcPath.node()?.__prevStartAng ?? startAng;
    const prevEndAng = arcPath.node()?.__prevEndAng ?? endAng;

    if (dur > 0) {
      arcPath.transition().duration(dur).ease(easeLinear)
        .attrTween("d", function() {
          const iStart = scaleLinear().domain([0, 1]).range([prevStartAng, startAng]);
          const iEnd = scaleLinear().domain([0, 1]).range([prevEndAng, endAng]);
          return function(t) {
            return arcBetween(iStart(t), iEnd(t), innerR, outerR);
          };
        });
    } else {
      arcPath.interrupt()
        .attr("d", arcBetween(startAng, endAng, innerR, outerR));
    }
    arcPath.node().__prevStartAng = startAng;
    arcPath.node().__prevEndAng = endAng;

    // 2. Start-year spoke (amber, dashed)
    const spokeStart = gSpoke.selectAll(".gw-spoke-start").data([0]).join("line")
      .attr("class", "gw-spoke-start");

    if (dur > 0) {
      spokeStart.transition().duration(dur).ease(easeLinear)
        .attr("x1", Math.sin(startAng) * innerR)
        .attr("y1", -Math.cos(startAng) * innerR)
        .attr("x2", Math.sin(startAng) * outerR)
        .attr("y2", -Math.cos(startAng) * outerR);
    } else {
      spokeStart.interrupt()
        .attr("x1", Math.sin(startAng) * innerR)
        .attr("y1", -Math.cos(startAng) * innerR)
        .attr("x2", Math.sin(startAng) * outerR)
        .attr("y2", -Math.cos(startAng) * outerR);
    }

    // 3. End-year spoke (cyan, animated during playback)
    const spokeLine = gSpoke.selectAll(".gw-spoke").data([0]).join("line").attr("class", "gw-spoke");
    if (dur > 0) {
      spokeLine.transition().duration(dur).ease(easeLinear)
        .attr("x1", Math.sin(endAng) * innerR)
        .attr("y1", -Math.cos(endAng) * innerR)
        .attr("x2", Math.sin(endAng) * outerR)
        .attr("y2", -Math.cos(endAng) * outerR);
    } else {
      spokeLine.interrupt()
        .attr("x1", Math.sin(endAng) * innerR)
        .attr("y1", -Math.cos(endAng) * innerR)
        .attr("x2", Math.sin(endAng) * outerR)
        .attr("y2", -Math.cos(endAng) * outerR);
    }

    // Toggle sheen overlay spin while playing
    const overlay = discWrap.querySelector(".gw__disc-overlay");
    if (overlay) overlay.classList.toggle("is-spinning", !!state.playing);
  }

  // ---------- side panel inset ----------
  function renderInset(state) {
    const focusList = state.focusedGenres || [];
    if (focusList.length === 0) {
      insetEl.innerHTML = `<p class="gw__hint">Click a band (or its legend hue) to focus genres and see their combined trend.</p>`;
      return;
    }
    const region = state.region;
    const cb = state.colorblind;
    const [ys, ye] = state.yearRange;
    const startYear = Math.max(yearMin, Math.min(yearMax, ys));
    const endYear   = Math.max(startYear, Math.min(yearMax, ye));

    // Find active families of focused genres
    const activeFamilies = [...new Set(focusList.map((g) => genreFamily(g)))];
    // Find all genres belonging to active families
    const allFamilyGenres = activeFamilies.flatMap((fam) => familyGenres(fam));

    const isMulti = allFamilyGenres.length > 1;
    const color = focusList.length === 1 ? genreColor(focusList[0], cb) : "#05d9e8";
    const label = focusList.length === 1 ? focusList[0] : `${focusList.length} Genres`;

    // Full dataset for background context
    const allData = years.map((y) => {
      const cell = gyr.table[region]?.[y] || {};
      let v = 0;
      for (const g of focusList) v += cell[g] || 0;
      return { year: y, v };
    });
    // Filtered to selected range
    const seriesData = allData.filter((d) => d.year >= startYear && d.year <= endYear);

    const peak = seriesData.length ? seriesData.reduce((a, b) => (b.v > a.v ? b : a), seriesData[0]) : { year: startYear, v: 0 };
    const tot = d3sum(seriesData, (d) => d.v);

    let swatchHtml = "";
    if (isMulti) {
      swatchHtml = `<div class="gw__inset-swatches">` +
        allFamilyGenres.map((g) => {
          const isActive = focusList.includes(g);
          const opacityStyle = isActive ? "opacity: 1;" : "opacity: 0.22; outline: 1px dashed rgba(255,255,255,0.4);";
          return `<span class="gw__inset-swatch" data-genre="${g}" style="background:${genreColor(g, cb)}; ${opacityStyle} cursor: pointer;"></span>`;
        }).join("") +
        `</div>`;
    } else {
      swatchHtml = `<span class="gw__inset-swatch" data-genre="${focusList[0]}" style="background:${color}; cursor: pointer;"></span>`;
    }

    insetEl.innerHTML = `
      <div class="gw__inset-title">
        ${swatchHtml}${label}
      </div>
      <div class="gw__inset-chart"></div>
      <p class="gw__inset-stat">Peak <b>${peak.year}</b> · ${fmtSales(peak.v)} &nbsp;·&nbsp; Total <b>${fmtSales(tot)}</b></p>
      <button class="gw__clear" aria-label="Clear focus">✕ Clear focus</button>`;
    insetEl.querySelector(".gw__clear").addEventListener("click", () =>
      store.set({ focusedGenres: [] })
    );

    // Custom tooltips on swatches
    const swatches = insetEl.querySelectorAll(".gw__inset-swatch");
    swatches.forEach((sw) => {
      const gName = sw.dataset.genre;
      const isActive = focusList.includes(gName);
      sw.addEventListener("mousemove", (e) => {
        tooltip.show(
          `<div class="tooltip__title">${gName}</div>
           <div class="tooltip__subtitle" style="font-size: 0.75rem; opacity: 0.8; margin-top: 4px;">
             ${isActive ? "Click to deselect" : "Click to select"}
           </div>`,
          e.clientX,
          e.clientY
        );
      });
      sw.addEventListener("mouseleave", () => { tooltip.hide(); });
      sw.addEventListener("click", () => {
        let updated;
        if (isActive) {
          updated = focusList.filter((g) => g !== gName);
        } else {
          updated = [...focusList, gName];
        }
        store.set({ focusedGenres: updated });
        tooltip.hide();
      });
    });

    // the linear line chart
    const host = insetEl.querySelector(".gw__inset-chart");
    const w = host.clientWidth || sideEl.clientWidth - 28 || 200;
    const h = 130;
    const mL = 30, mR = 8, mT = 8, mB = 18;
    // X axis spans full dataset; selected range highlighted
    const xx = scaleLinear().domain([yearMin, yearMax]).range([mL, w - mR]);
    const yy = scaleLinear().domain([0, d3max(allData, (d) => d.v) || 1]).range([h - mB, mT]).nice();
    const isvg = select(host).append("svg").attr("viewBox", `0 0 ${w} ${h}`).style("cursor", "pointer");

    // Shaded background for the selected year range
    isvg.append("rect")
      .attr("class", "gw-inset-range")
      .attr("x", xx(startYear))
      .attr("y", mT)
      .attr("width", Math.max(0, xx(endYear) - xx(startYear)))
      .attr("height", h - mT - mB);

    // Full-range area (dimmed context)
    isvg.append("path")
      .attr("class", "gw-inset-area gw-inset-area--dim")
      .attr("fill", color)
      .attr("d", d3area().x((d) => xx(d.year)).y0(h - mB).y1((d) => yy(d.v))(allData));

    // Selected-range area (bright)
    isvg.append("path")
      .attr("class", "gw-inset-area")
      .attr("fill", color)
      .attr("d", d3area().x((d) => xx(d.year)).y0(h - mB).y1((d) => yy(d.v))(seriesData));

    // Line over full range (dimmed)
    isvg.append("path")
      .attr("class", "gw-inset-line gw-inset-line--dim")
      .attr("stroke", color)
      .attr("d", d3line().x((d) => xx(d.year)).y((d) => yy(d.v))(allData));

    // Line over selected range (bright)
    isvg.append("path")
      .attr("class", "gw-inset-line")
      .attr("stroke", color)
      .attr("d", d3line().x((d) => xx(d.year)).y((d) => yy(d.v))(seriesData));

    isvg.append("g")
      .attr("class", "gw-inset-axis")
      .attr("transform", `translate(0,${h - mB})`)
      .call(axisBottom(xx).tickValues([yearMin, 2006, yearMax]).tickFormat(format("d")).tickSizeOuter(0));
    isvg.append("g")
      .attr("class", "gw-inset-axis")
      .attr("transform", `translate(${mL},0)`)
      .call(axisLeft(yy).ticks(3).tickFormat((v) => `${v}M`).tickSizeOuter(0));

    // Hover circles (only for points within selected range)
    const pointsGroup = isvg.append("g").attr("class", "gw-inset-points");
    pointsGroup.selectAll("circle")
      .data(seriesData)
      .join("circle")
      .attr("cx", (d) => xx(d.year))
      .attr("cy", (d) => yy(d.v))
      .attr("r", 5)
      .attr("fill", color)
      .attr("opacity", 0)
      .attr("style", "cursor: pointer; pointer-events: all;")
      .on("mousemove", (event, d) => {
        tooltip.show(
          `<div class="tooltip__title">${label} · ${d.year}</div>
           <div class="tooltip__row"><span>${region.toUpperCase()} sales</span><b>${fmtSales(d.v)}</b></div>`,
          event.clientX, event.clientY
        );
        select(event.currentTarget).attr("opacity", 0.85).attr("r", 3.5);
      })
      .on("mouseleave", (event) => {
        tooltip.hide();
        select(event.currentTarget).attr("opacity", 0).attr("r", 5);
      });

    isvg.on("click", (event) => {
      const [mx] = pointer(event, isvg.node());
      const yearVal = xx.invert(mx);
      const clickedYear = Math.max(yearMin, Math.min(yearMax, Math.round(yearVal)));
      const [s] = store.get().yearRange;
      store.set({ yearRange: [Math.min(s, clickedYear), clickedYear] });
    });
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

  // ---------- leaderboard sync ----------
  function syncLeaderboard(state) {
    const { region, yearRange, focusedGenres } = state;
    const [ys, ye] = yearRange;
    const focusList = focusedGenres || [];
    const hasFocus = focusList.length > 0;
    const regionVal = (g) => region === "total" ? (g.sales || 0) : (g[region] || 0);
    const filtered = (data.games || []).filter((g) => {
      if (g.year < ys || g.year > ye) return false;
      if (hasFocus && !focusList.includes(g.genre)) return false;
      return regionVal(g) > 0;
    });
    filtered.sort((a, b) => regionVal(b) - regionVal(a));
    const top = filtered.slice(0, 8).map((g) => ({
      title: g.title, console: g.console, genre: g.genre,
      year: g.year, sales: regionVal(g), score: g.score,
    }));
    const totalSales = filtered.reduce((acc, g) => acc + regionVal(g), 0);
    shell?.setLeaderboard?.(top, {
      title: "HIGH SCORES",
      metric: "sales",
      summary: `${fmtInt(filtered.length)} titles · Σ ${fmtSales(totalSales)}`,
    });
  }

  // ---------- orchestration ----------
  function onState(state) {
    const focusJSON = JSON.stringify(state.focusedGenres || []);
    const [ys, ye] = state.yearRange;
    const visualChanged =
      focusJSON !== prev.focus ||
      state.region !== prev.region ||
      state.colorblind !== prev.cb ||
      ys !== prev.ys ||
      ye !== prev.ye;
    if (visualChanged) {
      renderDisc(state);
      renderInset(state);
    }
    renderSpoke(state);
    syncLeaderboard(state);
    prev = { focus: focusJSON, region: state.region, cb: state.colorblind, ys, ye };
  }

  function measureAndRender(forceNoTransition = true) {
    layout();
    const state = store.get();
    const focusJSON = JSON.stringify(state.focusedGenres || []);
    const [ys, ye] = state.yearRange;
    renderDisc(state, forceNoTransition);
    renderSpoke(state);
    renderInset(state);
    syncLeaderboard(state);
    prev = { focus: focusJSON, region: state.region, cb: state.colorblind, ys, ye };
  }

  return {
    id: "genreWarp",
    title: "GENRE WARP",

    mount() {
      buildDom();
      shell?.setSampleSize?.(`${fmtInt(data.meta.window.withSales)} TITLES`);
      shell?.setLeaderboard?.(data.leaderboard);
      measureAndRender(false);
      isMounted = true;
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => measureAndRender(true));
      });
      ro.observe(discWrap);
      unsub = store.subscribe(onState);
    },

    update(state) {
      onState(state);
    },

    destroy() {
      isMounted = false;
      prevSpokeYear = null;
      cancelAnimationFrame(resizeRaf);
      ro?.disconnect();
      unsub?.();
      legend?.destroy();
      tooltip.hide();
      shell?.setLeaderboard?.(data.leaderboard);
      mountEl.innerHTML = "";
    },
  };
}
