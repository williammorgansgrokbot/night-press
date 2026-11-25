/* iPhone landscape: virtual move stick left, look-drag right. Keyboard WASD + pointer lock. Gamepad. */
const Input = (() => {
  const keys = Object.create(null);
  const move = { x: 0, y: 0 };
  const look = { dx: 0, dy: 0 };
  const padL = { x: 0, y: 0 }, padR = { x: 0, y: 0 };
  let lookSens = 0.0022, padLookSens = 1.6;
  let pointerLocked = false;

  function bind() {
    if (Util.isTouch()) document.body.classList.add("touch");
    window.addEventListener("keydown", (e) => {
      keys[e.code] = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyM") AudioBus.toggle();
      AudioBus.resume();
    });
    window.addEventListener("keyup", (e) => { keys[e.code] = false; });
    window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

    const canvas = document.getElementById("c");
    canvas.addEventListener("click", () => {
      AudioBus.resume();
      if (!Util.isTouch() && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener("mousemove", (e) => {
      if (!pointerLocked) return;
      look.dx += e.movementX;
      look.dy += e.movementY;
    });

    bindStick();
    bindLookPad();
  }

  function bindStick() {
    const el = document.getElementById("stickMove");
    if (!el) return;
    const knob = el.querySelector("i");
    let pid = null, cx, cy, max = 44;
    const set = (x, y) => {
      const l = Math.hypot(x, y) || 1;
      const k = Math.min(1, l / max);
      move.x = (x / l) * k;
      move.y = (y / l) * k;
      knob.style.transform = "translate(calc(-50% + " + (move.x * max) + "px), calc(-50% + " + (move.y * max) + "px))";
    };
    const onDown = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      pid = t.identifier !== undefined ? t.identifier : "m";
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      set(t.clientX - cx, t.clientY - cy);
      AudioBus.resume();
      e.preventDefault();
    };
    const onMove = (e) => {
      if (pid === null) return;
      const ts = e.changedTouches ? Array.from(e.changedTouches) : [e];
      const t = ts.find((p) => (p.identifier !== undefined ? p.identifier : "m") === pid) || ts[0];
      if (!t) return;
      set(t.clientX - cx, t.clientY - cy);
      e.preventDefault();
    };
    const onUp = () => {
      pid = null; move.x = move.y = 0;
      knob.style.transform = "translate(-50%,-50%)";
    };
    el.addEventListener("touchstart", onDown, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onUp); el.addEventListener("touchcancel", onUp);
  }

  function bindLookPad() {
    const el = document.getElementById("lookPad");
    if (!el) return;
    let pid = null, lx, ly;
    el.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      pid = t.identifier; lx = t.clientX; ly = t.clientY;
      AudioBus.resume();
      e.preventDefault();
    }, { passive: false });
    el.addEventListener("touchmove", (e) => {
      if (pid === null) return;
      const t = Array.from(e.changedTouches).find((p) => p.identifier === pid);
      if (!t) return;
      look.dx += (t.clientX - lx) * 1.15;
      look.dy += (t.clientY - ly) * 1.15;
      lx = t.clientX; ly = t.clientY;
      e.preventDefault();
    }, { passive: false });
    const up = () => { pid = null; };
    el.addEventListener("touchend", up); el.addEventListener("touchcancel", up);
  }

  function pollPad() {
    padL.x = padL.y = padR.x = padR.y = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (let i = 0; i < pads.length; i++) if (pads[i]) { pad = pads[i]; break; }
    if (!pad) return;
    const dead = (v) => Math.abs(v) < 0.22 ? 0 : v;
    const ax = pad.axes || [];
    padL.x = dead(ax[0] || 0); padL.y = dead(ax[1] || 0);
    padR.x = dead(ax[2] || 0); padR.y = dead(ax[3] || 0);
  }

  function consumeLook() {
    const o = { dx: look.dx * lookSens, dy: look.dy * lookSens };
    look.dx = look.dy = 0;
    return o;
  }

  function moveVec() {
    pollPad();
    let x = 0, y = 0; // x = strafe, y = forward (screen: up is forward = negative stick y)
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    x += move.x + padL.x;
    y += move.y + padL.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, mag: Math.min(1, l), lookX: padR.x * padLookSens, lookY: padR.y * padLookSens };
  }

  return { bind, moveVec, consumeLook };
})();
