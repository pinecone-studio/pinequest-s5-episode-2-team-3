import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Kind, PetMood, Stage } from './pet';

// «Дусалхан» in real 3D (three.js), for the achievements page. Every animal is the same glossy water
// drop built from code — no model files — with its own ears, wool, horns or wings, so they stay one
// family. Lit by a soft room environment so the clear-coat body shines like a toy. One live view walks
// around the header (it can be dragged round and tapped); `petImage` renders still pictures of the
// others from one shared hidden renderer, so the page never holds more than two WebGL contexts.

// `shine` 0–4 grows with the level: a brighter glow, then more and more gold sparkles circling it.
// `water` makes the body clear glass with water inside that rises with `fill` (the home gauge).
export interface Look { kind: Kind; mood: PetMood; stage: Stage; shine?: number; water?: boolean }

const COLORS: Record<Kind, number> = {
  drop: 0x2f93ff, mouse: 0xaab6c6, cat: 0xff9a45, rooster: 0xfff3e2, frog: 0x4cc860, dog: 0xdca468, pig: 0xff9fbd, monkey: 0x9a6640, goat: 0xf1ede6, snake: 0x5cc356, horse: 0xbd7d45, cow: 0xfbf8f3, tiger: 0xff8a1e, camel: 0xd8a965, bear: 0xa8703c, penguin: 0x2a3f6e, bunny: 0xff8ab5, whale: 0x3474e0, sheep: 0xffe9d6, unicorn: 0xf7c6f2, dragon: 0x22b4d6, legend: 0xd9f1ff,
};
const SCALE: Record<Stage, number> = { egg: 0.9, baby: 0.66, kid: 0.78, big: 0.9, giant: 1 };
const INK = 0x14284a, PINK = 0xff8fab, GOLD = 0xffc83d;

// The drop's outline, turned on a lathe: a round bottom (slightly squashed) and a pointed top.
const BOTTOM = 0.95, TOP = 1.9;
const radiusAt = (y: number) => (y < 0 ? Math.sqrt(Math.max(0, 1 - (y / BOTTOM) ** 2)) : Math.cos((Math.min(y, TOP) / TOP) * Math.PI / 2) ** 1.4);
function dropGeometry(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 18; i++) { const a = -Math.PI / 2 + (i / 18) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a), Math.sin(a) * BOTTOM)); }
  for (let i = 1; i <= 30; i++) { const y = (i / 30) * TOP; pts.push(new THREE.Vector2(Math.max(radiusAt(y), i === 30 ? 0 : 0.001), y)); }
  return new THREE.LatheGeometry(pts, 64);
}

const glossy = (color: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.65, ...extra });
// The pet's skin: glossy like a jelly sweet, with a soft sheen and a hint of rainbow like water.
const jelly = (color: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  glossy(color, { roughness: 0.22, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.35, iridescence: 0.35, iridescenceIOR: 1.3, emissive: new THREE.Color(color), emissiveIntensity: 0.08, ...extra });
// A bright edge that glows where the surface turns away (fresnel), drawn over the body so it reads as water.
function rim(color = 0xffffff, power = 2.6, strength = 0.85, add = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, power: { value: power }, strength: { value: strength } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float power; uniform float strength; varying vec3 vN; varying vec3 vV; void main() { float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), power) * strength; gl_FragColor = vec4(color, f); }',
    transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
// A soft star-shaped glint, shared by the glitter, aura and bubbles' shine.
let glint: THREE.CanvasTexture | null = null;
function glintTexture(): THREE.CanvasTexture {
  if (glint) return glint;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,255,.9)';
  x.beginPath(); x.moveTo(32, 2); x.lineTo(35, 29); x.lineTo(62, 32); x.lineTo(35, 35); x.lineTo(32, 62); x.lineTo(29, 35); x.lineTo(2, 32); x.lineTo(29, 29); x.closePath(); x.fill();
  glint = new THREE.CanvasTexture(c);
  return glint;
}

// A shiny eye: dark iris with a blue glow at the bottom and a big and a small sparkle, drawn once.
let irisTex: THREE.CanvasTexture | null = null;
function iris(): THREE.CanvasTexture {
  if (irisTex) return irisTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 58, 6, 64, 64, 64);
  g.addColorStop(0, '#081325'); g.addColorStop(0.62, '#0f2448'); g.addColorStop(1, '#1b3f7c');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 63, 0, Math.PI * 2); x.fill();
  const b = x.createRadialGradient(64, 112, 4, 64, 104, 46);
  b.addColorStop(0, 'rgba(110,200,255,.95)'); b.addColorStop(1, 'rgba(110,200,255,0)');
  x.fillStyle = b; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
  irisTex = new THREE.CanvasTexture(c); irisTex.colorSpace = THREE.SRGBColorSpace;
  return irisTex;
}
const flat = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1]) => {
  const o = new THREE.Mesh(g, m); o.position.set(...p); o.scale.set(...s); return o;
};

// Puts a face part on the body's surface at (x, y), turned to face outwards.
function onSurface(o: THREE.Object3D, x: number, y: number, lift = 0.02): THREE.Object3D {
  const r = radiusAt(y), z = Math.sqrt(Math.max(0.0001, r * r - x * x));
  const slope = y < 0 ? -y / (BOTTOM * BOTTOM) * r : 0.35 * y;  // rough tilt of the surface
  const n = new THREE.Vector3(x, slope, z).normalize();
  o.position.set(x, y, z).addScaledVector(n, lift);
  // Keeps the part's own turn (a flipped smile, a sideways line) on top of facing outwards.
  o.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n));
  return o;
}

// A bat-like wing (a membrane with scalloped edge and two ribs), for the dragon (red) and the legend.
function wing(color: number, side: number): THREE.Group {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.quadraticCurveTo(0.45, 0.55, 1.05, 0.62); sh.quadraticCurveTo(1.0, 0.3, 1.2, 0.12);
  sh.quadraticCurveTo(0.95, 0.1, 0.92, -0.12); sh.quadraticCurveTo(0.7, -0.02, 0.6, -0.22); sh.quadraticCurveTo(0.35, -0.08, 0, 0);
  const g = new THREE.Group();
  const m = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 16 }), jelly(color, { side: THREE.DoubleSide, iridescence: 0.2 }));
  g.add(m);
  const bone = glossy(new THREE.Color(color).multiplyScalar(0.7).getHex());
  for (const [x, y, a] of [[0.5, 0.31, 0.55], [0.48, 0.05, -0.05]]) g.add(mesh(new THREE.CapsuleGeometry(0.025, 0.95, 4, 8), bone, [x, y, 0.03]).rotateZ(Math.PI / 2 + a));
  g.scale.set(side, 1, 1);
  return g;
}

// Puts a part on the body at any angle round it (0 = front), facing outwards.
function around(o: THREE.Object3D, a: number, y: number, lift = 0.02): THREE.Object3D {
  const r = radiusAt(y), n = new THREE.Vector3(Math.sin(a), y < 0 ? -y * 0.9 : 0.35 * y, Math.cos(a)).normalize();
  o.position.set(Math.sin(a) * r, y, Math.cos(a) * r).addScaledVector(n, lift);
  o.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n));
  return o;
}
// A soft round puff for fire, smoke, embers and light.
let puff: THREE.CanvasTexture | null = null;
function puffTexture(): THREE.CanvasTexture {
  if (puff) return puff;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  puff = new THREE.CanvasTexture(c);
  return puff;
}
const glow = (color: number, opacity = 1) => new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));

// A feathered wing: rows of long glossy feathers fanned out, gold-tipped.
function featherWing(side: number, color: number, tip: number, size = 1): THREE.Group {
  const g = new THREE.Group();
  const m = jelly(color, { iridescence: 0.9, emissiveIntensity: 0.25 }), t = glossy(tip, { metalness: 0.5, roughness: 0.2 });
  for (let i = 0; i < 7; i++) {
    const a = 0.2 + i * 0.16, len = (1.0 - i * 0.08) * size;
    const f = new THREE.Group(); f.rotation.z = side * -(Math.PI / 2 - a);
    f.add(mesh(new THREE.CapsuleGeometry(0.11 * size, len, 6, 12), m, [0, len / 2 + 0.1, -i * 0.01], [1, 1, 0.4]));
    f.add(mesh(new THREE.SphereGeometry(0.075 * size, 10, 8), t, [0, len + 0.12, 0], [1, 1.4, 0.4]));
    g.add(f);
  }
  return g;
}

