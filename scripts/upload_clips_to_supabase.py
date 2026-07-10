"""Upload tennis clips to Supabase Storage and regenerate the frontend manifest.

One-off maintenance tool. Run manually whenever clips are added or changed:

    uv run scripts/upload_clips_to_supabase.py

It reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from a gitignored `.env`,
uploads every file under `assests/raw/` and `assests/inferenced/` to a public
Storage bucket (default: `tennis-clips`, with `raw/` and `inferenced/`
prefixes), creating the bucket if needed, then writes the resulting public URLs
to `frontend/data/clips-manifest.json`.

This script never runs in production — the deployed static site only reads the
committed manifest, which already contains full public HTTPS URLs.
"""

from __future__ import annotations

import json
import mimetypes
import os
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "assests" / "raw"
INFERENCED_DIR = REPO_ROOT / "assests" / "inferenced"
MANIFEST_PATH = REPO_ROOT / "frontend" / "data" / "clips-manifest.json"
ENV_PATH = REPO_ROOT / ".env"

BUCKET = "tennis-clips"


def load_env(env_path: Path) -> None:
    """Minimal .env loader (KEY=VALUE per line) so no extra dependency is needed."""
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(
            f"Missing {name}. Copy .env.example to .env and fill in your Supabase values."
        )
    return value


def ensure_bucket(client: httpx.Client, base_url: str) -> None:
    """Create the public bucket if it does not already exist."""
    resp = client.get(f"{base_url}/storage/v1/bucket/{BUCKET}")
    if resp.status_code == 200:
        return
    create = client.post(
        f"{base_url}/storage/v1/bucket",
        json={"id": BUCKET, "name": BUCKET, "public": True},
    )
    if create.status_code not in (200, 201):
        sys.exit(f"Failed to create bucket '{BUCKET}': {create.status_code} {create.text}")
    print(f"Created public bucket '{BUCKET}'.")


def upload_file(client: httpx.Client, base_url: str, local_path: Path, object_path: str) -> str:
    """Upload one file (upsert) and return its public URL."""
    content_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    with local_path.open("rb") as fh:
        data = fh.read()
    resp = client.post(
        f"{base_url}/storage/v1/object/{BUCKET}/{object_path}",
        content=data,
        headers={"Content-Type": content_type, "x-upsert": "true"},
    )
    if resp.status_code not in (200, 201):
        sys.exit(f"Failed to upload {object_path}: {resp.status_code} {resp.text}")
    print(f"Uploaded {object_path}")
    return f"{base_url}/storage/v1/object/public/{BUCKET}/{object_path}"


def main() -> None:
    load_env(ENV_PATH)
    base_url = require_env("SUPABASE_URL").rstrip("/")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    if not RAW_DIR.exists() or not INFERENCED_DIR.exists():
        sys.exit(f"Expected clip folders not found under {REPO_ROOT / 'assests'}.")

    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
    }

    clips: list[dict[str, str]] = []
    with httpx.Client(headers=headers, timeout=120.0) as client:
        ensure_bucket(client, base_url)

        raw_files = sorted(p for p in RAW_DIR.iterdir() if p.is_file())
        for raw_path in raw_files:
            inferenced_path = INFERENCED_DIR / raw_path.name
            if not inferenced_path.exists():
                print(f"Skipping {raw_path.name}: no matching inferenced counterpart.")
                continue

            raw_url = upload_file(client, base_url, raw_path, f"raw/{raw_path.name}")
            inferenced_url = upload_file(
                client, base_url, inferenced_path, f"inferenced/{inferenced_path.name}"
            )

            clip_id = raw_path.stem.lower()
            clips.append(
                {
                    "id": clip_id,
                    "label": raw_path.stem.replace("_", " "),
                    "raw_url": raw_url,
                    "inferenced_url": inferenced_url,
                }
            )

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps({"clips": clips}, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nWrote {len(clips)} clip(s) to {MANIFEST_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
