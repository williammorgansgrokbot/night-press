# Night Press — Pecan Branch lot (milestone 2, local only)

First-person walk around the v4b Dallas mall lot at night. **No GitHub repo, nothing published.** Pages only after Bill says `push`.

## Run locally

From this folder (`/workspace/carny-sim/game/`):

```bash
python3 tools/build.py
python3 -m http.server 8765 --directory site
```

Then open http://127.0.0.1:8765/ on a desktop or an iPhone on the same network.

Rebuild the GLBs from the v4b Blender scene (slow) with:

```bash
blender --background --python tools/export_lot.py
# then re-run the gltf-transform optimize step (see tools/export_lot.py notes) and tools/build.py
```

## Controls

- **iPhone Safari landscape:** virtual move stick on the left, look-drag on the right. Safe-area padding. Mute in the top bar.
- **Desktop:** click to capture the pointer, WASD / arrows to walk, mouse to look. M mutes.
- **Gamepad:** left stick move, right stick look.

Night Press stairs and the control-panel trailer area are walkable. Ride operation is milestone 3.

## Layout

- `src/` game modules, `tools/build.py`, vendored Three.js r160
- `site/` playable output (not named dist/build/out)
- `art/` exported GLBs, sky panorama, `lot.json` collision
- `audio/` original carnival + generator loops (120 Hz high-pass)
