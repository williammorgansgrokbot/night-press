/* Crowd placement with AABB validation + ground snap, and extra rail/drum colliders. */

function addBoxCollider(name, minX, minY, minZ, maxX, maxY, maxZ) {
  World.colliders.push({
    name,
    min: new THREE.Vector3(Math.min(minX, maxX), Math.min(minY, maxY), Math.min(minZ, maxZ)),
    max: new THREE.Vector3(Math.max(minX, maxX), Math.max(minY, maxY), Math.max(minZ, maxZ)),
  });
}

function addDrumAndRailColliders() {
  // RideWall was a solid AABB that filled the whole drum. Rebuild it as a ring
  // with a south-side door gap (glTF +Z, Blender -Y) between the jambs.
  const R = 4.48, thick = 0.32, segs = 22;
  const gap = (18 * Math.PI) / 180;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const mid = (a0 + a1) * 0.5;
    // a = 0 is +Z (the door)
    let ang = mid;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    if (Math.abs(ang) < gap) continue;
    const x = R * Math.sin(mid), z = R * Math.cos(mid);
    const w = 2 * R * Math.sin((a1 - a0) * 0.5) + 0.1;
    const hx = Math.abs(Math.cos(mid)) * w * 0.5 + Math.abs(Math.sin(mid)) * thick * 0.5;
    const hz = Math.abs(Math.sin(mid)) * w * 0.5 + Math.abs(Math.cos(mid)) * thick * 0.5;
    addBoxCollider("RideWallSeg_" + i, x - hx, 0.28, z - hz, x + hx, 5.9, z + hz);
  }

  // Queue rails (stanchion switchback south of the stairs). Stair gap is left open (x ~ -1.3..1.3, z ~ 6.2..8.9).
  addBoxCollider("QueueRailL", -2.70, 0.05, 8.20, -2.30, 1.15, 16.60);
  addBoxCollider("QueueRailR", -1.15, 0.05, 9.20, -0.75, 1.15, 16.60);
  // Stair handrails
  addBoxCollider("HandrailL", -0.85, 0.4, 6.20, -0.55, 1.70, 8.70);
  addBoxCollider("HandrailR", 0.55, 0.4, 6.20, 0.85, 1.70, 8.70);
  // Existing east fence is already in lot.json; keep a slightly taller volume so it actually blocks
  addBoxCollider("FenceEast", 9.88, 0.15, -7.10, 10.12, 1.15, 7.10);
}

function crowdBlocked(x, z, r) {
  r = r == null ? 0.42 : r;
  for (let i = 0; i < World.colliders.length; i++) {
    const b = World.colliders[i];
    if (b.max.y < 0.2 || b.min.y > 1.6) continue;
    if (Util.aabbHit(x, z, r, b)) return b.name || "solid";
  }
  return null;
}

function snapClear(x, z, r) {
  // spiral search for a free ground point
  if (!crowdBlocked(x, z, r)) return { x, z };
  for (let k = 1; k <= 14; k++) {
    const rad = 0.45 * k;
    const steps = 8 + k * 2;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const nx = x + Math.cos(a) * rad;
      const nz = z + Math.sin(a) * rad;
      if (!crowdBlocked(nx, nz, r)) return { x: nx, z: nz };
    }
  }
  return null;
}

