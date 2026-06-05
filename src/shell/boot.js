// shell/boot.js — the power-on sequence ("LOADING MARKET MEMORY…").
//
// The boot screen IS the data loader (architecture §2): it fetches and
// parses the CSV, builds the lookup tables, and shows an honest
// sample-size readout computed from the real data — then resolves with
// the aggregates so the shell can hand them to the cartridges.
import "./boot.css";
import { loadMarketMemory } from "../data/loader.js";
import { buildAggregates } from "../data/aggregate.js";

const REDUCED_MOTION = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => n.toLocaleString("en-US");

/**
 * Render the boot screen, load + aggregate the data, and resolve with
 * the aggregates. Cosmetic pauses are skipped under reduced motion,
 * but the real fetch/parse always runs.
 * @param {HTMLElement} screen - the console screen surface
 * @returns {Promise<object>} the aggregates from buildAggregates()
 */
export async function runBoot(screen) {
  screen.innerHTML = `
    <div class="screen__view boot" role="status" aria-live="polite">
      <div class="boot__logo">CHARTRIDGE</div>
      <div class="boot__tagline">Insert a cartridge. Play the data.</div>
      <div class="boot__status" id="boot-status">POWERING ON</div>
      <div class="boot__bar"><div class="boot__bar-fill" id="boot-fill"></div></div>
      <div class="boot__counts" id="boot-counts">READING CARTRIDGE SLOT…</div>
    </div>
  `;

  const statusEl = screen.querySelector("#boot-status");
  const fillEl = screen.querySelector("#boot-fill");
  const countsEl = screen.querySelector("#boot-counts");

  const beat = REDUCED_MOTION ? 0 : 320;
  const step = async (label, pct) => {
    statusEl.textContent = label;
    fillEl.style.width = `${pct}%`;
    if (beat) await wait(beat);
  };

  await step("POWERING ON", 12);

  // The real work: fetch + parse the 64k-row CSV (the actual delay).
  await step("LOADING MARKET MEMORY", 45);
  const { games, raw } = await loadMarketMemory();

  // Build the small lookup tables every cartridge reads.
  await step("BUILDING LOOKUP TABLES", 82);
  const data = buildAggregates(games, raw);

  // Honest sample-size readout, computed from the data itself.
  const m = data.meta;
  countsEl.textContent =
    `${fmt(m.total)} RECORDS · ${fmt(m.withSales)} WITH SALES · ${fmt(m.scored)} SCORED`;

  await step("READY", 100);
  if (!REDUCED_MOTION) await wait(260);

  return data;
}
