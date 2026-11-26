const Player = {
  yaw: 0, pitch: 0,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  radius: 0.38, eye: 1.62, speed: 4.2, locked: false,
};

function resetPlayer() {
  Player.pos.copy(World.spawn);
  Player.pos.y = groundHeight(Player.pos.x, Player.pos.z) + Player.eye;
  Player.yaw = World.spawnYaw;
  Player.pitch = -0.04;
  Player.vel.set(0, 0, 0);
  syncCamera();
}

function syncCamera() {
  World.camera.position.copy(Player.pos);
  World.camera.rotation.order = "YXZ";
  World.camera.rotation.y = Player.yaw;
  World.camera.rotation.x = Player.pitch;
}

function collideXZ(x, z) {
  const r = Player.radius;
  const { minX, maxX, minZ, maxZ } = World.bounds;
  x = Math.max(minX + r, Math.min(maxX - r, x));
  z = Math.max(minZ + r, Math.min(maxZ - r, z));
  const feet = Player.pos.y - Player.eye;
  const head = feet + 1.7;
  for (let i = 0; i < World.colliders.length; i++) {
    const box = World.colliders[i];
    if (box.max.y < feet + 0.40 || box.min.y > head) continue;
    const hit = Util.pushOut(x, z, r, box);
    if (hit) { x = hit.x; z = hit.z; }
  }
  x = Math.max(minX + r, Math.min(maxX - r, x));
  z = Math.max(minZ + r, Math.min(maxZ - r, z));
  return { x, z };
}

function tickPlayer(dt) {
  if (Player.locked) { syncCamera(); return; }
  const look = Input.consumeLook();
  const mv = Input.moveVec();
  Player.yaw -= look.dx + mv.lookX * dt;
  Player.pitch -= look.dy + mv.lookY * dt;
  const lim = 1.2;
  if (Player.pitch < -lim) Player.pitch = -lim;
  if (Player.pitch > lim) Player.pitch = lim;

  if (mv.mag > 0) {
    const sy = Math.sin(Player.yaw), cy = Math.cos(Player.yaw);
    // yaw 0 looks down -Z; forward is (-sin, -cos) wait: x = -sin(yaw), z = -cos(yaw)
    const fx = -Math.sin(Player.yaw), fz = -Math.cos(Player.yaw);
    const rx = Math.cos(Player.yaw), rz = -Math.sin(Player.yaw);
    // mv.y is positive when stick down / S (backward)
    const vx = (fx * -mv.y + rx * mv.x) * Player.speed;
    const vz = (fz * -mv.y + rz * mv.x) * Player.speed;
    const nx = Player.pos.x + vx * dt;
    const nz = Player.pos.z + vz * dt;
    const c = collideXZ(nx, nz);
    Player.pos.x = c.x;
    Player.pos.z = c.z;
  }
  const gy = groundHeight(Player.pos.x, Player.pos.z, Player.pos.y - Player.eye);
  const targetY = gy + Player.eye;
  Player.pos.y += (targetY - Player.pos.y) * Math.min(1, dt * 10);
  syncCamera();
}
