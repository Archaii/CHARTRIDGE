// data/loader.js — "Load Market Memory".
//
// One pass over the raw Divekar CSV on boot: parse, coerce types,
// derive Year from release_date (dd-mm-yyyy), and clamp the analytical
// window to 1995–2017 (earlier/later buckets are too sparse to trust).
// After this, nothing re-scans the 64k raw rows — aggregate.js builds
// the small lookup tables the cartridges actually read.
//
// Regional sales (na/jp/pal/other) are the dataset's REAL columns — not
// estimated — so the region toggle reflects genuine regional differences.
import { csv, timeParse } from "d3";

const parseDate = timeParse("%d-%m-%Y");

// The usable analytical window. Outside this, sales/score coverage
// collapses (the 2020 bucket is ~28 games and will lie to you).
export const YEAR_MIN = 1995;
export const YEAR_MAX = 2017;

// CSV lives in public/data/. BASE_URL keeps the path correct in dev
// and in a built site deployed under a subpath.
const CSV_URL = `${import.meta.env.BASE_URL}data/video_games_sales.csv`;

/**
 * Fetch, parse and clean the dataset.
 * @returns {Promise<{games: object[], raw: {total:number, withSales:number, scored:number}}>}
 *   `games` is the cleaned 1995–2017 window; `raw` holds honest
 *   whole-dataset counts for the on-screen sample-size readout.
 */
export async function loadMarketMemory() {
  let total = 0;
  let withSales = 0;
  let scored = 0;

  const parsed = await csv(CSV_URL, (row) => {
    total += 1;

    const date = parseDate(row.release_date);
    const score = row.critic_score ? +row.critic_score : null;
    const sales = row.total_sales ? +row.total_sales : null;

    if (sales != null) withSales += 1;
    if (sales != null && score != null) scored += 1;

    return {
      title: row.title,
      console: row.console,
      genre: row.genre,
      publisher: row.publisher,
      developer: row.developer,
      score: Number.isFinite(score) ? score : null, // ~10% present
      sales: Number.isFinite(sales) ? sales : null, // ~30% present
      na: +row.na_sales || 0,
      jp: +row.jp_sales || 0,
      pal: +row.pal_sales || 0,
      other: +row.other_sales || 0,
      year: date ? date.getFullYear() : null,
    };
  });

  // CLEAN: keep only the usable analytical window.
  const games = parsed.filter(
    (d) => d.year != null && d.year >= YEAR_MIN && d.year <= YEAR_MAX
  );

  return { games, raw: { total, withSales, scored } };
}