// Luu: a proper little water dragon — snout, gold belly plates, curved horns, ear fins, big red
// wings, back spikes and a tail. It flies, breathes little fire puffs and is circled by embers.
function dragon(body: THREE.Group, skin: THREE.Material, model: Model, wings: THREE.Object3D[]): void {
  const red = 0xe0102c, gold = glossy(GOLD, { metalness: 0.45, roughness: 0.2 });
  model.fly = true;
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.45, 0.55, -0.55); w.scale.setScalar(1.45);
    w.add(wing(red, s)); body.add(w); wings.push(w);
  }
  // Snout with nostrils, and a cream belly with gold plates.
  body.add(onSurface(mesh(new THREE.SphereGeometry(0.3, 24, 16), skin, [0, 0, 0], [1.25, 0.8, 0.7]), 0, -0.1, -0.04));
  for (const s of [-1, 1]) body.add(onSurface(mesh(new THREE.SphereGeometry(0.035, 10, 8), glossy(0x0b3a4a)), s * 0.09, -0.06, 0.2));
  // Curved gold horns and fin-like ears.
  for (const s of [-1, 1]) {
    const h = new THREE.Group(); h.position.set(s * 0.3, 1.1, -0.05); h.rotation.z = -s * 0.35;
    h.add(mesh(new THREE.ConeGeometry(0.1, 0.38, 20), gold, [0, 0.19, 0]), mesh(new THREE.ConeGeometry(0.06, 0.3, 16), gold, [-s * 0.08, 0.48, -0.06]).rotateZ(s * 0.7));
    body.add(h);
    body.add(mesh(new THREE.ConeGeometry(0.14, 0.42, 3), glossy(red), [s * 0.78, 0.55, 0]).rotateZ(-s * 1.2));
  }
  const spike = glossy(red);
  for (let i = 0; i < 6; i++) { const y = 1.5 - i * 0.36, r = radiusAt(y); body.add(mesh(new THREE.ConeGeometry(0.1 - i * 0.006, 0.28, 16), spike, [0, y, -r - 0.06]).rotateX(-1.25)); }
  const tail = new THREE.Group(); tail.position.set(0.3, -0.55, -0.75); tail.rotation.set(-1.1, 0, -0.75);
  tail.add(mesh(new THREE.ConeGeometry(0.18, 0.9, 20), skin, [0, 0.4, 0]), mesh(new THREE.ConeGeometry(0.16, 0.28, 3), spike, [0, 0.92, 0]));
  body.add(tail);
  // Fire breath: puffs from the snout every few seconds; embers drifting up all around.
  const mouth = new THREE.Vector3(0, -0.12, 1.15);
  const flames = Array.from({ length: 34 }, () => { const sp = glow(0xffa020, 0); body.add(sp); return { sp, life: 9, v: new THREE.Vector3() }; });
  const embers = Array.from({ length: 12 }, (_, i) => { const sp = glow(i % 2 ? 0xff6a00 : 0xffd000, 0.9); sp.scale.setScalar(0.12); body.add(sp); return { sp, a: Math.random() * 6.3, y: Math.random() * 2.4 - 0.6, sp2: 0.3 + Math.random() * 0.4 }; });
  const aura = glow(0xff5a1f, 0.35); aura.scale.setScalar(3.6); aura.position.set(0, 0.5, -1); body.add(aura);
  let next = 1.2, fl = 0;
  model.tick = (t, dt) => {
    next -= dt;
    if (next <= 0) { next = 2.2 + Math.random() * 1.5; fl = 1.1; }
    if (fl > 0) {
      fl -= dt;
      const f = flames.find(p => p.life >= 0.7);
      if (f) { f.life = 0; f.sp.position.copy(mouth); f.v.set((Math.random() - 0.5) * 0.6, 0.1 + Math.random() * 0.4, 1.8 + Math.random() * 0.8); }
    }
    for (const p of flames) {
      if (p.life >= 0.7) { p.sp.material.opacity = 0; continue; }
      p.life += dt; p.sp.position.addScaledVector(p.v, dt);
      const k = p.life / 0.7;
      p.sp.material.color.setHSL(0.12 - k * 0.12, 1, 0.55 - k * 0.15);
      p.sp.material.opacity = (1 - k * k) * 1; p.sp.scale.setScalar(0.3 + k * 0.9);
    }
    for (const e of embers) {
      e.y += dt * e.sp2; if (e.y > 2.2) e.y = -0.6;
      e.sp.position.set(Math.sin(e.a + t * 0.6) * 1.35, e.y, Math.cos(e.a + t * 0.6) * 1.0);
      e.sp.material.opacity = 0.9 * Math.min(1, (2.2 - e.y) / 0.8);
    }
    aura.material.opacity = 0.3 + Math.sin(t * 2.5) * 0.08;
  };
}

// Домогт Дусал: a pearly rainbow drop with a gold crown and halo, two pairs of feathered wings,
// three water orbs circling it, a beam of light behind and a rainbow glow. It floats.
function legend(body: THREE.Group, model: Model, wings: THREE.Object3D[]): void {
  model.fly = true;
  for (const [s, y, size, z] of [[-1, 0.75, 1.15, -0.55], [1, 0.75, 1.15, -0.55], [-1, 0.15, 0.75, -0.5], [1, 0.15, 0.75, -0.5]] as const) {
    const w = new THREE.Group(); w.position.set(s * 0.5, y, z); w.add(featherWing(s, 0xfffaf0, GOLD, size)); body.add(w); wings.push(w);
  }
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, emissive: 0xffb300, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.2 });
  const halo = mesh(new THREE.TorusGeometry(0.46, 0.055, 14, 64), gold, [0, 2.25, 0]); halo.rotation.x = Math.PI / 2.3; body.add(halo); model.halo = halo;
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; body.add(mesh(new THREE.ConeGeometry(0.07, 0.24, 12), gold, [Math.sin(a) * 0.3, 1.55, Math.cos(a) * 0.3])); }
  body.add(mesh(new THREE.TorusGeometry(0.31, 0.045, 10, 40), gold, [0, 1.44, 0]).rotateX(Math.PI / 2));
  body.add(onSurface(mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshPhysicalMaterial({ color: 0x7fd6ff, emissive: 0x2fa8ff, emissiveIntensity: 0.6, roughness: 0, clearcoat: 1 }), [0, 0, 0], [0.8, 1.15, 0.5]), 0, 0.7));
  const beam = glow(0xfff2c0, 0.4); beam.scale.set(1.6, 5.5, 1); beam.position.set(0, 1.2, -1.2); body.add(beam);
  const auras = [0xff7ab8, 0xffd166, 0x7fe0c3, 0x7fb8ff].map(c => { const a = glow(c, 0.22); a.scale.setScalar(3.4); a.position.z = -1; body.add(a); return a; });
  const orbMat = jelly(0x8fd8ff, { iridescence: 1, emissiveIntensity: 0.3 });
  const orbs = [0, 1, 2].map(() => { const o = new THREE.Group(); o.add(mesh(new THREE.SphereGeometry(0.15, 24, 16), orbMat), mesh(new THREE.SphereGeometry(0.17, 24, 16), rim(0xffffff, 2, 1))); const g = glow(0xbfeaff, 0.6); g.scale.setScalar(0.6); o.add(g); body.add(o); return o; });
  const trail = Array.from({ length: 14 }, () => { const sp = glow(0xffffff, 0); body.add(sp); return { sp, life: Math.random() }; });
  model.tick = (t, dt) => {
    orbs.forEach((o, i) => { const a = t * 1.1 + (i / 3) * Math.PI * 2; o.position.set(Math.sin(a) * 1.45, 0.7 + Math.sin(t * 2 + i) * 0.25, Math.cos(a) * 0.9); });
    auras.forEach((a, i) => { const k = t * 0.9 + i * 1.6; a.position.set(Math.sin(k) * 0.35, 0.6 + Math.cos(k) * 0.3, -1); a.material.opacity = 0.16 + Math.sin(k * 1.3) * 0.07; });
    beam.material.opacity = 0.32 + Math.sin(t * 1.7) * 0.1;
    for (const p of trail) {
      p.life += dt * 0.7;
      if (p.life > 1) { p.life = 0; p.sp.position.set((Math.random() - 0.5) * 1.6, -0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8); }
      p.sp.position.y -= dt * 0.35; p.sp.scale.setScalar(0.14 * (1 - p.life) + 0.04); p.sp.material.opacity = Math.sin(p.life * Math.PI) * 0.9;
    }
  };
}

// A smooth tube along points (tails).
const tube = (pts: [number, number, number][], r: number, m: THREE.Material) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 40, r, 10), m);
const spiral = (x: number, y: number, z: number, r: number, turns = 1.6): [number, number, number][] =>
  Array.from({ length: 14 }, (_, i) => { const a = (i / 13) * turns * Math.PI * 2, k = r * (1 - i / 18); return [x + Math.cos(a) * k, y + Math.sin(a) * k, z - i * 0.02]; });

interface Water { plane: THREE.Plane; inner: THREE.Mesh; surface: THREE.Mesh }
interface Model { water?: Water; tail?: THREE.Object3D; wag?: number; fly?: boolean; tick?: (t: number, dt: number) => void; glitter?: THREE.Points[]; aura?: THREE.Sprite; spout?: THREE.Object3D; sparkles?: THREE.Group; root: THREE.Group; body: THREE.Group; eyes: THREE.Group; armL: THREE.Group; armR: THREE.Group; wings: THREE.Object3D[]; halo?: THREE.Object3D; sweat?: THREE.Object3D; mouthOpen?: THREE.Object3D }

function eye(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.2, 32, 24), glossy(INK, { roughness: 0.08 }), [0, 0, 0], [1, 1.18, 0.45]));
  g.add(mesh(new THREE.CircleGeometry(0.19, 40), new THREE.MeshBasicMaterial({ map: iris(), transparent: true }), [0, 0, 0.092], [1, 1.18, 1]));
  g.add(mesh(new THREE.SphereGeometry(0.2, 32, 24), glossy(0xffffff, { transparent: true, opacity: 0.12, roughness: 0 }), [0, 0, 0.012], [1, 1.18, 0.47]));
  g.add(mesh(new THREE.SphereGeometry(0.075, 16, 12), flat(0xffffff), [0.065, 0.09, 0.1], [1, 1.1, 0.5]));
  g.add(mesh(new THREE.SphereGeometry(0.034, 12, 8), flat(0xffffff), [-0.06, -0.08, 0.1], [1, 1, 0.5]));
  return g;
}
const arc = (r: number, tube: number, flip = false) => {
  const o = mesh(new THREE.TorusGeometry(r, tube, 10, 24, Math.PI), glossy(INK));
  if (flip) o.rotation.z = Math.PI;
  return o;
};

