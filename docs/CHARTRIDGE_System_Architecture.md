# CHARTRIDGE — System Architecture
### *Insert a cartridge. Play the data.*

A web-based interactive data-visualization system for the **Video Game Sales & Industry** dataset (Divekar 2026, 64,016 rows), built in **D3.js**. CHARTRIDGE presents itself as a retro handheld-console OS: the user boots the device, the screen reads **"LOADING MARKET MEMORY…"**, and lands on a **cartridge-select** menu. Each visualization is a *game cartridge*:

| Cartridge | Visualization | Answers |
|---|---|---|
| **HIGH SCORE** | Linked genre streamgraph + critic-score × sales scatter | Quality vs sales, hidden gems, genre eras |
| **CONSOLE WARS** | Console-lifecycle ridgeline + year playhead | Platform lifecycles, regional strength, genre-per-console |
| **GENRE WARP** | Radial genre spiral + focus inset | Genre peaks over time, era dominance, single-genre drill-down |

> This document is the **build architecture**. The per-cartridge visual/encoding design lives in `Group5_Visualization_Redesign_Spec.md`; read both together.

---

## 1. Tech stack & rationale

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite** | Instant dev server, ES-module bundling, zero-config for Claude Code. |
| Language | **Vanilla JS (ES modules)** | D3 owns the DOM. A framework (React) fighting D3 over the SVG is the #1 source of bugs in student D3 projects. Keep it framework-free. |
| Viz | **D3.js v7** | Scales, shapes, transitions, force, axes, brush — all native. |
| Rendering | **SVG** for everything except the HIGH SCORE scatter, which uses **`<canvas>`** (4k+ points). | SVG = easy interaction; canvas = performance for dense marks. |
| Styling | **Plain CSS + custom properties** | Theme tokens (colors, fonts) in `:root`; no Tailwind needed for a contained app. |
| Fonts | **Press Start 2P** (headings only) + **Inter / system-ui** (data text) | Pixel font for flavor, clean sans for legibility — fixes "text too small." |
| State | **Tiny custom pub/sub store** (~30 lines) | Coordinated views need shared state; a full state library is overkill. |
| Data | CSV loaded once, parsed, cleaned, **pre-aggregated into lookup tables** | 64k rows must never be re-scanned on interaction. |

> **If your team strongly prefers React:** use React only for the *shell* (routing between cartridges, control panel) and let each cartridge be a `useRef` + `useEffect` that hands a bare `<div>`/`<svg>` to D3. Never let React re-render inside D3's subtree. Vanilla is still recommended.

---

## 2. The console metaphor → architecture mapping

The retro-console fiction isn't decoration — it maps 1:1 onto real modules, so the theme *carries information* (the cross-cutting fix from the redesign spec):

```
  Physical console part        →   Software module
  ─────────────────────────────────────────────────────
  Power-on / boot screen       →   Boot sequence + data loader
  Cartridge-select menu        →   Router / cartridge registry
  The cartridge slot           →   mount()/destroy() lifecycle
  D-pad                        →   Year scrubber / timeline nav
  Face buttons (A/B/X/Y)       →   Region toggle (NA/JP/PAL/Other/Total)
  Shoulder buttons             →   Focused-genre / reset
  Screen bezel                 →   Thin themed SVG border (≤15% chrome)
  Status LED / readout         →   Active-sample-size + filter readout
```

---

## 3. Project structure