// Three.js x,z,yaw (yaw 0 looks -Z, toward Night Press from the south).
const CROWD_SLOTS = [
  // Night Press queue, two lanes, facing the entrance (yaw 0 looks -Z)
  { x: -1.72, z:  9.60, yaw: Math.PI },
  { x: -0.15, z: 10.20, yaw: Math.PI },
  { x: -1.72, z: 11.10, yaw: Math.PI },
  { x: -0.15, z: 12.00, yaw: Math.PI },
  { x: -1.72, z: 12.60, yaw: Math.PI },
  { x: -0.15, z: 14.20, yaw: Math.PI },
  { x: -1.72, z: 14.10, yaw: Math.PI },
  { x: -1.72, z: 15.60, yaw: Math.PI },
  // ticket booth — customer at the north window, attendant to the west
  { x:  5.60, z:  5.15, yaw: 0 },
  { x:  3.05, z:  9.20, yaw:  0.6 },
  // food trailer 0 (lot / north face)
  { x: -11.2, z: -16.35, yaw: Math.PI },
  { x:  -9.4, z: -16.35, yaw: Math.PI + 0.15 },
  { x: -10.3, z: -15.40, yaw: Math.PI - 0.2 },
  // food trailer 1
  { x:  8.50, z: -12.20, yaw: Math.PI },
  { x: 10.80, z: -12.20, yaw: Math.PI + 0.2 },
  // ferris — south of the A-frame, looking at the wheel
  { x: -27.6, z: -26.80, yaw: 0.1 },
  { x: -24.2, z: -27.00, yaw: 0 },
  { x: -21.4, z: -26.60, yaw: -0.15 },
  // carousel — just outside the platform
  { x: -16.0, z:  -4.20, yaw: Math.PI },
  { x:  -8.0, z: -12.00, yaw: -1.57 },
  { x: -24.8, z:  -4.00, yaw:  1.2 },
  // swing ride
  { x:  2.90, z: -15.50, yaw: -1.57 },
  { x:  3.10, z: -12.50, yaw: -1.4 },
  { x: -5.20, z:  -8.20, yaw: Math.PI },
  // mall sidewalk (west of the facade, clear of parked cars)
  { x: 28.5, z:  2.00, yaw: 1.57 },
  { x: 28.5, z:  8.50, yaw: 1.45 },
  { x: 28.5, z: -14.0, yaw: 1.70 },
  { x: 28.5, z: 16.00, yaw: 1.50 },
  // mid-lot paths and small chat groups
  { x:  -8.0, z: 22.00, yaw: 0.4 },
  { x:   2.2, z: 18.50, yaw: -0.5 },
  { x:   6.4, z: 12.00, yaw: 0.2 },
  { x: -18.0, z:  4.00, yaw: 0.8 },
  { x: -18.5, z: -4.50, yaw: -0.3 },
  { x:   8.5, z: 14.00, yaw: 2.5 },
  { x:  16.5, z: -3.00, yaw: 0.1 },
  { x:  -6.5, z:  4.50, yaw: 1.1 },
];

function placeCrowd(root) {
  const people = [];
  root.traverse((o) => {
    if (/^skeleton(\.?\d+)?$/i.test(o.name) && o.parent === root) people.push(o);
  });
  if (!people.length) {
    root.children.forEach((o) => {
      if (/^skeleton/i.test(o.name)) people.push(o);
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const used = [];
  people.forEach((p, i) => {
    const slot = CROWD_SLOTS[i] || { x: -8, z: 24 + i * 0.8, yaw: 0 };
    const at = snapClear(slot.x, slot.z, 0.45);
    if (!at) {
      p.visible = false;
      return;
    }
    // keep a little space between people
    let x = at.x, z = at.z, ok = true;
    for (const u of used) {
      if (Math.hypot(u.x - x, u.z - z) < 0.85) { ok = false; break; }
    }
    if (!ok) {
      const retry = snapClear(slot.x + 0.7, slot.z + 0.7, 0.45);
      if (retry) { x = retry.x; z = retry.z; }
    }
    const y = groundHeight(x, z);
    p.position.set(x, y, z);
    p.rotation.set(0, slot.yaw, 0);
    p.updateMatrix();
    used.push({ x, z });
    World.anim.push({
      kind: "idle",
      obj: p,
      baseYaw: slot.yaw,
      phase: i * 0.73,
      sway: 0.12 + (i % 3) * 0.03,
    });
  });
  if (typeof console !== "undefined") {
    console.info("crowd placed", used.length, "of", people.length);
  }
}

// idle ticks piggy-back on tickWorld
function tickCrowd(dt) {
  const t = (World.clock && World.clock.elapsedTime) || performance.now() / 1000;
  // clock may not advance; use a local
  tickCrowd._t = (tickCrowd._t || 0) + dt;
  const tt = tickCrowd._t;
  for (const a of World.anim) {
    if (a.kind !== "idle") continue;
    a.obj.rotation.y = a.baseYaw + Math.sin(tt * a.sway + a.phase) * 0.22;
    a.obj.rotation.x = Math.sin(tt * (a.sway * 1.7) + a.phase) * 0.02;
  }
}
