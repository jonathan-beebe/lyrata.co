import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const WALL_COLOR = 0xf2a02a;
const FOV = 30;
const CAMERA_DISTANCE = 4.9;
const CAMERA_HEIGHT = 1.3;
const LOOK_AT_HEIGHT = 1.02;
const PLANT_SCREEN_X = 0.28; // plant's horizontal position in landscape, 0..1

const WIND = {
  radius: 0.26,        // pointer reach, in viewport heights
  gain: 3.6,           // pointer travel -> gust
  maxGust: 1.0,
  decay: 2.0,          // gust decay rate, 1/s
  ambient: 0.07,       // idle breeze strength
};

// Seeded PRNG so the plant grows the same way on every load.
let seed = 1987;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(WALL_COLOR);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

// ---------------------------------------------------------------------------
// Lights. The key light casts the shadows that land on the backdrop.
// ---------------------------------------------------------------------------

scene.add(new THREE.HemisphereLight(0xfff0d8, 0xe89a30, 1.15));

const key = new THREE.SpotLight(0xfff4e2, 3.4, 0, 0.66, 0.95, 0);
key.position.set(-4.2, 3.1, 4.6);
key.target.position.set(0.5, 1.0, -0.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 2;
key.shadow.camera.far = 16;
key.shadow.bias = -0.0002;
key.shadow.radius = 5;
key.shadow.blurSamples = 16;
scene.add(key, key.target);

const rim = new THREE.DirectionalLight(0xffe2b0, 0.5);
rim.position.set(4, 3, -0.5);
scene.add(rim);

// ---------------------------------------------------------------------------
// Backdrop: floor sweeping up into the wall
// ---------------------------------------------------------------------------

function buildBackdrop() {
  const wallZ = -1.25, coveR = 1.5, halfW = 40, far = 16;
  const profile = [[far, 0]];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI / 2;
    profile.push([wallZ + coveR - coveR * Math.sin(a), coveR - coveR * Math.cos(a)]);
  }
  profile.push([wallZ, far]);

  const pos = [], idx = [];
  profile.forEach(([z, y], j) => {
    pos.push(-halfW, y, z, halfW, y, z);
    if (j < profile.length - 1) {
      const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: WALL_COLOR, roughness: 0.95, metalness: 0, envMapIntensity: 0.4,
  }));
  mesh.receiveShadow = true;
  return mesh;
}
scene.add(buildBackdrop());

// ---------------------------------------------------------------------------
// Sign: a painted shingle mounted on the wall behind the plant
// ---------------------------------------------------------------------------

const SIGN = { w: 500, h: 330, font: '"Libre Baskerville", Georgia, serif' };

// Drawn on a 500 x 330 grid, matching the logo artwork.
function drawSign(canvas) {
  const k = canvas.width / SIGN.w;
  const g = canvas.getContext('2d');
  g.setTransform(k, 0, 0, k, 0, 0);
  const paint = '#1c1a17';
  g.fillStyle = '#f4e6c4';
  g.fillRect(0, 0, SIGN.w, SIGN.h);
  g.strokeStyle = paint;
  g.lineWidth = 4;
  g.strokeRect(2, 2, SIGN.w - 4, SIGN.h - 4);
  g.lineWidth = 1.5;
  g.strokeRect(14.75, 14.75, SIGN.w - 29.5, SIGN.h - 29.5);

  g.fillStyle = paint;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const cx = SIGN.w / 2;

  g.font = `84px ${SIGN.font}`;
  g.fillText('Lyrata', cx, 138);

  g.font = `italic 64px ${SIGN.font}`;
  const ampW = g.measureText('&').width;
  g.fillText('&', cx, 212);
  g.beginPath();
  g.moveTo(cx - 180, 190); g.lineTo(cx - ampW / 2 - 18, 190);
  g.moveTo(cx + ampW / 2 + 18, 190); g.lineTo(cx + 180, 190);
  g.stroke();

  g.font = `29px ${SIGN.font}`;
  const spacing = 29 * 0.28;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  g.fillText('COMPANY', cx + spacing / 2, 258);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

function buildSign() {
  const canvas = document.createElement('canvas');
  canvas.width = SIGN.w * 3;
  canvas.height = SIGN.h * 3;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const redraw = () => { drawSign(canvas); tex.needsUpdate = true; };
  redraw();
  // Repaint once the web font arrives.
  Promise.all([
    document.fonts.load(`84px ${SIGN.font}`),
    document.fonts.load(`italic 64px ${SIGN.font}`),
  ]).then(redraw, () => {});

  const edge = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.8 });
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, envMapIntensity: 0.4 });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, SIGN.h / SIGN.w, 0.035),
    [edge, edge, edge, edge, face, edge],
  );
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
const sign = buildSign();
scene.add(sign);

