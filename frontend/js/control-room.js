/* control-room.js — the "Hawk-Eye operator" experience.
 *
 * Flow: user drags (or clicks) a raw clip card into the monitor. The raw clip
 * plays under a themed "analyzing" overlay driven purely by a client-side
 * timer (no network calls, no real ML). When the timer finishes, the monitor
 * swaps to the matching pre-rendered inferenced clip and shows a completion
 * badge. "New Clip" resets to idle. Dragging a new clip mid-sequence just
 * restarts for the new clip.
 *
 * Exposes window.ControlRoom.init(), called once from app.js.
 */
(function () {
  "use strict";

  // Duration of the fake "analysis" sequence, in milliseconds. Tune here.
  const ANALYSIS_DURATION_MS = 4000;

  const STATUS_MESSAGES = [
    "Loading frames…",
    "Detecting ball…",
    "Detecting court lines…",
    "Running trajectory model…",
    "Rendering overlay…",
  ];

  const MANIFEST_URL = "data/clips-manifest.json";

  // DOM refs.
  let els = {};
  let clips = [];
  let selectedId = null;

  // Sequence state (so we can cancel/restart cleanly).
  let analysisTimer = null;
  let statusTimer = null;
  let rafId = null;



  function iconSvg() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<polygon points="23 7 16 12 23 17 23 7"></polygon>' +
      '<rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>'
    );
  }

  function cancelSequence() {
    if (analysisTimer) {
      clearTimeout(analysisTimer);
      analysisTimer = null;
    }
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function showOnly(stateEl) {
    // Hide all overlays/states, then optionally reveal one.
    els.idle.hidden = true;
    els.error.hidden = true;
    els.analysisOverlay.hidden = true;
    els.revealBadge.hidden = true;
    els.video.classList.remove("visible");
    if (stateEl) stateEl.hidden = false;
  }

  function resetToIdle() {
    cancelSequence();
    selectedId = null;
    els.video.pause();
    els.video.removeAttribute("src");
    els.video.load();
    showOnly(els.idle);
    els.idle.hidden = false;
    els.newClipBtn.disabled = true;
    els.monitorLabel.textContent = "No clip loaded";
    els.clipList
      .querySelectorAll(".clip-card.selected")
      .forEach((c) => c.classList.remove("selected"));
  }

  function showError(message) {
    cancelSequence();
    els.video.pause();
    showOnly(null);
    els.errorText.textContent = message || "Could not load this clip.";
    els.error.hidden = false;
    els.newClipBtn.disabled = false;
  }

  function markSelectedCard(clipId) {
    els.clipList.querySelectorAll(".clip-card").forEach((card) => {
      card.classList.toggle("selected", card.dataset.id === clipId);
    });
  }

  function runReveal(clip) {
    cancelSequence();
    // The inferenced video has been loading silently since analysis started.
    // Just hide the overlay and play — no src switch needed.
    els.analysisOverlay.hidden = true;
    els.revealBadge.hidden = false;
    els.monitorLabel.textContent = clip.label + " — analysis complete";

    const play = () => {
      const p = els.video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };

    if (els.video.readyState >= 2) {
      play();
    } else {
      els.video.addEventListener("canplay", play, { once: true });
    }
  }

  function startAnalysis(clip) {
    cancelSequence();
    markSelectedCard(clip.id);
    selectedId = clip.id;

    showOnly(null);
    els.newClipBtn.disabled = false;
    els.monitorLabel.textContent = clip.label + " — analysing…";

    // Load the inferenced video silently in the background while the
    // analysis overlay runs — no raw→inferenced switch needed.
    els.video.loop = true;
    els.video.muted = true;
    els.video.src = clip.inferenced_url;
    els.video.classList.add("visible");

    const onError = () => showError("Could not load this clip.");
    els.video.addEventListener("error", onError, { once: true });

    // load() starts buffering without playing — the overlay covers it.
    els.video.load();

    // Themed analysis overlay.
    els.analysisOverlay.hidden = false;
    els.revealBadge.hidden = true;
    els.analysisBarFill.style.width = "0%";
    els.analysisStatus.textContent = STATUS_MESSAGES[0];

    // Rotate status text across the duration.
    let msgIndex = 0;
    const interval = Math.max(500, Math.floor(ANALYSIS_DURATION_MS / STATUS_MESSAGES.length));
    statusTimer = setInterval(() => {
      msgIndex = Math.min(msgIndex + 1, STATUS_MESSAGES.length - 1);
      els.analysisStatus.textContent = STATUS_MESSAGES[msgIndex];
    }, interval);

    // Smooth progress bar via rAF.
    const start = performance.now();
    const tick = (now) => {
      const pct = Math.min(100, ((now - start) / ANALYSIS_DURATION_MS) * 100);
      els.analysisBarFill.style.width = pct.toFixed(1) + "%";
      if (pct < 100) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    // Reveal when the timer completes.
    analysisTimer = setTimeout(() => {
      // Ignore if the user has since reset or switched clips.
      if (selectedId !== clip.id) return;
      runReveal(clip);
    }, ANALYSIS_DURATION_MS);
  }

  function loadClip(clipId) {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;
    startAnalysis(clip);
  }

  function buildCards() {
    els.clipList.innerHTML = "";
    clips.forEach((clip) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "clip-card";
      card.draggable = true;
      card.dataset.id = clip.id;
      // draggable="false" on the img: images have their own native drag
      // behaviour that would otherwise hijack the card's drag.
      const thumb = clip.thumb_url
        ? '<img class="clip-card-thumb" src="' +
          clip.thumb_url +
          '" alt="" draggable="false">'
        : '<span class="clip-card-icon">' + iconSvg() + "</span>";
      card.innerHTML =
        thumb +
        '<span class="clip-card-meta">' +
        '<span class="clip-card-label">' +
        clip.label +
        "</span>" +
        '<span class="clip-card-sub">Raw rally clip</span>' +
        "</span>";

      card.addEventListener("click", () => loadClip(clip.id));

      card.addEventListener("dragstart", (e) => {
        card.classList.add("dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "copy";
          e.dataTransfer.setData("text/plain", clip.id);
        }
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));

      els.clipList.appendChild(card);
    });
  }

  function wireMonitorDrop() {
    const monitor = els.monitor;

    monitor.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      monitor.classList.add("drag-over");
    });

    monitor.addEventListener("dragleave", (e) => {
      // Only clear when leaving the monitor itself, not its children.
      if (e.target === monitor) monitor.classList.remove("drag-over");
    });

    monitor.addEventListener("drop", (e) => {
      e.preventDefault();
      monitor.classList.remove("drag-over");
      const clipId = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
      if (clipId) loadClip(clipId);
    });
  }

  async function loadManifest() {
    try {
      const resp = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      clips = Array.isArray(data.clips) ? data.clips : [];
      if (clips.length === 0) {
        els.clipList.innerHTML =
          '<div class="rail-loading">No clips found in manifest.</div>';
        return;
      }
      buildCards();
    } catch (err) {
      els.clipList.innerHTML =
        '<div class="rail-loading">Failed to load clip manifest.</div>';
      showError("Clip manifest could not be loaded. Run the upload script or check data/clips-manifest.json.");
    }
  }

  function init() {
    els = {
      monitor: document.getElementById("monitor"),
      video: document.getElementById("monitor-video"),
      idle: document.getElementById("monitor-idle"),
      error: document.getElementById("monitor-error"),
      errorText: document.getElementById("monitor-error-text"),
      analysisOverlay: document.getElementById("analysis-overlay"),
      analysisStatus: document.getElementById("analysis-status"),
      analysisBarFill: document.getElementById("analysis-bar-fill"),
      revealBadge: document.getElementById("reveal-badge"),
      clipList: document.getElementById("clip-list"),
      newClipBtn: document.getElementById("new-clip-btn"),
      monitorLabel: document.getElementById("monitor-label"),
    };

    if (!els.monitor) return;

    els.newClipBtn.addEventListener("click", resetToIdle);
    wireMonitorDrop();
    loadManifest();
  }

  window.ControlRoom = { init: init };
})();
