// main.js — bootstrap: build the console → load data on boot → menu.
//
// M1 (data spine): the boot sequence now loads and aggregates the CSV
// and returns the lookup tables. They're logged here for inspection
// and threaded into the router for the cartridges (built in M3+).
import "./theme.css";
import { createConsole } from "./shell/console.js";
import { runBoot } from "./shell/boot.js";
import { createRouter } from "./shell/router.js";

async function start() {
  const root = document.querySelector("#app");
  const hw = createConsole(root);

  hw.setPower(true, "BOOTING");
  const data = await runBoot(hw.screen);

  logLookupTables(data);

  // Fill the cabinet's HIGH SCORES rail with all-time top sellers.
  hw.setLeaderboard(data.leaderboard);

  const router = createRouter({ screen: hw.screen, console: hw, data });
  // Wire the left cartridge rail + logo to navigation.
  hw.onNav = (id) => (id === "menu" ? router.showMenu() : router.open(id));
  router.showMenu();
}

// Inspect the lookup tables in the console (M1 acceptance check).
function logLookupTables(data) {
  const { meta, genreYearRegion, consoleYear, scoredGames } = data;
  /* eslint-disable no-console */
  console.groupCollapsed(
    `%cCHARTRIDGE · MARKET MEMORY LOADED`,
    "color:#e4572e;font-weight:700"
  );
  console.log("meta", meta);
  console.log(
    `genreYearRegion · ${genreYearRegion.genres.length} genres × ` +
      `${genreYearRegion.years.length} years × ${genreYearRegion.regions.length} regions`,
    genreYearRegion
  );
  console.table(consoleYear.consoles);
  console.log("consoleYear (top-15 + Other)", consoleYear);
  console.log(`scoredGames · ${scoredGames.length} rows (scatter subset)`, scoredGames.slice(0, 5));
  console.groupEnd();
  /* eslint-enable no-console */
}

start();
