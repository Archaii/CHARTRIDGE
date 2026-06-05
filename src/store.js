// store.js — the coordinated-views backbone (architecture §5).
//
// One shared state object; every control writes to it and every
// cartridge subscribes. This is what makes the three views feel like
// one machine: region and focusedGenre persist across cartridge swaps.
// Deliberately tiny — a full state library would be overkill, and a
// dependency-free module keeps d3 out of this graph.

// Default analytical window mirrors loader.js (YEAR_MIN/YEAR_MAX).
const DEFAULT_YEAR_RANGE = [1995, 2017];

const state = {
  cartridge: "menu", // "menu" | "highScore" | "consoleWars" | "genreWarp"
  region: "total", // "na" | "jp" | "pal" | "other" | "total"
  // Focus = a genre FAMILY key (see ui/palette.js FAMILIES) or null.
  // The architecture calls this "focusedGenre", but every view stacks
  // by the 6 families, so focus coordinates at the family level — the
  // "focus one genre" interaction from the redesign spec (§1a).
  focusedFamily: null,
  yearRange: [...DEFAULT_YEAR_RANGE], // [start, end] — brush / scrubber
  colorblind: false,
  playing: false, // true while the year playhead is sweeping
};

// How long the playhead dwells per year. Cartridges transition the
// sweep/spoke over this same span so motion is continuous, not stepped.
export const PLAYHEAD_MS = 650;

const subs = new Set();

export const store = {
  /** Read the current state (treat as read-only; mutate via set). */
  get: () => state,

  /**
   * Shallow-merge a patch and notify every subscriber.
   * Controls call this; subscribers re-read and re-render.
   */
  set(patch) {
    Object.assign(state, patch);
    subs.forEach((fn) => fn(state));
  },

  /**
   * Subscribe to state changes. Returns an unsubscribe function.
   * @param {(state: object) => void} fn
   */
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

export const DEFAULTS = { yearRange: DEFAULT_YEAR_RANGE };
