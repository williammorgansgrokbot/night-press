const World = {
  scene: null, camera: null, renderer: null, composer: null, bloom: null,
  env: null, clock: new THREE.Clock(),
  anim: [], colliders: [], floors: [], bounds: null,
  spawn: new THREE.Vector3(-8, 1.65, 20), spawnYaw: 0,
  pixelRatio: 1, targetPR: 1, lowFrames: 0,
};

function setLoad(p, msg) {
  const f = document.getElementById("loadfill");
  const t = document.getElementById("loadtxt");
  if (f) f.style.width = Math.round(p * 100) + "%";
  if (t && msg) t.textContent = msg;
}

async function loadGLB(url) {
  const loader = new THREE.GLTFLoader();
  if (typeof MeshoptDecoder !== "undefined") {
    if (MeshoptDecoder.ready) await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return new Promise((resolve, reject) => {
    loader.load(url, (g) => resolve(g.scene), undefined, reject);
  });
}

function prepareMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      const em = m.emissive ? m.emissive.getHex() : 0;
      if (em > 0 || (m.emissiveIntensity && m.emissiveIntensity > 0.01)) {
        m.emissiveIntensity = Math.max(m.emissiveIntensity || 1, 1.4);
        m.toneMapped = true;
      }
      // wet-look boost for asphalt-like materials
      const n = (m.name || o.name || "").toLowerCase();
      if (n.includes("asphalt") || n.includes("ground") || n.includes("puddle")) {
        m.roughness = Math.min(m.roughness ?? 0.5, 0.28);
        m.metalness = Math.max(m.metalness ?? 0, 0.12);
        if ("envMapIntensity" in m) m.envMapIntensity = 1.35;
      }
      if (n.includes("puddle")) {
        m.roughness = 0.08;
        m.metalness = 0.2;
        if ("envMapIntensity" in m) m.envMapIntensity = 1.8;
      }
      m.needsUpdate = true;
    });
  });
}

function findByName(root, substrs) {
  const hits = [];
  root.traverse((o) => {
    const n = (o.name || "").toLowerCase();
    if (substrs.some((s) => n.includes(s))) hits.push(o);
  });
  return hits;
}

