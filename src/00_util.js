/* Shared helpers. Blender is Z-up / Y-forward; glTF export is Y-up (X, Z, -Y). */
const Util = {
  fromBlender(x, y, z, out) {
    const v = out || new THREE.Vector3();
    return v.set(x, z, -y);
  },
  boxToThree(b) {
    const a = Util.fromBlender(b.min[0], b.min[1], b.min[2]);
    const c = Util.fromBlender(b.max[0], b.max[1], b.max[2]);
    return {
      min: new THREE.Vector3(Math.min(a.x, c.x), Math.min(a.y, c.y), Math.min(a.z, c.z)),
      max: new THREE.Vector3(Math.max(a.x, c.x), Math.max(a.y, c.y), Math.max(a.z, c.z)),
    };
  },
  aabbHit(px, pz, r, box) {
    const qx = Math.max(box.min.x, Math.min(px, box.max.x));
    const qz = Math.max(box.min.z, Math.min(pz, box.max.z));
    const dx = px - qx, dz = pz - qz;
    return dx * dx + dz * dz < r * r;
  },
  pushOut(px, pz, r, box) {
    if (!Util.aabbHit(px, pz, r, box)) return null;
    const cx = (box.min.x + box.max.x) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;
    const hx = (box.max.x - box.min.x) * 0.5 + r;
    const hz = (box.max.z - box.min.z) * 0.5 + r;
    const dx = px - cx, dz = pz - cz;
    const ox = hx - Math.abs(dx), oz = hz - Math.abs(dz);
    if (ox < oz) return { x: cx + Math.sign(dx || 1) * hx, z: pz };
    return { x: px, z: cz + Math.sign(dz || 1) * hz };
  },
  isTouch() {
    return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  },
  isPhone() {
    const w = Math.min(screen.width, screen.height);
    const h = Math.max(screen.width, screen.height);
    return Util.isTouch() && w <= 500 && h <= 1000;
  },
};
