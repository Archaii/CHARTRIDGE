# Video Game Sales — Visualization Redesign Spec (Phase II → Phase III)

**For:** Team 5 · **Stack:** D3.js (web), built with Claude Code
**Dataset:** `Video_Games_Sales__1980-2024__-_Raw.csv` (Divekar 2026 — 64,016 rows)

This document responds point-by-point to the critique on your three Phase II designs, then redesigns each visualization to be **novel, multivariable, clearly readable, and tightly interactive**, with D3 build notes and a ready-to-paste Claude Code prompt.

---

## 0. Read this first — what the data actually supports

Real columns:

`img, title, console, genre, publisher, developer, critic_score, total_sales, na_sales, jp_sales, pal_sales, other_sales, release_date, last_update`

**The "64,016 games" number is misleading for analysis — most rows are catalog/metadata only:**

| Field | Coverage | Implication |
|---|---|---|
| `critic_score` | **~10% present** (~6,700 games) | Score views must use this subset, not all 64k. |
| `total_sales` | **~30% present** (~19k games) | The usable sales timeline is really **1995–2017**. |
| `critic_score` **and** `total_sales` | **4,126 games** | This is your true score-vs-sales scatter — a healthy, non-dense count. |
| Publisher/developer **location/country** | **Absent** | The Viz 2 world map is still not supported by the data (see §3). |

