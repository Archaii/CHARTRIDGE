// ui/regionToggle.js — the console's face buttons as a region control.
//
// Renders NA / JP / PAL / Other / Total as a radio group. Clicking
// sets store.region; the control also subscribes so it reflects the
// region even when another control or cartridge changes it (the state
// is global and persists across cartridge swaps — architecture §5).
import "./regionToggle.css";

const REGIONS = [
  { id: "na", label: "NA" },
  { id: "jp", label: "JP" },
  { id: "pal", label: "PAL" },
  { id: "other", label: "OTH" },
  { id: "total", label: "TOTAL" },
];

/**
 * @param {{ mountEl: HTMLElement, store: object }} opts
 * @returns {{ destroy: () => void }}
 */
export function createRegionToggle({ mountEl, store }) {
  mountEl.classList.add("region");
  mountEl.setAttribute("role", "radiogroup");
  mountEl.setAttribute("aria-label", "Sales region");

  mountEl.innerHTML = REGIONS.map(
    (r) => `
      <button class="region__btn${r.id === "total" ? " region__btn--total" : ""}"
              role="radio" data-region="${r.id}"
              aria-label="${r.label === "OTH" ? "Other" : r.label} region">
        ${r.label}
      </button>`
  ).join("");

  const btns = [...mountEl.querySelectorAll(".region__btn")];

  function reflect(state) {
    for (const b of btns) {
      const active = b.dataset.region === state.region;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-checked", String(active));
      b.tabIndex = active ? 0 : -1; // roving tabindex
    }
  }

  function onClick(e) {
    const btn = e.target.closest(".region__btn");
    if (btn) store.set({ region: btn.dataset.region });
  }

  // Left/Right arrows move through regions (keyboard support, §11).
  function onKey(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = REGIONS.findIndex((r) => r.id === store.get().region);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % REGIONS.length
        : (i - 1 + REGIONS.length) % REGIONS.length;
    store.set({ region: REGIONS[next].id });
    mountEl.querySelector(".region__btn.is-active")?.focus();
  }

  mountEl.addEventListener("click", onClick);
  mountEl.addEventListener("keydown", onKey);
  const unsub = store.subscribe(reflect);
  reflect(store.get());

  return {
    destroy() {
      unsub();
      mountEl.removeEventListener("click", onClick);
      mountEl.removeEventListener("keydown", onKey);
      mountEl.innerHTML = "";
      mountEl.classList.remove("region");
    },
  };
}
