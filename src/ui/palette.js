// ui/palette.js — the single source of truth for genre color.
//
// 20 genres roll up into 5 FAMILIES (groups) for filtering.
// Color never works alone — the cartridges pair it with a focus interaction.
// Hex values mirror theme.css's --fam-* tokens; canvas needs literals.

export const FAMILIES = [
  "combat",  // Action & Combat
  "mind",    // Strategy & Mind
  "story",   // Role-Playing & Story
  "speed",   // Sports & Speed
  "casual",  // Casual & Creative
];

export const FAMILY_LABEL = {
  combat: "Action & Combat",
  mind: "Strategy & Mind",
  story: "Role-Playing & Story",
  speed: "Sports & Speed",
  casual: "Casual & Creative",
};

// Every one of the 20 genres → its family (grouped as requested).
const GENRE_TO_FAMILY = {
  Action: "combat",
  "Action-Adventure": "combat",
  Fighting: "combat",
  Shooter: "combat",
  
  Strategy: "mind",
  Simulation: "mind",
  Puzzle: "mind",
  "Board Game": "mind",
  Education: "mind",
  
  "Role-Playing": "story",
  Adventure: "story",
  "Visual Novel": "story",
  MMO: "story",
  Platform: "story",
  
  Sports: "speed",
  Racing: "speed",
  
  Party: "casual",
  Music: "casual",
  Misc: "casual",
  Sandbox: "casual",
};

// Default (themed) palette — neon, tuned to glow on the dark CRT.
const PALETTE = {
  combat: "#ff3c00",   // Action & Combat (Electric red-orange)
  mind: "#00f5a0",     // Strategy & Mind (Neon mint green)
  story: "#c77dff",    // Role-Playing & Story (Neon light purple)
  speed: "#00f5ff",    // Sports & Speed (Neon cyan-blue)
  casual: "#ffd23f",   // Casual & Creative (Neon yellow)
};

// Colorblind-safe variant (Okabe–Ito), used when store.colorblind = true.
// Validated by Okabe and Ito (2008) for deuteranopia, protanopia, and tritanopia.
const PALETTE_CB = {
  combat: "#d55e00",   // vermillion (matches Red/Orange)
  mind: "#009e73",     // bluish green (matches Green)
  story: "#cc79a7",    // reddish purple (matches Purple/Pink)
  speed: "#56b4e9",    // sky blue (matches Cyan)
  casual: "#f0e442",   // yellow (matches Amber)
};

// Fallback for any genre not in the map (keeps rendering robust).
const NEUTRAL = "#9aa0a6";

const GENRE_COLORS = {
  // Combat (reds/oranges)
  Action: "#ff3c00",
  "Action-Adventure": "#ff8a00",
  Fighting: "#ff0055",
  Shooter: "#d90429",
  
  // Mind (greens)
  Strategy: "#00f5a0",
  Simulation: "#00f5d4",
  Puzzle: "#70e000",
  "Board Game": "#38b000",
  Education: "#007f5f",
  
  // Story (purples/pinks)
  "Role-Playing": "#c77dff",
  Adventure: "#ffc6ff",
  "Visual Novel": "#7209b7",
  MMO: "#ff2a6d",
  Platform: "#f72585",
  
  // Speed (blues)
  Sports: "#4ea8de",
  Racing: "#90e0ef",
  
  // Casual (yellows/golds)
  Party: "#ffee32",
  Music: "#ff9100",
  Misc: "#ffd60a",
  Sandbox: "#ffd166",
};

/** Map a genre string to its family key (or "casual" as a safe default). */
export function genreFamily(genre) {
  return GENRE_TO_FAMILY[genre] ?? "casual";
}

/** Color for a family key, honoring the colorblind toggle. */
export function familyColor(family, colorblind = false) {
  const p = colorblind ? PALETTE_CB : PALETTE;
  return p[family] ?? NEUTRAL;
}

/** Color for a raw genre, honoring the colorblind toggle. */
export function genreColor(genre, colorblind = false) {
  if (colorblind) {
    return familyColor(genreFamily(genre), true);
  }
  return GENRE_COLORS[genre] ?? familyColor(genreFamily(genre), false);
}

export const GENRES = Object.keys(GENRE_TO_FAMILY).sort((a, b) => {
  const famA = genreFamily(a);
  const famB = genreFamily(b);
  if (famA !== famB) return famA.localeCompare(famB);
  return a.localeCompare(b);
});

/** Get all raw genres belonging to a family. */
export function familyGenres(family) {
  return Object.keys(GENRE_TO_FAMILY).filter((g) => GENRE_TO_FAMILY[g] === family);
}

/** Toggle a family in a list of active genres. */
export function toggleFamily(currentGenres, family) {
  const fGenres = familyGenres(family);
  const isFullyActive = fGenres.every((g) => currentGenres.includes(g));
  if (isFullyActive) {
    return currentGenres.filter((g) => !fGenres.includes(g));
  } else {
    return [...new Set([...currentGenres, ...fGenres])];
  }
}

/** The raw genre swatches in order — for building the legend. */
export function genreSwatches(colorblind = false) {
  return GENRES.map((genre) => ({
    genre,
    label: genre,
    color: genreColor(genre, colorblind),
  }));
}
