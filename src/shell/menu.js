// shell/menu.js — the cartridge-select screen ("INSERT CARTRIDGE").
import "./menu.css";
import { CARTRIDGES } from "./cartridges.js";

/**
 * Render the cartridge-select menu into `screen`.
 * @param {HTMLElement} screen - the console screen surface
 * @param {(id: string) => void} onSelect - called with a cartridge id
 */
export function renderMenu(screen, onSelect) {
  const carts = CARTRIDGES.map(
    (c, i) => `
      <button class="cart" data-id="${c.id}" style="--cart-family:${c.family}"
              aria-label="Cartridge ${c.no}: ${c.title}. ${c.blurb}">
        <span class="cart__no">CART ${c.no} · PRESS ${i + 1}</span>
        <span class="cart__title">${c.title}</span>
        <span class="cart__blurb">${c.blurb}</span>
        <span class="cart__answers">${c.answers}</span>
      </button>
    `
  ).join("");

  screen.innerHTML = `
    <div class="screen__view menu">
      <div class="menu__head">
        <span class="menu__title">INSERT CARTRIDGE</span>
        <span class="menu__hint">1–3 Quick-pick &nbsp;·&nbsp; R Reset filters</span>
      </div>
      <div class="menu__grid" role="menu">${carts}</div>
    </div>
  `;

  screen.querySelectorAll(".cart").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.id));
  });
}
