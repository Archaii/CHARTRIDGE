// shell/router.js — cartridge registry + view switching.
//
// The router owns what's on screen after boot: the menu, or one
// cartridge. On switch it calls current.destroy() → next.mount()
// (architecture §6). Cartridges without a `create` factory render an
// empty themed slot ("not inserted").
import "./router.css";
import { store } from "../store.js";
import { CARTRIDGES, getCartridge } from "./cartridges.js";
import { renderMenu } from "./menu.js";

export function createRouter({ screen, console: hw, data }) {
  let current = null; // the mounted cartridge instance, or null on the menu

  function teardown() {
    if (current && typeof current.destroy === "function") current.destroy();
    current = null;
  }

  function showMenu() {
    teardown();
    store.set({ cartridge: "menu" });
    hw.setSampleSize("");
    hw.setPower(true, "MENU");
    renderMenu(screen, open);
  }

  function open(id) {
    const cart = getCartridge(id);
    if (!cart) return;
    teardown();
    store.set({ cartridge: id });
    hw.setSampleSize("");
    hw.setPower(true, "ON");

    if (cart.create) {
      // Build and mount the real cartridge, handing it the shared
      // lookup tables (data), the store, and console hooks (shell).
      current = cart.create({ mountEl: screen, data, store, shell: hw });
      current.mount();
      return;
    }

    // M0 placeholder: the slot is empty until this cartridge ships.
    screen.innerHTML = `
      <div class="screen__view slot" style="--slot-family:${cart.family}">
        <span class="slot__no">CART ${cart.no}</span>
        <span class="slot__title">${cart.title}</span>
        <span class="slot__badge">Cartridge not inserted</span>
        <p class="slot__msg">${cart.blurb} This slot is wired up in a later build — the shell boots and routes, but the visualization isn't loaded yet.</p>
        <button class="slot__back" data-back>◀ BACK TO MENU</button>
      </div>
    `;
    screen.querySelector("[data-back]").addEventListener("click", showMenu);
  }

  // Keyboard (architecture §11): number keys quick-pick a cartridge;
  // R resets the shared filters; Esc / Backspace return to the menu.
  // (Ignore keystrokes while typing in a form control.)
  function onKey(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement)
      return;
    const n = Number(e.key);
    if (n >= 1 && n <= CARTRIDGES.length) {
      open(CARTRIDGES[n - 1].id);
      return;
    }
    if (e.key.toLowerCase() === "r") {
      store.set({ region: "total", focusedGenres: [], yearRange: [1995, 2024] });
      return;
    }
    if (e.key === "Escape" || e.key === "Backspace") {
      if (current !== null || !screen.querySelector(".menu")) showMenu();
    }
  }
  window.addEventListener("keydown", onKey);

  return { showMenu, open };
}