// ---------------------------------------------------------------------------
// Pot
// ---------------------------------------------------------------------------

const POT = { height: 0.66, rBottom: 0.3, rTop: 0.4, soilY: 0.6 };

function buildPot() {
  const { height: h, rBottom: rb, rTop: rt, soilY } = POT;
  const group = new THREE.Group();
  const pts = [
    [0, 0], [rb - 0.012, 0], [rb, 0.012], [rt, h - 0.012],
    [rt + 0.012, h - 0.004], [rt + 0.012, h + 0.006], [rt - 0.004, h + 0.008],
    [rt - 0.012, h - 0.01], [rt - 0.02, soilY - 0.02],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const body = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 72),
    new THREE.MeshPhysicalMaterial({
      color: 0xf6e7c3, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  body.castShadow = body.receiveShadow = true;

  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(rt - 0.015, 48),
    new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = soilY;
  soil.receiveShadow = true;

  group.add(body, soil);
  return group;
}
scene.add(buildPot());

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

// Leaf maps share one 256 x 512 layout (t = 0 at the bottom), drawn at 2x.
const LEAF_W = 256, LEAF_H = 512, LEAF_TEX_SCALE = 2;

function leafCanvas() {
  const c = document.createElement('canvas');
  c.width = LEAF_W * LEAF_TEX_SCALE;
  c.height = LEAF_H * LEAF_TEX_SCALE;
  const g = c.getContext('2d');
  g.scale(LEAF_TEX_SCALE, LEAF_TEX_SCALE);
  g.lineCap = 'round';
  return [c, g];
}

function leafMap(canvas, srgb) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Texture detail uses its own generator so it never shifts the plant's shape.
let texSeed = 42;
function texRand() {
  texSeed = (texSeed * 1664525 + 1013904223) >>> 0;
  return texSeed / 4294967296;
}

// Paths for the primary lateral veins, shared by every map.
function traceLaterals(g, each) {
  const W = LEAF_W, H = LEAF_H;
  for (let k = 0; k < 9; k++) {
    const y0 = H * (0.95 - k * 0.1);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2, y0);
      g.quadraticCurveTo(W / 2 + s * 70, y0 - 14, W / 2 + s * 128, y0 - 78);
      each();
    }
  }
}

function leafTexture() {
  const W = LEAF_W, H = LEAF_H;
  const [c, g] = leafCanvas();

  const base = g.createLinearGradient(0, 0, W, 0);
  base.addColorStop(0, '#16301b');
  base.addColorStop(0.5, '#224a29');
  base.addColorStop(1, '#16301b');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 900; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(120,170,90,0.05)' : 'rgba(0,10,0,0.07)';
    g.fillRect(rand() * W, rand() * H, 2 + rand() * 7, 2 + rand() * 12);
  }

  // lateral veins (t = 0 is the bottom of the canvas)
  g.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const y0 = H * (0.95 - k * 0.1);
    for (const s of [-1, 1]) {
      g.strokeStyle = 'rgba(150,180,100,0.38)';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(W / 2, y0);
      g.quadraticCurveTo(W / 2 + s * 70, y0 - 14, W / 2 + s * 128, y0 - 78);
      g.stroke();
      g.strokeStyle = 'rgba(150,180,100,0.16)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(W / 2 + s * 40, y0 - 9);
      g.quadraticCurveTo(W / 2 + s * 80, y0 + 6, W / 2 + s * 128, y0 - 22);
      g.stroke();
    }
  }
  // midrib
  g.fillStyle = '#8fa860';
  g.beginPath();
  g.moveTo(W / 2 - 4, H); g.lineTo(W / 2 + 4, H);
  g.lineTo(W / 2 + 1, 0); g.lineTo(W / 2 - 1, 0);
  g.fill();

  return leafMap(c, true);
}