function build(look: Look): Model {
  const { kind, mood, stage } = look;
  const grey = mood === 'sick' || mood === 'weak';
  const color = grey ? 0xa9b5c0 : COLORS[kind];
  const shine = look.shine ?? 0;
  const skin = jelly(color, { emissiveIntensity: 0.08 + shine * 0.05 + (kind === 'legend' ? 0.15 : 0), iridescence: kind === 'legend' ? 1 : 0.35 + shine * 0.15, ...(kind === 'sheep' ? { roughness: 0.4, iridescence: 0 } : {}) });
  const root = new THREE.Group(), body = new THREE.Group(), eyes = new THREE.Group();
  const armL = new THREE.Group(), armR = new THREE.Group();
  const wings: THREE.Object3D[] = [];
  const model: Model = { root, body, eyes, armL, armR, wings };
  root.add(body);
  body.position.y = 1;  // the root's origin is between the feet

  if (stage === 'egg') {
    body.add(mesh(new THREE.SphereGeometry(1, 48, 36), jelly(grey ? 0xc9d2da : 0xcfeaff), [0, 0.15, 0], [0.82, 1.12, 0.82]));
    body.add(mesh(new THREE.SphereGeometry(1, 48, 36), rim(0xffffff, 2.4, 0.7), [0, 0.15, 0], [0.83, 1.13, 0.83]));
    for (const [x, y, z, r] of [[-0.45, 0.6, 0.5, 0.12], [0.4, 0.95, 0.42, 0.09], [0.55, -0.35, 0.5, 0.1]]) body.add(mesh(new THREE.SphereGeometry(r, 16, 12), glossy(0xffffff), [x, y, z], [1, 1, 0.4]));
    eyes.add(arc(0.08, 0.025, true).translateX(-0.2), arc(0.08, 0.025, true).translateX(0.2));
    eyes.position.set(0, -0.05, 0.86);
    body.add(eyes);
    return model;
  }

  if ((kind === 'penguin' || kind === 'dragon' || kind === 'whale') && !grey) {
    // Two-tone in one piece: a white face and tummy fading smoothly into the navy back.
    const geo = dropGeometry(), pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    const navy = new THREE.Color(color), white = new THREE.Color(kind === 'dragon' ? 0xfff0c8 : kind === 'whale' ? 0xd6ecff : 0xffffff), c = new THREE.Color(), cols: number[] = [];
    const step = (a: number, b: number, v: number) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
    for (let i = 0; i < pos.count; i++) {
      const front = kind === 'whale' ? step(0.3, 0.7, nor.getZ(i)) * step(-0.3, -0.55, pos.getY(i)) : kind === 'dragon' ? step(0.55, 0.85, nor.getZ(i)) * step(-0.1, -0.35, pos.getY(i)) : step(0.6, 0.85, nor.getZ(i)) * step(0.5, 0.25, pos.getY(i));
      c.copy(navy).lerp(white, front); cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    body.add(mesh(geo, jelly(0xffffff, { vertexColors: true, emissive: new THREE.Color(0x101828), emissiveIntensity: 0.1 })));
  } else if (look.water) {
    // A clear glass drop; the water inside is cut flat at the level by a clipping plane (moved each frame).
    // On a white card an additive glow vanishes, so the glass gets a tinted body and a blue edge.
    body.add(mesh(dropGeometry(), jelly(grey ? 0xc9d3dc : 0xb4dcff, { transparent: true, opacity: 0.3, depthWrite: false, iridescence: 0.6, emissiveIntensity: 0.06 })));
    body.add(mesh(dropGeometry(), rim(grey ? 0x7d8b98 : 0x2f86e8, 1.8, 0.9, false), [0, 0, 0], [1.015, 1.008, 1.015]));
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), -10);
    const inner = mesh(dropGeometry(), glossy(grey ? 0x6f8597 : 0x0f6fe8, { roughness: 0.12, emissive: new THREE.Color(0x0a4fb0), emissiveIntensity: 0.25, clippingPlanes: [plane] }), [0, 0, 0], [0.93, 0.95, 0.93]);
    const surface = mesh(new THREE.CircleGeometry(1, 48), glossy(grey ? 0x9fb2c2 : 0x4fb0ff, { roughness: 0.05, emissive: new THREE.Color(0x2a8cff), emissiveIntensity: 0.3 }));
    surface.rotation.x = -Math.PI / 2;
    body.add(inner, surface);
    model.water = { plane, inner, surface };
  } else body.add(mesh(dropGeometry(), skin));
  body.add(mesh(dropGeometry(), rim(grey ? 0xe8eef3 : 0xeaf7ff), [0, 0, 0], [1.01, 1.005, 1.01]));
  // Feet and little arms (arms swing from the shoulder pivots).
  const limb = look.water ? jelly(grey ? 0x9eacb8 : 0x5fb2ff) : skin;
  const feet = kind === 'penguin' ? glossy(0xffa630) : limb;
  for (const x of [-0.38, 0.38]) root.add(mesh(new THREE.SphereGeometry(0.26, 24, 16), feet, [x, 0.12, 0.18], [1.1, 0.6, 1.3]));
  for (const [arm, side] of [[armL, -1], [armR, 1]] as const) {
    arm.position.set(side * 0.9, 0.05, 0.12);
    arm.add(mesh(new THREE.SphereGeometry(0.2, 24, 16), limb, [side * 0.1, -0.22, 0], [0.72, 1.15, 0.72]));
    arm.rotation.z = side * (mood === 'joyful' ? 2.3 : 0.45);
    body.add(arm);
  }

  // Face.
  if (mood === 'good' || mood === 'thirsty') {
    const s = mood === 'thirsty' ? 0.85 : 1;
    for (const x of [-0.34, 0.34]) { const e = onSurface(eye(), x, 0.24); e.scale.setScalar(s); eyes.add(e); }
  } else if (mood === 'joyful') {
    for (const x of [-0.34, 0.34]) eyes.add(onSurface(arc(0.12, 0.035), x, 0.2));
  } else if (mood === 'sick') {
    for (const x of [-0.34, 0.34]) eyes.add(onSurface(arc(0.1, 0.03, true), x, 0.24));
  } else {
    for (const x of [-0.34, 0.34]) eyes.add(onSurface(mesh(new THREE.CapsuleGeometry(0.03, 0.18, 4, 8), glossy(INK)).rotateZ(Math.PI / 2), x, 0.22));
  }
  body.add(eyes);
  if (mood === 'joyful') {
    const m = onSurface(new THREE.Group(), 0, -0.02);
    m.add(mesh(new THREE.CircleGeometry(0.13, 24, Math.PI, Math.PI), flat(0x6b1d33)));
    m.add(mesh(new THREE.CircleGeometry(0.07, 16, Math.PI, Math.PI), flat(0xff7a95), [0, -0.05, 0.002]));
    body.add(m);
    model.mouthOpen = m;
  } else if (mood === 'thirsty') {
    body.add(onSurface(mesh(new THREE.CircleGeometry(0.05, 16), flat(0x6b1d33), [0, 0, 0], [1, 1.3, 1]), 0, -0.04));
  } else if (mood === 'weak') {
    body.add(onSurface(mesh(new THREE.CapsuleGeometry(0.02, 0.12, 4, 8), glossy(INK)).rotateZ(Math.PI / 2), 0, -0.02));
  } else {
    body.add(onSurface(arc(0.09, 0.024, mood !== 'sick'), 0, mood === 'sick' ? -0.08 : 0.02));
  }
  if (mood === 'good' || mood === 'joyful') for (const x of [-0.58, 0.58]) body.add(onSurface(mesh(new THREE.CircleGeometry(0.11, 24), flat(PINK, 0.55), [0, 0, 0], [1.2, 0.7, 1]), x, 0.04, 0.01));
  if (mood === 'thirsty') {
    const d = mesh(new THREE.SphereGeometry(0.09, 16, 12), glossy(0xbfe6ff), [0.72, 0.75, 0.55], [0.8, 1.2, 0.8]);
    body.add(d); model.sweat = d;
  }

  // The animal.
  const pinkIn = glossy(0xffb3c6);
  const whiskers = (spread: number) => {
    for (const sx of [-1, 1]) for (const a of [-0.15, 0.15]) { const w = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6), flat(INK, 0.6)); onSurface(w, sx * spread, -0.02 + a * 0.4, 0.02); w.rotation.set(0, 0, Math.PI / 2 + sx * a); body.add(w); }
  };
  if (kind === 'cat') {
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.6, 0.92, 0); ear.rotation.z = -s * 0.62;
      ear.add(mesh(new THREE.ConeGeometry(0.3, 0.62, 32), skin, [0, 0.12, 0]), mesh(new THREE.ConeGeometry(0.17, 0.4, 24), pinkIn, [0, 0.08, 0.16], [1, 1, 0.4]));
      body.add(ear);
      for (const a of [-0.15, 0.15]) { const w = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6), flat(INK, 0.6)); onSurface(w, s * 0.62, -0.02 + a * 0.4, 0.02); w.rotation.set(0, 0, Math.PI / 2 + s * a); body.add(w); }
    }
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.05, 16, 12), glossy(PINK), [0, 0, 0], [1.3, 0.9, 0.7]), 0, 0.07));
    // A red collar with a little gold bell.
    body.add(mesh(new THREE.TorusGeometry(radiusAt(-0.42) + 0.02, 0.05, 12, 64), glossy(0xff4d5e), [0, -0.42, 0]).rotateX(Math.PI / 2));
    body.add(mesh(new THREE.SphereGeometry(0.1, 20, 14), glossy(GOLD, { metalness: 0.6, roughness: 0.2 }), [0, -0.52, radiusAt(-0.42) + 0.06]));
  } else if (kind === 'mouse') {
    for (const sx of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.36, 24, 16), skin, [sx * 0.66, 0.8, -0.05], [1, 1, 0.32]), mesh(new THREE.SphereGeometry(0.23, 20, 14), pinkIn, [sx * 0.66, 0.8, 0.07], [1, 1, 0.3]));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.055, 16, 12), glossy(PINK)), 0, 0.07));
    whiskers(0.55);
    body.add(tube([[0, -0.7, -0.75], [0.45, -0.85, -1.15], [0.85, -0.55, -1.25], [0.95, -0.15, -1.05]], 0.035, glossy(0xffb3c6)));
  } else if (kind === 'rooster') {
    const red = glossy(0xff3347);
    for (const [y, z, r] of [[1.62, 0.2, 0.15], [1.82, 0.04, 0.16], [1.42, 0.32, 0.12]]) body.add(mesh(new THREE.SphereGeometry(r * 1.2, 20, 14), red, [0, y, z], [0.75, 1, 1]));
    body.add(onSurface(mesh(new THREE.ConeGeometry(0.1, 0.24, 16), glossy(0xffb326)).rotateX(Math.PI / 2), 0, 0.06, 0.06));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.08, 16, 12), red, [0, 0, 0], [0.7, 1.3, 0.6]), 0, -0.1, 0.04));
    [0xff7a1a, 0x1f9d55, 0xe0102c, 0x2b4fd6, 0xffb326].forEach((c, i) => body.add(mesh(new THREE.CapsuleGeometry(0.07, 0.6, 6, 10), glossy(c), [(i - 2) * 0.16, 0.2 + Math.abs(i - 2) * -0.05, -0.95]).rotateX(-0.6).rotateZ((i - 2) * -0.35)));
  } else if (kind === 'dog') {
    const brown = glossy(0x9a6232);
    for (const sx of [-1, 1]) body.add(mesh(new THREE.CapsuleGeometry(0.17, 0.42, 8, 12), brown, [sx * 0.8, 0.5, 0.05], [1, 1, 0.55]).rotateZ(sx * 0.35));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.26, 24, 16), glossy(0xfbe6cf), [0, 0, 0], [1.25, 0.8, 0.5]), 0, -0.06, -0.02));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.075, 16, 12), glossy(INK), [0, 0, 0], [1.3, 0.9, 0.8]), 0, 0.04, 0.12));
    body.add(around(mesh(new THREE.CircleGeometry(0.06, 16), flat(0xff7a95), [0, 0, 0], [0.8, 1.2, 1]), 0, -0.2, 0.13));
    body.add(mesh(new THREE.TorusGeometry(radiusAt(-0.45) + 0.02, 0.05, 12, 64), glossy(0xe0102c), [0, -0.45, 0]).rotateX(Math.PI / 2));
    body.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20), glossy(GOLD, { metalness: 0.6 }), [0, -0.57, radiusAt(-0.45) + 0.05]).rotateX(Math.PI / 2));
  } else if (kind === 'pig') {
    const snout = onSurface(new THREE.Group(), 0, -0.04, 0.02);
    snout.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 32), glossy(0xff8fb0)).rotateX(Math.PI / 2));
    for (const sx of [-1, 1]) snout.add(mesh(new THREE.SphereGeometry(0.04, 12, 8), glossy(0x8a2f4a), [sx * 0.07, 0, 0.06], [1, 1.3, 0.5]));
    body.add(snout);
    for (const sx of [-1, 1]) body.add(mesh(new THREE.ConeGeometry(0.2, 0.36, 20), skin, [sx * 0.5, 0.95, 0.1]).rotateZ(-sx * 0.6).rotateX(0.5));
    body.add(tube(spiral(0, -0.35, -1.0, 0.16), 0.035, skin));
  } else if (kind === 'monkey') {
    const beige = glossy(0xf2d2ac);
    for (const sx of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.3, 24, 16), skin, [sx * 0.98, 0.32, 0], [0.45, 1, 1]), mesh(new THREE.SphereGeometry(0.18, 16, 12), beige, [sx * 1.08, 0.32, 0.02], [0.3, 1, 1]));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.42, 32, 24), beige, [0, 0, 0], [1.45, 1.2, 0.18]), 0, 0.08, -0.06));
    body.add(tube(spiral(0.2, -0.2, -1.0, 0.3, 1.3), 0.05, skin));
  } else if (kind === 'goat') {
    const horn = glossy(0xc9b28f);
    for (const sx of [-1, 1]) body.add(mesh(new THREE.TorusGeometry(0.32, 0.085, 12, 28, Math.PI * 1.15), horn, [sx * 0.3, 1.05, -0.25]).rotateY(Math.PI / 2 + sx * 0.25).rotateZ(0.3));
    for (const sx of [-1, 1]) body.add(mesh(new THREE.CapsuleGeometry(0.1, 0.32, 6, 10), skin, [sx * 0.9, 0.6, 0]).rotateZ(sx * 1.2));
    body.add(around(mesh(new THREE.ConeGeometry(0.1, 0.32, 16), glossy(0xd8d0c2)).rotateX(Math.PI), 0, -0.5, 0.06));
  } else if (kind === 'snake') {
    body.add(mesh(new THREE.TorusGeometry(0.98, 0.2, 18, 64, Math.PI * 1.7), skin, [0, -0.78, 0]).rotateX(Math.PI / 2).rotateZ(1.2));
    body.add(mesh(new THREE.ConeGeometry(0.17, 0.5, 20), skin, [0.9, -0.72, -0.5]).rotateZ(-1.4).rotateY(0.6));
    const tongue = onSurface(new THREE.Group(), 0, -0.12, 0.02);
    for (const sx of [-1, 1]) tongue.add(mesh(new THREE.CapsuleGeometry(0.014, 0.12, 4, 6), glossy(0xe0102c), [sx * 0.025, -0.1, 0.02]).rotateZ(sx * 0.4));
    tongue.add(mesh(new THREE.CapsuleGeometry(0.016, 0.1, 4, 6), glossy(0xe0102c), [0, -0.02, 0.02]));
    body.add(tongue);
    for (const [a, y] of [[1.4, 0.5], [-1.4, 0.2], [2.4, 0.0], [-2.3, 0.7], [3.1, 0.35], [1.0, -0.35], [-1.0, -0.4]]) body.add(around(mesh(new THREE.SphereGeometry(0.11, 16, 12), glossy(0xffd34d), [0, 0, 0], [1, 1, 0.3]), a, y));
  } else if (kind === 'horse') {
    const mane = glossy(0x5a3418);
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.32, 24, 16), glossy(0xe7c39b), [0, 0, 0], [1.25, 0.85, 0.55]), 0, -0.12, -0.02));
    for (const sx of [-1, 1]) body.add(onSurface(mesh(new THREE.SphereGeometry(0.035, 10, 8), glossy(0x3b2414)), sx * 0.1, -0.12, 0.17));
    for (const sx of [-1, 1]) body.add(mesh(new THREE.ConeGeometry(0.11, 0.32, 16), skin, [sx * 0.28, 1.2, 0]).rotateZ(-sx * 0.35));
    for (let i = 0; i < 6; i++) { const y = 1.4 - i * 0.3, r = radiusAt(y); body.add(mesh(new THREE.SphereGeometry(0.16, 16, 12), mane, [0.05, y, -r - 0.02])); }
    body.add(mesh(new THREE.SphereGeometry(0.14, 16, 12), mane, [0, 1.12, 0.3]));
    for (let i = 0; i < 4; i++) body.add(mesh(new THREE.CapsuleGeometry(0.06, 0.55, 6, 10), mane, [(i - 1.5) * 0.08, -0.45, -1.0]).rotateX(-0.5).rotateZ((i - 1.5) * 0.15));
  } else if (kind === 'cow') {
    const spot = glossy(0x2b2b2b, { roughness: 0.4 });
    for (const [a, y, k] of [[1.15, 0.85, 0.2], [-1.4, 0.25, 0.24], [2.5, 0.45, 0.26], [-2.3, 0.95, 0.18], [0.95, -0.45, 0.16], [3.0, -0.2, 0.22]]) body.add(around(mesh(new THREE.SphereGeometry(k, 20, 14), spot, [0, 0, 0], [1.2, 0.9, 0.15]), a, y));
    for (const sx of [-1, 1]) body.add(mesh(new THREE.ConeGeometry(0.08, 0.32, 16), glossy(0xf5e6c4), [sx * 0.34, 1.2, 0]).rotateZ(-sx * 0.75));
    for (const sx of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.2, 16, 12), skin, [sx * 0.9, 0.72, 0], [1.3, 0.5, 0.6]).rotateZ(sx * 0.3));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.3, 24, 16), glossy(0xffb8c8), [0, 0, 0], [1.3, 0.75, 0.5]), 0, -0.2, -0.02));
    for (const sx of [-1, 1]) body.add(onSurface(mesh(new THREE.SphereGeometry(0.04, 10, 8), glossy(0x8a2f4a)), sx * 0.1, -0.2, 0.15));
    body.add(mesh(new THREE.SphereGeometry(0.11, 20, 14), glossy(GOLD, { metalness: 0.6, roughness: 0.2 }), [0, -0.6, radiusAt(-0.48) + 0.06]));
    body.add(mesh(new THREE.TorusGeometry(radiusAt(-0.48) + 0.02, 0.045, 12, 64), glossy(0x8a5a2b), [0, -0.48, 0]).rotateX(Math.PI / 2));
  } else if (kind === 'tiger') {
    const stripe = glossy(0x2a1a10, { roughness: 0.4 });
    for (const a of [1.25, 1.7, 2.2, -1.25, -1.7, -2.2, 2.8, -2.8]) for (const y of [0.55, 0.05, -0.45]) body.add(around(mesh(new THREE.CapsuleGeometry(0.05, 0.34, 4, 8), stripe).rotateZ(Math.PI / 2 + (a > 0 ? 0.2 : -0.2)), a, y + (Math.abs(a) > 2 ? 0.15 : 0)));
    for (const x of [-0.12, 0, 0.12]) body.add(onSurface(mesh(new THREE.CapsuleGeometry(0.03, 0.16, 4, 8), stripe), x, 0.72 - Math.abs(x) * 0.5));
    for (const sx of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.24, 20, 14), skin, [sx * 0.55, 0.85, 0], [1, 1, 0.55]), mesh(new THREE.SphereGeometry(0.13, 16, 12), glossy(0xffffff), [sx * 0.55, 0.85, 0.1], [1, 1, 0.4]));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.27, 24, 16), glossy(0xfff6ea), [0, 0, 0], [1.3, 0.8, 0.5]), 0, -0.08, -0.02));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.06, 16, 12), glossy(PINK), [0, 0, 0], [1.3, 0.9, 0.7]), 0, 0.03, 0.1));
    whiskers(0.6);
  } else if (kind === 'camel') {
    for (const sx of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.42, 24, 16), skin, [sx * 0.34, 0.95, -0.55], [1, 1.15, 1]));
    body.add(mesh(new THREE.SphereGeometry(0.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glossy(0xe0102c), [0, 0.42, -0.5], [1.05, 0.5, 0.9]));
    body.add(mesh(new THREE.TorusGeometry(0.62, 0.035, 10, 64), glossy(GOLD, { metalness: 0.5 }), [0, 0.43, -0.5], [1.05, 0.9, 1]).rotateX(Math.PI / 2));
    for (const sx of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.06, 12, 8), glossy(0x1f6fd6), [sx * 0.62, 0.36, -0.2]));
    for (const sx of [-1, 1]) body.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 12), skin, [sx * 0.3, 1.22, 0]).rotateZ(-sx * 0.4));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.3, 24, 16), glossy(0xf2d6a8), [0, 0, 0], [1.25, 0.8, 0.5]), 0, -0.12, -0.02));
  } else if (kind === 'frog') {
    // Big eye bumps on top, a wide grin and a lily pad with a pink flower for a hat.
    for (const sx of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.27, 24, 16), skin, [sx * 0.36, 0.95, 0.12]), mesh(new THREE.SphereGeometry(0.14, 16, 12), glossy(0xeaffdf), [sx * 0.36, 0.98, 0.33], [1, 1, 0.5]));
    const pad = new THREE.Group(); pad.position.set(0.1, 1.42, 0); pad.rotation.z = -0.15;
    pad.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 32, 1, false, 0.3, Math.PI * 1.8), glossy(0x2fa84a)));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pad.add(mesh(new THREE.SphereGeometry(0.09, 12, 8), glossy(0xff8fc7), [Math.cos(a) * 0.1, 0.07, Math.sin(a) * 0.1], [1, 0.5, 1.6]).rotateY(-a)); }
    pad.add(mesh(new THREE.SphereGeometry(0.06, 12, 8), glossy(0xffd34d), [0, 0.1, 0]));
    body.add(pad);
  } else if (kind === 'penguin') {
    // An orange beak, rosy cheeks on the white face and a tiny tuft on top.
    body.add(onSurface(mesh(new THREE.ConeGeometry(0.1, 0.24, 16), glossy(0xffa630)).rotateX(Math.PI / 2), 0, 0.04, 0.08));
    body.add(mesh(new THREE.ConeGeometry(0.06, 0.25, 12), skin, [0.05, 1.95, 0]).rotateZ(-0.4));
  } else if (kind === 'whale') {
    // A pale belly, a tail fin behind and a fountain of water on top.
    for (const sx of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.32, 20, 14), skin, [sx * 0.3, -0.25, -1.05], [1.2, 0.3, 0.7]).rotateZ(sx * 0.5));
    const spout = new THREE.Group(); spout.position.y = 1.95;
    const water = glossy(0xbfe8ff, { transparent: true, opacity: 0.85 });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; spout.add(mesh(new THREE.SphereGeometry(0.07, 12, 8), water, [Math.cos(a) * 0.2, 0.18 + (i % 2) * 0.1, Math.sin(a) * 0.2])); }
    spout.add(mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.25, 10), water, [0, 0.08, 0]));
    body.add(spout); model.spout = spout;
  } else if (kind === 'unicorn') {
    // A spiral gold horn, little ears and a rainbow mane down the back.
    const horn = new THREE.Group(); horn.position.set(0, 1.0, 0.42); horn.rotation.x = 0.45;
    horn.add(mesh(new THREE.ConeGeometry(0.15, 0.85, 24), glossy(GOLD, { metalness: 0.5, roughness: 0.15 }), [0, 0.42, 0]));
    for (let i = 0; i < 4; i++) horn.add(mesh(new THREE.TorusGeometry(0.13 - i * 0.03, 0.022, 8, 24), glossy(0xfff1b8, { metalness: 0.4 }), [0, 0.1 + i * 0.18, 0]).rotateX(Math.PI / 2 - 0.25));
    body.add(horn);
    for (const sx of [-1, 1]) body.add(mesh(new THREE.ConeGeometry(0.13, 0.3, 20), skin, [sx * 0.42, 1.0, 0]).rotateZ(-sx * 0.5));
    const mane = [0xff7ab8, 0xffb547, 0xffe066, 0x6ee0b0, 0x6cb8ff, 0xb48cff];
    mane.forEach((c, i) => { const y = 1.3 - i * 0.28, r = radiusAt(y); body.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), glossy(c), [0.08, y, -r - 0.02])); });
  } else if (kind === 'bear') {
    for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.27, 24, 16), skin, [s * 0.6, 0.78, 0], [1, 1, 0.6]), mesh(new THREE.SphereGeometry(0.14, 16, 12), pinkIn, [s * 0.6, 0.78, 0.12], [1, 1, 0.4]));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.27, 24, 16), glossy(0xfbe6cf), [0, 0, 0], [1.25, 0.85, 0.55]), 0, -0.04, -0.02));
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.075, 16, 12), glossy(INK), [0, 0, 0], [1.3, 0.9, 0.8]), 0, 0.05, 0.12));
    // A cosy blue scarf.
    body.add(mesh(new THREE.TorusGeometry(radiusAt(-0.4) + 0.03, 0.09, 14, 64), glossy(0x3d8bff, { roughness: 0.5 }), [0, -0.4, 0]).rotateX(Math.PI / 2));
    body.add(mesh(new THREE.CapsuleGeometry(0.09, 0.34, 6, 12), glossy(0x3d8bff, { roughness: 0.5 }), [0.42, -0.62, 0.78]).rotateZ(0.25));
  } else if (kind === 'bunny') {
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.26, 1.2, -0.05); ear.rotation.z = -s * 0.22;
      ear.add(mesh(new THREE.CapsuleGeometry(0.14, 0.75, 8, 16), skin, [0, 0.45, 0]), mesh(new THREE.CapsuleGeometry(0.07, 0.55, 8, 12), pinkIn, [0, 0.45, 0.09], [1, 1, 0.5]));
      body.add(ear);
    }
    // A bow at the base of one ear.
    const bow = new THREE.Group(); bow.position.set(0.42, 1.08, 0.22); bow.rotation.z = -0.4;
    const ribbon = glossy(0xff5c8a);
    bow.add(mesh(new THREE.SphereGeometry(0.16, 16, 12), ribbon, [-0.14, 0, 0], [1, 0.7, 0.45]), mesh(new THREE.SphereGeometry(0.16, 16, 12), ribbon, [0.14, 0, 0], [1, 0.7, 0.45]), mesh(new THREE.SphereGeometry(0.07, 12, 8), ribbon));
    body.add(bow);
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.05, 16, 12), glossy(PINK), [0, 0, 0], [1.3, 0.9, 0.7]), 0, 0.07));
  } else if (kind === 'sheep') {
    // A white fluffy coat of wool puffs all over, leaving the face clear, and a curly tuft on top.
    const wool = jelly(0xffffff, { roughness: 0.55, clearcoat: 0.2, sheen: 1, iridescence: 0, emissiveIntensity: 0.12 });
    const puff = new THREE.SphereGeometry(1, 20, 14);
    for (let y = -0.55; y <= 1.55; y += 0.22) {
      const r = radiusAt(y), n = Math.max(3, Math.round(r * 14));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + y * 1.7, px = Math.sin(a) * r, pz = Math.cos(a) * r;
        if (pz > 0.15 && Math.abs(px) < 0.78 && y > -0.5 && y < 0.78) continue;  // the face
        const k = 0.2 + r * 0.12;
        body.add(mesh(puff, wool, [px * 1.04, y, pz * 1.04], [k, k, k]));
      }
    }
    for (const [x, y, z, k] of [[0, 0.9, 0.55, 0.2], [-0.24, 0.84, 0.52, 0.17], [0.24, 0.84, 0.52, 0.17]]) body.add(mesh(puff, wool, [x, y, z], [k, k, k]));
    for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.22, 16, 12), glossy(0x5b4a3e), [s * 1.05, 0.42, 0.1], [1.25, 0.45, 0.6]).rotateZ(s * 0.45));
  } else if (kind === 'dragon') {
    dragon(body, skin, model, wings);
  } else if (kind === 'legend') {
    legend(body, model, wings);
  }

  if (!grey) {
    // Glitter: tiny twinkling points all over the skin, more at higher shine; and a soft glow behind.
    const pts = (n: number) => {
      const a: number[] = [];
      for (let i = 0; i < n; i++) {
        const y = -0.85 + Math.random() * 2.4, r = radiusAt(y), t = Math.random() * Math.PI * 2;
        a.push(Math.sin(t) * r * 1.01, y, Math.cos(t) * r * 1.01);
      }
      return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    };
    model.glitter = [0, 1].map(() => {
      const p = new THREE.Points(pts(18 + shine * 22), new THREE.PointsMaterial({ map: glintTexture(), color: shine >= 3 ? 0xfff2b0 : 0xffffff, size: 0.09 + shine * 0.012, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      body.add(p);
      return p;
    });
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: shine >= 3 ? 0xffe58a : 0xcfefff, transparent: true, opacity: 0.25 + shine * 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.scale.setScalar(3.2 + shine * 0.35); aura.position.set(0, 0.5, -0.9);
    body.add(aura); model.aura = aura;
  }
  // The camel's nose sits out on its muzzle: a dark nose with two nostrils and a split lip.
  if (kind === 'camel') {
    body.add(onSurface(mesh(new THREE.SphereGeometry(0.07, 16, 12), glossy(0x6b4a2a), [0, 0, 0], [1.6, 0.8, 0.6]), 0, -0.04, 0.16));
    for (const sx of [-1, 1]) body.add(onSurface(mesh(new THREE.SphereGeometry(0.028, 10, 8), glossy(0x2a1a0e), [0, 0, 0], [1, 1.4, 0.6]), sx * 0.06, -0.05, 0.2));
    body.add(onSurface(mesh(new THREE.CapsuleGeometry(0.012, 0.08, 4, 6), glossy(0x6b4a2a)), 0, -0.17, 0.15));
  }
  // Tails: wagging, long, striped, puffy or tufted, each to its animal.
  const tailOf: Partial<Record<Kind, 'curl' | 'long' | 'stripe' | 'puff' | 'tuft' | 'rainbow'>> = { dog: 'curl', cat: 'long', tiger: 'stripe', bunny: 'puff', sheep: 'puff', bear: 'puff', goat: 'puff', cow: 'tuft', camel: 'tuft', unicorn: 'rainbow' };
  const tk = tailOf[kind];
  if (tk) {
    const tl = new THREE.Group(); tl.position.set(0, -0.5, -0.88);
    if (tk === 'curl') tl.add(tube([[0, 0, 0], [0.08, 0.2, -0.25], [0.12, 0.5, -0.3], [0.02, 0.68, -0.15]], 0.075, skin), mesh(new THREE.SphereGeometry(0.08, 12, 8), skin, [0.02, 0.68, -0.15]));
    if (tk === 'long') tl.add(tube([[0, 0, 0], [0.25, 0.1, -0.3], [0.4, 0.5, -0.35], [0.3, 0.85, -0.25], [0.4, 1.0, -0.15]], 0.06, skin), mesh(new THREE.SphereGeometry(0.065, 12, 8), skin, [0.4, 1.0, -0.15]));
    if (tk === 'stripe') {
      const pts: [number, number, number][] = [[0, 0, 0], [0.25, 0.05, -0.35], [0.45, 0.4, -0.4], [0.4, 0.8, -0.3]];
      tl.add(tube(pts, 0.07, skin), mesh(new THREE.SphereGeometry(0.075, 12, 8), glossy(0x2a1a10), [0.4, 0.8, -0.3]));
      const curve = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q)));
      for (const u of [0.25, 0.45, 0.65, 0.85]) { const at = curve.getPoint(u), dir = curve.getTangent(u); const r = mesh(new THREE.TorusGeometry(0.072, 0.022, 6, 16), glossy(0x2a1a10)); r.position.copy(at); r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); tl.add(r); }
    }
    if (tk === 'puff') tl.add(mesh(new THREE.SphereGeometry(kind === 'sheep' ? 0.22 : 0.17, 16, 12), kind === 'bunny' || kind === 'sheep' ? jelly(0xffffff, { roughness: 0.6 }) : skin, [0, 0.05, -0.05]));
    if (tk === 'tuft') tl.add(tube([[0, 0, 0], [0.05, -0.15, -0.15], [0.08, -0.38, -0.2]], 0.03, skin), mesh(new THREE.SphereGeometry(0.08, 12, 8), glossy(kind === 'cow' ? 0x2b2b2b : 0x8a5a2b), [0.08, -0.42, -0.2], [0.9, 1.4, 0.9]));
    if (tk === 'rainbow') [0xff7ab8, 0xffb547, 0xffe066, 0x6ee0b0, 0x6cb8ff].forEach((c, i) => tl.add(mesh(new THREE.CapsuleGeometry(0.06, 0.5, 6, 10), glossy(c), [(i - 2) * 0.07, -0.1, -0.2]).rotateX(-0.9).rotateZ((i - 2) * 0.12)));
    body.add(tl); model.tail = tl; model.wag = tk === 'curl' ? 9 : 2.5;
  }
  // A nose or nostrils for the animals whose parts above don't give one.
  const nose: Partial<Record<Kind, [number, number]>> = { frog: [0x2b6b35, 2], sheep: [0x5b4a3e, 1], unicorn: [0xff8fb8, 1], goat: [0xb07a7a, 1], monkey: [0x5a3418, 2], snake: [0x1f5a2a, 2], whale: [0x1c3f8a, 2] };
  const nz = nose[kind];
  if (nz) {
    if (nz[1] === 1) body.add(onSurface(mesh(new THREE.SphereGeometry(0.055, 16, 12), glossy(nz[0]), [0, 0, 0], [1.3, 0.9, 0.7]), 0, 0.07));
    else for (const sx of [-1, 1]) body.add(onSurface(mesh(new THREE.SphereGeometry(0.03, 10, 8), glossy(nz[0]), [0, 0, 0], [1, 1.3, 0.6]), sx * 0.07, kind === 'camel' ? -0.08 : 0.06));
  }
  if (shine > 0 && !grey) {
    // Higher levels: gold and white sparkles circling the pet, more of them at each tier.
    const sp = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: GOLD, emissive: 0xffc400, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.2 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const n = shine * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, h = 0.1 + ((i * 7) % n) / n * 1.7;
      const st = mesh(new THREE.OctahedronGeometry(i % 2 ? 0.05 : 0.08), i % 3 ? gold : white, [Math.cos(a) * 1.3, h, Math.sin(a) * 1.3]);
      sp.add(st);
    }
    body.add(sp); model.sparkles = sp;
  }
  if (stage === 'giant' && kind !== 'legend') {
    const gold = glossy(GOLD, { metalness: 0.5 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; body.add(mesh(new THREE.ConeGeometry(0.08, 0.26, 12), gold, [Math.sin(a) * 0.36, 1.42, Math.cos(a) * 0.36])); }
    body.add(mesh(new THREE.TorusGeometry(0.37, 0.05, 10, 40), gold, [0, 1.3, 0]).rotateX(Math.PI / 2));
  }
  return model;
}

