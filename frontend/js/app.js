/* app.js — tab switching, hash routing, and init.
 * Two views: "presentation" and "control-room". The active tab is reflected
 * in the URL hash so reloads and shared links preserve which tab is showing.
 */
(function () {
  "use strict";

  const VALID_TABS = ["presentation", "control-room"];
  const DEFAULT_TAB = "presentation";

  const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = {
    presentation: document.getElementById("panel-presentation"),
    "control-room": document.getElementById("panel-control-room"),
  };

  function normalizeTab(raw) {
    const name = (raw || "").replace(/^#/, "");
    return VALID_TABS.includes(name) ? name : DEFAULT_TAB;
  }

  function activateTab(tab) {
    const active = normalizeTab(tab);

    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === active;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    VALID_TABS.forEach((name) => {
      const panel = panels[name];
      if (!panel) return;
      panel.hidden = name !== active;
    });

    // Let each view react when it becomes visible.
    document.dispatchEvent(new CustomEvent("tab:changed", { detail: { tab: active } }));
  }

  function setTab(tab) {
    const active = normalizeTab(tab);
    if (("#" + active) !== window.location.hash) {
      window.location.hash = active;
    } else {
      activateTab(active);
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  window.addEventListener("hashchange", () => activateTab(window.location.hash));

  // Init.
  activateTab(window.location.hash);

  if (window.Presentation && typeof window.Presentation.init === "function") {
    window.Presentation.init();
  }
  if (window.ControlRoom && typeof window.ControlRoom.init === "function") {
    window.ControlRoom.init();
  }
})();
