# Hawk-Eye Control Room — Project Context

## Idea / Goal

A tennis ball-tracking **demo app** called "Hawk-Eye Control Room". It is purely presentational and interactive — **no real-time AI inference**. All processed videos are pre-computed and already saved to disk.

### User flow

1. A sidebar shows a list of video clips (Video 1–6)
2. The user drags (or clicks) a clip card onto a centre TV monitor
3. A themed **"analysing" overlay** plays for ~4 seconds — fake, purely cosmetic/theatrical
4. After the overlay, the pre-rendered **inferenced video** plays in the monitor, showing Hawk-Eye ball-tracking annotations

---

## File Structure

```
assests/
  raw/          ← original raw rally footage  (Video_1.mp4 … Video_6.mp4)
  inferenced/   ← pre-processed annotated video, already exists

frontend/
  index.html
  style.css
  js/
    app.js              ← tab routing
    control-room.js     ← drag-drop, analysis overlay, video playback
    presentation.js
  data/
    clips-manifest.json ← maps video IDs → raw_url / inferenced_url

backend/
  main.py               ← FastAPI: serves /assests/* and frontend/*
  requirements.txt

pyproject.toml
uv.lock
```

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | Vanilla HTML / CSS / JS (no framework) |
| Backend  | FastAPI + uvicorn (Python) |
| Package manager | `uv` |

The backend serves **static files only** — no API logic, no ML processing.

---

## Key Constraints

- **No real-time inference** — inferenced videos are already in `assests/inferenced/`
- The clip manifest uses **root-relative URLs**: `/assests/inferenced/Video_1.mp4`
- `control-room.js` loads the inferenced video silently with `video.load()` during the fake analysis, then plays it when the overlay ends — no src-switch at reveal time

---

## Start Command

```powershell
# From the project root (tennis-hawk-eye/)
uv run uvicorn backend.main:app --reload
# → http://localhost:8000
```

If port 8000 is already in use:

```powershell
Get-Process python, uvicorn | Stop-Process -Force
```

---

## Known Issues / History

| Issue | Root cause | Fix applied |
|-------|-----------|-------------|
| "Could not load this clip" error | Stale `{ once: true }` error handler from analysis phase fired when reveal switched video src | Eliminated src-switch: inferenced video now loads directly during analysis |
| Black screen / "signal lost" on reveal | Analysis overlay hidden before inferenced video buffered | Overlay now stays until `canplay` fires; `video.load()` buffers silently under it |
| Backend exit code 1 | Port 8000 already occupied by a previous process | Kill existing processes before restarting |
| Wrong relative URLs (`../assests/`) | Ambiguous when page served from different base paths | Changed to root-relative `/assests/...` in `clips-manifest.json` |
| Legacy quiz API code | Old feature (in/out quiz with per-clip question/reveal/verdict endpoints) | Removed — `backend/quiz_assets/` deleted, `main.py` stripped to static-only |
