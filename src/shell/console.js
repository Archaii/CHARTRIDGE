// shell/console.js — builds the synthwave arcade cabinet and exposes
// the CRT screen surface that boot / menu / cartridges render into.
//
// The cabinet maps the console fiction onto real chrome (architecture
// §2), now dressed as an arcade machine:
//   marquee          → logo / tagline / credits / power + colorblind
//   left rail        → cartridge slots (live cartridge nav)
//   CRT screen       → the mount surface for every view
//   right rail       → HIGH SCORES leaderboard (top sellers)
//   control deck     → region buttons + year slider + filter readout
//
// Scanlines + vignette skin the frame only; the screen stays crisp.
import "./shell.css";
import { store } from "../store.js";
import { CARTRIDGES } from "./cartridges.js";
import { createRegionToggle } from "../ui/regionToggle.js";
import { createYearScrubber } from "../ui/yearScrubber.js";

const REGION_LABEL = {
  na: "NA",
  jp: "JP",
  pal: "PAL",
  other: "OTHER",
  total: "TOTAL",
};

const fmtM = (v) => `${(+v).toFixed(v < 10 ? 1 : 0)}M`;
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

export function createConsole(rootEl) {
  const slots = CARTRIDGES.map(
    (c) => `
      <button class="slot-cart" data-id="${c.id}" style="color:${c.family}"
              aria-label="Play ${c.title}">
        <span class="slot-cart__chip" style="background:${c.family}"></span>
        <span class="slot-cart__name">${c.title.replace(" ", "<br>")}</span>
      </button>`
  ).join("");

  rootEl.innerHTML = `
    <div class="scene" aria-hidden="true">
      <div class="scene__sun"></div>
      <div class="scene__floor"></div>
    </div>

    <div class="cab" role="application" aria-label="CHARTRIDGE arcade cabinet">
      <div class="cab__inner">
        <header class="marquee crt-lines">
          <div>
            <button class="marquee__logo" id="home-btn" type="button">CHARTRIDGE</button>
            <div class="marquee__tag">INSERT A CARTRIDGE. PLAY THE DATA.</div>
          </div>
          <div class="marquee__credits">
            <div class="marquee__status">
              <span class="marquee__led" aria-hidden="true"></span>
              <span id="hw-status">STANDBY</span>
              <button class="console__cb" id="cb-toggle" type="button" aria-pressed="false"
                      title="Colorblind-safe palette"><span aria-hidden="true">◑</span> CB</button>
            </div>
            CREDITS&nbsp;01<br><span class="blink">▶ INSERT COIN</span>
          </div>
        </header>

        <div class="machine">
          <nav class="rail rail--cart crt-lines" id="cart-rail" aria-label="Cartridge select">
            <h3 class="rail__title">CARTRIDGE</h3>
            ${slots}
          </nav>

          <div class="screen-frame">
            <div class="screen" id="screen"></div>
          </div>

          <aside class="rail rail--hs crt-lines" aria-label="High scores">
            <h3 class="rail__title" id="hs-rail-title">HIGH SCORES</h3>
            <div class="lb-summary" id="lb-summary"></div>
            <ol class="leaderboard" id="leaderboard"></ol>
          </aside>
        </div>

        <div class="deck crt-lines">
          <div class="deck__group">
            <div class="stick" aria-hidden="true">
              <div class="stick__base"></div><div class="stick__shaft"></div><div class="stick__ball"></div>
            </div>
            <span class="deck__label">P1</span>
          </div>
          <div class="deck__group">
            <div id="deck-region"></div>
            <span class="deck__label">REGION</span>
          </div>
          <div class="deck__scrub" id="deck-year"></div>
          <div class="readout" id="readout"></div>
        </div>
      </div>
    </div>

    <div class="vignette" aria-hidden="true"></div>
  `;

  const screen = rootEl.querySelector("#screen");
  const led = rootEl.querySelector(".marquee__led");
  const statusEl = rootEl.querySelector("#hw-status");
  const readout = rootEl.querySelector("#readout");
  const cbToggle = rootEl.querySelector("#cb-toggle");
  const leaderboard = rootEl.querySelector("#leaderboard");
  const railTitle = rootEl.querySelector("#hs-rail-title");
  const lbSummary = rootEl.querySelector("#lb-summary");
  const railBtns = [...rootEl.querySelectorAll(".slot-cart")];
  const deck = rootEl.querySelector(".deck");

  // Mount the live arcade controls, wired to the shared store.
  createRegionToggle({ mountEl: rootEl.querySelector("#deck-region"), store });
  createYearScrubber({ mountEl: rootEl.querySelector("#deck-year"), store });

  // Navigation: the API consumer (main.js) sets onNav(id|"menu").
  const api = { onNav: null };
  const nav = (id) => api.onNav && api.onNav(id);
  rootEl.querySelector("#home-btn").addEventListener("click", () => nav("menu"));
  railBtns.forEach((b) => b.addEventListener("click", () => nav(b.dataset.id)));

  // Colorblind-safe palette toggle.
  cbToggle.addEventListener("click", () =>
    store.set({ colorblind: !store.get().colorblind })
  );

  // Reflect store: filter readout, colorblind state, active cartridge.
  let sampleNote = "";
  function reflect(state) {
    const isMenu = state.cartridge === "menu";
    deck.style.display = isMenu ? "none" : null;

    const [s, e] = state.yearRange;
    const yrs = s === e ? `${s}` : `${s}–${e}`;
    readout.innerHTML = `${sampleNote ? `<b>${sampleNote}</b> · ` : ""}${REGION_LABEL[state.region]} · ${yrs}`;
    cbToggle.setAttribute("aria-pressed", String(state.colorblind));
    cbToggle.classList.toggle("is-on", state.colorblind);
    for (const b of railBtns) b.classList.toggle("is-on", b.dataset.id === state.cartridge);
  }
  store.subscribe(reflect);
  reflect(store.get());

  return {
    /** The CRT screen element — every view mounts here. */
    screen,

    /** Set the cartridge-nav handler: fn("menu" | cartridge id). */
    set onNav(fn) {
      api.onNav = fn;
    },

    /** Power LED + status label: "STANDBY" before boot, mode after. */
    setPower(on, label) {
      led.classList.toggle("is-on", !!on);
      statusEl.textContent = label ?? (on ? "ON" : "STANDBY");
    },

    /** A cartridge sets its active sample-size note (e.g. "4,126 SCORED"). */
    setSampleSize(note) {
      sampleNote = note ?? "";
      reflect(store.get());
    },

    /**
     * Fill the HIGH SCORES rail.
     * @param {{title,sales,score}[]} items
     * @param {{title?:string, metric?:"sales"|"score", summary?:string}} [opts]
     *   metric "score" shows critic score as the headline number (with
     *   sales beneath); "sales" (default) shows the sales figure.
     */
    setLeaderboard(items, opts = {}) {
      const { title = "HIGH SCORES", metric = "sales", summary = "" } = opts;
      railTitle.textContent = title;
      lbSummary.textContent = summary;
      lbSummary.classList.toggle("is-on", !!summary);
      leaderboard.innerHTML = (items || [])
        .map((g, i) => {
          const headline =
            metric === "score" ? (g.score != null ? g.score.toFixed(1) : "—") : fmtM(g.sales);
          const sub =
            metric === "score" ? `<span class="lb-sub">${fmtM(g.sales)}</span>` : "";
          return (
            `<li><span class="lb-rank">${i + 1}</span>` +
            `<span class="lb-main"><span class="lb-title" title="${esc(g.title)}">${esc(g.title)}</span>${sub}</span>` +
            `<span class="lb-score">${headline}</span></li>`
          );
        })
        .join("");

      // Detect overflowing text and apply marquee effect
      requestAnimationFrame(() => {
        leaderboard.querySelectorAll(".lb-title").forEach((titleEl) => {
          const scrollW = titleEl.scrollWidth;
          const clientW = titleEl.clientWidth;
          if (scrollW > clientW + 1) {
            const diff = scrollW - clientW;
            titleEl.style.setProperty("--scroll-dist", `${diff}px`);
            titleEl.classList.add("is-sliding");
          }
        });
      });
    },
  };
}
