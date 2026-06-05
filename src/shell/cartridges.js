// shell/cartridges.js — the cartridge registry.
//
// Each entry is what the menu renders and what the router switches
// between. A `create` factory implements the mount/update/destroy
// contract (architecture §6); entries with `create: null` are not yet
// built and render a placeholder slot.
import { createConsoleWars } from "../cartridges/consoleWars.js";
import { createHighScore } from "../cartridges/highScore.js";
import { createGenreWarp } from "../cartridges/genreWarp.js";

export const CARTRIDGES = [
  {
    id: "highScore",
    no: "01",
    title: "HIGH SCORE",
    family: "var(--fam-action)",
    answers: "Quality vs sales · hidden gems · genre eras",
    blurb: "Linked genre streamgraph + critic-score × sales scatter.",
    create: createHighScore,
  },
  {
    id: "consoleWars",
    no: "02",
    title: "CONSOLE WARS",
    family: "var(--fam-compete)",
    answers: "Platform lifecycles · regional strength · genre-per-console",
    blurb: "Console-lifecycle ridgeline with a year playhead.",
    create: createConsoleWars,
  },
  {
    id: "genreWarp",
    no: "03",
    title: "GENRE WARP",
    family: "var(--fam-story)",
    answers: "Genre peaks over time · era dominance · single-genre drill-down",
    blurb: "Radial genre spiral with a focus inset.",
    create: createGenreWarp,
  },
];

export const getCartridge = (id) => CARTRIDGES.find((c) => c.id === id);
