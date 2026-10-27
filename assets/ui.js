// Small shared pieces of the page chrome: marquee bulbs, the clock and the nav highlight.
import { clock } from "./format.js";

// Bulbs are real elements, about one every 24px, refilled when the sign changes width.
export function startBulbs() {
  function fill() {
    document.querySelectorAll(".bulbs").forEach((row) => {
      const want = Math.max(6, Math.floor(row.clientWidth / 24) + 1);
      if (row.children.length === want) return;
      row.replaceChildren();
      for (let i = 0; i < want; i++) row.append(document.createElement("i"));
    });
  }
  fill();
  window.addEventListener("resize", fill);
}

export function startClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  const tick = () => { el.textContent = clock(Date.now()); };
  tick();
  setInterval(tick, 15000);
}

// Highlights the nav item whose data-nav matches key.
export function setNav(key) {
  document.querySelectorAll("[data-nav]").forEach((n) => {
    if (n.getAttribute("data-nav") === key) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
}
