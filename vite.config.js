import { defineConfig } from "vite";

// CHARTRIDGE is a static site reading one CSV — no backend.
// base: "./" keeps asset paths relative so the built dist/ works on
// GitHub Pages / Netlify / Vercel without extra config.
export default defineConfig({
  base: "./",
  server: {
    open: true,
  },
});