async function initWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0810);
  scene.fog = new THREE.FogExp2(0x1a1018, 0.0045);
  World.scene = scene;

  const cam = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.08, 8000);
  World.camera = cam;

  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: !Util.isPhone(), powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x0a0810, 1);
  World.renderer = renderer;
  World.targetPR = Util.isPhone() ? Math.min(1.25, window.devicePixelRatio || 1) : Math.min(1.75, window.devicePixelRatio || 1);
  World.pixelRatio = World.targetPR;
  renderer.setPixelRatio(World.pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);

  // bloom
  if (typeof THREE.EffectComposer === "function") {
    const comp = new THREE.EffectComposer(renderer);
    const rp = new THREE.RenderPass(scene, cam);
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.7, 0.85);
    comp.addPass(rp);
    comp.addPass(bloom);
    World.composer = comp;
    World.bloom = bloom;
  }

  // lights
  scene.add(new THREE.AmbientLight(0x2a2030, 0.45));
  const hemi = new THREE.HemisphereLight(0x8899cc, 0x1a0c0a, 0.55);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xffc8a0, 0.35);
  fill.position.set(-20, 40, -80);
  scene.add(fill);
  const key = new THREE.DirectionalLight(0xa8c4ff, 0.2);
  key.position.set(30, 25, 10);
  scene.add(key);

  // sky + skyline env
  setLoad(0.08, "Loading the sky…");
  const skyTex = await new Promise((res, rej) => {
    new THREE.TextureLoader().load("assets/sky_skyline.jpg", res, undefined, rej);
  });
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = skyTex;
  scene.environment = skyTex;
  World.env = skyTex;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(skyTex).texture;
  scene.environment = envMap;
  World.env = envMap;

  const lot = await fetch("assets/lot.json").then((r) => r.json());
  const sp = lot.spawn;
  Util.fromBlender(sp.x, sp.y, sp.z, World.spawn);
  // look toward the ride origin
  // yaw 0 looks down -Z, which is Blender +Y (toward the ride / skyline from spawn).
  // Aim at the ride origin so the hero view is slightly to the right.
  World.spawnYaw = Math.atan2(World.spawn.x, World.spawn.z);
  World.bounds = {
    min: Util.fromBlender(sp.bounds.min[0], sp.bounds.min[1], 0),
    max: Util.fromBlender(sp.bounds.max[0], sp.bounds.max[1], 0),
  };
  // after fromBlender the z values flip; rebuild xz bounds
  const b1 = Util.fromBlender(sp.bounds.min[0], sp.bounds.min[1], 0);
  const b2 = Util.fromBlender(sp.bounds.max[0], sp.bounds.max[1], 0);
  World.bounds = {
    minX: Math.min(b1.x, b2.x), maxX: Math.max(b1.x, b2.x),
    minZ: Math.min(b1.z, b2.z), maxZ: Math.max(b1.z, b2.z),
  };
  World.colliders = (lot.colliders || []).filter((c) => {
    const n = (c.name || "").toLowerCase().replace(/\s|\./g, "");
    if (/^(riser_|stanchbase|doorthresh|doorstoop|rampa$|rampb$|rampmid|edgeroad|genskid|trailerskirt|trailerfloor|panelkick|stripe|hoop_|padridge)/.test(n)) return false;
    if ((c.name || "").toLowerCase().includes("crowd_barrier")) {
      if (c.min[0] < 1.45 && c.max[0] > -1.45) return false;
    }
    if (c.max[2] < 0.28 && (c.max[2] - c.min[2]) < 0.35) return false;
    return true;
  }).map(Util.boxToThree);
  World.floors = (lot.floors || []).map((f) => {
    const a = Util.fromBlender(f.min[0], f.min[1], f.z);
    const b = Util.fromBlender(f.max[0], f.max[1], f.z);
    return {
      kind: f.kind,
      y: f.z,
      minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
      minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z),
    };
  });

  const assets = [
    ["ground.glb", 0.2, "Laying asphalt…"],
    ["night_press.glb", 0.35, "Raising Night Press…"],
    ["mall.glb", 0.48, "Opening the mall…"],
    ["carnival.glb", 0.62, "Lighting the carnival…"],
    ["props.glb", 0.78, "Parking the lot…"],
    ["people.glb", 0.88, "Crowds wandering in…"],
  ];
  // skyline.glb is optional — the equirect already holds the distant city
  if (lot.loadSkyline) assets.push(["skyline.glb", 0.95, "Placing the skyline…"]);

  for (const [file, p, msg] of assets) {
    setLoad(p, msg);
    try {
      const root = await loadGLB("assets/" + file);
      prepareMaterials(root);
      scene.add(root);
      // ride animations
      if (file === "carnival.glb") {
        findByName(root, ["ferris", "wheel"]).forEach((o) => {
          if (o.parent && /wheel|ferris/i.test(o.name)) World.anim.push({ obj: o, kind: "spinZ", speed: 0.18 });
        });
        // spin the biggest wheel-like object
        let wheel = null, max = 0;
        root.traverse((o) => {
          if (!o.isMesh) return;
          const b = new THREE.Box3().setFromObject(o);
          const s = b.getSize(new THREE.Vector3());
          const n = o.name.toLowerCase();
          if ((n.includes("wheel") || n.includes("ferris") || n.includes("gond")) && s.x + s.y > max) {
            max = s.x + s.y; wheel = o;
          }
        });
        if (wheel) World.anim.push({ obj: wheel, kind: "spinZ", speed: 0.22 });
        findByName(root, ["carousel"]).forEach((o) => {
          if (!o.parent || o.parent === root) World.anim.push({ obj: o, kind: "spinY", speed: 0.45 });
        });
        findByName(root, ["swing"]).forEach((o) => {
          if (!o.parent || o.parent === root) World.anim.push({ obj: o, kind: "sway", speed: 0.8 });
        });
      }
    } catch (err) {
      console.warn("missing or failed", file, err);
    }
  }

  // a few point lights around Night Press and carnival so neon reads
  [[0, 6, 0, 0xff66cc, 40], [-16, 8, -12, 0xffa0d0, 50], [8, 5, 4, 0xffe0a0, 25], [20, 8, -6, 0xfff2c0, 30],
   // trailer / panel work light (three.js coords, inside the booth)
   [8.2, 2.05, -1.4, 0xffd8a0, 8]].forEach((L) => {
    const l = new THREE.PointLight(L[3], 1.15, L[4], 2);
    l.position.set(L[0], L[1], L[2]);
    scene.add(l);
  });

  // distant skyline card (equirect city is only ~40px tall; this plate reads at night from the lot)
  try {
    const plateTex = await new Promise((res, rej) => {
      new THREE.TextureLoader().load("assets/skyline_plate.jpg", res, undefined, rej);
    });
    plateTex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(480, 48),
      new THREE.MeshBasicMaterial({ map: plateTex, fog: false, depthWrite: false, toneMapped: true, transparent: true, opacity: 0.92 })
    );
    // north of the lot; y chosen so the tree/ground line in the plate sits on the horizon
    plate.position.set(0, 6.2, -520);
    plate.lookAt(0, 6.2, 0);
    scene.add(plate);
  } catch (e) {
    console.warn("skyline plate skipped", e);
  }

  setLoad(1, "Ready");
  setTimeout(() => document.getElementById("load").classList.add("gone"), 250);
}

function resizeWorld() {
  const w = innerWidth, h = innerHeight;
  World.camera.aspect = w / h;
  World.camera.updateProjectionMatrix();
  World.renderer.setSize(w, h, false);
  if (World.composer) World.composer.setSize(w, h);
}

function groundHeight(x, z, feetY) {
  let y = 0;
  const step = 0.62;
  const reach = (feetY == null) ? 1e9 : feetY + step;
  for (const f of World.floors) {
    if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) {
      if (f.y <= reach && f.y > y) y = f.y;
    }
  }
  return y;
}

function tickWorld(dt) {
  for (const a of World.anim) {
    if (a.kind === "spinY") a.obj.rotation.y += a.speed * dt;
    else if (a.kind === "spinZ") a.obj.rotation.z += a.speed * dt;
    else if (a.kind === "sway") a.obj.rotation.y = Math.sin(World.clock.elapsedTime * a.speed) * 0.4;
  }
}

function adaptPR(frameMs) {
  if (frameMs > 24) World.lowFrames++;
  else World.lowFrames = Math.max(0, World.lowFrames - 2);
  if (World.lowFrames > 45 && World.pixelRatio > 0.85) {
    World.pixelRatio = Math.max(0.75, World.pixelRatio - 0.15);
    World.renderer.setPixelRatio(World.pixelRatio);
    World.lowFrames = 0;
    if (World.bloom) World.bloom.enabled = World.pixelRatio > 0.9;
  }
}
