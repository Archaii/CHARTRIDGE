// ui/legend.js — the 5-group genre legend, doubling as a filter.
//
// Clicking a group toggles all of its constituent genres in the shared store,
// which triggers consistent filtering across all three cartridges.
import "./legend.css";
import { FAMILIES, FAMILY_LABEL, familyColor, familyGenres, toggleFamily } from "./palette.js";

/**
 * @param {{ mountEl: HTMLElement, store?: object, title?: string }} opts
 * @returns {{ destroy: () => void }}
 */
export function createLegend({ mountEl, store, title = "Genre Group" }) {
  mountEl.classList.add("legend");
  mountEl.setAttribute("aria-label", "Genre filter — click to isolate group");
  let prevCb;

  function build(cb) {
    prevCb = cb;
    const items = FAMILIES.map((fam) => {
      const label = FAMILY_LABEL[fam];
      const color = familyColor(fam, cb);
      return `
        <button type="button" class="legend__item" data-family="${fam}" aria-pressed="false">
          <span class="legend__swatch" style="background:${color}"></span>${label}
        </button>`;
    }).join("");
    mountEl.innerHTML = `<span class="legend__title">${title}</span>${items}`;
  }

  // Reflect colorblind (re-color swatches) + focus (active/dim states).
  function reflect(state) {
    if (state.colorblind !== prevCb) build(state.colorblind);
    const selectedGenres = state.focusedGenres || [];
    const hasFocus = selectedGenres.length > 0;
    
    for (const b of mountEl.querySelectorAll(".legend__item")) {
      const fam = b.dataset.family;
      const fGenres = familyGenres(fam);
      // A group is active if all its member genres are focused.
      const active = fGenres.length > 0 && fGenres.every((g) => selectedGenres.includes(g));
      
      b.classList.toggle("is-active", active);
      b.classList.toggle("is-dim", hasFocus && !active);
      b.setAttribute("aria-pressed", String(active));
    }
  }

  function onClick(e) {
    const b = e.target.closest(".legend__item");
    if (!b) return;
    const fam = b.dataset.family;
    const current = store.get().focusedGenres || [];
    const updated = toggleFamily(current, fam);
    store.set({ focusedGenres: updated });
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