// One-time scene parts shared by the live view and the pictures.
function scene(renderer: THREE.WebGLRenderer): { scene: THREE.Scene; shadow: THREE.Mesh } {
  const s = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  s.add(new THREE.HemisphereLight(0xffffff, 0x2f64b8, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 5, 4); s.add(key);
  const rim = new THREE.DirectionalLight(0xcfe8ff, 1.4); rim.position.set(3, 2, -4); s.add(rim);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,30,90,.45)'); g.addColorStop(1, 'rgba(0,30,90,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; s.add(shadow);
  return { scene: s, shadow };
}
function newRenderer(canvas?: HTMLCanvasElement): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !canvas });
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.95;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0x000000, 0);
  return r;
}
function dispose(o: THREE.Object3D): void {
  o.traverse(c => { if (c instanceof THREE.Mesh) { c.geometry.dispose(); (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose()); } });
}

// Still pictures (PNG data URLs) for the collection and the reveal, cached per look.
let still: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; shadow: THREE.Mesh; camera: THREE.PerspectiveCamera } | null = null;
const pictures = new Map<string, string>();
export function petImage(look: Look, size = 220, turn = -0.5): string {
  const key = `${look.kind}-${look.mood}-${look.stage}-${look.shine ?? 0}-${size}-${turn}`;
  const hit = pictures.get(key);
  if (hit) return hit;
  if (!still) {
    const renderer = newRenderer();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    still = { renderer, camera, ...scene(renderer) };
  }
  const { renderer, scene: s, camera } = still;
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const m = build(look);
  m.root.scale.setScalar(SCALE[look.stage] / 0.9);
  m.root.rotation.y = turn;
  if (m.fly) m.root.position.y = 0.3;
  for (let i = 0; i < 40; i++) m.tick?.(0.05 * i + 1, 0.05);
  s.add(m.root);
  camera.position.set(0, 1.5, 7.6); camera.lookAt(0, 1.3, 0);
  renderer.render(s, camera);
  const url = renderer.domElement.toDataURL('image/png');
  s.remove(m.root); dispose(m.root);
  pictures.set(key, url);
  return url;
}

