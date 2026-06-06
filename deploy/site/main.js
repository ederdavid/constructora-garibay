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

  // ── Cotizador por metro cuadrado ────────────────────────
  // Precio base de obra. Cambiar aquí ajusta todo el cotizador.
  const RATE_PER_M2 = 15000; // MXN
  const MIN_M2 = 1;
  const MAX_M2 = 5000;

  const m2Input = document.getElementById("cz-m2");
  const m2Range = document.getElementById("cz-range");
  const totalOut = document.getElementById("cz-total");
  const rateOut = document.getElementById("cz-rate");

  if (m2Input && totalOut) {
    const mxn = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    });

    const clamp = (n) => Math.min(MAX_M2, Math.max(MIN_M2, n));

    if (rateOut) rateOut.textContent = mxn.format(RATE_PER_M2);

    const render = (m2) => {
      totalOut.textContent = `${mxn.format(m2 * RATE_PER_M2)} MXN`;
    };

    // El número manda; el slider lo sigue (y se topa en su propio máximo).
    const fromInput = () => {
      const raw = parseInt(m2Input.value, 10);
      if (Number.isNaN(raw)) {
        totalOut.textContent = "—";
        return;
      }
      const m2 = clamp(raw);
      if (m2Range) m2Range.value = Math.min(Number(m2Range.max), m2);
      render(m2);
    };

    const fromRange = () => {
      const m2 = clamp(parseInt(m2Range.value, 10));
      m2Input.value = m2;
      render(m2);
    };

    m2Input.addEventListener("input", fromInput);
    m2Input.addEventListener("blur", () => {
      if (m2Input.value !== "") m2Input.value = clamp(parseInt(m2Input.value, 10) || MIN_M2);
      fromInput();
    });
    if (m2Range) m2Range.addEventListener("input", fromRange);

    fromInput(); // estado inicial
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