Other facts that shape the designs:
- **Regions = NA / JP / PAL / Other** (it's **PAL**, not EU).
- **20 genres** (Action, Action-Adventure, Adventure, Board Game, Education, Fighting, MMO, Misc, Music, Party, Platform, Puzzle, Racing, Role-Playing, Sandbox, Shooter, Simulation, Sports, Strategy, Visual Novel).
- **81 consoles** — filter to the top ~15 by sales (PS2, X360, PS3, PS, PS4, Wii, DS, XOne, PSP, XB, GBA, PC, GC, 3DS, N64) and bucket the rest as "Other."
- `release_date` is a real date (`dd-mm-yyyy`); derive `Year` from it. 7,051 rows have no parseable date.

**Data-prep tasks (do once on load):**
- Parse `release_date` → `Year`; drop null-year rows for time charts.
- Clamp time charts to **1995–2017** (earlier/later buckets are too sparse — the 2020 bucket is only 28 games and will lie to you).
- For score views, filter to `critic_score.notna()`. For score-vs-sales, filter to both present (4,126 rows).
- Pre-aggregate `genre × year × region` and `console × year` **once**, not per interaction.

> **Strong stories already in the data:** Japan's share of sales spiked to ~60% in the late-80s/early-90s then collapsed below 10% by the 2000s while PAL climbed to ~36%; PS2/X360/PS3 show textbook console lifecycles; GTA V tops sales at 20.3M with a 9.4 critic score.

---

## 1. Cross-cutting fixes (these recur in every comment)

### 1a. The genre color problem — now **20 genres**
No categorical palette stays distinguishable past ~8–10 colors. Every critique flagged "colors not unique," and you now have *twenty* genres. Do not let color carry it alone.

- **Group into ~6 families, one hue each, shade within:**

  | Family | Genres | Hue |
  |---|---|---|
  | Action-driven | Action, Action-Adventure, Adventure, Sandbox | reds/oranges |
  | Competitive | Shooter, Fighting, Sports, Racing | blues |
  | Systems | Strategy, Simulation, Puzzle, Board Game | greens |
  | Story | Role-Playing, Visual Novel, Platform | purples |
  | Social/Casual | Party, Music, Misc, Education | teal/yellow |
  | Online | MMO | single accent |

  A 6-hue legend is learnable; a 20-swatch lookup is not.
- **Never rely on color alone.** Pair with a "focus one genre" click (isolate one, fade the rest to ~10%). This is your best accessibility + clarity move and answers your own "what happens when focusing on one genre?"
- Provide a **colorblind toggle** (patterns) rather than patterns by default. Verify in Coblis.

### 1b. Size legends are mandatory
Where size encodes sales, add a **nested-circle size legend** (e.g. 1M / 5M / 20M). Use `d3.scaleSqrt()` so *area* ∝ value. The reviewer called this out explicitly on Viz 1.

### 1c. Kill the decorative dead space
The handheld-console frame is a good theme only if it carries information. **Every pixel of chrome must do a job:** D-pad/buttons → real controls (year, region, reset); bezel → thin themed border; screen fills ~85% of the canvas. Boot animation = one-time intro only.

### 1d. Typography
Pixel/retro font for **titles and labels only**. Axis ticks, tooltips, and readouts in clean sans (Inter / system-ui) at ≥12px. This fixes "text too small" across all three.

### 1e. Honesty about missing data
Because sales/score are mostly missing, **state the active sample size on screen** ("showing 4,126 scored titles"). Don't imply 64k points. This is both an integrity issue and a defensible sophistication point in your writeup.

---

## 2. Visualization 1 — redesign: **"Genre Streams + Score×Sales Scatter" (linked)**

**Critique it answers:** not connected → *two-way linked*; not novel → *streamgraph + quality/sales scatter*; colors not unique → *family palette + focus*; missing size legend → *added*; wasted handheld space → *chrome becomes controls*; text small → *typographic split*. And it finally uses `critic_score` the way you intended.

### Layout (two coordinated panels)
**Top — Genre Stream (streamgraph):** X = Year (1995–2017), stacked bands = genre **share of `total_sales`**, family palette. Shows era hand-offs at a glance.

**Bottom — Score × Sales scatter:** the **4,126 games with both score and sales**.
- X = `total_sales` on a **log scale** (sales are heavily long-tailed).
- Y = `critic_score` (1–10).
- Color = genre family. Slight jitter to de-overlap; no redundant size encoding.
- Quadrant readers: top-left = **critically loved but low-selling ("hidden gems")**; top-right = **blockbusters that also reviewed well**; bottom-right = **big sellers reviewers disliked**.
- *Optional toggle:* swap Y to **regional skew** `(jp_sales − na_sales) / total_sales` (Japan-leaning hits float up) — a novel derived axis if you want a second lens.

### Variables encoded
Year (x, top), genre (color), sales (x, bottom — log), critic score (y), region (toggle/derived), title (tooltip). **5–6 variables, no redundancy.**

### Interactions (the "connected" fix)
- **Brush a year-range on the stream** → scatter filters to those years.
- **Click a genre** anywhere → highlight in both, fade others.
- **Region buttons** (NA / JP / PAL / Other / Total) on the console face → restack the stream / reweight the scatter.
- **Hover a point** → tooltip: title, console, year, score, sales, region split bar.

### Questions it answers
Genre dominance per era · quality-vs-sales correlation · critical hidden gems vs over-performing blockbusters · regionally polarized hits · how the genre mix shifted.

### D3 build notes
- `d3.stack()` + `stackOffsetWiggle`, `curveBasis` for the stream.
- `d3.scaleLog()` on X for the scatter; clamp zeros.
- Shared state `{yearRange, focusedGenre, region}`; both panels subscribe and re-render.

---

## 3. Visualization 2 — redesign: **"Console Lifecycle Ridgeline" (replaces world map)**

**Critique it answers:** map not novel → *novel ridgeline small-multiple*; colors not unique → *family palette*; text small → *typographic split*; "animation for time is good" → *kept as a year playhead*. And it sidesteps the still-missing location data.

> The map is **not novel and not supported** — there is no country/location field for publishers or developers in this dataset. (Mapping 3,383 publisher *names* to HQ countries would require an external lookup and is out of scope.) Meanwhile `console` has 81 values with clean birth-peak-death curves — your most underused, most striking asset.

### Layout — stacked ridgeline / horizon timeline
- One **row per console** (top ~15 by `total_sales`; rest = "Other"), x = Year.
- Each row = a filled **area (ridge)**: height = that console's sales that year; rows overlap ridgeline-style so 15 fit in one scannable column.
- **Fill = the console's dominant genre family that year** → read *when* it peaked *and what drove it*, together.
- Sort rows by **peak year** → a diagonal cascade of consoles being born and dying reads like a timeline of the industry (the novel "aha").
- *Now that scores exist:* optionally place a small **median-critic-score glyph** at each console's peak (a quality marker on the volume story).

### Variables encoded
Console (row), year (x), sales (height), dominant genre (fill), region (toggle), critic score (optional glyph).

### Interactions
- **Region toggle** (NA / JP / PAL / Other / Total) → all ridges redraw (watch Nintendo handhelds swell under JP).
- **Year playhead animation** (keep your Phase II idea): a sweep line fills a side panel with "top games this year" — animation as a guided tour, not motion for its own sake.
- **Click a console row** → expand to top titles + NA/JP/PAL/Other split.
- **Hover** → exact-value tooltip.

### Questions it answers
Console lifecycles & longevity · which consoles dominated which years · region-by-console strength · which genres carried each console · the generational hand-off.

### D3 build notes
- One `<g>` per console; `d3.area()` per row; translate by fixed row-height with overlap (ridge up to ~2.2× spacing).
- Pre-compute `console × year` sales matrix and `console × year → argmax(genre family)`.
- Animation via `d3.interval`, transition the sweep line + side panel.

---

## 4. Visualization 3 — redesign: **"Genre Spiral" (one clear radial chart)**

**Critique it answers:** font too small → *fixed*; radial-vs-pie relationship unclear → *pie removed*; pie unreadable → *gone*; region toggles ambiguous → *one single toggle*. Keeps the praised radial-stacked-area and the disc/console metaphor.

> The fix is **subtraction**: one disc, one toggle, big labels, labeled scale.

### Layout — single radial stacked area ("the disc")
- **Angle = Year** (1995 at top, clockwise to 2017) — one revolution = the timeline, reinforcing the spinning-disc metaphor.
- **Radius = cumulative `total_sales`**, stacked by genre family.
- **Labeled concentric gridlines** (e.g. 100M / 200M / 300M) with visible values — fixes "exact comparison imprecise in radial charts." Don't make users guess the scale.
- **Remove the center pie.** Center hub just shows current region + total.

### Key interaction: focus mode
- **Click a genre** → its band brightens and a thin **linear inset line chart** of that genre over time appears beside the disc → radial *gestalt* + linear *precision* together, answering both the reviewer's precision concern and your "focus on one genre" question.
- **Single region toggle** (NA / JP / PAL / Other / Total) redraws the disc. No second toggle.
- **Hover a segment** → year / genre / sales tooltip.

### Variables encoded
Year (angle), genre (band + color), sales (radius), region (toggle), focused-genre detail (inset).

### Questions it answers
Which genre peaked when & how large · how regions differ · which genres dominated eras (thick bands) · single-genre deep-dive.

### D3 build notes
- `d3.areaRadial()` with `.angle(scaleTime→radians)` + inner/outer radius from `d3.stack()`.
- Use `scaleSqrt`/`scaleLinear` for radius; radial area exaggerates outer bands, so the labeled gridlines are essential. State the scale in the UI.
- Disc ≥60% of canvas; labels in clean sans, headings in pixel font.

---

## 5. Coordinate the three (high-impact, optional)
Persist a shared **region** and **focused-genre** state across all three views. Isolate a genre in the Spiral and it stays isolated when you jump to the Streams. This is *coordinated multiple views* (Roberts) and is a legitimate novelty point for your writeup.

---

## 6. Principle checklist (cite in your report)
- **Expressiveness/effectiveness (Mackinlay):** position/length for quantities; color for category only.
- **Perceptual ranking (Cleveland & McGill):** linear insets where radial/area hurt precision.
- **Color:** ≤6 hues + interaction instead of 20 raw colors; colorblind-checked; redundant encoding via focus.
- **Shneiderman mantra:** overview → zoom/filter → details on demand.
- **Coordinated multiple views:** linking within Viz 1 + shared state across all three.
- **Data–ink / chartjunk (Tufte):** chrome converted to controls.
- **Data integrity:** on-screen active sample size given the heavy missingness.

---

## 7. Claude Code handoff prompts
Build incrementally; verify each panel before linking. Columns: `title, console, genre, publisher, developer, critic_score, total_sales, na_sales, jp_sales, pal_sales, other_sales, release_date`. Derive `Year` from `release_date` (`dd-mm-yyyy`).

**Viz 1:**
> Using D3.js v7 and `Video_Games_Sales__1980-2024__-_Raw.csv`, build a two-panel coordinated view. Parse release_date (dd-mm-yyyy) to Year; clamp to 1995–2017. Top: a streamgraph of genre share of total_sales by Year (stackOffsetWiggle, curveBasis), colors from a 6-family genre palette. Bottom: a scatter of the games where BOTH critic_score and total_sales are present (~4,126 rows), x=total_sales on a log scale, y=critic_score (1–10), color=genre family, slight jitter. Shared state {yearRange, focusedGenre, region}: brushing a year range on the stream filters the scatter; clicking a genre highlights both and fades others to 0.1; region buttons (NA/JP/PAL/Other/Total) restack the stream. Add a genre-family legend and an on-screen sample-size readout. Headings in a pixel font, ticks/tooltips in system-ui ≥12px.

**Viz 2:**
> Build a console-lifecycle ridgeline in D3 v7 from the same CSV. One row per console (top 15 by total_sales, rest "Other"), x=Year (1995–2017), each row a d3.area with height = that console's sales that year, rows overlapping ridgeline-style, sorted by peak year. Fill = the console's dominant genre family that year (6-family palette). Region toggle (NA/JP/PAL/Other/Total) redraws all rows. A year-playhead animation sweeps a vertical line and updates a side panel of that year's top games. Click a row to expand top titles + NA/JP/PAL/Other split. Hover for exact-value tooltips. Optionally mark each console's peak with a median critic_score glyph.

**Viz 3:**
> Build a single radial stacked-area "genre spiral" in D3 v7 from the same CSV. Angle = Year (1995 top, clockwise to 2017), radius = cumulative total_sales stacked by genre family via d3.areaRadial + d3.stack. Labeled concentric gridlines at 100M/200M/300M. No pie chart; center hub shows current region + total. One region toggle (NA/JP/PAL/Other/Total) redraws the disc. Clicking a genre brightens its band and shows a linear inset line chart of that genre over time. Hover a segment for a year/genre/sales tooltip. Disc ≥60% of canvas; headings pixel font, labels system-ui.

---

*Build order: Viz 2 (ridgeline) first — most self-contained, biggest payoff. Then Viz 1 (linking is trickiest). Then Viz 3 (radial math last). Throughout, remember the data is sparse before 1995 and after 2017, and only ~30% of rows have sales at all.*
