# Deploying tennis-hawk-eye: Cloudflare Pages + R2

Static frontend on Cloudflare Pages (auto-deploys from GitHub on push to `main`), video clips on Cloudflare R2, git history stripped of video blobs.

## What's different from a generic guide

- Backend lives at `backend/main.py`, not root `main.py`. Deps are managed with **uv** (`pyproject.toml` / `uv.lock`), plus a redundant `backend/requirements.txt`.
- `assests/` is 625MB and has **four** subfolders: `raw/` (272MB), `inferenced/` (64MB), `thumbs/` (84KB), and `_originals_mp4v/` (289MB) — that last one isn't referenced anywhere in `frontend/js` or the manifest. It's dead weight (old mp4v-codec renders), so it doesn't need to go to R2 at all.
- `frontend/data/clips-manifest.json` already exists with real content — 6 clips (`video_1`–`video_6`), and the `inferenced_url` entries have a `?v=2` cache-busting query string that should be dropped (new R2 URLs don't need it).
- `frontend/vercel.json` exists but isn't used with Cloudflare Pages — safe to delete or ignore.
- There's a Supabase Storage upload script (`scripts/upload_clips_to_supabase.py`) and `.env.example` from an earlier direction that wasn't taken. Since R2 is the direction, these are dead code — delete both so the repo doesn't have two competing "how do I upload clips" stories.
- `origin` is already set to `https://github.com/TPInvent/tennis-hawk-eye.git`, **and that remote already has the current history pushed** (`e757716` is on `origin/main`). The force-push in Part 4 is real, not hypothetical.
- `.git` is 618MB and `assests/` working tree is 625MB — almost 1:1, confirming the video is only committed across the 2 existing commits (`2cec954` init, `e757716` fix), so `git filter-repo` will clean it up completely.

---

## Part 1 — R2 bucket

Dashboard → R2 Object Storage → Create bucket (e.g. `tennis-hawkeye`) → enable R2.dev public subdomain → CORS:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Tighten `AllowedOrigins` to your `.pages.dev` URL once you have it.

Upload only what's actually served — skip `_originals_mp4v/` (289MB, unused) and `.DS_Store`:

```bash
aws s3 sync ./assests/raw s3://tennis-hawkeye/raw \
  --endpoint-url https://029f8fe2c882b3115ae29d75838227f6.r2.cloudflarestorage.com --profile r2

aws s3 sync ./assests/inferenced s3://tennis-hawkeye/inferenced \
  --endpoint-url https://029f8fe2c882b3115ae29d75838227f6.r2.cloudflarestorage.com --profile r2

aws s3 sync ./assests/thumbs s3://tennis-hawkeye/thumbs \
  --endpoint-url https://029f8fe2c882b3115ae29d75838227f6.r2.cloudflarestorage.com --profile r2
```

That's 336MB uploaded instead of 625MB.

---

## Part 2 — Strip video history

```bash
cp -r tennis-hawk-eye tennis-hawk-eye-backup   # backup first
pip install git-filter-repo --break-system-packages   # or: brew install git-filter-repo

cd tennis-hawk-eye
git filter-repo --path assests --invert-paths
```

Add to `.gitignore` (it currently ignores `.env`, `.DS_Store`, Python cruft, but not `assests/`):

```bash
echo "assests/" >> .gitignore
git add .gitignore
git commit -m "Ignore local video assets folder"
```

```bash
du -sh .git   # should drop from 618M to a few MB
```

---

## Part 3 — Update the code

### 3.1 Manifest

Update `frontend/data/clips-manifest.json`. Replace each entry, e.g.:

```json
{
  "id": "video_1",
  "label": "Video 1",
  "raw_url": "https://pub-xxxxxxxx.r2.dev/raw/Video_1.mp4",
  "inferenced_url": "https://pub-xxxxxxxx.r2.dev/inferenced/Video_1.mp4",
  "thumb_url": "https://pub-xxxxxxxx.r2.dev/thumbs/Video_1.jpg"
}
```

Do this for `video_1` through `video_6`. Drop the `?v=2` suffix — it was a cache-buster for the old `/assests/...` local paths, not needed for fresh R2 URLs.

### 3.2 Remove the unused Supabase path

```bash
rm scripts/upload_clips_to_supabase.py .env.example
```

Drop the now-unused `scripts` optional-dependency group (`httpx`) from `pyproject.toml` if nothing else uses it.

### 3.3 `backend/main.py`

Not needed to serve production (Cloudflare Pages serves `frontend/` directly). Options:

- Delete `backend/`, `pyproject.toml`, `uv.lock` entirely, or
- Keep for local preview (`uv run uvicorn backend.main:app --reload` from repo root, or adjust — check your current run command since `main.py` does `os.path.dirname` relative to itself, so it should still work as-is if invoked from `backend/`).

### 3.4 `frontend/vercel.json`

Unused under Cloudflare Pages — delete or leave, doesn't matter.

---

## Part 4 — Push the cleaned repo

`origin` is already set and already has the old 618MB history on `main` — this isn't a "maybe," it's overwriting real remote history:

```bash
git push --force origin main
```

Since this is a solo 2-commit repo, that's low-risk, but if anyone else has cloned `TPInvent/tennis-hawk-eye`, their clone breaks and needs a fresh `git clone`.

---

## Part 5 — Cloudflare Pages

Workers & Pages → Create application → Pages → Connect to Git → select `TPInvent/tennis-hawk-eye`.

- **Framework preset:** None
- **Build command:** (empty)
- **Build output directory:** `frontend`

Save and Deploy. Every push to `main` auto-deploys from here on.

---

## Part 6 — Final checks

- [ ] `.pages.dev` URL loads Presentation and Control Room tabs
- [ ] Video plays in Control Room (check browser console for CORS errors if not)
- [ ] Trivial push to `main` shows up live within ~30–60s
- [ ] Tighten R2 CORS `AllowedOrigins` from `*` to the real `.pages.dev`/custom domain
- [ ] Confirm `du -sh .git` stayed small after the push (no accidental re-add of `assests/`)
