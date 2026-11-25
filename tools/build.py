#!/usr/bin/env python3
"""Build the walkable lot into /workspace/carny-sim/game/site/ (not dist/build/out).
Vendors Three.js r160 + GLTFLoader + bloom + meshopt, concatenates src/, copies compressed assets.
"""
import os, re, json, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
ART = ROOT / "art"
OPT = Path("/tmp/glbopt")
AUDIO = ROOT / "audio"
VENDOR = ROOT / "vendor"

def wrap_three(src: str) -> str:
    m = re.search(r"export\{([^}]*)\};?\s*$", src)
    if not m:
        raise SystemExit("could not wrap three.module.min.js")
    pairs = []
    for part in m.group(1).split(","):
        a = part.strip().split(" as ")
        name = a[1].strip() if len(a) > 1 else a[0].strip()
        pairs.append("%s:%s" % (name, a[0].strip()))
    return 'const THREE=(()=>{"use strict";' + src[:m.start()] + ";return {" + ",".join(pairs) + "};})();"

def main():
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "assets").mkdir(exist_ok=True)
    # .nojekyll at game root and site
    (ROOT / ".nojekyll").write_text("")
    (SITE / ".nojekyll").write_text("")

    three = wrap_three((VENDOR / "three.module.min.js").read_text())
    postfx = (VENDOR / "postfx.js").read_text()
    gltf = (VENDOR / "gltf.js").read_text()
    meshopt = (VENDOR / "meshopt_decoder.js").read_text()
    modules = ["00_util", "10_audio", "20_input", "30_world", "40_player", "50_main"]
    game = "\n".join((ROOT / "src" / (n + ".js")).read_text() for n in modules)
    body = ('(function(){"use strict";\n' + three + "\n" + meshopt + "\n" + postfx + "\n" + gltf + "\n" + game + "\n})();")
    body = body.replace("</script", "<\\/script")
    (SITE / "game.js").write_text(body)

    css = (ROOT / "src" / "style.css").read_text()
    html = (ROOT / "src" / "template.html").read_text()
    html = html.replace("/*CSS*/", css)
    html = html.replace("<script>/*SCRIPT*/</script>", '<script src="game.js"></script>')
    (SITE / "index.html").write_text(html)

    # assets: prefer optimized GLBs
    names = ["night_press.glb", "mall.glb", "carnival.glb", "ground.glb", "props.glb", "people.glb"]
    # skyline.glb is optional (equirect already has the city). Omitted from the default download.
    for n in names:
        src = OPT / n if (OPT / n).exists() else ART / n
        if src.exists():
            shutil.copy2(src, SITE / "assets" / n)
            print("asset", n, round(src.stat().st_size / 1e6, 2), "MB")
        else:
            print("MISSING", n)
    shutil.copy2(ART / "sky_skyline.jpg", SITE / "assets" / "sky_skyline.jpg")
    if (ART / "skyline_plate.jpg").exists():
        shutil.copy2(ART / "skyline_plate.jpg", SITE / "assets" / "skyline_plate.jpg")
    shutil.copy2(ART / "lot.json", SITE / "assets" / "lot.json")
    for a in AUDIO.glob("*"):
        if a.suffix in (".mp3", ".ogg"):
            shutil.copy2(a, SITE / "assets" / a.name)

    total = sum(f.stat().st_size for f in SITE.rglob("*") if f.is_file())
    print("site ready", SITE)
    print("total download", round(total / 1e6, 2), "MB")
    print("game.js", round((SITE / "game.js").stat().st_size / 1e6, 2), "MB")

if __name__ == "__main__":
    main()