```
chartridge/
├── index.html
├── vite.config.js
├── public/
│   └── data/
│       └── video_games_sales.csv          # the Divekar raw file
├── src/
│   ├── main.js                            # bootstrap: boot → load → mount shell
│   ├── store.js                           # shared pub/sub state (coordinated views)
│   ├── theme.css                          # CSS custom properties (the design tokens)
│   ├── data/
│   │   ├── loader.js                      # fetch + parse + clean ("Load Market Memory")
│   │   └── aggregate.js                   # pre-built lookup tables (genre×year×region, console×year)
│   ├── shell/
│   │   ├── boot.js                        # boot animation, then resolves
│   │   ├── console.js                     # frame, screen, hardware controls
│   │   ├── router.js                      # cartridge registry + switching
│   │   └── menu.js                        # "INSERT CARTRIDGE" select screen
│   ├── ui/                                # shared, reusable across cartridges
│   │   ├── palette.js                     # 6-family genre color scale + colorblind set
│   │   ├── legend.js                      # genre-family legend
│   │   ├── sizeLegend.js                  # nested-circle size legend
│   │   ├── tooltip.js                     # single shared tooltip singleton
│   │   ├── regionToggle.js                # face-button region control
│   │   └── yearScrubber.js                # D-pad timeline control + playhead
│   └── cartridges/
│       ├── cartridge.js                   # the interface contract (base)
│       ├── highScore.js                   # Cartridge 01
│       ├── consoleWars.js                 # Cartridge 02
│       └── genreWarp.js                   # Cartridge 03
└── package.json
```

---

## 4. Data pipeline — "Loading Market Memory"

One pass on boot. Never touch the raw 64k rows again.

```js
// data/loader.js
import { csv, timeParse } from "d3";
const parseDate = timeParse("%d-%m-%Y");

export async function loadMarketMemory() {
  const raw = await csv("/data/video_games_sales.csv", d => {
    const date = parseDate(d.release_date);
    return {
      title: d.title,
      console: d.console,
      genre: d.genre,
      publisher: d.publisher,
      developer: d.developer,
      score: d.critic_score ? +d.critic_score : null,   // ~10% present
      sales: d.total_sales ? +d.total_sales : null,      // ~30% present
      na: +d.na_sales || 0, jp: +d.jp_sales || 0,
      pal: +d.pal_sales || 0, other: +d.other_sales || 0,
      year: date ? date.getFullYear() : null,
    };
  });
  // CLEAN: usable analytical window
  const games = raw.filter(d => d.year && d.year >= 1995 && d.year <= 2017);
  return games;
}
```

```js
// data/aggregate.js  — build ALL lookup tables once
export function buildAggregates(games) {
  return {
    genreYearRegion: rollupGenreYearRegion(games), // for streams + spiral
    consoleYear:     rollupConsoleYear(games),      // for ridgeline (sales + dominant genre)
    scoredGames:     games.filter(d => d.score != null && d.sales != null), // ~4,126 → scatter
    meta: { total: games.length, scored: /* count */ }, // for on-screen sample-size readout
  };
}
```

The boot screen shows a fake-but-honest progress readout: `LOADING MARKET MEMORY… 64,016 RECORDS · 18,922 WITH SALES · 4,126 SCORED`.

---

## 5. State store — the coordinated-views backbone

