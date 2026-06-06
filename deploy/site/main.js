// Constructora Garibay — minimal progressive enhancement.
// No dependencies. Everything degrades gracefully if JS is off.

(() => {
  "use strict";

  // ── Current year in footer ──────────────────────────────
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // ── Sticky nav hairline on scroll ───────────────────────
  const nav = document.getElementById("nav");
  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle("is-stuck", window.scrollY > 8);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // ── Mobile menu toggle ──────────────────────────────────
  const toggle = document.querySelector(".nav__toggle");
  const menu = document.getElementById("mobile-menu");
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      menu.hidden = !open;
    };
    toggle.addEventListener("click", () =>
      setOpen(toggle.getAttribute("aria-expanded") !== "true")
    );
    menu.addEventListener("click", (e) => {
      if (e.target.tagName === "A") setOpen(false);
    });
  }

  // ── Scroll-reveal via IntersectionObserver ──────────────
  const reveals = document.querySelectorAll(".reveal");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-in"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
  );
  reveals.forEach((el) => io.observe(el));
})();
