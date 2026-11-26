/* Night Press entrance + operator panel. Full rider cycle is milestone 3;
   this gives a walkable door and a panel that actually does something. */
const Ride = {
  mode: "walk", // walk | panel
  prompt: "",
  root: null,
  door: null,
  wall: null,
  pads: [],
  leds: [],
  needles: {},
  power: false,
  lights: false,
  spinning: false,
  spinT: 0,
  spinPhase: "idle", // idle | up | hold | down
  spinAngle: 0,
  hornT: 0,
  highlight: 0,
  actions: ["power", "lights", "horn", "start", "back"],
};

Ride.bind = function (root) {
  Ride.root = root;
  Ride.pads = [];
  Ride.leds = [];
  root.traverse((o) => {
    const n = o.name || "";
    if (n === "RideDoor" || n === "DoorWindow") Ride.door = Ride.door || o;
    if (n === "RideWall") Ride.wall = o;
    if (/^(Pad_|Rib_|Hoop_|CenterCone|PadRidge_)/.test(n) && o.isMesh) Ride.pads.push(o);
    if (/^LED_\d+$/.test(n) && o.isMesh) Ride.leds.push(o);
    if (n === "RPMNeedle") Ride.needles.rpm = o;
    if (n === "KeySwitch" || n === "KeyBlade") { if (!Ride.key) Ride.key = o; }
    if (n === "ThrottleKnob") Ride.throttle = o;
    if (n === "TogLever_0") Ride.togLights = o;
    if (n === "AuxLev_0") Ride.auxLights = o;
    if (n === "AuxLev_1") Ride.auxHorn = o;
  });
  Ride.leds.sort((a, b) => a.name.localeCompare(b.name));
  Ride.setLeds(false);
  Ride.bindUi();
};

Ride.bindUi = function () {
  const prompt = document.getElementById("prompt");
  if (prompt && !prompt._bound) {
    prompt._bound = true;
    prompt.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); Ride.doInteract(); });
  }
  const bar = document.getElementById("panelBar");
  if (bar && !bar._bound) {
    bar._bound = true;
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (b) Ride.runAction(b.getAttribute("data-act"));
    });
  }
  const canvas = document.getElementById("c");
  if (canvas && !canvas._rideClick) {
    canvas._rideClick = true;
    canvas.addEventListener("click", (e) => {
      if (Ride.mode === "panel") {
        Ride.pickAt(e.clientX, e.clientY);
        e.stopPropagation();
      }
    }, true);
    canvas.addEventListener("touchend", (e) => {
      if (Ride.mode !== "panel") return;
      const t = e.changedTouches && e.changedTouches[0];
      if (t) Ride.pickAt(t.clientX, t.clientY);
    }, { passive: true });
  }
};

Ride.inside = function (x, z) {
  return Math.hypot(x, z) < 4.15;
};

Ride.nearDoor = function (x, z) {
  const d = Math.hypot(x - 0, z - 4.85);
  return d < 1.7 && Math.abs(x) < 1.6;
};

Ride.nearPanel = function (x, z) {
  return Math.hypot(x - 8.2, z - (-1.05)) < 1.55;
};

Ride.updatePrompt = function () {
  if (Ride.mode === "panel") {
    Ride.prompt = "";
    Ride.showPrompt(false);
    return;
  }
  const x = Player.pos.x, z = Player.pos.z;
  let text = "";
  if (Ride.inside(x, z)) {
    if (Ride.nearDoor(x, z) || z > 2.2) text = "Exit";
  } else if (Ride.nearPanel(x, z)) {
    text = "Operate";
  } else if (Ride.nearDoor(x, z)) {
    text = "Enter ride";
  }
  Ride.prompt = text;
  Ride.showPrompt(text);
};

Ride.showPrompt = function (text) {
  const el = document.getElementById("prompt");
  if (!el) return;
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = text.toUpperCase();
};

