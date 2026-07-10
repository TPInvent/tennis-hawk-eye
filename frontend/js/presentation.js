/* presentation.js — slide deck mechanics: prev/next, arrow keys, progress dots.
 * Exposes window.Presentation.init(), called once from app.js.
 */
(function () {
  "use strict";

  const stage = document.getElementById("deck-stage");
  const slides = stage ? Array.from(stage.querySelectorAll(".slide")) : [];
  const dotsContainer = document.getElementById("deck-dots");
  const prevBtn = document.getElementById("deck-prev");
  const nextBtn = document.getElementById("deck-next");
  const currentEl = document.getElementById("deck-current");
  const totalEl = document.getElementById("deck-total");

  let current = 0;
  let dots = [];

  function render() {
    slides.forEach((slide, i) => slide.classList.toggle("is-active", i === current));
    dots.forEach((dot, i) => {
      const isActive = i === current;
      dot.classList.toggle("active", isActive);
      dot.setAttribute("aria-selected", String(isActive));
    });
    if (currentEl) currentEl.textContent = String(current + 1);
    if (prevBtn) prevBtn.disabled = current === 0;
    if (nextBtn) nextBtn.disabled = current === slides.length - 1;
  }

  function goTo(index) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    render();
  }

  function buildDots() {
    if (!dotsContainer) return;
    slides.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.className = "deck-dot";
      dot.type = "button";
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", "Go to slide " + (i + 1));
      dot.addEventListener("click", () => goTo(i));
      dotsContainer.appendChild(dot);
      dots.push(dot);
    });
  }

  function isPresentationActive() {
    const panel = document.getElementById("panel-presentation");
    return panel && !panel.hidden;
  }

  function onKeydown(e) {
    if (!isPresentationActive()) return;
    if (e.key === "ArrowRight") {
      goTo(current + 1);
    } else if (e.key === "ArrowLeft") {
      goTo(current - 1);
    }
  }

  function init() {
    if (!stage || slides.length === 0) return;
    if (totalEl) totalEl.textContent = String(slides.length);
    buildDots();
    if (prevBtn) prevBtn.addEventListener("click", () => goTo(current - 1));
    if (nextBtn) nextBtn.addEventListener("click", () => goTo(current + 1));
    document.addEventListener("keydown", onKeydown);
    render();
  }

  window.Presentation = { init: init };
})();
