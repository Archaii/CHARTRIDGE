// ui/yearScrubber.js — the timeline control (D-pad / slider + playhead).
//
// Owns a [start, end] year range as two thumbs (the "brush" for the
// timeline cartridges) plus a play button that sweeps the end thumb
// forward one year at a time via a single requestAnimationFrame loop
// (architecture §8/§10 — one rAF loop, not setInterval-per-element).
// Reads/writes store.yearRange; subscribes so it reflects external
// changes too.
import "./yearScrubber.css";
import { PLAYHEAD_MS } from "../store.js";

const REDUCED_MOTION = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

const STEP_MS = PLAYHEAD_MS; // dwell per year while playing

/**
 * @param {{ mountEl: HTMLElement, store: object, min?: number, max?: number }} opts
 * @returns {{ destroy: () => void }}
 */
export function createYearScrubber({ mountEl, store, min = 1995, max = 2020 }) {
  mountEl.classList.add("scrubber");
  mountEl.innerHTML = `
    <button class="scrubber__play" aria-label="Play timeline">▶</button>
    <div class="scrubber__body">
      <div class="scrubber__head">
        <span class="scrubber__label">Year</span>
        <span class="scrubber__value" id="scrub-value"></span>
      </div>
      <div class="scrubber__track">
        <div class="scrubber__rail"></div>
        <div class="scrubber__fill" id="scrub-fill"></div>
        <input class="scrubber__input" id="scrub-start" type="range"
               min="${min}" max="${max}" step="1" aria-label="Start year" />
        <input class="scrubber__input" id="scrub-end" type="range"
               min="${min}" max="${max}" step="1" aria-label="End year" />
      </div>
    </div>
  `;

  const playBtn = mountEl.querySelector(".scrubber__play");
  const startInput = mountEl.querySelector("#scrub-start");
  const endInput = mountEl.querySelector("#scrub-end");
  const fillEl = mountEl.querySelector("#scrub-fill");
  const valueEl = mountEl.querySelector("#scrub-value");

  const span = max - min || 1;
  const pct = (y) => ((y - min) / span) * 100;

  // ---- render from state (no store writes here → no feedback loop) ----
  function reflect(state) {
    let [s, e] = state.yearRange;
    s = Math.max(min, Math.min(max, s));
    e = Math.max(s, Math.min(max, e));
    startInput.value = String(s);
    endInput.value = String(e);
    fillEl.style.left = `${pct(s)}%`;
    fillEl.style.width = `${pct(e) - pct(s)}%`;
    valueEl.textContent = s === e ? `${s}` : `${s}–${e}`;
  }

  // ---- user dragging a thumb ----
  function commit(s, e) {
    s = Math.max(min, Math.min(max, s));
    e = Math.max(min, Math.min(max, e));
    if (s > e) [s, e] = [e, s]; // keep ordered
    store.set({ yearRange: [s, e] });
  }
  function onStart() {
    stop();
    commit(+startInput.value, +endInput.value);
  }
  function onEnd() {
    stop();
    commit(+startInput.value, +endInput.value);
  }

  // ---- playhead loop (one rAF) ----
  let playing = false;
  let rafId = null;
  let lastT = 0;
  let acc = 0;

  function tick(t) {
    if (!playing) return;
    if (!lastT) lastT = t;
    acc += t - lastT;
    lastT = t;
    while (acc >= STEP_MS) {
      acc -= STEP_MS;
      const [s, e] = store.get().yearRange;
      if (e >= max) {
        stop();
        return;
      }
      store.set({ yearRange: [s, e + 1] });
    }
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (playing) return;
    let [s, e] = store.get().yearRange;
    // If parked at the end, restart the sweep from the start year.
    if (e >= max) store.set({ yearRange: [s, s] });
    playing = true;
    lastT = 0;
    acc = 0;
    playBtn.textContent = "⏸";
    playBtn.setAttribute("aria-label", "Pause timeline");
    // Glide the fill over each dwell so it reads as continuous motion.
    mountEl.style.setProperty("--scrub-dur", `${STEP_MS}ms`);
    mountEl.classList.add("is-playing");
    store.set({ playing: true });
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    playBtn.textContent = "▶";
    playBtn.setAttribute("aria-label", "Play timeline");
    mountEl.classList.remove("is-playing");
    store.set({ playing: false });
  }

  function onPlay() {
    playing ? stop() : play();
  }

  playBtn.addEventListener("click", onPlay);
  startInput.addEventListener("input", onStart);
  endInput.addEventListener("input", onEnd);
  const unsub = store.subscribe(reflect);
  reflect(store.get());

  // Honor reduced motion: keep the control, just disable autoplay.
  if (REDUCED_MOTION) {
    playBtn.disabled = true;
    playBtn.title = "Autoplay disabled (reduced motion)";
    playBtn.style.opacity = "0.5";
    playBtn.style.cursor = "default";
  }

  return {
    destroy() {
      stop();
      unsub();
      playBtn.removeEventListener("click", onPlay);
      startInput.removeEventListener("input", onStart);
      endInput.removeEventListener("input", onEnd);
      mountEl.innerHTML = "";
      mountEl.classList.remove("scrubber");
    },
  };
}
