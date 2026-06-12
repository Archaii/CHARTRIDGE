# :video_game: CHARTRIDGE

### _Insert a cartridge. Play the data._

A web-based interactive data-visualization system for the **Video Game Sales & Industry** dataset (Divekar 2026, 64,016 rows), built with **D3.js v7** and **Vite**. CHARTRIDGE dresses itself as a retro synthwave **arcade cabinet**: you power on, the screen reads _“LOADING MARKET MEMORY…”_, and you land on a cartridge-select menu. Each visualization is a _game cartridge_.

> Built for Data Visualization (Group 5). The console fiction is the information architecture, not a skin — every piece of chrome does a job.

---

## The three cartridges

| Cartridge | Visualization | Answers |
|---|---|---|
| **HIGH SCORE** | Linked genre **streamgraph** + critic-score × sales **canvas scatter** | Quality vs. sales, hidden gems, genre eras |
| **CONSOLE WARS** | Console-lifecycle **ridgeline** + year playhead | Platform lifecycles, regional strength, genre-per-console |
| **GENRE WARP** | Radial stacked-area **spiral** + focus inset | Genre peaks over time, era dominance, single-genre drill-down |

All three read one shared state store, so the **region** and **focused genre family** you pick persist as you swap cartridges (coordinated multiple views).

---

## Features

- **Synthwave arcade shell** — perspective grid-floor + neon sun, backlit marquee, left cartridge rail, right **HIGH SCORES** leaderboard, and an arcade control deck (round glowing region buttons + a neon year slider). CRT scanlines/vignette skin the frame only — the chart plotting areas stay crisp.
- **Coordinated views** — brush a year range, click a genre family in the legend, or toggle a region, and every panel responds.
- **Marquee selection** (HIGH SCORE) — click-drag a box on the scatter to select titles; the leaderboard live-updates to those titles ranked by critic score.
- **Smooth year playhead** — press ▶ and the sweep glides across the timeline.
- **Honest sample sizes** — the on-screen readout states how many records are actually plotted (sales/score are mostly missing in the raw data).
- **Accessibility** — clickable 5-group genre legend (20 genre hues, grouped for legibility; colorblind mode collapses to the 5 groups), keyboard nav, and `prefers-reduced-motion` support.

---

## Tech stack

- **Build:** Vite 5 (zero-config dev server + static build)
- **Language:** Vanilla JS (ES modules) — D3 owns the DOM
- **Viz:** D3.js v7 (scales, shapes, stack, areaRadial, brush, quadtree)
- **Rendering:** SVG everywhere except the dense HIGH SCORE scatter, which uses `<canvas>`
- **Styling:** Plain CSS + custom properties (design tokens in `src/theme.css`)
- No backend — it's a static site reading one CSV.

---

## Getting started

**Required environment & libraries**

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **18 or newer** | includes `npm` |
| Vite | 5.x | dev server + static build (installed by `npm install`) |
| D3.js | v7 | the only runtime dependency (installed by `npm install`) |

No backend, database, or API keys are needed — it is a static site that reads one local CSV.

**Run it**

```bash
npm install        # install dependencies (Vite + D3) — first time only
npm run dev        # start the dev server, opens http://localhost:5173
npm run build      # produce a static dist/ (deployable to any static host)
npm run preview    # serve the built dist/ locally
```

**Entry point:** [index.html](index.html) is the page that loads the app; it imports
[src/main.js](src/main.js), which boots the console, loads the data, and shows the
cartridge menu. (You don't open `index.html` directly — run `npm run dev`, which
serves it.)

### Accessing the data

The dataset is **bundled with this repository** — no download or API is required:

```
public/data/video_games_sales.csv      # ~8 MB, loaded once on boot
```

- **Original source:** *Video Game Sales 1980–2024* by Divekar (2026), published on
  Kaggle. Replace this line with the exact dataset URL: `[dataset link]`.
- The loader fetches it at runtime from `public/data/` (see
  [src/data/loader.js](src/data/loader.js)); to swap in a fresh copy, replace that
  file (same columns: `title, console, genre, publisher, developer, critic_score,
  total_sales, na_sales, jp_sales, pal_sales, other_sales, release_date`).

---

## Controls

- **Cartridge rail / menu cards** — pick a visualization. Keys **1–3** quick-pick; **Esc** returns to the menu; **R** resets all filters.
- **Region buttons** (NA / JP / PAL / OTH / TOTAL) — restack and reweight the charts.
- **Year slider** — drag the knobs to set a range, or press **▶** to sweep.
- **Genre legend** — click a family to isolate it (click again to clear). Works in all three cartridges.
- **HIGH SCORE scatter** — hover for details; **click-drag** to marquee-select a cluster (the right rail lists them by critic score).
- **◑ CB** (marquee) — toggle the colorblind-safe palette.

---

## Project structure

```
src/
├── main.js              # bootstrap: boot → load → mount shell
├── store.js             # tiny pub/sub shared state
├── theme.css            # design tokens (the synthwave palette)
├── data/                # loader (parse/clean) + aggregate (lookup tables)
├── shell/               # cabinet, boot, router, menu, cartridge registry
├── ui/                  # palette, legend, tooltip, region toggle, year scrubber
└── cartridges/          # highScore, consoleWars, genreWarp
public/data/             # the source CSV
docs/                    # architecture + visualization redesign specs
```

---

## Data & attribution

The dataset is **“Video Game Sales 1980–2024”** (Divekar 2026), ~64,016 rows. Coverage is sparse and honestly surfaced in-app:

- `critic_score` is present for ~10% of rows; `total_sales` for ~30%.
- Only **4,126** rows have both a critic score and sales (the HIGH SCORE scatter).
- Time charts are clamped to **1995–2017**, the usable analytical window.

> ⚠️ **Before making this repository public:** the bundled CSV is third-party data and is subject to **its own license/terms** (check the original Kaggle dataset page). The MIT license below covers **this project's source code only — not the dataset.** If the dataset's terms don't permit redistribution, remove `public/data/video_games_sales.csv` from the repo and document how to download it instead.

---

## License

This project's **code** is released under the [MIT License](LICENSE). The dataset is © its respective authors under its own terms (see above).