// The little world around the live pet: a round stage with a shallow pool, ripples where it steps
// and lands, bubbles drifting up and soft lights glowing in the back.
// Each animal stands on a stage that fits it: a pond, ice, meadow, desert, jungle, clouds, lava…
type Theme = 'water' | 'ocean' | 'pond' | 'ice' | 'meadow' | 'farm' | 'cushion' | 'forest' | 'jungle' | 'desert' | 'cloud' | 'lava' | 'gold';
const THEME: Record<Kind, Theme> = {
  drop: 'water', whale: 'ocean', frog: 'pond', penguin: 'ice', sheep: 'meadow', goat: 'meadow', horse: 'meadow', cow: 'meadow', bunny: 'meadow',
  mouse: 'farm', rooster: 'farm', pig: 'farm', dog: 'farm', cat: 'cushion', bear: 'forest', tiger: 'jungle', monkey: 'jungle', snake: 'jungle',
  camel: 'desert', unicorn: 'cloud', dragon: 'lava', legend: 'gold',
};
const LOOK: Record<Theme, { side: number; top: number; rim: number; wet?: boolean }> = {
  water: { side: 0x56a8ec, top: 0x5cb8ff, rim: 0xf2fbff, wet: true }, ocean: { side: 0x2f6fd0, top: 0x2f8cf0, rim: 0xe6f4ff, wet: true },
  pond: { side: 0x6b8f4a, top: 0x3fa7a0, rim: 0x8fcf6a, wet: true }, ice: { side: 0xbfe6ff, top: 0xeef9ff, rim: 0xffffff },
  meadow: { side: 0x8a5a33, top: 0x7ccf5a, rim: 0x5fb848 }, farm: { side: 0xb07a45, top: 0xe8c25a, rim: 0xc98a3c },
  cushion: { side: 0xff8fb8, top: 0xffc2d8, rim: 0xffd166 }, forest: { side: 0x6b4a2a, top: 0x4f9a48, rim: 0x3d7a38 },
  jungle: { side: 0x5a3d22, top: 0x2f9a58, rim: 0x1f7a42 }, desert: { side: 0xc9954f, top: 0xf2cf8a, rim: 0xe0b46a },
  cloud: { side: 0xe8f2ff, top: 0xffffff, rim: 0xffe0f4 }, lava: { side: 0x3a2a2a, top: 0x4a3434, rim: 0xff5a1f },
  gold: { side: 0xf6f1e6, top: 0xfffaf0, rim: 0xffc83d },
};
// Small props round the edge of the stage (the middle stays free for walking).
function props(theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const at = (o: THREE.Object3D, a: number, r = 1.3) => { o.position.set(Math.cos(a) * r, o.position.y, Math.sin(a) * r * 0.55); g.add(o); return o; };
  const spots = [0.25, 0.9, 2.3, 2.95, 3.6, 4.2, 5.3, 5.9];
  const flower = (c: number) => { const f = new THREE.Group(); f.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), glossy(0x3d9a3a), [0, 0.08, 0])); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; f.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), glossy(c), [Math.cos(a) * 0.05, 0.17, Math.sin(a) * 0.05])); } f.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), glossy(0xffd34d), [0, 0.18, 0])); return f; };
  const tuft = (c: number) => { const t = new THREE.Group(); for (let i = -1; i <= 1; i++) t.add(mesh(new THREE.ConeGeometry(0.035, 0.22, 6), glossy(c), [i * 0.04, 0.1, 0]).rotateZ(i * 0.3)); return t; };
  if (theme === 'meadow' || theme === 'forest' || theme === 'farm') {
    spots.forEach((a, i) => at(i % 2 ? tuft(theme === 'farm' ? 0xd9a830 : 0x3d9a3a) : flower([0xff7ab8, 0xffffff, 0xb48cff, 0xffd34d][i % 4]), a, 1.25 + (i % 3) * 0.1));
  }
  if (theme === 'forest') for (const a of [0.6, 2.6, 4.7]) { const m = new THREE.Group(); m.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 10), glossy(0xfff4e0), [0, 0.08, 0]), mesh(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glossy(0xe0302c), [0, 0.15, 0])); for (let i = 0; i < 4; i++) m.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), flat(0xffffff), [Math.cos(i * 1.6) * 0.08, 0.25, Math.sin(i * 1.6) * 0.08])); at(m, a, 1.3); }
  if (theme === 'farm') for (const a of [1.5, 4.6]) at(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 16), glossy(0xe8c25a, { roughness: 0.7 }), [0, 0.11, 0]).rotateZ(Math.PI / 2), a, 1.3);
  if (theme === 'pond') for (const [a, r] of [[0.5, 1.1], [2.5, 1.2], [4.3, 1.15]]) { const pad = new THREE.Group(); pad.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24, 1, false, 0.3, Math.PI * 1.8), glossy(0x2fa84a), [0, 0.02, 0])); if (a === 2.5) pad.add(mesh(new THREE.SphereGeometry(0.07, 12, 8), glossy(0xff8fc7), [0, 0.08, 0], [1, 0.8, 1])); at(pad, a, r); }
  if (theme === 'ice') for (const a of spots) at(mesh(new THREE.BoxGeometry(0.2, 0.16 + (a % 1) * 0.15, 0.18), new THREE.MeshPhysicalMaterial({ color: 0xd6f1ff, roughness: 0.05, transmission: 0, clearcoat: 1, transparent: true, opacity: 0.85 }), [0, 0.1, 0]).rotateY(a), a, 1.32);
  if (theme === 'ocean') for (const a of [0.4, 1.8, 3.3, 4.9]) at(mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20, Math.PI), glossy(0xffffff), [0, 0.03, 0]), a, 1.25);
  if (theme === 'jungle') for (const a of spots) { const leaf = mesh(new THREE.SphereGeometry(0.22, 12, 8), glossy(a % 2 > 1 ? 0x2fae5a : 0x1f8a46), [0, 0.12, 0], [0.45, 0.12, 1]); leaf.rotation.set(0.6, a, 0.4); at(leaf, a, 1.35); }
  if (theme === 'desert') { for (const a of [0.3, 2.8, 4.5]) at(mesh(new THREE.SphereGeometry(0.3, 16, 10), glossy(0xf0c47a, { roughness: 0.8 }), [0, 0, 0], [1.4, 0.45, 1]), a, 1.25); for (const a of [1.3, 3.7, 5.6]) at(mesh(new THREE.DodecahedronGeometry(0.07), glossy(0xa98a6a), [0, 0.05, 0]), a, 1.35); }
  if (theme === 'cushion') for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) at(mesh(new THREE.SphereGeometry(0.08, 12, 8), glossy(0xffd166, { metalness: 0.4 }), [0, 0.02, 0]), a, 1.55);
  if (theme === 'cloud') { for (let i = 0; i < 12; i++) at(mesh(new THREE.SphereGeometry(0.2 + (i % 3) * 0.05, 16, 10), jelly(0xffffff, { iridescence: 0.6 }), [0, 0.02, 0]), (i / 12) * Math.PI * 2, 1.55); ['#ff7ab8', '#ffb547', '#ffe066', '#6ee0b0', '#6cb8ff'].forEach((c, i) => g.add(mesh(new THREE.TorusGeometry(1.6 - i * 0.1, 0.05, 8, 48, Math.PI), glossy(new THREE.Color(c).getHex(), { emissive: new THREE.Color(c), emissiveIntensity: 0.25 }), [0, 0, -0.75]))); }
  if (theme === 'lava') { for (const a of spots) at(mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshStandardMaterial({ color: 0xff3b1f, emissive: 0xff4a10, emissiveIntensity: 0.9, roughness: 0.3 }), [0, 0.12, 0], [0.7, 1.6, 0.7]).rotateY(a), a, 1.35); for (const a of [0.8, 2.2, 3.9, 5.2]) { const crack = mesh(new THREE.BoxGeometry(0.5, 0.01, 0.04), new THREE.MeshBasicMaterial({ color: 0xff7a1a }), [0, 0.012, 0]); crack.rotation.y = a; at(crack, a, 0.8); } }
  if (theme === 'gold') { for (const a of spots) { const p = new THREE.Group(); p.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.36, 14), glossy(0xfffaf0), [0, 0.18, 0]), mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshStandardMaterial({ color: GOLD, emissive: 0xffb300, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.2 }), [0, 0.42, 0])); at(p, a, 1.42); } }
  return g;
}

