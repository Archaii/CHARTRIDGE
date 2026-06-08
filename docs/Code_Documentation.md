# CHARTRIDGE — Code Documentation

A walkthrough of the system's code, **with the D3.js usage highlighted**. CHARTRIDGE is a static Vite + vanilla-ES-modules app; **D3 v7** does all the heavy lifting (scales, shapes, axes, stacks, brush, quadtree, transitions). File paths are clickable.

- Live data flow: **load once → pre-aggregate → render from tiny lookup tables**.
- The shell (arcade cabinet) is plain DOM/CSS; the **charts** are where D3 lives.

---

## 1. Architecture at a glance

```
 boot ──► loader.js ──► aggregate.js ──► { lookup tables }
                                              │
                       ┌──────────────────────┼───────────────────────┐
                       ▼                       ▼                       ▼
                 store.js  ◄──── controls (region / year / colorblind / focus)
                       │
            ┌──────────┴──────────┐
            ▼          ▼          ▼
      consoleWars  highScore  genreWarp        (each: mount / update / destroy)
            └──────────┬──────────┘
                       ▼
                 shared UI kit (palette · legend · tooltip · regionToggle · yearScrubber)
```

| Layer | Files | D3 used? |
|---|---|---|
| Data pipeline | [src/data/loader.js](../src/data/loader.js), [src/data/aggregate.js](../src/data/aggregate.js) | **Yes** (loader) / No (aggregate) |
| Shared state | [src/store.js](../src/store.js) | No |
| Shell / cabinet | [src/shell/](../src/shell/) | No |
| UI kit | [src/ui/](../src/ui/) | No |
| Cartridges (charts) | [src/cartridges/](../src/cartridges/) | **Yes — the core D3 work** |

---

## 2. Data pipeline

### 2.1 `loader.js` — parsing the CSV  *(D3: `d3.csv`, `d3.timeParse`)*

D3's CSV loader streams the file through a **row-accessor** that coerces types and derives `year` from the `dd-mm-yyyy` date. Counts are tallied in the same pass for the honest on-screen readout.

```js
// src/data/loader.js
import { csv, timeParse } from "d3";
const parseDate = timeParse("%d-%m-%Y");

const parsed = await csv(CSV_URL, (row) => {
  const date = parseDate(row.release_date);
  const score = row.critic_score ? +row.critic_score : null;
  const sales = row.total_sales ? +row.total_sales : null;
  // …tally counts…
  return { title: row.title, console: row.console, genre: row.genre,
           score, sales, na:+row.na_sales||0, /* … */,
           year: date ? date.getFullYear() : null };
});
const games = parsed.filter(d => d.year >= 1995 && d.year <= 2017); // clamp window
```

**Why it matters:** one pass, one parse. After this the raw 64k rows are never scanned again.

### 2.2 `aggregate.js` — pre-built lookup tables  *(plain JS, by design)*

Aggregation is deliberately **dependency-free** so the data spine stays decoupled from the theme. It builds, once:
- `genreYearRegion` — `table[region][year][genre] → sales` (feeds the streamgraph + the spiral),
- `consoleYear` — per console × year regional sales + a genre breakdown (feeds the ridgeline),
- `scoredGames` — the ~4,126 games with both score and sales (the scatter),
- `topGamesByYear` / `topGamesByConsole` / `leaderboard` — for the side panels and the cabinet rail,
- `meta` — the honest sample-size counts.

This is the **performance backbone**: every interaction reads these small objects, never the 64k array.

---

## 3. Shared state — `store.js`

A ~20-line pub/sub store is the coordinated-views backbone. One object, many subscribers; controls call `set`, cartridges `subscribe`.

```js
// src/store.js
const state = { cartridge:"menu", region:"total", focusedFamily:null,
                yearRange:[1995,2017], colorblind:false, playing:false };
export const store = {
  get: () => state,
  set(patch){ Object.assign(state, patch); subs.forEach(fn => fn(state)); },
  subscribe(fn){ subs.add(fn); return () => subs.delete(fn); },
};
```

Because `region` and `focusedFamily` live here (not in a cartridge), they **persist across cartridge swaps** — the heart of the "one machine" feel.

---

## 4. The cartridge contract

Every chart implements the same three methods so the router can hot-swap them ([src/cartridges/cartridge.js](../src/cartridges/cartridge.js)):

```js
createCartridge({ mountEl, data, store, shell }) => {
  id, title,
  mount(),         // build SVG/canvas, draw initial state, subscribe to store
  update(state),   // respond to region/year/focus changes via transitions
  destroy(),       // unsubscribe, remove nodes, free the slot
}
```