// Height map: veins sit in grooves and the blade puffs up between them.
function leafBumpTexture() {
  const W = LEAF_W, H = LEAF_H;
  const [c, g] = leafCanvas();
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, W, H);

  // soft grooves: stacked strokes fake a blur
  for (const [width, alpha] of [[26, 0.05], [18, 0.06], [11, 0.08], [6, 0.1], [2.5, 0.16]]) {
    g.strokeStyle = `rgba(0,0,0,${alpha})`;
    g.lineWidth = width;
    traceLaterals(g, () => g.stroke());
    g.lineWidth = width * 1.3;
    g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 0); g.stroke();
  }
  // fine vein network
  g.lineWidth = 0.7;
  for (let i = 0; i < 520; i++) {
    const x = texRand() * W, y = texRand() * H, a = texRand() * Math.PI;
    const len = 5 + texRand() * 12;
    g.strokeStyle = `rgba(0,0,0,${0.05 + texRand() * 0.07})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // pores and pitting
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = texRand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(texRand() * W, texRand() * H, 1 + texRand() * 1.6, 1 + texRand() * 1.6);
  }
  return leafMap(c, false);
}

// Roughness map: a waxy cuticle that is worn unevenly, duller in the grooves.
function leafRoughnessTexture() {
  const W = LEAF_W, H = LEAF_H;
  const [c, g] = leafCanvas();
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 90; i++) {
    const x = texRand() * W, y = texRand() * H, r = 14 + texRand() * 40;
    const v = texRand() < 0.5 ? 255 : 60;
    const blot = g.createRadialGradient(x, y, 0, x, y, r);
    blot.addColorStop(0, `rgba(${v},${v},${v},0.16)`);
    blot.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = blot;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (const [width, alpha] of [[12, 0.07], [6, 0.1], [2.5, 0.14]]) {
    g.strokeStyle = `rgba(255,255,255,${alpha})`;
    g.lineWidth = width;
    traceLaterals(g, () => g.stroke());
    g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 0); g.stroke();
  }
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = texRand() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    g.fillRect(texRand() * W, texRand() * H, 1 + texRand() * 2, 1 + texRand() * 2);
  }
  return leafMap(c, false);
}

const leafMaterial = new THREE.MeshPhysicalMaterial({
  map: leafTexture(),
  bumpMap: leafBumpTexture(),
  bumpScale: 2.2,
  roughnessMap: leafRoughnessTexture(),
  roughness: 0.7,
  specularIntensity: 0.8,
  sheen: 0.1,
  sheenRoughness: 0.55,
  sheenColor: new THREE.Color(0x8fae6a),
  envMapIntensity: 0.7,
  side: THREE.DoubleSide,
});

const NX = 8, NY = 22; // leaf grid segments (across, along)

// Half-width of the lyre outline at t (0 = base, 1 = tip), normalised to ~1.
function lyreProfile(t) {
  const outline = Math.pow(Math.sin(Math.PI * (t * 0.965 + 0.015)), 0.42);
  const upper = THREE.MathUtils.smoothstep(t, 0.3, 0.75);
  const waist = Math.exp(-(((t - 0.36) / 0.13) ** 2));
  return outline * (0.6 + 0.4 * upper - 0.2 * waist);
}

class Leaf {
  constructor({ length, width, curl, phase }) {
    this.length = length;
    this.curl = curl;       // rest droop along the blade, radians
    this.bend = 0; this.bendV = 0;
    this.twist = 0; this.twistV = 0;
    this.sway = 0; this.swayV = 0;
    this.gust = new THREE.Vector2();
    this.phase = phase;
    this.twistSign = rand() < 0.5 ? -1 : 1;
    const f = 0.75 + rand() * 0.35;          // natural frequency, Hz
    this.k = (2 * Math.PI * f) ** 2;
    this.c = 2 * 0.2 * Math.sqrt(this.k);

    // Rest shape in blade space: x across, z along the normal.
    const n = (NX + 1) * (NY + 1);
    this.restX = new Float32Array(n);
    this.restZ = new Float32Array(n);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j <= NY; j++) {
      const t = j / NY;
      const hw = lyreProfile(t) * width * 0.5;
      for (let i = 0; i <= NX; i++) {
        const u = (i / NX) * 2 - 1;
        const v = j * (NX + 1) + i;
        this.restX[v] = u * hw;
        this.restZ[v] = 0.22 * hw * Math.pow(Math.abs(u), 1.5)
          + 0.03 * length * Math.sin(t * 12 + phase) * u * u * t
          + 0.012 * length * Math.sin(t * 9.5 + phase * 2) * u;
        uv[v * 2] = i / NX;
        uv[v * 2 + 1] = t;
      }
    }
    const idx = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geometry = geo;

    this.mesh = new THREE.Mesh(geo, leafMaterial);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;

    this.pivot = new THREE.Group();
    this.pivot.rotation.order = 'YXZ';
    this.pivot.add(this.mesh);
    this.deform();
  }

  // Rebuild vertices from the rest shape, curling and twisting along the blade.
  deform() {
    const pos = this.geometry.attributes.position.array;
    const ds = this.length / NY;
    let cy = 0, cz = 0;
    for (let j = 0; j <= NY; j++) {
      const t = j / NY;
      const theta = this.curl * Math.pow(t, 1.4) + this.bend * 0.7 * Math.pow(t, 1.2);
      const phi = this.twist * t;
      const ct = Math.cos(theta), st = Math.sin(theta);
      const cp = Math.cos(phi), sp = Math.sin(phi);
      if (j > 0) { cy += ds * ct; cz -= ds * st; }
      // tangent (0, ct, -st), normal (0, st, ct), side (1, 0, 0)
      for (let i = 0; i <= NX; i++) {
        const v = j * (NX + 1) + i;
        const x = this.restX[v], z = this.restZ[v];
        const sAmt = x * cp - z * sp;   // along side
        const nAmt = x * sp + z * cp;   // along normal
        pos[v * 3] = sAmt;
        pos[v * 3 + 1] = cy + nAmt * st;
        pos[v * 3 + 2] = cz + nAmt * ct;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

// ---------------------------------------------------------------------------
// Plant
// ---------------------------------------------------------------------------

const plant = new THREE.Group();
plant.position.y = POT.soilY;
scene.add(plant);

const stemCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0.015, 0.28, 0.01),
  new THREE.Vector3(-0.02, 0.58, -0.01),
  new THREE.Vector3(0.0, 0.88, 0.0),
]);
const stem = new THREE.Mesh(
  new THREE.TubeGeometry(stemCurve, 24, 0.024, 10),
  new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.8 }),
);
stem.castShadow = stem.receiveShadow = true;
plant.add(stem);

const leaves = [];
{
  const COUNT = 11;
  const GOLDEN = 2.39996;
  for (let i = 0; i < COUNT; i++) {
    const f = i / (COUNT - 1);                     // 0 = lowest, 1 = newest
    const size = 0.7 + 0.24 * Math.sin(Math.PI * Math.pow(f, 0.8)) - 0.12 * f * f;
    const leaf = new Leaf({
      length: size,
      width: size * (0.64 + rand() * 0.08),
      curl: THREE.MathUtils.lerp(0.75, 0.12, f) + (rand() - 0.5) * 0.2,
      phase: rand() * 6.28,
    });
    leaf.yaw = 0.6 + i * GOLDEN + (rand() - 0.5) * 0.3;
    leaf.pitch = THREE.MathUtils.lerp(1.3, 0.22, Math.pow(f, 0.85)) + (rand() - 0.5) * 0.14;
    leaf.pivot.position.copy(stemCurve.getPoint(0.14 + 0.86 * f));
    leaf.pivot.rotation.set(-leaf.pitch, leaf.yaw, 0);
    plant.add(leaf.pivot);
    leaves.push(leaf);
  }
  plant.updateMatrixWorld(true);
  // World-space rest axes used to turn wind into torques.
  const q = new THREE.Quaternion();
  for (const leaf of leaves) {
    leaf.pivot.getWorldQuaternion(q);
    leaf.side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    leaf.normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    leaf.screen = new THREE.Vector3();
  }
}

// Whole-plant sway
const stemSway = { x: 0, vx: 0, z: 0, vz: 0 };
const globalGust = new THREE.Vector2();
const plantScreen = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Pointer -> wind
// ---------------------------------------------------------------------------

const pointer = { x: 0, y: 0, t: 0, active: false };

function onPointerMove(e) {
  const now = performance.now();
  const dt = (now - pointer.t) / 1000;
  const h = innerHeight, w = innerWidth;
  if (pointer.active && dt < 0.12) {
    // travel in viewport heights, y up
    let dx = (e.clientX - pointer.x) / h;
    let dy = -(e.clientY - pointer.y) / h;
    const len = Math.hypot(dx, dy);
    const max = 0.12;
    if (len > max) { dx *= max / len; dy *= max / len; }

    const px = (e.clientX / w * 2 - 1) * (w / h);
    const py = -(e.clientY / h * 2 - 1);
    const r2 = (WIND.radius * 2) ** 2; // NDC spans 2 units per viewport height
    for (const leaf of leaves) {
      const ex = leaf.screen.x * (w / h) - px, ey = leaf.screen.y - py;
      const fall = Math.exp(-(ex * ex + ey * ey) / r2);
      leaf.gust.x += dx * fall * WIND.gain;
      leaf.gust.y += dy * fall * WIND.gain;
      leaf.gust.clampLength(0, WIND.maxGust);
    }
    const gx = plantScreen.x * (w / h) - px, gy = plantScreen.y - py;
    const gFall = Math.exp(-(gx * gx + gy * gy) / (r2 * 6));
    globalGust.x += dx * gFall * WIND.gain * 0.5;
    globalGust.y += dy * gFall * WIND.gain * 0.5;
    globalGust.clampLength(0, WIND.maxGust);
  }
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = now; pointer.active = true;
}
addEventListener('pointermove', onPointerMove, { passive: true });
addEventListener('pointerdown', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = performance.now(); pointer.active = true;
}, { passive: true });
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  addEventListener(type, (e) => { if (e.pointerType !== 'mouse') pointer.active = false; }, { passive: true });
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const windWorld = new THREE.Vector3();
const tmp = new THREE.Vector3();

function step(dt, time) {
  const decay = Math.exp(-WIND.decay * dt);
  const amb = reducedMotion ? 0 : WIND.ambient;
  globalGust.multiplyScalar(decay);

  // stem
  const sk = 30, sc = 3.2;
  const ambX = amb * (Math.sin(time * 0.37) + 0.5 * Math.sin(time * 0.83 + 1.3));
  stemSway.vx += (-sk * stemSway.x - sc * stemSway.vx + (globalGust.x + ambX) * 3.2) * dt;
  stemSway.vz += (-sk * stemSway.z - sc * stemSway.vz - globalGust.length() * 1.6) * dt;
  stemSway.x += stemSway.vx * dt;
  stemSway.z += stemSway.vz * dt;
  plant.rotation.z = -THREE.MathUtils.clamp(stemSway.x, -0.14, 0.14);
  plant.rotation.x = THREE.MathUtils.clamp(stemSway.z, -0.1, 0.1);

  for (const leaf of leaves) {
    leaf.gust.multiplyScalar(decay);
    const p = leaf.phase;
    const gx = leaf.gust.x + globalGust.x * 0.45
      + amb * (Math.sin(time * 0.55 + p) + 0.6 * Math.sin(time * 1.35 + p * 2.3));
    const gy = leaf.gust.y + globalGust.y * 0.45
      + amb * 0.6 * Math.sin(time * 0.47 + p * 1.7);
    const mag = Math.hypot(gx, gy);
    const flutter = 1 + 0.45 * Math.sin(time * 5.3 + p * 3) * Math.min(mag * 2, 1);

    // screen-space breeze -> world: right, up, and pushed back toward the wall
    windWorld.set(gx, gy * 0.6, -mag * 0.55).multiplyScalar(flutter);
    const fn = windWorld.dot(leaf.normal);
    const fs = windWorld.dot(leaf.side);

    leaf.bendV += (-leaf.k * leaf.bend - leaf.c * leaf.bendV - fn * 19) * dt;
    leaf.swayV += (-leaf.k * leaf.sway - leaf.c * leaf.swayV + fs * 16) * dt;
    leaf.twistV += (-leaf.k * 1.6 * leaf.twist - leaf.c * 1.2 * leaf.twistV
      + fn * 12 * leaf.twistSign + fs * 9) * dt;
    leaf.bend = THREE.MathUtils.clamp(leaf.bend + leaf.bendV * dt, -0.8, 0.8);
    leaf.sway = THREE.MathUtils.clamp(leaf.sway + leaf.swayV * dt, -0.6, 0.6);
    leaf.twist = THREE.MathUtils.clamp(leaf.twist + leaf.twistV * dt, -0.7, 0.7);
  }
}

function applyPose() {
  for (const leaf of leaves) {
    leaf.pivot.rotation.set(-(leaf.pitch + leaf.bend * 0.35), leaf.yaw + leaf.sway * 0.6, leaf.sway * 0.4);
    leaf.deform();
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function layout() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setSize(w, h, false);
  camera.aspect = aspect;

  // Keep the plant's width in frame on narrow screens.
  const dist = Math.max(CAMERA_DISTANCE, CAMERA_DISTANCE * 0.8 / aspect);
  const lift = (dist - CAMERA_DISTANCE) * 0.05;
  camera.position.set(0, CAMERA_HEIGHT + lift, dist);
  camera.lookAt(0, LOOK_AT_HEIGHT, 0);

  // Lens shift: plant on the left third in landscape, low and centred in portrait.
  if (aspect > 1) camera.setViewOffset(w, h, (0.5 - PLANT_SCREEN_X) * w, 0, w, h);
  else camera.setViewOffset(w, h, 0, -0.13 * h, w, h);
  camera.updateProjectionMatrix();

  // The sign hangs on the wall behind the plant, clear of the cove.
  if (aspect > 1) { sign.position.set(1.3, 1.72, -1.15); sign.scale.setScalar(1.8); }
  else { sign.position.set(0.15, 2.5, -1.15); sign.scale.setScalar(1.7); }
}
addEventListener('resize', layout);
layout();

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();
let first = true;

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const time = clock.elapsedTime;
  const sub = 2;
  for (let i = 0; i < sub; i++) step(dt / sub, time);
  applyPose();

  renderer.render(scene, camera);

  // Screen positions for the next pointer event.
  for (const leaf of leaves) {
    leaf.screen.set(0, leaf.length * 0.55, 0);
    leaf.pivot.localToWorld(leaf.screen).project(camera);
  }
  plantScreen.set(0, 1.3, 0).project(camera);

  if (first) {
    first = false;
    const loader = document.getElementById('loader');
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 800);
  }
}
renderer.setAnimationLoop(frame);

// Debug handle: lyrata.gust(x, y) blows the whole plant.
window.lyrata = {
  gust(x = 1, y = 0) {
    for (const leaf of leaves) leaf.gust.set(x, y).clampLength(0, WIND.maxGust);
    globalGust.set(x, y).clampLength(0, WIND.maxGust);
  },
};
