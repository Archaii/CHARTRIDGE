// ui/tooltip.js — ONE shared tooltip for the whole app.
//
// Never instantiate per-cartridge (architecture §8). A single fixed
// div is created lazily on first use and moved/filled on hover. It
// follows the cursor and clamps itself inside the viewport.
import "./tooltip.css";

let el = null;

function ensure() {
  if (el) return el;
  el = document.createElement("div");
  el.className = "tooltip";
  el.setAttribute("role", "tooltip");
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  return el;
}

export const tooltip = {
  /**
   * Show the tooltip with HTML content, anchored near (x, y) in
   * viewport (clientX/clientY) coordinates.
   */
  show(html, x, y) {
    const node = ensure();
    node.innerHTML = html;
    node.classList.add("is-visible");
    node.setAttribute("aria-hidden", "false");
    this.move(x, y);
  },

  /** Reposition without changing content; clamps to the viewport. */
  move(x, y) {
    if (!el) return;
    const pad = 8;
    const r = el.getBoundingClientRect();
    // Default anchor centers above the cursor (see transform in CSS).
    let left = x;
    let top = y;
    // Clamp horizontally so the centered box stays on-screen.
    const half = r.width / 2;
    left = Math.max(half + pad, Math.min(window.innerWidth - half - pad, left));
    // If there's no room above, flip below the cursor.
    if (y - r.height - 12 < pad) {
      top = y + r.height + 12;
      el.style.transform = "translate(-50%, 0)";
    } else {
      el.style.transform = "translate(-50%, calc(-100% - 12px))";
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  },

  hide() {
    if (!el) return;
    el.classList.remove("is-visible");
    el.setAttribute("aria-hidden", "true");
  },
};
