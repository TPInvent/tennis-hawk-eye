import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Hawk-Eye Control Room")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(BASE_DIR)

# Serve raw/inferenced videos at /assests/* (must come before the catch-all).
assests_dir = os.path.join(REPO_ROOT, "assests")
if os.path.isdir(assests_dir):
    app.mount("/assests", StaticFiles(directory=assests_dir), name="assests")

# Serve the frontend as the catch-all.
frontend_dir = os.path.join(REPO_ROOT, "frontend")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