// Little things that float round the stage with the bubbles, one kind per stage theme.
type Floater = 'drop' | 'petal' | 'snow' | 'leaf' | 'heart' | 'star' | 'rainbow' | 'ember' | 'sand' | 'gold';
const FLOAT: Record<Theme, Floater> = { water: 'drop', ocean: 'drop', pond: 'petal', ice: 'snow', meadow: 'petal', farm: 'gold', cushion: 'heart', forest: 'leaf', jungle: 'leaf', desert: 'sand', cloud: 'rainbow', lava: 'ember', gold: 'star' };
const floatTex = new Map<string, THREE.CanvasTexture>();
function floaterTexture(kind: Floater, hue = 0): THREE.CanvasTexture {
  const key = `${kind}-${hue}`, hit = floatTex.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.translate(32, 32);
  const star = (r: number, fill: string) => { x.fillStyle = fill; x.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); };
  if (kind === 'drop') { x.fillStyle = '#bfe8ff'; x.beginPath(); x.moveTo(0, -24); x.bezierCurveTo(14, -6, 18, 4, 18, 10); x.arc(0, 10, 18, 0, Math.PI); x.bezierCurveTo(-18, 4, -14, -6, 0, -24); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.ellipse(-7, 4, 3, 7, -0.4, 0, Math.PI * 2); x.fill(); }
  if (kind === 'petal') { x.fillStyle = ['#ff9cc8', '#ffffff', '#ffd1e6', '#ffe38a'][hue % 4]; x.beginPath(); x.ellipse(0, 0, 11, 22, 0.5, 0, Math.PI * 2); x.fill(); }
  if (kind === 'snow') { x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.lineCap = 'round'; for (let i = 0; i < 6; i++) { x.rotate(Math.PI / 3); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -24); x.moveTo(0, -14); x.lineTo(7, -20); x.moveTo(0, -14); x.lineTo(-7, -20); x.stroke(); } }
  if (kind === 'leaf') { x.fillStyle = ['#3fbf5a', '#7fd34a', '#2f9a48'][hue % 3]; x.beginPath(); x.ellipse(0, 0, 12, 24, 0.6, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-12, 16); x.lineTo(12, -16); x.stroke(); }
  if (kind === 'heart') { x.fillStyle = ['#ff6b9a', '#ff9cc8', '#ff4d6d'][hue % 3]; x.beginPath(); x.moveTo(0, 20); x.bezierCurveTo(-30, -2, -14, -26, 0, -10); x.bezierCurveTo(14, -26, 30, -2, 0, 20); x.fill(); }
  if (kind === 'star' || kind === 'gold') star(26, kind === 'star' ? '#ffd34d' : '#ffe9a0');
  if (kind === 'rainbow') star(26, ['#ff7ab8', '#ffb547', '#ffe066', '#6ee0b0', '#6cb8ff', '#b48cff'][hue % 6]);
  if (kind === 'ember') { const g = x.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, '#fff5b0'); g.addColorStop(0.3, '#ff9a1a'); g.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = g; x.fillRect(-32, -32, 64, 64); }
  if (kind === 'sand') { x.fillStyle = '#f2cf8a'; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc((i - 2) * 9, Math.sin(i) * 8, 5, 0, Math.PI * 2); x.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  floatTex.set(key, t);
  return t;
}

