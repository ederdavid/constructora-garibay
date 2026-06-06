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
  // Modelo: total = m² × tarifa(tipo de obra) × multiplicador(acabado).
  // Editar estos catálogos ajusta todo el cotizador.
  const OBRA = {
    casa:         { label: "Casa residencial", rate: 15000 },
    comercial:    { label: "Local comercial",  rate: 18000 },
    remodelacion: { label: "Remodelación",     rate: 9000  },
  };
  const ACABADO = {
    economico: { label: "Económico", mult: 0.85 },
    medio:     { label: "Medio",     mult: 1.0  },
    premium:   { label: "Premium",   mult: 1.35 },
  };
  const MIN_M2 = 1;
  const MAX_M2 = 5000;

  const m2Input = document.getElementById("cz-m2");
  const m2Range = document.getElementById("cz-range");
  const totalOut = document.getElementById("cz-total");
  const detailOut = document.getElementById("cz-detail");
  const obraGroup = document.getElementById("cz-obra");
  const acabadoGroup = document.getElementById("cz-acabado");
  const cta = document.getElementById("cz-cta");
  const mensaje = document.getElementById("contacto-mensaje");

  if (m2Input && totalOut) {
    const mxn = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    });

    const clamp = (n) => Math.min(MAX_M2, Math.max(MIN_M2, n));
    const checked = (group, fallback) => {
      const el = group && group.querySelector("input:checked");
      return el ? el.value : fallback;
    };

    // Estado actual del cotizador (lo reusa también el prellenado del form).
    const quote = () => {
      const obra = OBRA[checked(obraGroup, "casa")];
      const acabado = ACABADO[checked(acabadoGroup, "medio")];
      const raw = parseInt(m2Input.value, 10);
      const m2 = Number.isNaN(raw) ? null : clamp(raw);
      const effRate = Math.round(obra.rate * acabado.mult);
      return { obra, acabado, m2, effRate, total: m2 === null ? null : m2 * effRate };
    };

    const render = () => {
      const q = quote();
      if (q.total === null) {
        totalOut.textContent = "—";
      } else {
        totalOut.textContent = `${mxn.format(q.total)} MXN`;
      }
      detailOut.textContent =
        `${mxn.format(q.effRate)} MXN/m² · ${q.obra.label} · acabado ${q.acabado.label.toLowerCase()}`;
    };

    // El número manda; el slider lo sigue (y se topa en su propio máximo).
    const syncFromInput = () => {
      const raw = parseInt(m2Input.value, 10);
      if (!Number.isNaN(raw) && m2Range) m2Range.value = Math.min(Number(m2Range.max), clamp(raw));
      render();
    };
    const syncFromRange = () => {
      m2Input.value = clamp(parseInt(m2Range.value, 10));
      render();
    };

    m2Input.addEventListener("input", syncFromInput);
    m2Input.addEventListener("blur", () => {
      if (m2Input.value !== "") m2Input.value = clamp(parseInt(m2Input.value, 10) || MIN_M2);
      syncFromInput();
    });
    if (m2Range) m2Range.addEventListener("input", syncFromRange);
    if (obraGroup) obraGroup.addEventListener("change", render);
    if (acabadoGroup) acabadoGroup.addEventListener("change", render);

    // CTA: prellena el mensaje del formulario con el detalle del estimado.
    if (cta && mensaje) {
      cta.addEventListener("click", () => {
        const q = quote();
        const m2 = q.m2 === null ? "—" : q.m2;
        const total = q.total === null ? "por definir" : `${mxn.format(q.total)} MXN`;
        mensaje.value =
          `Hola, me interesa una cotización.\n\n` +
          `• Tipo de obra: ${q.obra.label}\n` +
          `• Nivel de acabado: ${q.acabado.label}\n` +
          `• Superficie: ${m2} m²\n` +
          `• Estimado aproximado: ${total} (${mxn.format(q.effRate)} MXN/m²)\n\n` +
          `Me gustaría agendar una cotización formal.`;
        // El href="#contacto" hace el scroll; resaltamos el campo al llegar.
        mensaje.classList.add("is-filled");
        setTimeout(() => mensaje.classList.remove("is-filled"), 1600);
      });
    }

    render(); // estado inicial
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