Every cartridge and every control reads/writes **one** state object and subscribes to changes. This is what makes the three views feel like one machine (Roberts' coordinated multiple views).

```js
// store.js
const state = {
  cartridge: "menu",                 // "highScore" | "consoleWars" | "genreWarp" | "menu"
  region: "total",                   // "na" | "jp" | "pal" | "other" | "total"
  focusedGenre: null,                // a genre string, or null = all
  yearRange: [1995, 2017],           // brush / scrubber
  colorblind: false,
};
const subs = new Set();
export const store = {
  get: () => state,
  set(patch) { Object.assign(state, patch); subs.forEach(fn => fn(state)); },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};
```

**Data flow (one direction, predictable):**

```
  user acts on a control  →  store.set({...})  →  all subscribers re-render
        ▲                                                    │
        └──────────────── controls re-read state ◀───────────┘
```

- `region` and `focusedGenre` are **global** — set in HIGH SCORE, still active in GENRE WARP.
- `yearRange` is shared by the timeline-based cartridges.
- Cartridges **diff** the patch and update only what changed (don't full-redraw on every tick).

---

## 6. The Cartridge interface (module contract)

Every visualization implements the same three-method contract so the router can hot-swap them like real cartridges:

```js
// cartridges/cartridge.js  (contract every cartridge follows)
export function createCartridge({ data, store, mountEl }) {
  return {
    id: "highScore",
    title: "HIGH SCORE",
    mount() { /* build SVG/canvas, draw initial state, subscribe to store */ },
    update(state) { /* respond to region/genre/year changes via transitions */ },
    destroy() { /* unsubscribe, remove nodes, free the slot */ },
  };
}
```

Router behavior: on cartridge switch → `current.destroy()` → `next.mount()`. Shared state persists across the swap, so a region/genre the user picked carries into the next cartridge.

---

## 7. The three cartridges (recap — full encodings in the redesign spec)

- **HIGH SCORE** (`highScore.js`): top = genre streamgraph (`d3.stack` + `stackOffsetWiggle`); bottom = **canvas** scatter of the 4,126 scored games, x=`sales` (log), y=`score`, color=genre family. Brush on stream filters scatter; click genre → `store.set({focusedGenre})`.
- **CONSOLE WARS** (`consoleWars.js`): ridgeline, one `d3.area` row per top-15 console, sorted by peak year, fill = dominant genre family/year; region toggle redraws; year playhead drives a "top games this year" side panel.
- **GENRE WARP** (`genreWarp.js`): `d3.areaRadial` stacked spiral, angle=year, radius=cumulative sales, labeled concentric gridlines; click genre → band brightens + linear inset line chart.

---

## 8. Shared UI kit — the console hardware as controls

Build these **once** in `src/ui/` and reuse across all cartridges (DRY + consistent theme):

- `palette.js` — `genreFamily(genre) → hue`, plus a `colorblind` variant; single source of truth so colors match everywhere.
- `regionToggle.js` — renders as the console's **face buttons**; calls `store.set({region})`.
- `yearScrubber.js` — the **D-pad / slider**; owns the playhead `requestAnimationFrame` loop; calls `store.set({yearRange})`.
- `tooltip.js` — **one** shared tooltip div, positioned on hover; never instantiate per-cartridge.
- `legend.js` + `sizeLegend.js` — genre-family legend and nested-circle size legend (mandatory wherever size encodes sales).

---

## 9. Theming system (design tokens)

`theme.css` — all visual constants in one place so the retro look is consistent and tweakable:

```css
:root {
  --bg-console:   #5B3FD9;     /* purple shell */
  --bg-screen:    #FBF1E3;     /* cream screen */
  --ink:          #1d1d1f;
  --accent:       #E4572E;     /* coin/title red */
  /* genre families */
  --fam-action:#E4572E; --fam-compete:#3F88C5; --fam-systems:#2A9D8F;
  --fam-story:#9B5DE5;  --fam-social:#F6C667;  --fam-online:#FF5DA2;
  --font-display: "Press Start 2P", monospace;  /* headings ONLY */
  --font-data: "Inter", system-ui, sans-serif;  /* ticks, tooltips ≥12px */
  --screen-fill: 0.85;          /* screen occupies 85% of canvas, ≤15% chrome */
}
```

---

## 10. Performance budget

- **Pre-aggregate everything once** (§4). Interactions read tiny lookup tables, never the 64k array.
- **Scatter → canvas.** 4k SVG circles with hover is fine; if you add more, canvas + a quadtree for hit-testing.
- **Freeze the force sim** (if used) after ~120 ticks; don't run it live on every frame.
- **Transitions, not rebuilds.** On state change, join data and transition (`enter/update/exit`); never `innerHTML = ""` and redraw.
- **Playhead** uses one `requestAnimationFrame` loop, not `setInterval` per element.
- Target: cartridge switch < 200ms; filter response < 100ms.

---

## 11. Accessibility
- ≤6 color hues + the **focus-one-genre** interaction so color never works alone.
- **Colorblind toggle** in settings → swaps to the safe palette / adds patterns.
- Keyboard: arrow keys drive the scrubber, number keys pick cartridges, `R` resets.
- All data text ≥12px in the sans font; sufficient contrast on the cream screen.
- `aria-label`s on controls; respect `prefers-reduced-motion` (skip boot animation).

---

## 12. Responsive layout
- The console frame scales with `viewBox` + `preserveAspectRatio`; SVG charts use a `resize` observer to recompute scales (don't hard-code pixel widths).
- Below ~720px, stack HIGH SCORE's two panels vertically and collapse the side panels into drawers.

---

## 13. Build & deploy
```
npm create vite@latest chartridge -- --template vanilla
cd chartridge && npm i d3
# place CSV in public/data/, build src/ per the tree above
npm run dev      # local
npm run build    # static dist/ → deploy to GitHub Pages / Netlify / Vercel
```
No backend required — it's a static site reading one CSV.

---

## 14. Build roadmap (milestones)

1. **M0 — Skeleton:** Vite app, `theme.css`, empty shell that boots and shows the cartridge menu.
2. **M1 — Data spine:** `loader.js` + `aggregate.js`; log the lookup tables; wire the boot readout.
3. **M2 — Store + UI kit:** `store.js`, `palette.js`, `tooltip.js`, `regionToggle.js`, `yearScrubber.js`.
4. **M3 — CONSOLE WARS** (most self-contained, biggest payoff) — ship it fully wired to the store.
5. **M4 — HIGH SCORE** (the linking/brushing is the hardest; canvas scatter).
6. **M5 — GENRE WARP** (radial math last).
7. **M6 — Coordination pass:** verify region + focusedGenre persist across cartridge swaps.
8. **M7 — Polish:** accessibility, responsive, colorblind toggle, reduced-motion, sample-size readouts.

---

## 15. Master prompt for Claude Code

> Build **CHARTRIDGE**, a static web app (Vite + vanilla ES modules + D3 v7) that presents a retro handheld-console OS for exploring `public/data/video_games_sales.csv` (cols: title, console, genre, publisher, developer, critic_score, total_sales, na_sales, jp_sales, pal_sales, other_sales, release_date). Follow this architecture:
>
> Use the folder structure and the modules described here: a one-time data loader that parses release_date (dd-mm-yyyy)→year, clamps to 1995–2017, and pre-aggregates genre×year×region, console×year, and the ~4,126 games with both critic_score and total_sales. A tiny pub/sub `store` holding {cartridge, region, focusedGenre, yearRange, colorblind}. A console shell with a boot sequence ("LOADING MARKET MEMORY"), a cartridge-select menu, and hardware controls (face buttons = region toggle NA/JP/PAL/Other/Total, D-pad = year scrubber). A shared UI kit (6-family genre color scale + colorblind variant, one tooltip singleton, genre-family legend, nested-circle size legend). Three cartridges implementing a mount/update/destroy contract and all reading the shared store so region and focusedGenre persist across cartridge swaps:
> - **CONSOLE WARS** — console-lifecycle ridgeline (top-15 consoles by total_sales, rows sorted by peak year, fill = dominant genre family per year, region toggle redraws, year playhead updates a "top games this year" panel).
> - **HIGH SCORE** — top streamgraph of genre share of total_sales (stackOffsetWiggle); bottom canvas scatter of the scored games (x=total_sales log, y=critic_score, color=genre family); brushing a year range on the stream filters the scatter; clicking a genre sets focusedGenre and highlights both panels.
> - **GENRE WARP** — radial stacked-area spiral (angle=year, radius=cumulative total_sales by genre family, labeled concentric gridlines, no pie); clicking a genre brightens its band and shows a linear inset line chart.
>
> Headings in "Press Start 2P", all data text in Inter ≥12px. Theme via CSS custom properties. Pre-aggregate once; use enter/update/exit transitions, never full redraws; render the dense scatter on canvas. Show an honest active-sample-size readout. Build in this order: skeleton → data → store+UI kit → CONSOLE WARS → HIGH SCORE → GENRE WARP → coordination → polish.

---

*CHARTRIDGE — three cartridges, one machine. The console fiction is the information architecture, not a skin.*