---

## 5. D3 deep-dive: the three cartridges

> **Encoding model (current).** The cartridges encode **all 20 genres** with their own hue (`genreColor()` in [palette.js](../src/ui/palette.js)), but the hues are organized into **5 genre groups** (combat / mind / story / speed / casual) so each group reads as a color *region* and the legend stays learnable. Under the **colorblind** toggle, the 20 hues collapse to the 5 group colors (Okabe–Ito). **Focus** is a *multi-select* list, `store.focusedGenres`, toggled a whole group at a time via `toggleFamily(...)`; all three cartridges read the same list, so a genre's color **and** its focus state are identical everywhere.

### 5.1 CONSOLE WARS — ridgeline  *([consoleWars.js](../src/cartridges/consoleWars.js))*
**D3:** `scaleLinear`, `d3.area`, `curveBasis`, `axisBottom`, `.transition()` + `easeLinear`, `clipPath`.

Each console row is a `d3.area` whose height encodes sales. The signature trick: the **fill is the dominant genre per year**, achieved by drawing colored per-year `<rect>` bands **clipped to the area silhouette** — so one smooth ridge shows multiple colors.

```js
// per-year colored bands, shaped by the ridge via a clip path
const bands = gRow.append("g").attr("clip-path", `url(#${clipId})`);
bands.selectAll("rect").data(row.series).join("rect")
  .attr("x", d => x(d.year) - bandW / 2)
  .attr("width", bandW).attr("height", maxAmp)
  .attr("fill", d => d.domGenre ? genreColor(d.domGenre, cb) : NEUTRAL);  // per-genre hue

// the area that defines the clip + the outline
const gen = d3area()
  .x(d => x(d.year)).y0(re.yBase)
  .y1(d => re.yBase - amp(d.values[region]))
  .curve(curveBasis);
re.clipPath.transition().duration(dur).attr("d", gen(rows[i].series));
```

The **year playhead** glides via a linear transition tied to the scrubber's dwell time, instead of snapping frame-by-frame:

```js
sweep.transition().duration(PLAYHEAD_MS).ease(easeLinear)
     .attr("x1", x(yr)).attr("x2", x(yr));
```

CONSOLE WARS also renders a **per-console genre breakdown** side panel where each genre row is individually clickable (`toggleGenreFocus`), giving finer, genre-level control than the group-level legend; it writes the same shared `focusedGenres` list.

### 5.2 HIGH SCORE — linked stream + canvas scatter  *([highScore.js](../src/cartridges/highScore.js))*
**D3:** `d3.stack` + `stackOffsetWiggle` + `curveBasis` (streamgraph), `scaleLog` (scatter x), `d3.brushX` (linking), `d3.quadtree` (hit-testing), **`d3.forceSimulation` + `forceX`/`forceY` + `timer`** (scatter animation), `axisBottom`/`axisLeft`, `extent`.

**Streamgraph** — a wiggle-offset stacked area of **all 20 genres** (each its own hue, grouped into 5 color regions):

```js
const series = d3stack().keys(GENRES).offset(stackOffsetWiggle)(perYear);
const areaGen = d3area()
  .x(d => xStream(d.data.year))
  .y0(d => yStream(d[0])).y1(d => yStream(d[1]))
  .curve(curveBasis);
gStreamBands.selectAll("path").data(series, s => s.key)
  .join(/* … */).attr("fill", s => genreColor(s.key, cb)).transition().attr("d", areaGen);
```

**Scatter** is drawn on `<canvas>` (thousands of points), but D3 owns the math. A **log** x-scale + a **quadtree** for fast nearest-point hover, and a **force simulation** that *animates dots settling into their true position*:

```js
xScatter = scaleLog().domain([Math.max(0.01, xdom[0]), xdom[1]])
                     .range([scL, cw - scR]).clamp(true);
qt = d3quadtree().x(d => d.sx).y(d => d.sy).addAll(lit);   // hover hit-test

// dots glide to their exact (sales, score) spot — forceX/forceY target the
// true (sx, sy); there is NO collision force, so resting positions stay
// accurate (positional integrity preserved — it's an entry animation).
simulation.nodes(active)
  .force("x", forceX(d => d.sx).strength(0.12))
  .force("y", forceY(d => d.sy).strength(0.12))
  .alpha(1).restart();
simulation.on("tick", renderCanvasFrame);  // redraw the canvas each tick
```

Non-focused dots are drawn **desaturated to grayscale** (focus the eye on the active genres), and a hovered genre **pulses** via a `d3.timer`.

**Linking** — a `d3.brushX`-style year selection on the stream writes the shared `yearRange`, which fades the out-of-range scatter points:

```js
// onStream{Down,Move,Up} → store.set({ yearRange: [s, e] });  // every panel reacts
```

**Marquee selection** — a custom drag rectangle over the scatter intersects the *currently-lit* points and repopulates the HIGH SCORES leaderboard (ranked by critic score); implemented directly so it coexists with hover and the stream selection.

### 5.3 GENRE WARP — radial stacked area  *([genreWarp.js](../src/cartridges/genreWarp.js))*
**D3:** `d3.areaRadial` + `d3.stack`, `scaleSqrt` (radius), `scaleLinear` (angle), `d3.line`/`d3.area` (inset), `axisLeft`/`axisBottom`, `scale.invert` (hover).

Angle = year (one revolution); radius = stacked sales on a **sqrt** scale so *area* ∝ value:

```js
const angle  = scaleLinear().domain([yearMin, yearMax]).range([0, TAU * 0.92]);
const radius = scaleSqrt().range([innerR, outerR]);          // area-proportional
const series = d3stack().keys(GENRES)(perYear);              // 20 genre bands

const areaGen = areaRadial()
  .angle(d => angle(d.data.year))
  .innerRadius(d => radius(d[0]))
  .outerRadius(d => radius(d[1]))
  .curve(curveCardinal);
```

Hover maps a cursor angle **back** to a year with `angle.invert(...)`, and clicking a band toggles that genre's group in `focusedGenres`, which brightens the focused bands and draws a **linear `d3.line` inset** beside the disc — radial gestalt + linear precision together.

---

## 6. Shared UI kit (no D3, but central)

| Module | Role |
|---|---|
| [palette.js](../src/ui/palette.js) | the single source of truth for color: **20 per-genre hues** grouped into **5 families**; `genreColor()` for the full palette, `familyColor()` for the colorblind fallback. Also `GENRES`, `familyGenres()`, and `toggleFamily()` (group-level focus toggling). Canvas needs hex literals, so they mirror `theme.css`. |
| [legend.js](../src/ui/legend.js) | the **5-group** key **doubling as a click-to-filter control** — clicking a group toggles all its genres in `store.focusedGenres` for every cartridge. |
| [tooltip.js](../src/ui/tooltip.js) | one shared tooltip singleton (never per-cartridge). |
| [regionToggle.js](../src/ui/regionToggle.js) | the arcade region buttons → `store.region`. |
| [yearScrubber.js](../src/ui/yearScrubber.js) | the year slider; owns a single `requestAnimationFrame` playhead loop → `store.yearRange` + `store.playing`. |

---

## 7. Performance & accessibility notes

- **Pre-aggregate once** (§2.2); interactions read tiny tables, never the 64k array.
- **Canvas for the dense scatter**, with a **quadtree** for O(log n) hover hit-testing.
- **Transitions, not rebuilds** — D3 `enter/update/exit` joins + `.transition()`; the playhead uses one rAF loop.
- **20 hues organized into 5 groups + multi-select focus** so color never works alone; the **colorblind** toggle collapses the 20 hues to 5 Okabe–Ito group colors; arrow/number-key navigation; `prefers-reduced-motion` shortens or disables animation.
- **Regional sales are the dataset's real columns** (`na/jp/pal/other_sales`) — the region toggle reflects genuine regional differences, not estimates.

---

## 8. Where D3 is used — quick index

| D3 API | File | Purpose |
|---|---|---|
| `csv`, `timeParse` | loader.js | parse + type the CSV, derive year |
| `scaleLinear`, `scaleLog`, `scaleSqrt` | all cartridges | position/size encodings |
| `area`, `areaRadial`, `line`, `curveBasis`/`curveCardinal` | cartridges | streamgraph, ridgeline, spiral, insets |
| `stack` + `stackOffsetWiggle` | highScore, genreWarp | stacked / streamgraph layout |
| `axisBottom`, `axisLeft` | all cartridges | axes |
| `brushX` | highScore | year-range brushing (linking) |
| `quadtree` | highScore | fast scatter hover hit-testing |
| `forceSimulation` + `forceX`/`forceY` | highScore | animate scatter dots settling into their true position |
| `timer` | highScore | hover pulse on the focused genre |
| `selection.transition` + `easeLinear` | consoleWars, genreWarp, highScore | smooth updates + playhead |
| `max`, `min`, `extent`, `sum` | cartridges | domains & rollups |
| `pointer` | cartridges | cursor → data coordinates |