const Stats = { frames: 0, acc: 0, ms: 16, last: performance.now() };

function frame() {
  const now = performance.now();
  let dt = (now - Stats.last) / 1000;
  Stats.last = now;
  if (dt > 0.08) dt = 0.08;
  const ev = Input.consumeInteract ? Input.consumeInteract() : { pressed: false, back: false, dpad: 0 };
  if (typeof Ride !== "undefined") {
    if (Ride.mode === "panel") {
      if (ev.back) Ride.exitPanel();
      else if (ev.pressed) Ride.runAction(Ride.actions[Ride.highlight] || "back");
      else if (ev.dpad) {
        Ride.highlight = (Ride.highlight + ev.dpad + Ride.actions.length) % Ride.actions.length;
        Ride.paintPanelButtons();
      }
    } else if (ev.pressed) {
      Ride.doInteract();
    }
  }
  tickPlayer(dt);
  tickWorld(dt);
  if (World.composer) World.composer.render();
  else World.renderer.render(World.scene, World.camera);
  Stats.frames++;
  Stats.acc += dt;
  const ms = performance.now() - now;
  Stats.ms = Stats.ms * 0.9 + ms * 0.1;
  adaptPR(ms);
  // expose for QA
  window.__PERF = { ms: Stats.ms, fps: 1000 / Math.max(1, Stats.ms), frames: Stats.frames };
  requestAnimationFrame(frame);
}

async function boot() {
  Input.bind();
  document.getElementById("mute").addEventListener("click", () => {
    AudioBus.resume();
    AudioBus.toggle();
  });
  try {
    await initWorld();
  } catch (e) {
    console.error("initWorld failed", e);
    const t = document.getElementById("loadtxt");
    if (t) t.textContent = "Failed to load the lot. See console.";
    throw e;
  }
  resetPlayer();
  addEventListener("resize", resizeWorld);
  resizeWorld();
  // audio after first gesture is handled in Input; try to preload
  AudioBus.resume().then(async () => {
    const tryUrls = async (name, urls) => {
      for (const u of urls) {
        try { await AudioBus.loadLoop(name, u); return; } catch (e) { console.warn("audio skip", u, e); }
      }
    };
    await tryUrls("carnival", ["assets/carnival.mp3", "assets/carnival.ogg"]);
    await tryUrls("generator", ["assets/generator.mp3", "assets/generator.ogg"]);
  }).catch(() => {});
  setupXR();
  window.World = World;
  window.Player = Player;
  window.Util = Util;
  window.__READY = true;
  window.__teleport = (x, y, z, yaw, pitch) => {
    Player.pos.set(x, y, z);
    if (yaw != null) Player.yaw = yaw;
    if (pitch != null) Player.pitch = pitch;
    syncCamera();
  };
  requestAnimationFrame(frame);
}

function setupXR() {
  const btn = document.getElementById("vr");
  if (!btn || !navigator.xr || !World.renderer) return;
  navigator.xr.isSessionSupported("immersive-vr").then((ok) => {
    if (!ok) return;
    btn.hidden = false;
    btn.addEventListener("click", async () => {
      try {
        World.renderer.xr.enabled = true;
        const s = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
        await World.renderer.xr.setSession(s);
      } catch (e) {
        console.warn("XR session failed", e);
      }
    });
  }).catch(() => {});
}

boot();
