# Build prompt: two-tab "Hawk-Eye Control Room" site (Presentation + Control Room)

> This document is written to be handed to a coding agent (Claude Code, Codex, etc.) in a
> fresh session with no other context. It is self-contained: background, decisions already
> made, exact scope, data contracts, build order, and hosting plan.

## 1. Role and objective

Replace the current `frontend/` (an "In or Out?" quiz game UI, built for a different, earlier
pass at this project) with a new two-tab static site:

1. **Presentation tab** — a slick, fullscreen slide deck. For this pass it holds **placeholder
   content** about CNNs and YOLO (real content comes later; the deck mechanics are what matter
   now).
2. **Control Room tab** — an interactive "Hawk-Eye operator" experience. The user drags a raw
   clip (from `assests/raw/`) into a monitor, watches a simulated analysis sequence play, then
   the matching inferenced/annotated clip (from `assests/inferenced/`) reveals as the result —
   as if they're a VAR referee or Hawk-Eye operator reviewing a call.

The site is fully static (no backend, no build step) and deploys to **Vercel**. Video files are
hosted in **Supabase Storage** (a public bucket), not committed to the repo, keeping the Git
history and Vercel deployment small.

## 2. Project background — what already exists

Repo root: `c:\Users\topfeiff\OneDrive - Capgemini\Desktop\tennis-hawk-eye`.

- `assests/raw/Video_1.mp4` … `Video_6.mp4` — original rally clips (note the repo's existing
  folder typo, `assests`, not `assets` — keep it as-is unless explicitly asked to rename, since
  renaming touches every path in this doc and any existing scripts).
- `assests/inferenced/Video_1.mp4` … `Video_6.mp4` — the same 6 clips with ball/court/player
  detection overlays already burned in. **Filenames match 1:1 between the two folders** — this
  is what makes "drag a raw clip → show its inferenced counterpart" possible without any live
  inference at request time.
- `backend/` — a FastAPI app (`main.py`) serving a different, now-unused quiz game
  (`backend/quiz_assets/`, `GET /api/clips`, etc.), built from
  `2026-07-09-tennis-inout-quiz-agent-prompt.md`. **Leave this directory in place untouched.**
  It is not part of this build and not wired into the new deployment. Flag it as a candidate for
  deletion in a later, separate cleanup pass — do not delete it as part of this work.
- `frontend/index.html`, `frontend/style.css` — the quiz UI. **This gets replaced.** The
  existing `style.css` already defines a dark neon design system worth reusing (see §5):
  `--bg-dark`, `--accent` (cyber yellow), `--in-color` (neon green), `--out-color` (neon red/rose),
  `--blue-player`, Outfit + Plus Jakarta Sans fonts, glow/transition variables.
- `pyproject.toml` / `uv.lock` — the repo uses `uv` for Python tooling. The one Python script
  this build adds (the Supabase upload script, §6) should follow that convention.
- `scripts/slice_clips.py` — an existing one-off script (unrelated to this build, used to
  produce the quiz assets from a separate `TennisAnalytics` repo). Not touched by this work.
- No git commits exist yet in this repo (all files are currently untracked). This build's
  commit will likely be the first commit.

## 3. Decisions already made (do not re-litigate)

These were confirmed with the human during design; implement them as given rather than
re-deriving from first principles:

- **No live ML inference at request time.** The Control Room pairs a raw clip with its
  pre-rendered inferenced counterpart by filename. It does not run any model.
- **No backend/server.** The site is pure static HTML/CSS/vanilla JS. No FastAPI, no Node
  server, no API routes at runtime.
- **Video storage: Supabase Storage**, not committed to the repo and not deployed with the
  static site. A checked-in JSON manifest (§6) records the public URLs.
- **Hosting: Vercel**, zero-config static deployment of the `frontend/` directory.
- **Frontend stack: vanilla HTML/CSS/JS**, no framework, no bundler, no build step — consistent
  with how the existing quiz frontend was built.
- **The quiz game is replaced**, not kept as a third tab, not preserved elsewhere in this pass.
- **Control Room reveal is theatrical**, not a real progress indicator: a client-side timer
  drives a fake "analyzing" sequence before swapping to the real inferenced video.

## 4. Scope: what to build

### 4.1 Shell — tabs

