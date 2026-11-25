#!/usr/bin/env python3
"""Headless Chromium QA. Serve site/ first: python3 -m http.server 8765 --directory site"""
import os, sys, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
env = os.environ.copy()
env["NODE_PATH"] = "/workspace/brass-rail-derby/node_modules"
r = subprocess.run(["node", str(ROOT / "tools" / "qa.mjs"), url], cwd=str(ROOT), env=env)
sys.exit(r.returncode)
