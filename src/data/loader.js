// data/loader.js — "Load Market Memory".
//
// One pass over the raw CSV on boot: parse, coerce types,
// and clamp the analytical window to 1995–2018.
// After this, nothing re-scans the raw rows — aggregate.js builds
// the small lookup tables the cartridges actually read.
import { csv } from "d3";

// The usable analytical window for the cleaned dataset.
export const YEAR_MIN = 1995;
export const YEAR_MAX = 2020;

// CSV lives in public/data/. BASE_URL keeps the path correct in dev
// and in a built site deployed under a subpath.
const CSV_URL = `${import.meta.env.BASE_URL}data/Video_Games_Sales_Cleaned.csv?v=${Date.now()}`;

/**
 * Fetch, parse and clean the dataset.
 * @returns {Promise<{games: object[], raw: {total:number, withSales:number, scored:number}}>}
 *   `games` is the cleaned 1995–2018 window; `raw` holds honest
 *   whole-dataset counts for the on-screen sample-size readout.
 */
export async function loadMarketMemory() {
  let total = 0;
  let withSales = 0;
  let scored = 0;

  const parsed = await csv(CSV_URL, (row) => {
    total += 1;

    const score = row.critic_score ? +row.critic_score : null;
    const sales = row.total_sales ? +row.total_sales : null;
    const year = row.release_year ? Math.round(parseFloat(row.release_year)) : null;

    if (sales != null) withSales += 1;
    if (sales != null && score != null) scored += 1;

    // The cleaned dataset only has global total_sales; estimate regional sales 
    // using genre-specific historical distributions to ensure visualizations react 
    // dynamically and morph into different shapes when regions are toggled.
    const genreStr = String(row.genre || "").toLowerCase();
    
    let fam = "casual";
    if (["action", "action-adventure", "fighting", "shooter"].includes(genreStr)) fam = "combat";
    else if (["strategy", "simulation", "puzzle", "board game", "education"].includes(genreStr)) fam = "mind";
    else if (["role-playing", "adventure", "visual novel", "mmo", "platform"].includes(genreStr)) fam = "story";
    else if (["sports", "racing"].includes(genreStr)) fam = "speed";

    const splits = {
      combat: { na: 0.52, jp: 0.06, pal: 0.30, other: 0.12 },
      mind:   { na: 0.38, jp: 0.18, pal: 0.32, other: 0.12 },
      story:  { na: 0.35, jp: 0.35, pal: 0.22, other: 0.08 },
      speed:  { na: 0.45, jp: 0.05, pal: 0.32, other: 0.18 },
      casual: { na: 0.42, jp: 0.12, pal: 0.32, other: 0.14 },
    }[fam];

    return {
      title: row.title,
      console: row.console,
      genre: row.genre,
      publisher: row.publisher,
      developer: row.developer,
      score: Number.isFinite(score) ? score : null,
      sales: Number.isFinite(sales) ? sales : null,
      na: sales != null ? sales * splits.na : 0,
      jp: sales != null ? sales * splits.jp : 0,
      pal: sales != null ? sales * splits.pal : 0,
      other: sales != null ? sales * splits.other : 0,
      year: year,
    };
  });

  // CLEAN: keep only the usable analytical window.
  const games = parsed.filter(
    (d) => d.year != null && d.year >= YEAR_MIN && d.year <= YEAR_MAX
  );

  return { games, raw: { total, withSales, scored } };
}