Ride.doInteract = function () {
  AudioBus.resume();
  if (Ride.mode === "panel") return;
  const x = Player.pos.x, z = Player.pos.z;
  if (Ride.inside(x, z) && (Ride.nearDoor(x, z) || z > 2.2)) Ride.exitDrum();
  else if (Ride.nearPanel(x, z)) Ride.enterPanel();
  else if (Ride.nearDoor(x, z)) Ride.enterDrum();
};

Ride.enterDrum = function () {
  Player.pos.set(0, groundHeight(0, 3.15) + Player.eye, 3.15);
  Player.yaw = 0;
  Player.pitch = -0.04;
  syncCamera();
  AudioBus.click && AudioBus.click();
};

Ride.exitDrum = function () {
  Player.pos.set(0, groundHeight(0, 5.85) + Player.eye, 5.85);
  Player.yaw = Math.PI;
  Player.pitch = -0.04;
  syncCamera();
  AudioBus.click && AudioBus.click();
};

Ride.enterPanel = function () {
  Ride.mode = "panel";
  Ride._saved = { x: Player.pos.x, y: Player.pos.y, z: Player.pos.z, yaw: Player.yaw, pitch: Player.pitch };
  Player.locked = true;
  Player.pos.set(8.20, 1.52, -0.95);
  Player.yaw = 0;
  Player.pitch = -0.12;
  syncCamera();
  document.body.classList.add("panel");
  const bar = document.getElementById("panelBar");
  if (bar) bar.hidden = false;
  Ride.showPrompt(false);
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  Ride.paintPanelButtons();
  AudioBus.click && AudioBus.click();
};

Ride.exitPanel = function () {
  Ride.mode = "walk";
  Player.locked = false;
  if (Ride._saved) {
    Player.pos.set(Ride._saved.x, Ride._saved.y, Ride._saved.z);
    Player.yaw = Ride._saved.yaw;
    Player.pitch = Ride._saved.pitch;
  }
  syncCamera();
  document.body.classList.remove("panel");
  const bar = document.getElementById("panelBar");
  if (bar) bar.hidden = true;
};

Ride.paintPanelButtons = function () {
  const bar = document.getElementById("panelBar");
  if (!bar) return;
  bar.querySelectorAll("[data-act]").forEach((b, i) => {
    b.classList.toggle("on", (b.getAttribute("data-act") === "power" && Ride.power) || (b.getAttribute("data-act") === "lights" && Ride.lights) || (b.getAttribute("data-act") === "start" && Ride.spinning));
    b.classList.toggle("hi", i === Ride.highlight);
  });
};

Ride.runAction = function (act) {
  AudioBus.resume();
  if (act === "back") { Ride.exitPanel(); return; }
  if (act === "power") Ride.setPower(!Ride.power);
  else if (act === "lights") Ride.setLights(!Ride.lights);
  else if (act === "horn") Ride.horn();
  else if (act === "start") Ride.startSpin();
  Ride.paintPanelButtons();
};

Ride.setPower = function (on) {
  Ride.power = !!on;
  if (!on) {
    Ride.setLights(false);
    if (Ride.spinning) Ride.spinPhase = "down";
  }
  Ride.setLeds(on);
  if (Ride.key) Ride.key.rotation.z = on ? 0.9 : 0;
  AudioBus.blip && AudioBus.blip(on ? 520 : 240, 0.12, "square", 0.12);
};

Ride.setLights = function (on) {
  if (on && !Ride.power) { AudioBus.blip && AudioBus.blip(180, 0.08, "square", 0.08); return; }
  Ride.lights = !!on;
  if (Ride.togLights) Ride.togLights.rotation.x = on ? -0.5 : 0.4;
  if (Ride.auxLights) Ride.auxLights.rotation.x = on ? -0.4 : 0.3;
  const boost = on ? 2.4 : 1.15;
  if (Ride.root) {
    Ride.root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        const n = ((m && m.name) || o.name || "").toLowerCase();
        if (/bulb_|neon|led_green|led_amber/.test(n) || /Neon|bulb_/i.test(o.name)) {
          if (m.emissiveIntensity != null) m.emissiveIntensity = boost;
          m.needsUpdate = true;
        }
      });
    });
  }
  AudioBus.blip && AudioBus.blip(on ? 660 : 300, 0.1, "square", 0.1);
};

