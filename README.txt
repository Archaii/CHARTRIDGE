============================================================
CHARTRIDGE  —  Insert a cartridge. Play the data.
============================================================

A web-based interactive data-visualization system for the
"Video Game Sales & Industry" dataset (Divekar 2026, 64,016 rows),
built with D3.js v7 and Vite. CHARTRIDGE presents itself as a retro
synthwave arcade cabinet: power on, the screen reads
"LOADING MARKET MEMORY...", then you pick a "cartridge" (visualization).

Built for Data Visualization (Group 5).


THE THREE CARTRIDGES
------------------------------------------------------------
HIGH SCORE    - Linked genre streamgraph + critic-score x sales
                canvas scatter. (Quality vs. sales, hidden gems.)
CONSOLE WARS  - Console-lifecycle ridgeline + year playhead.
                (Platform lifecycles, regional strength.)
GENRE WARP    - Radial genre spiral + focus inset.
                (Genre peaks over time, era dominance.)

Region and focused-genre selections persist across cartridges
(coordinated multiple views).


REQUIRED ENVIRONMENT & LIBRARIES
------------------------------------------------------------
- Node.js 18 or newer (includes npm)
- Vite 5.x        (dev server + static build; installed by npm install)
- D3.js v7        (only runtime dependency; installed by npm install)

No backend, database, or API keys are required. It is a static site
that reads one local CSV file.


HOW TO RUN
------------------------------------------------------------
From the project folder:

    npm install      # install dependencies (Vite + D3) - first time only
    npm run dev      # start dev server, opens http://localhost:5173
    npm run build    # produce a static dist/ for deployment
    npm run preview  # serve the built dist/ locally

ENTRY POINT (starting page file):
    index.html  -> imports src/main.js, which boots the console,
                   loads the data, and shows the cartridge menu.
    Do not open index.html directly in a browser; run "npm run dev",
    which serves it (the app loads data via fetch / ES modules).


ACCESSING THE DATA
------------------------------------------------------------
The dataset is bundled with this repository - no download or API needed:

    public/data/video_games_sales.csv      (~8 MB, loaded once on boot)

Original source: "Video Game Sales 1980-2024" by Divekar (2026),
published on Kaggle. Replace this line with the exact dataset URL:
    [dataset link]

The loader (src/data/loader.js) fetches the CSV at runtime from
public/data/. To use a fresh copy, replace that file (keep the same
columns: title, console, genre, publisher, developer, critic_score,
total_sales, na_sales, jp_sales, pal_sales, other_sales, release_date).


CONTROLS
------------------------------------------------------------
- Cartridge rail / menu cards: pick a visualization.
  Keys 1-3 quick-pick; Esc returns to menu; R resets all filters.
- Region buttons (NA / JP / PAL / OTH / TOTAL): restack/reweight charts.
- Year slider: drag the knobs to set a range, or press play to sweep.
- Genre legend: click a genre group to isolate it (click again to clear).
  20 genres each have their own hue, organized into 5 color groups.
- HIGH SCORE scatter: hover for details; click-drag to marquee-select
  a cluster (the right rail lists them by critic score).
- "CB" button: toggle the colorblind-safe palette.


PROJECT STRUCTURE
------------------------------------------------------------
src/
  main.js          - bootstrap: boot -> load -> mount shell
  store.js         - tiny pub/sub shared state
  theme.css        - design tokens (synthwave palette)
  data/            - loader (parse/clean) + aggregate (lookup tables)
  shell/           - cabinet, boot, router, menu, cartridge registry
  ui/              - palette, legend, tooltip, region toggle, year scrubber
  cartridges/      - highScore, consoleWars, genreWarp
public/data/       - the source CSV
docs/              - architecture, redesign spec, presentation, code docs


DATA NOTES (honestly surfaced in-app)
------------------------------------------------------------
- critic_score present for ~10% of rows; total_sales for ~30%.
- Only 4,126 rows have BOTH a score and sales (the HIGH SCORE scatter).
- Time charts are clamped to 1995-2017, the usable analytical window.


LICENSE
------------------------------------------------------------
This project's source code is released under the MIT License (see LICENSE).
The dataset is (c) its respective authors under its own terms - the MIT
license does NOT cover the dataset. Before publishing the repo, confirm the
dataset's terms allow redistribution; if not, remove the CSV and document
how to download it.