function world(s: THREE.Scene) {
  const g = new THREE.Group();
  s.add(g);
  let current: Theme | null = null;
  const theme = (kind: Kind) => {
    const t = THEME[kind];
    if (t === current) return;
    current = t;
    g.children.slice().forEach(c => { g.remove(c); dispose(c); });
    const l = LOOK[t], base = new THREE.Group();
    base.scale.set(1, 1, 0.55);
    base.add(mesh(new THREE.CylinderGeometry(1.62, 1.3, 0.3, 72), jelly(l.side, { iridescence: 0.3, emissiveIntensity: 0.1 }), [0, -0.15, 0]));
    base.add(mesh(new THREE.TorusGeometry(1.58, 0.07, 16, 96), t === 'lava' ? new THREE.MeshStandardMaterial({ color: l.rim, emissive: 0xff4a10, emissiveIntensity: 0.8 }) : glossy(l.rim, t === 'gold' ? { metalness: 0.6, roughness: 0.2 } : {}), [0, 0, 0]).rotateX(Math.PI / 2));
    base.add(mesh(new THREE.CircleGeometry(1.52, 72), glossy(l.top, l.wet ? { roughness: 0.04, transparent: true, opacity: 0.9 } : { roughness: t === 'ice' ? 0.05 : 0.6, clearcoat: t === 'ice' || t === 'gold' ? 1 : 0.2 }), [0, 0.005, 0]).rotateX(-Math.PI / 2));
    g.add(base, props(t));
    // This stage's floaters.
    const kindOf = FLOAT[t];
    floaters.forEach((f, i) => {
      f.sp.material.map = floaterTexture(kindOf, i);
      f.sp.material.blending = kindOf === 'ember' ? THREE.AdditiveBlending : THREE.NormalBlending;
      f.sp.material.needsUpdate = true;
      f.fall = kindOf === 'snow' || kindOf === 'leaf' || kindOf === 'petal';
      f.drift = kindOf === 'sand' ? 0.5 : 0;
      f.reset(Math.random() * 3.4);
    });
  };
  const floaters = Array.from({ length: 14 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    s.add(sp);
    const f = { sp, fall: false, drift: 0, speed: 0, wob: 0, x0: 0, spin: 0, reset(y: number) {
      f.x0 = (Math.random() * 2 - 1) * 2.4; f.speed = 0.2 + Math.random() * 0.35; f.wob = Math.random() * 6; f.spin = (Math.random() - 0.5) * 2;
      sp.position.set(f.x0, f.fall ? 3.4 - y : y - 0.2, -1 + Math.random() * 1.6);
      sp.scale.setScalar(0.13 + Math.random() * 0.12);
    } };
    return f;
  });

  const rings = Array.from({ length: 6 }, () => {
    const r = mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }), [0, 0.02, 0]);
    r.rotation.x = -Math.PI / 2; s.add(r);
    return { r, age: 9 };
  });
  let next = 0;
  const ripple = (x: number, size = 1) => { const k = rings[next++ % rings.length]; k.age = 0; k.r.position.x = x; k.r.userData.size = size; };

  const dot = document.createElement('canvas'); dot.width = dot.height = 64;
  const c = dot.getContext('2d')!, rg = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.4, 'rgba(255,255,255,.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = rg; c.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(dot);
  const lights = Array.from({ length: 9 }, (_, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i % 3 ? 0xffffff : 0x9fe3ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 }));
    const size = 0.6 + Math.random() * 1.1;
    sp.scale.set(size, size, 1);
    sp.position.set((Math.random() * 2 - 1) * 3.4, 0.6 + Math.random() * 3, -3 - Math.random() * 2);
    s.add(sp);
    return { sp, phase: Math.random() * 6 };
  });
  const bubbleMat = rim(0xffffff, 1.6, 1.1);
  const shine = flat(0xffffff, 0.85);
  const bubbles = Array.from({ length: 12 }, () => {
    const b = new THREE.Group();
    b.add(mesh(new THREE.SphereGeometry(1, 20, 14), bubbleMat), mesh(new THREE.SphereGeometry(0.22, 8, 6), shine, [-0.38, 0.4, 0.8]));
    s.add(b);
    const o = { b, speed: 0, wob: 0, x: 0 };
    const reset = (y = Math.random() * 3) => { o.x = (Math.random() * 2 - 1) * 2.4; o.speed = 0.25 + Math.random() * 0.35; o.wob = Math.random() * 6; b.position.set(o.x, y, -0.8 + Math.random() * 1.2); b.scale.setScalar(0.04 + Math.random() * 0.07); };
    reset();
    return { o, reset };
  });

  return {
    theme,
    ripple,
    update(dt: number, t: number, still: boolean) {
      for (const k of rings) {
        k.age += dt;
        const a = Math.min(k.age / 1.3, 1), size = (k.r.userData.size as number | undefined) ?? 1;
        k.r.scale.set((0.15 + a * 1.2) * size, (0.15 + a * 1.2) * size * 0.55, 1);
        (k.r.material as THREE.MeshBasicMaterial).opacity = a < 1 ? 0.55 * (1 - a) : 0;
      }
      for (const l of lights) (l.sp.material as THREE.SpriteMaterial).opacity = 0.22 + Math.sin(t * 0.8 + l.phase) * 0.14;
      if (still) return;
      for (const f of floaters) {
        f.sp.position.y += (f.fall ? -1 : 1) * f.speed * dt;
        f.x0 += f.drift * dt;
        f.sp.position.x = f.x0 + Math.sin(t * 1.3 + f.wob) * 0.25;
        f.sp.material.rotation += f.spin * dt;
        const y = f.sp.position.y;
        f.sp.material.opacity = Math.min(1, (y + 0.2) / 0.5, (3.4 - y) / 0.5);
        if (y > 3.4 || y < -0.3 || f.x0 > 2.8) { f.reset(0); if (f.drift) f.x0 = -2.8; }
      }
      for (const { o, reset } of bubbles) {
        o.b.position.y += o.speed * dt;
        o.b.position.x = o.x + Math.sin(t * 1.5 + o.wob) * 0.12;
        if (o.b.position.y > 3.6) reset(0);
      }
    },
  };
}