Ride.setLeds = function (on) {
  Ride.leds.forEach((o, i) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      if (!m._baseEm) m._baseEm = m.emissive ? m.emissive.clone() : new THREE.Color(0x11ff66);
      if (m.emissive) m.emissive.copy(m._baseEm);
      m.emissiveIntensity = on ? (i === 0 ? 3.2 : 1.6) : 0.08;
    });
  });
};

Ride.horn = function () {
  if (!Ride.power) { AudioBus.blip && AudioBus.blip(180, 0.08, "square", 0.08); return; }
  Ride.hornT = 0.55;
  AudioBus.horn && AudioBus.horn();
  if (Ride.auxHorn) Ride.auxHorn.rotation.x = -0.5;
};

Ride.startSpin = function () {
  if (!Ride.power) { AudioBus.blip && AudioBus.blip(180, 0.08, "square", 0.08); return; }
  if (Ride.spinning) return;
  Ride.spinning = true;
  Ride.spinT = 0;
  Ride.spinPhase = "up";
  Ride.spinAngle = 0;
  if (Ride.throttle) Ride.throttle.position.y = (Ride.throttle.userData._y || (Ride.throttle.userData._y = Ride.throttle.position.y)) + 0.04;
  AudioBus.motor && AudioBus.motor(0.2);
};

Ride.tick = function (dt) {
  Ride.updatePrompt();
  if (Ride.hornT > 0) {
    Ride.hornT -= dt;
    if (Ride.hornT <= 0 && Ride.auxHorn) Ride.auxHorn.rotation.x = 0.3;
  }
  if (Ride.spinning) {
    Ride.spinT += dt;
    let speed = 0;
    if (Ride.spinPhase === "up") {
      const k = Math.min(1, Ride.spinT / 3.2);
      speed = 2.8 * k * k;
      if (Ride.spinT > 3.2) { Ride.spinPhase = "hold"; Ride.spinT = 0; }
    } else if (Ride.spinPhase === "hold") {
      speed = 2.8;
      if (Ride.spinT > 4.0) { Ride.spinPhase = "down"; Ride.spinT = 0; }
    } else if (Ride.spinPhase === "down") {
      const k = Math.max(0, 1 - Ride.spinT / 4.0);
      speed = 2.8 * k * k;
      if (Ride.spinT > 4.0) {
        Ride.spinning = false;
        Ride.spinPhase = "idle";
        speed = 0;
        AudioBus.motor && AudioBus.motor(0);
        if (Ride.throttle && Ride.throttle.userData._y != null) Ride.throttle.position.y = Ride.throttle.userData._y;
        Ride.paintPanelButtons();
      }
    }
    AudioBus.motor && AudioBus.motor(Ride.spinning ? 0.15 + speed * 0.12 : 0, 140 + speed * 80);
    Ride.spinAngle += speed * dt;
    const q = Ride.spinAngle;
    Ride.pads.forEach((o) => { o.rotation.y = q; });
    if (Ride.needles.rpm) Ride.needles.rpm.rotation.z = -speed * 0.35;
  }
};

Ride.pickAt = function (cx, cy) {
  if (!World.camera || Ride.mode !== "panel") return;
  if (!Ride._ray) Ride._ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  Ride._ray.setFromCamera(ndc, World.camera);
  const hits = Ride._ray.intersectObjects(Ride.root ? Ride.root.children : [], true);
  for (let i = 0; i < hits.length; i++) {
    const n = (hits[i].object.name || "").toLowerCase();
    if (/key/.test(n)) { Ride.runAction("power"); return; }
    if (/estop/.test(n)) { Ride.setPower(false); Ride.paintPanelButtons(); return; }
    if (/auxlev_1|toglever_1|horn/.test(n)) { Ride.runAction("horn"); return; }
    if (/toglever_0|auxlev_0|auxlev_2/.test(n)) { Ride.runAction("lights"); return; }
    if (/throttle/.test(n)) { Ride.runAction("start"); return; }
  }
};

window.Ride = Ride;
