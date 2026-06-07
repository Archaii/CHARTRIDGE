// data/aggregate.js — build ALL lookup tables once.
//
// The cleaned `games` array is scanned a handful of times here and
// then never again: every interaction reads these small tables, not
// the 64k rows (architecture §10, performance budget).
//
// Tables are kept family-agnostic — keyed by the 20 raw genres. The
// 6-family rollup is a UI concern (M2 palette.js) and a cheap re-sum
// at render time, so the data spine stays decoupled from the theme.

// The five selectable regions. "total" uses the authoritative
// total_sales field; the four geos use their own columns.
export const REGIONS = ["na", "jp", "pal", "other", "total"];

// Number of top consoles to keep as their own ridgeline rows; the
// rest are bucketed into "Other" (architecture §0: 81 consoles).
const TOP_CONSOLES = 15;
const OTHER = "Other";

const regionValue = (g, region) =>
  region === "total" ? g.sales ?? 0 : g[region];

/**
 * Build every lookup table from the cleaned games.
 * @param {object[]} games - cleaned 1995–2017 window from the loader
 * @param {{total:number, withSales:number, scored:number}} raw - whole-dataset counts
 */
export function buildAggregates(games, raw) {
  const years = uniqueSorted(games.map((d) => d.year));
  const genres = uniqueSorted(games.map((d) => d.genre));

  const consoleYear = rollupConsoleYear(games, years);
  // Reuse the same top-15 bucketing for the per-console game lists.
  const topSet = new Set(consoleYear.order.filter((n) => n !== OTHER));
  const bucket = (name) => (topSet.has(name) ? name : OTHER);

  return {
    games,
    genreYearRegion: rollupGenreYearRegion(games, years, genres),
    consoleYear,
    scoredGames: games.filter((d) => d.score != null && d.sales != null),
    // Top sellers per year / per console — for the CONSOLE WARS panels.
    topGamesByYear: rollupTopGames(games, (g) => g.year),
    topGamesByConsole: rollupTopGames(games, (g) => bucket(g.console)),
    // All-time top sellers — for the cabinet's HIGH SCORES rail.
    leaderboard: rollupTopGames(games, () => "all").all || [],
    meta: buildMeta(games, raw, years, genres),
  };
}

// ---- top sellers grouped by an arbitrary key -----------------------
// Keeps the top 8 by total_sales per group, as lean display objects.
const PANEL_TOP_N = 8;
function rollupTopGames(games, keyFn) {
  const groups = {};
  for (const g of games) {
    if (g.sales == null) continue;
    (groups[keyFn(g)] ??= []).push({
      title: g.title,
      console: g.console,
      genre: g.genre,
      year: g.year,
      sales: g.sales,
      na: g.na,
      jp: g.jp,
      pal: g.pal,
      other: g.other,
      score: g.score,
    });
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => b.sales - a.sales);
    groups[k] = groups[k].slice(0, PANEL_TOP_N);
  }
  return groups;
}

// ---- genre × year × region → summed sales ---------------------------
// Shape: table[region][year][genre] = sales. Feeds the streamgraph
// (HIGH SCORE) and the radial spiral (GENRE WARP).
function rollupGenreYearRegion(games, years, genres) {
  const table = {};
  for (const region of REGIONS) {
    table[region] = {};
    for (const y of years) table[region][y] = {};
  }

  for (const g of games) {
    for (const region of REGIONS) {
      const v = regionValue(g, region);
      if (!v) continue;
      const cell = table[region][g.year];
      cell[g.genre] = (cell[g.genre] ?? 0) + v;
    }
  }
  return { regions: REGIONS, years, genres, table };
}

// ---- console × year → regional sales + genre breakdown --------------
// Shape: table[console][year] = { na, jp, pal, other, total, byGenre }.
// Feeds the CONSOLE WARS ridgeline (row height = sales, fill =
// dominant genre that year → derived from byGenre at render time).
function rollupConsoleYear(games, years) {
  // 1) total_sales per console to pick the top 15.
  const consoleTotals = new Map();
  for (const g of games) {
    consoleTotals.set(
      g.console,
      (consoleTotals.get(g.console) ?? 0) + (g.sales ?? 0)
    );
  }
  const top = [...consoleTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CONSOLES)
    .map(([name]) => name);
  const topSet = new Set(top);
  const bucket = (name) => (topSet.has(name) ? name : OTHER);

  // 2) accumulate per console×year.
  const table = {};
  const ensure = (c, y) => {
    (table[c] ??= {});
    return (table[c][y] ??= {
      na: 0,
      jp: 0,
      pal: 0,
      other: 0,
      total: 0,
      byGenre: {},
    });
  };
  for (const g of games) {
    const cell = ensure(bucket(g.console), g.year);
    cell.na += g.na;
    cell.jp += g.jp;
    cell.pal += g.pal;
    cell.other += g.other;
    cell.total += g.sales ?? 0;
    cell.byGenre[g.genre] = (cell.byGenre[g.genre] ?? 0) + (g.sales ?? 0);
  }

  // 3) per-console summary: lifetime total + peak year (for row sort).
  const order = [...top, OTHER];
  const consoles = order.map((name) => {
    const byYear = table[name] ?? {};
    let peakYear = years[0];
    let peak = -Infinity;
    let lifetime = 0;
    for (const y of years) {
      const t = byYear[y]?.total ?? 0;
      lifetime += t;
      if (t > peak) {
        peak = t;
        peakYear = y;
      }
    }
    return { name, total: lifetime, peakYear };
  });

  return { regions: REGIONS, years, order, consoles, table };
}

// ---- honest on-screen sample-size metadata --------------------------
function buildMeta(games, raw, years, genres) {
  const scored = games.filter((d) => d.score != null && d.sales != null).length;
  const windowWithSales = games.filter((d) => d.sales != null).length;
  return {
    total: raw.total, // whole dataset (~64,016)
    withSales: raw.withSales, // whole dataset with total_sales (~18,922)
    scored: raw.scored, // whole dataset with score + sales (~4,126)
    window: {
      games: games.length, // rows inside 1995–2017
      withSales: windowWithSales,
      scored, // scatter subset actually plotted
    },
    yearRange: [years[0], years[years.length - 1]],
    genreCount: genres.length,
  };
}

// ---- helpers --------------------------------------------------------
function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) =>
    typeof a === "number" ? a - b : String(a).localeCompare(String(b))
  );
}
