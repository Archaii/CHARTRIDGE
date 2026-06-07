// ui/legend.js — the 6-family genre legend, doubling as a filter.
//
// Clicking a family swatch toggles the shared store.focusedFamily, so
// the legend is the primary, big-target way to isolate a genre (the
// dense scatter makes per-dot clicking fiddly). Because the legend is
// shared, this same gesture filters all three cartridges consistently.
import "./legend.css";
import { genreSwatches } from "./palette.js";

/**
 * @param {{ mountEl: HTMLElement, store?: object, title?: string }} opts
 * @returns {{ destroy: () => void }}
 */
export function createLegend({ mountEl, store, title = "Genre" }) {
  mountEl.classList.add("legend");
  mountEl.setAttribute("aria-label", "Genre filter — click to isolate");
  let prevCb;

  function build(cb) {
    prevCb = cb;
    const items = genreSwatches(cb)
      .map(
        (s) => `
        <button type="button" class="legend__item" data-genre="${s.genre}" aria-pressed="false">
          <span class="legend__swatch" style="background:${s.color}"></span>${s.label}
        </button>`
      )
      .join("");
    mountEl.innerHTML = `<span class="legend__title">${title}</span>${items}`;
  }

  // Reflect colorblind (re-color swatches) + focus (active/dim states).
  function reflect(state) {
    if (state.colorblind !== prevCb) build(state.colorblind);
    const focus = state.focusedGenre;
    for (const b of mountEl.querySelectorAll(".legend__item")) {
      const on = b.dataset.genre === focus;
      b.classList.toggle("is-active", on);
      b.classList.toggle("is-dim", !!focus && !on);
      b.setAttribute("aria-pressed", String(on));
    }
  }

  function onClick(e) {
    const b = e.target.closest(".legend__item");
    if (!b) return;
    const genre = b.dataset.genre;
    store.set({ focusedGenre: store.get().focusedGenre === genre ? null : genre });
  }

  build(store ? store.get().colorblind : false);
  let unsub = null;
  if (store) {
    mountEl.addEventListener("click", onClick);
    reflect(store.get());
    unsub = store.subscribe(reflect);
  }

  return {
    destroy() {
      unsub?.();
      mountEl.removeEventListener("click", onClick);
      mountEl.innerHTML = "";
      mountEl.classList.remove("legend");
    },
  };
}