export interface Pet3D { set(look: Look, roam: boolean): void; fill(share: number): void; hop(): void; eat(): void; cheer(): void; dragged(): boolean; destroy(): void }

// The live pet: idles, blinks, waddles left and right, looks at the finger, spins when dragged and
// hops when tapped. Rendering stops while the page is hidden or the view is off screen.
// `stage: false` leaves out the round stage and the floaters (the home gauge draws its own frame).
export function mountPet3d(host: HTMLElement, { stage = true } = {}): Pet3D {
  const canvas = document.createElement('canvas');
  canvas.className = 'pet3d';
  host.append(canvas);
  const renderer = newRenderer(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.localClippingEnabled = true;
  // Battery saver: under 25% and not charging it draws about 20 frames a second instead of 60.
  let lowPower = false;
  type Battery = EventTarget & { level: number; charging: boolean };
  void (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery?.().then(b => {
    const check = () => { lowPower = b.level < 0.25 && !b.charging; };
    check(); b.addEventListener('levelchange', check); b.addEventListener('chargingchange', check);
  }).catch(() => { /* no battery info: full speed */ });
  let wait = 0;
  const { scene: s, shadow } = scene(renderer);
  const env = stage ? world(s) : { theme() {}, ripple() {}, update() {} };
  let stepT = 0;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.6, stage ? 7.6 : 5.4); camera.lookAt(0, 1.25, 0);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let model: Model | null = null, look: Look | null = null, roam = false;
  let x = 0, target = 0, pause = 1.5, face = 0, y = 0, vy = 0, squash = 0, spin = 0, spinV = 0, blink = 3;
  let full = 0, level = 0;
  const at = new THREE.Vector3();
  let eating = 0, cheering = 0, dragX: number | null = null, moved = 0, lookX = 0, lookY = 0;

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  const halfWidth = () => Math.min(0.6, Math.max(0.3, Math.tan((camera.fov * Math.PI) / 360) * 7.6 * camera.aspect - 1.1));

  canvas.addEventListener('pointerdown', e => { dragX = e.clientX; moved = 0; });
  addEventListener('pointermove', e => {
    const b = canvas.getBoundingClientRect();
    lookX = Math.max(-1, Math.min(1, (e.clientX - b.left) / b.width * 2 - 1));
    lookY = Math.max(-1, Math.min(1, (e.clientY - b.top) / b.height * 2 - 1));
    if (dragX === null) return;
    const dx = e.clientX - dragX; dragX = e.clientX; moved += Math.abs(dx);
    spinV = dx * 0.012; spin += spinV;
  });
  addEventListener('pointerup', () => { dragX = null; });

  const clock = new THREE.Clock();
  let visible = true, raf = 0;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) loop(); });
  io.observe(host);
  const onVis = () => { if (!document.hidden) loop(); };
  document.addEventListener('visibilitychange', onVis);

  function frame(dt: number, t: number): void {
    if (!model || !look) return;
    const { root, body, eyes, armL, armR } = model;
    const asleep = look.mood === 'weak';
    // Walking: pick a spot, waddle there facing it, rest, sometimes hop.
    let walking = false;
    if (roam && !eating && !still) {
      if (pause > 0) { pause -= dt; if (pause <= 0) { target = (Math.random() * 2 - 1) * halfWidth(); if (Math.random() < 0.3 && y === 0) vy = 4; } }
      else { const d = target - x; if (Math.abs(d) < 0.03) pause = 1.6 + Math.random() * 2.4; else { x += Math.sign(d) * Math.min(Math.abs(d), dt * 0.9); walking = true; } }
    } else x += (0 - x) * Math.min(1, dt * 3);
    face += ((walking ? Math.sign(target - x) * 0.75 : lookX * 0.35) - face) * Math.min(1, dt * 5);
    // Hops.
    if (y > 0 || vy > 0) { vy -= 13 * dt; y += vy * dt; if (y <= 0) { y = 0; vy = 0; squash = 0.22; env.ripple(x, 1.2); } }
    squash *= Math.exp(-dt * 7);
    if (cheering > 0) { cheering -= dt; if (y === 0 && cheering > 0.3) vy = 4.2; spin += dt * 9; }
    if (dragX === null) { spin += spinV; spinV *= Math.exp(-dt * 4); if (Math.abs(spinV) < 0.002) { const back = Math.round(spin / (Math.PI * 2)) * Math.PI * 2; spin += (back - spin) * Math.min(1, dt * 3); } }

    const breathe = still ? 0 : Math.sin(t * 2.4) * 0.025;
    const step = walking ? Math.abs(Math.sin(t * 11)) * 0.09 : 0;
    const chomp = eating > 0 ? Math.abs(Math.sin(t * 16)) * 0.1 : 0;
    const lift = model.fly && !asleep ? 0.3 + (still ? 0 : Math.sin(t * 1.8) * 0.1) : 0;
    root.position.set(x, y + lift + step + (still || asleep ? 0 : Math.sin(t * 2) * 0.04), 0);
    model.tick?.(t, dt);
    root.rotation.y = face + spin;
    root.rotation.z = walking ? Math.sin(t * 11) * 0.09 : 0;
    root.rotation.x = asleep ? 0 : lookY * 0.12;
    const sq = squash + chomp;
    body.scale.set(1 + sq * 0.6 - breathe * 0.5, 1 - sq + breathe, 1 + sq * 0.6 - breathe * 0.5);
    if (eating > 0) eating -= dt;
    stepT -= dt;
    if ((walking || eating > 0) && stepT <= 0) { env.ripple(x + (Math.random() - 0.5) * 0.4, 0.55); stepT = walking ? 0.45 : 0.3; }
    env.update(dt, t, still);
    // Blinks, waving and flapping.
    blink -= dt;
    eyes.scale.y = blink < 0.12 && blink > 0 && (look.mood === 'good' || look.mood === 'thirsty') ? 0.15 : 1;
    if (blink < 0) blink = 2.5 + Math.random() * 3;
    if (look.mood === 'joyful' && !still) armR.rotation.z = 2.3 + Math.sin(t * 8) * 0.35;
    else armR.rotation.z = 0.45 + (walking ? Math.sin(t * 11) * 0.3 : 0);
    if (look.mood !== 'joyful') armL.rotation.z = -0.45 - (walking ? Math.sin(t * 11) * 0.3 : 0);
    if (eating > 0) { armL.rotation.z = -1.4; armR.rotation.z = 1.4; }
    model.wings.forEach((w, i) => { w.rotation.y = (i ? -1 : 1) * (0.25 + Math.sin(t * (walking || y > 0 ? 14 : 4)) * 0.25); });
    if (model.halo) model.halo.rotation.z = t * 0.8;
    model.glitter?.forEach((p, i) => { (p.material as THREE.PointsMaterial).opacity = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.2 + i * 1.6)); });
    if (model.aura) model.aura.material.opacity = (0.25 + (look.shine ?? 0) * 0.08) * (0.8 + Math.sin(t * 1.6) * 0.2);
    if (model.tail) model.tail.rotation.z = Math.sin(t * (model.wag ?? 2) + (eating > 0 ? t * 6 : 0)) * (model.wag === 9 ? 0.45 : 0.15);
    if (model.spout) { const k = (t * 1.2) % 1; model.spout.scale.set(1 + k * 0.4, 0.6 + Math.sin(k * Math.PI) * 0.8, 1 + k * 0.4); }
    if (model.sparkles) { model.sparkles.rotation.y = t * 0.7; model.sparkles.children.forEach((c, i) => { c.rotation.y = t * 3 + i; c.scale.setScalar(0.7 + Math.abs(Math.sin(t * 3 + i)) * 0.6); }); }
    if (model.sweat) { const k = (t * 0.6) % 1; model.sweat.position.y = 0.75 - k * 0.35; model.sweat.scale.setScalar(k < 0.85 ? 1 : (1 - k) * 6); }
    if (model.water) {
      // The water rises towards `full`, sloshing a little; the plane stays level while the body sways.
      level += (full - level) * (still ? 1 : Math.min(1, dt * 2.5));
      const ly = -0.86 + level * 2.25, slosh = still ? 0 : Math.sin(t * 3.1) * 0.06 * (walking || y > 0 || eating > 0 ? 2 : 0.5);
      const { plane, inner, surface } = model.water;
      inner.visible = surface.visible = level > 0.01;
      surface.position.y = ly;
      surface.scale.setScalar(Math.max(0.001, radiusAt(ly / 0.95) * 0.93));
      surface.rotation.set(-Math.PI / 2 + slosh, 0, slosh * 0.6);
      body.updateWorldMatrix(true, false);
      plane.constant = body.localToWorld(at.set(0, ly, 0)).y;
    }
    const sc = SCALE[look.stage] * (1 / (1 + (y + lift) * 0.25));
    shadow.position.x = root.position.x; shadow.scale.set(sc, sc, sc);
  }
  function loop(): void {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!visible || document.hidden) return;
      raf = requestAnimationFrame(tick);
      wait += clock.getDelta();
      if (lowPower && wait < 0.05) return;
      const dt = Math.min(wait, 0.06);
      wait = 0;
      frame(dt, clock.elapsedTime);
      renderer.render(s, camera);
    };
    clock.getDelta();
    raf = requestAnimationFrame(tick);
  }
  loop();

  return {
    set(next, r) {
      roam = r;
      if (look && look.kind === next.kind && look.mood === next.mood && look.stage === next.stage && look.shine === next.shine && look.water === next.water) return;
      look = next;
      if (model) { s.remove(model.root); dispose(model.root); }
      model = build(next);
      env.theme(next.kind);
      model.root.scale.setScalar(SCALE[next.stage]);
      s.add(model.root);
    },
    fill(share) { full = Math.max(0, Math.min(1, share)); },
    hop() { if (y === 0) { vy = 4.6; spinV = 0.25; } },
    eat() { eating = 1.6; x *= 0.3; pause = 2; },
    cheer() { cheering = 1.4; },
    dragged() { return moved > 6; },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (model) dispose(model.root); renderer.dispose(); canvas.remove(); },
  };
}