- `frontend/index.html` becomes a shell with two tabs at the top: **Presentation** and
  **Control Room**. Tab switching is pure client-side JS (show/hide panels); reflect the active
  tab in the URL hash (`#presentation` / `#control-room`) so a reload or shared link preserves
  which tab is showing.
- Reuse the existing dark neon design system from the current `style.css` (colors, fonts,
  glow/transition variables) rather than inventing a new palette — the ask is "slick," and this
  repo already has a working, cohesive look.

### 4.2 Presentation tab (placeholder content)

A fullscreen slide deck, one slide visible at a time:

- **Navigation**: prev/next buttons, left/right arrow keys, and a row of progress dots (click a
  dot to jump to that slide). Show a slide counter (e.g. "3 / 6").
- **Slides (placeholder content — mark clearly as placeholder, e.g. a small "PLACEHOLDER
  CONTENT" tag in a corner, so nobody mistakes it for final copy)**:
  1. Title slide — project name, subtitle, Hawk-Eye framing.
  2. "What is a CNN?" — a few placeholder bullet points plus an empty bordered box labeled
     "diagram placeholder."
  3. "How CNNs extract features" — placeholder bullets + placeholder diagram box (filters /
     feature maps framing).
  4. "What is YOLO?" — placeholder bullets (single-pass detection, bounding boxes framing).
  5. "YOLO in this pipeline" — placeholder bullets tying it to ball/player detection framing
     (do not invent specific model names/architectures beyond what's already implied by the
     existing repo's naming — keep it generic/placeholder).
  6. Closing slide — simple sign-off, no real content needed.
- No slide content is meant to be accurate or final; the goal of this pass is the deck mechanic
  (nav, dots, keyboard, layout, theme), not the CNN/YOLO copy itself.

### 4.3 Control Room tab

**Layout**: left rail + center monitor.

- **Left rail**: 6 draggable "clip cards," one per raw video (`Video_1` … `Video_6`), labeled by
  filename (no auto-generated thumbnails — that would need a build step/server; a static
  icon/filename card is enough). Cards are draggable (HTML5 drag-and-drop) **and** clickable
  (so keyboard/touch/no-drag-support users can still select a clip — click selects it exactly as
  if it were dropped).
- **Center monitor**: a bordered "screen" area.
  - **Idle state**: "Drag a clip in to begin analysis" (or click a card).
  - **Drop/select**: the raw clip loads into the monitor and starts playing. A **simulated
    analysis overlay** appears on top: a scanning-line animation, a progress bar filling over a
    few seconds (e.g. 3–5s, make this a single named constant so it's easy to tune), and rotating
    status text lines such as "Loading frames…", "Detecting ball…", "Detecting court lines…",
    "Running trajectory model…", "Rendering overlay…". This is a pure client-side timer/sequence
    — no network calls, no real processing.
  - **Reveal**: the monitor swaps from the raw clip to the matching inferenced clip (same
    filename, `assests/inferenced/` counterpart), autoplaying, with an "ANALYSIS COMPLETE" /
    broadcast-review-style badge shown over or near the video.
  - **Reset**: a "New Clip" button clears the monitor back to idle so another card can be
    dragged in. Dragging a new clip while one is showing should also just reset and restart the
    sequence for the new clip (don't require an explicit reset first).
- Error handling: if a video URL fails to load (e.g. Supabase misconfiguration), show an inline
  error state in the monitor rather than a silent blank screen — this is the only "backend" this
  static site touches, so failures should be visible during setup/testing.

## 5. Visual design

Extend, don't replace, the existing design system in `style.css` (colors, fonts, glow effects,
`--transition-smooth`). The Control Room monitor and Presentation deck should feel like they
belong to the same product as the current quiz UI's aesthetic — dark background, neon accents,
glowing borders — even though the quiz UI itself is gone. Tabs should be a persistent header
element visible from both views.

## 6. Data contract — clips manifest

A single checked-in file, `frontend/data/clips-manifest.json`:

```json
{
  "clips": [
    {
      "id": "video_1",
      "label": "Video 1",
      "raw_url": "https://<project>.supabase.co/storage/v1/object/public/tennis-clips/raw/Video_1.mp4",
      "inferenced_url": "https://<project>.supabase.co/storage/v1/object/public/tennis-clips/inferenced/Video_1.mp4"
    }
  ]
}
```

- One entry per clip, `id` derived from the filename (lowercased, no extension).
- The frontend fetches this JSON at load time (`fetch('data/clips-manifest.json')`) and uses it
  to populate the left rail and to resolve raw→inferenced pairs. No Supabase SDK is needed at
  runtime — these are plain public HTTPS URLs.

### 6.1 Upload script

Add `scripts/upload_clips_to_supabase.py` (Python, run manually/once, following this repo's
`uv`-based tooling):

- Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from a **gitignored** `.env` file (add a
  `.gitignore` to the repo if one doesn't exist yet — it currently has none, so also exclude
  `.venv/`, `__pycache__/`, `.env`).
- Uploads every file under `assests/raw/` and `assests/inferenced/` to a public bucket (suggest
  name `tennis-clips`, with `raw/` and `inferenced/` prefixes), creating the bucket if it
  doesn't exist.
- Writes/overwrites `frontend/data/clips-manifest.json` with the resulting public URLs.
- This script is a one-off maintenance tool, not part of the deployed site — it never runs in
  production, only when clips are added/changed.

## 7. Hosting plan

**Supabase** (storage only, no DB/auth needed for this pass):
1. Create a Supabase project.
2. Create a public Storage bucket (`tennis-clips`).
3. Run `scripts/upload_clips_to_supabase.py` to populate it and generate the manifest.

**Vercel** (static hosting):
1. Connect this GitHub repo to a new Vercel project.
2. Set the project root/output directory to `frontend/` (or add a minimal `vercel.json` if
   Vercel's zero-config detection doesn't pick a static-HTML directory automatically — check
   during implementation rather than assuming).
3. No build command, no environment variables needed at runtime (the manifest already contains
   full public URLs baked in at upload time).
4. Every push to the connected branch redeploys automatically; there is no server component to
   keep alive.

If clips ever change, the flow is: re-run the upload script → commit the updated
`clips-manifest.json` → Vercel redeploys.

## 8. Suggested file layout

```
frontend/
  index.html              (tab shell)
  style.css                (extended existing design system)
  js/
    app.js                 (tab switching, init, hash routing)
    presentation.js         (slide deck: nav, dots, keyboard)
    control-room.js         (drag/drop, clip select, fake-analysis sequence, video swap)
  data/
    clips-manifest.json     (generated by the upload script, committed to repo)
scripts/
  upload_clips_to_supabase.py
.gitignore                  (new — excludes .venv/, __pycache__/, .env)
.env.example                 (documents SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, no real values)
```

`backend/` is left in place, untouched, unused by the new deployment.

## 9. Build order

1. Add `.gitignore` and `.env.example`; confirm no secrets get committed.
2. Write `scripts/upload_clips_to_supabase.py`; create the Supabase project/bucket by hand;
   run the script to populate storage and generate `frontend/data/clips-manifest.json`.
3. Build the tab shell (`index.html`, hash routing, shared header) reusing the existing
   `style.css` variables.
4. Build the Presentation tab (deck mechanics + placeholder slides).
5. Build the Control Room tab (drag/drop or click-select, fake-analysis sequence, raw→inferenced
   reveal, reset/new-clip flow, error state for failed video loads).
6. Manually verify in a browser: switch tabs, page through the whole deck via buttons/keys/dots,
   drag (and click-select) every one of the 6 clips through the full analysis→reveal cycle,
   trigger the error state by pointing a manifest entry at a bad URL temporarily.
7. Connect the repo to Vercel, deploy, verify the live URL end-to-end (videos actually load from
   Supabase over the public internet, not just localhost).

## 10. Non-goals (explicit — do not build these)

- No real/live ML inference — the "analysis" is a themed animation over a lookup.
- No user accounts, no database, no persistence of which clips were reviewed.
- No new/real CNN or YOLO educational content — placeholder only, this pass is about mechanics.
- No changes to `backend/` or the quiz assets it serves — left in place, unused.
- No renaming of the `assests/` folder typo.
- No thumbnail generation/build pipeline for the clip cards.

## 11. Open questions to raise with the human (do not silently assume)

- Exact Supabase project to use (new project, or an existing one under the user's account)?
- Whether `backend/` should be deleted in a follow-up pass once the new site is live and
  confirmed working (explicitly deferred, not decided, in this spec).
- Real CNN/YOLO slide content and diagrams — to be supplied later; this pass only builds the
  deck mechanics.
