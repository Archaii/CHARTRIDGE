// ui/palette.js — the single source of truth for genre color.
//
// 20 genres is far past the ~8 a categorical palette can keep
// distinguishable (redesign spec §1a), so genres roll up into 6
// FAMILIES, one hue each. Color never works alone — the cartridges
// pair it with a focus-one-genre interaction.
//
// Hex values mirror theme.css's --fam-* tokens. They're duplicated
// here because <canvas> (the HIGH SCORE scatter) can't read CSS custom
// properties — JS needs literal colors. Keep the two in sync.

export const FAMILIES = [
  "action", // Action-driven   — reds/oranges
  "compete", // Competitive     — blues
  "systems", // Systems         — greens
  "story", // Story           — purples
  "social", // Social/Casual   — teal/yellow
  "online", // Online (MMO)    — single accent
];

export const FAMILY_LABEL = {
  action: "Action-driven",
  compete: "Competitive",
  systems: "Systems",
  story: "Story",
  social: "Social / Casual",
  online: "Online",
};

// Every one of the 20 genres → its family (redesign spec §1a).
const GENRE_TO_FAMILY = {
  Action: "action",
  "Action-Adventure": "action",
  Adventure: "action",
  Shooter: "compete",
  Fighting: "compete",
  Sports: "compete",
  Racing: "compete",
  Strategy: "systems",
  Simulation: "systems",
  Puzzle: "systems",
  "Board Game": "systems",
  "Role-Playing": "story",
  "Visual Novel": "story",
  Platform: "story",
  Party: "social",
  Music: "social",
  Misc: "social",
  Education: "social",
  MMO: "online",
};

// Default (themed) palette — neon, tuned to glow on the dark CRT.
// Mirrors the --fam-* tokens in theme.css; canvas needs literals.
const PALETTE = {
  action: "#ff6b35",
  compete: "#05d9e8",
  systems: "#00f5a0",
  story: "#c77dff",
  social: "#ffd23f",
  online: "#ff2a6d",
};

// Colorblind-safe variant (Okabe–Ito), used when store.colorblind = true.
const PALETTE_CB = {
  action: "#d55e00", // vermillion
  compete: "#0072b2", // blue
  systems: "#009e73", // green
  story: "#cc79a7", // reddish purple
  social: "#f0e442", // yellow
  online: "#e69f00", // orange
};

// Fallback for any genre not in the map (keeps rendering robust).
const NEUTRAL = "#9aa0a6";

const GENRE_COLORS = {
  Action: "#ff3c00",             // Electric red-orange
  "Action-Adventure": "#ff8a00",   // Neon orange
  Adventure: "#b21e35",          // Deep vibrant red
  
  Shooter: "#00f5ff",            // Ultra-bright cyan
  Fighting: "#3a86ff",           // Neon royal blue
  Sports: "#4ea8de",             // Bright sky blue
  Racing: "#90e0ef",             // Pale electric blue
  
  Strategy: "#00f5a0",           // Neon mint green
  Simulation: "#00f5d4",         // Neon turquoise
  Puzzle: "#70e000",             // Neon lime green
  "Board Game": "#38b000",       // Vibrant grass green
  
  "Role-Playing": "#c77dff",     // Neon light purple
  "Visual Novel": "#7209b7",     // Deep electric violet
  Platform: "#f72585",           // Neon hot pink-purple
  
  Party: "#ffee32",              // Bright neon yellow
  Music: "#ff9100",              // Neon amber orange
  Misc: "#ffd60a",               // Bright gold
  Education: "#ffd166",          // Pastel orange-yellow
  
  MMO: "#ff2a6d",                // Neon magenta
};

/** Map a genre string to its family key (or "social" as a safe default). */
export function genreFamily(genre) {
  return GENRE_TO_FAMILY[genre] ?? "social";
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

/** The raw genre swatches in order — for building the legend. */
export function genreSwatches(colorblind = false) {
  return GENRES.map((genre) => ({
    genre,
    label: genre,
    color: genreColor(genre, colorblind),
  }));
}
