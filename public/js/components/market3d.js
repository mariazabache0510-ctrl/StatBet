import * as THREE from '/vendor/three/three.module.js';

/**
 * Mesa de la bolsa en 3D para el proyector. Solo dibuja: el estado del juego llega desde la
 * vista (setMode, setPot, reveal, setPodium) y el texto vive en capas HTML ancladas con anchor().
 */

const PALETTE = {
  pink: { base: '#ff4f9a', dark: '#b8175f', light: '#ff9cc6' },
  cyan: { base: '#22d3ee', dark: '#0a7d99', light: '#a5f3fc' },
  violet: { base: '#a78bfa', dark: '#5b3cc4', light: '#d8ccff' },
  gold: { base: '#fbbf24', dark: '#a86f00', light: '#fde68a' },
  pearl: { base: '#e8ebff', dark: '#8d95c9', light: '#ffffff' },
};
const CHIP_R = 0.42;
const CHIP_H = 0.12;
const TABLE_RX = 7;
const SQUASH = 0.6;
const CAPACITY = 560;

const ZONES = {
  pot: new THREE.Vector3(0, 0, 0.55),
  true: new THREE.Vector3(-3.7, 0, 0.35),
  false: new THREE.Vector3(3.7, 0, 0.35),
  bank: new THREE.Vector3(0, 4.5, -7),
};

const CAMERA = {
  lobby: { r: 14.5, h: 7.2, look: [0, 1.4, 0], orbit: 0.55, speed: 0.06 },
  betting: { r: 12.6, h: 8.4, look: [0, 0.4, 0.6], orbit: 0.2, speed: 0.05 },
  closed: { r: 10.8, h: 6.6, look: [0, 0.6, 0.6], orbit: 0.12, speed: 0.08 },
  revealed: { r: 15.2, h: 10.6, look: [0, 0.2, 0.2], orbit: 0.08, speed: 0.05 },
  finished: { r: 13.5, h: 6.4, look: [0, 1.6, 0], orbit: 0.4, speed: 0.05 },
  podium: { r: 14, h: 6.4, look: [0, 1.5, 0], orbit: 0.2, speed: 0.06 },
};

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function easeOutBounce(t) {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function chipFace(colors) {
  return canvasTexture(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = colors.base;
    g.beginPath();
    g.arc(c, c, c, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(c, c);
      g.rotate((i * Math.PI) / 4);
      g.fillRect(-14, -c, 28, 34);
      g.restore();
    }
    g.fillStyle = colors.dark;
    g.beginPath();
    g.arc(c, c, c * 0.66, 0, Math.PI * 2);
    g.fill();
    const grad = g.createRadialGradient(c - 20, c - 24, 6, c, c, c * 0.6);
    grad.addColorStop(0, colors.light);
    grad.addColorStop(1, colors.base);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, c * 0.6, 0, Math.PI * 2);
    g.fill();
    g.setLineDash([12, 10]);
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(c, c, c * 0.52, 0, Math.PI * 2);
    g.stroke();
  });
}

function chipEdge(colors) {
  const tex = canvasTexture(256, 32, (g, w, h) => {
    g.fillStyle = colors.base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 10, 0, 12, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, h - 3, w, 3);
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Fieltro: elipse con las zonas VERDADERO / FALSO y la bolsa central. Se dibuja estirado porque el grupo lo achata. */
function feltTexture() {
  return canvasTexture(2048, 2048, (g, w) => {
    const c = w / 2;
    const toCanvas = (v) => [c + (v.x / TABLE_RX) * c, c + (v.z / SQUASH / TABLE_RX) * c];
    const felt = g.createRadialGradient(c, c, 80, c, c, c);
    felt.addColorStop(0, '#1d2766');
    felt.addColorStop(0.7, '#141b4d');
    felt.addColorStop(1, '#0d1238');
    g.fillStyle = felt;
    g.beginPath();
    g.arc(c, c, c, 0, Math.PI * 2);
    g.fill();

    g.strokeStyle = 'rgba(200,210,255,0.10)';
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, w);
      g.stroke();
      g.beginPath();
      g.moveTo(0, x);
      g.lineTo(w, x);
      g.stroke();
    }
    g.globalCompositeOperation = 'destination-in';
    g.beginPath();
    g.arc(c, c, c - 6, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';

    g.lineWidth = 6;
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.arc(c, c, c - 70, 0, Math.PI * 2);
    g.stroke();

    const zone = (v, color, label) => {
      const [x, y] = toCanvas(v);
      const zw = 560;
      const zh = 620;
      g.save();
      g.translate(x, y);
      const fill = g.createLinearGradient(0, -zh / 2, 0, zh / 2);
      fill.addColorStop(0, `${color}38`);
      fill.addColorStop(1, `${color}10`);
      g.fillStyle = fill;
      g.strokeStyle = color;
      g.lineWidth = 10;
      g.beginPath();
      g.roundRect(-zw / 2, -zh / 2, zw, zh, 70);
      g.fill();
      g.stroke();
      g.scale(1, 1 / SQUASH);
      g.fillStyle = color;
      g.font = '800 92px Sora, Inter, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, 0, (zh / 2) * SQUASH - 62);
      g.restore();
    };
    zone(ZONES.true, '#22d3ee', 'VERDADERO');
    zone(ZONES.false, '#ff4f9a', 'FALSO');

    const [px, py] = toCanvas(ZONES.pot);
    g.save();
    g.translate(px, py);
    g.setLineDash([26, 20]);
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(167,139,250,0.85)';
    g.beginPath();
    g.arc(0, 0, 250, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.scale(1, 1 / SQUASH);
    g.fillStyle = 'rgba(216,204,255,0.55)';
    g.font = '800 64px Sora, Inter, sans-serif';
    g.textAlign = 'center';
    g.fillText('BOLSA', 0, -175 * SQUASH);
    g.restore();

    g.save();
    g.translate(c, c - 760);
    g.scale(1, 1 / SQUASH);
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.font = '800 80px Sora, Inter, sans-serif';
    g.textAlign = 'center';
    g.fillText('STATBET', 0, 0);
    g.restore();
  });
}

function glowTexture() {
  return canvasTexture(512, 512, (g, w) => {
    const c = w / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,79,154,0.35)');
    grad.addColorStop(0.45, 'rgba(120,90,230,0.18)');
    grad.addColorStop(0.75, 'rgba(34,211,238,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });
}

/** Grupo de instancias de un color. */
class Pool {
  constructor(scene, colors) {
    const geo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 40, 1, false);
    const face = new THREE.MeshStandardMaterial({ map: chipFace(colors), roughness: 0.45, metalness: 0.08 });
    const edge = new THREE.MeshStandardMaterial({ map: chipEdge(colors), roughness: 0.5, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(geo, [edge, face, face], CAPACITY);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.free = [];
    for (let i = CAPACITY - 1; i >= 0; i--) {
      this.free.push(i);
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    scene.add(this.mesh);
  }
  take() {
    return this.free.pop() ?? null;
  }
  release(i) {
    this.mesh.setMatrixAt(i, HIDDEN);
    this.free.push(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

export function createMarketScene(canvas) {
  if (!supportsWebGL()) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1026, 20, 46);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 120);

  // Luces: llave blanca con sombras + rellenos rosa (derecha) y cian (izquierda).
  scene.add(new THREE.HemisphereLight(0xffd0e6, 0x0b1026, 0.75));
  scene.add(new THREE.AmbientLight(0x6070c0, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(3, 13, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 2, far: 30 });
  key.shadow.bias = -0.0015;
  key.shadow.radius = 4;
  scene.add(key);
  const cyanLight = new THREE.PointLight(0x22d3ee, 40, 16, 2);
  cyanLight.position.set(-5, 3.2, 2.5);
  const pinkLight = new THREE.PointLight(0xff4f9a, 40, 16, 2);
  pinkLight.position.set(5, 3.2, 2.5);
  scene.add(cyanLight, pinkLight);

  // Mesa
  const table = new THREE.Group();
  table.scale.set(1, 1, SQUASH);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(TABLE_RX, TABLE_RX * 0.97, 0.5, 96),
    new THREE.MeshStandardMaterial({ color: 0x0f1540, roughness: 0.7, metalness: 0.2 }),
  );
  body.position.y = -0.26;
  body.receiveShadow = true;
  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE_RX * 2, TABLE_RX * 2),
    new THREE.MeshStandardMaterial({ map: feltTexture(), transparent: true, roughness: 0.92 }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 0.002;
  felt.receiveShadow = true;
  const rimGeo = new THREE.TorusGeometry(TABLE_RX + 0.05, 0.2, 18, 120, Math.PI);
  const rimMat = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.6 });
  const rimCyan = new THREE.Mesh(rimGeo, rimMat(0x22d3ee));
  rimCyan.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  const rimPink = new THREE.Mesh(rimGeo, rimMat(0xff4f9a));
  rimPink.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  rimCyan.position.y = rimPink.position.y = 0.02;
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(TABLE_RX * 0.55, TABLE_RX * 0.7, 1.4, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a0e2e, roughness: 0.8, metalness: 0.3 }),
  );
  pedestal.position.y = -1.2;
  table.add(body, felt, rimCyan, rimPink, pedestal);
  scene.add(table);

  // Piso: resplandor rosa/cian y rejilla que se pierde en la niebla.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -1.88;
  scene.add(glow);
  const grid = new THREE.GridHelper(80, 64, 0x3a2a7a, 0x1a2156);
  grid.position.y = -1.9;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  // Polvo de luz flotando
  const dustCount = 260;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);
  const pink = new THREE.Color(0xff7ab6);
  const cyan = new THREE.Color(0x67e8f9);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 30;
    dustPos[i * 3 + 1] = Math.random() * 10 - 1;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 22 - 3;
    const col = Math.random() < 0.5 ? pink : cyan;
    dustCol.set([col.r, col.g, col.b], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // Ficha protagonista (sala de espera)
  const heroGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.34, 72);
  const heroFace = new THREE.MeshStandardMaterial({ map: heroTexture(), roughness: 0.35, metalness: 0.15 });
  const heroEdge = new THREE.MeshStandardMaterial({ map: chipEdge({ base: '#c05cf0' }), roughness: 0.4, metalness: 0.2 });
  heroEdge.map.repeat.set(3, 1);
  const hero = new THREE.Mesh(heroGeo, [heroEdge, heroFace, heroFace]);
  hero.castShadow = true;
  hero.rotation.order = 'YXZ';
  hero.position.set(0, 2.8, 0.2);
  scene.add(hero);

  const pools = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, new Pool(scene, v)]));
  const chips = [];
  const groups = { pot: [], true: [], false: [], p1: [], p2: [], p3: [] };
  const anchors = new Map();
  const mat = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();

  let mode = 'lobby';
  let lightBoost = { true: 0, false: 0 };
  const camState = { pos: new THREE.Vector3(0, 9, 16), look: new THREE.Vector3(0, 1, 0) };
  camera.position.copy(camState.pos);

  // Cada grupo apila fichas en columnas alrededor de su centro.
  const LAYOUTS = {
    pot: { center: ZONES.pot, cols: 7, spread: 0.92 },
    true: { center: ZONES.true, cols: 7, spread: 0.92 },
    false: { center: ZONES.false, cols: 7, spread: 0.92 },
    p1: { center: new THREE.Vector3(0, 0, 0.4), cols: 1, spread: 0 },
    p2: { center: new THREE.Vector3(-3.2, 0, 0.6), cols: 1, spread: 0 },
    p3: { center: new THREE.Vector3(3.2, 0, 0.6), cols: 1, spread: 0 },
  };
  function slot(group, k) {
    const L = LAYOUTS[group];
    const col = k % L.cols;
    const level = Math.floor(k / L.cols);
    const pos = L.center.clone();
    if (col > 0) {
      const a = (col - 1) * ((Math.PI * 2) / (L.cols - 1)) + 0.3;
      pos.x += Math.cos(a) * L.spread;
      pos.z += Math.sin(a) * L.spread * 0.85;
    }
    pos.y = CHIP_H / 2 + level * (CHIP_H + 0.004);
    return pos;
  }
  const groupTop = (group) => {
    const n = groups[group].length;
    const L = LAYOUTS[group];
    return L.center.clone().setY(CHIP_H * Math.ceil(n / L.cols) + 0.4);
  };

  function spawn(color, group, { from, lift = 6, delay = 0, dur = 0.9, kind = 'drop' } = {}) {
    const pool = pools[color];
    const index = pool.take();
    if (index === null) return null;
    const k = groups[group].length;
    const to = slot(group, k);
    const chip = {
      pool, index, color, group,
      from: from ?? to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, lift + Math.random() * 2, (Math.random() - 0.5) * 1.2)),
      to,
      t: reduced ? 1 : -delay,
      dur, kind,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 8,
      remove: false,
    };
    groups[group].push(chip);
    chips.push(chip);
    return chip;
  }

  function sendAway(chip, target, delay = 0) {
    chip.from = currentPos(chip);
    chip.to = target.clone();
    chip.t = reduced ? 1 : -delay;
    chip.dur = 1.1;
    chip.kind = 'fly';
    chip.remove = true;
    chip.settled = false;
  }

  function currentPos(chip) {
    const k = Math.max(0, Math.min(1, chip.t / chip.dur));
    if (chip.kind === 'drop') {
      const e = easeOutBounce(k);
      return new THREE.Vector3().lerpVectors(chip.from, chip.to, e);
    }
    const e = easeInOut(k);
    const p = new THREE.Vector3().lerpVectors(chip.from, chip.to, e);
    p.y += Math.sin(Math.PI * k) * (chip.arc ?? 2.2);
    return p;
  }

  function removeChip(chip) {
    chip.pool.release(chip.index);
    const gi = groups[chip.group]?.indexOf(chip);
    if (gi >= 0) groups[chip.group].splice(gi, 1);
    const ci = chips.indexOf(chip);
    if (ci >= 0) chips.splice(ci, 1);
  }

  function clearAll({ animate = true } = {}) {
    for (const chip of [...chips]) {
      if (animate && !reduced) {
        if (chip.remove) continue;
        const g = groups[chip.group];
        const gi = g ? g.indexOf(chip) : -1;
        if (gi >= 0) g.splice(gi, 1);
        chip.group = null;
        sendAway(chip, ZONES.bank.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 2, 0)), Math.random() * 0.4);
      } else removeChip(chip);
    }
    lightBoost = { true: 0, false: 0 };
  }

  /** Cambia una ficha de color manteniendo su posición (de la bolsa a una zona). */
  function recolor(chip, color, group, delay) {
    const pos = currentPos(chip);
    removeChip(chip);
    const c = spawn(color, group, { from: pos, delay, dur: 1.15, kind: 'fly' });
    if (c) c.arc = 1.6 + Math.random();
    return c;
  }

  /**
   * Proyecta las etiquetas HTML sobre la mesa sin invadir los paneles marcados con
   * data-anchor-bound="top|left|right". Primero se mide todo y luego se escribe, para no forzar
   * un recálculo de layout por cada etiqueta.
   */
  function placeAnchors() {
    const origin = canvas.getBoundingClientRect();
    let top = origin.top + 8;
    const walls = [];
    for (const b of document.querySelectorAll('[data-anchor-bound]')) {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const kind = b.dataset.anchorBound;
      if (kind === 'top') top = Math.max(top, r.bottom + 12);
      else walls.push({ kind, top: r.top, bottom: r.bottom, x: kind === 'left' ? r.right : r.left });
    }
    const placed = [];
    for (const [el, getPos] of anchors) {
      const world = getPos();
      if (!world) continue;
      tmp.copy(world).project(camera);
      placed.push({
        el,
        x: origin.left + (tmp.x * 0.5 + 0.5) * w,
        y: origin.top + (-tmp.y * 0.5 + 0.5) * h,
        ew: el.offsetWidth,
        eh: el.offsetHeight,
        visible: tmp.z < 1,
      });
    }
    for (const a of placed) {
      const y = Math.min(Math.max(a.y, top + a.eh), origin.bottom - 8);
      let left = origin.left + 8;
      let right = origin.right - 8;
      for (const wall of walls) {
        if (y < wall.top || y - a.eh > wall.bottom) continue;
        if (wall.kind === 'left') left = Math.max(left, wall.x + 12);
        else right = Math.min(right, wall.x - 12);
      }
      const half = a.ew / 2;
      const x = right - left >= a.ew ? Math.min(Math.max(a.x, left + half), right - half) : (left + right) / 2;
      a.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      a.el.style.visibility = a.visible ? 'visible' : 'hidden';
    }
  }

  // ---------- Bucle de animación ----------
  let raf = 0;
  let last = performance.now();
  let elapsed = 0;
  let w = 1;
  let h = 1;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);
  resize();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    elapsed += dt;

    const cam = CAMERA[mode] ?? CAMERA.betting;
    const fit = Math.max(1, 1.55 / camera.aspect);
    const angle = reduced ? 0 : Math.sin(elapsed * cam.speed * Math.PI * 2 * 0.25) * cam.orbit;
    tmp.set(Math.sin(angle) * cam.r * fit, cam.h * Math.min(fit, 1.3), Math.cos(angle) * cam.r * fit);
    const lerp = reduced ? 1 : 1 - Math.exp(-dt * 1.6);
    camState.pos.lerp(tmp, lerp);
    camState.look.lerp(tmp.set(...cam.look), lerp);
    camera.position.copy(camState.pos);
    camera.lookAt(camState.look);

    const showHero = mode === 'lobby';
    hero.visible = showHero || hero.scale.x > 0.02;
    const hs = THREE.MathUtils.lerp(hero.scale.x, showHero ? 1 : 0.001, reduced ? 1 : 1 - Math.exp(-dt * 4));
    hero.scale.setScalar(hs);
    hero.rotation.set(Math.PI / 2 - 0.25 + Math.sin(elapsed * 0.8) * 0.08, reduced ? 0.4 : elapsed * 0.9, 0);
    hero.position.y = 3 + Math.sin(elapsed * 1.3) * 0.18;

    const pos = dust.geometry.attributes.position;
    if (!reduced) {
      for (let i = 0; i < dustCount; i++) {
        let y = pos.getY(i) + dt * (0.15 + (i % 7) * 0.03);
        if (y > 9) y = -1.5;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3);
    cyanLight.intensity = 34 + lightBoost.true * (60 + 30 * pulse);
    pinkLight.intensity = 34 + lightBoost.false * (60 + 30 * pulse);
    rimCyan.material.emissiveIntensity = 0.45 + lightBoost.true * 0.9 * pulse;
    rimPink.material.emissiveIntensity = 0.45 + lightBoost.false * 0.9 * pulse;

    const touched = new Set();
    for (const chip of [...chips]) {
      if (chip.t >= chip.dur && !chip.remove && chip.settled) continue;
      chip.t += dt;
      if (chip.t < 0) continue;
      const k = Math.min(1, chip.t / chip.dur);
      const p = currentPos(chip);
      const tilt = chip.kind === 'fly' ? Math.sin(Math.PI * k) * 1.2 : (1 - k) * 0.6;
      euler.set(tilt, chip.rot + chip.spin * (1 - k), 0);
      quat.setFromEuler(euler);
      mat.compose(p, quat, one);
      chip.pool.mesh.setMatrixAt(chip.index, mat);
      touched.add(chip.pool);
      if (k >= 1) {
        if (chip.remove) removeChip(chip);
        else chip.settled = true;
      }
    }
    for (const pool of touched) pool.mesh.instanceMatrix.needsUpdate = true;

    if (anchors.size) placeAnchors();

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // ---------- API ----------
  return {
    setMode(next) {
      mode = CAMERA[next] ? next : 'betting';
    },
    /** Asegura `n` fichas en la bolsa (agrega con caída o quita las sobrantes). */
    setPot(n, { colors = ['violet', 'pearl'], instant = false } = {}) {
      const target = Math.min(n, CAPACITY - 20);
      const pot = groups.pot;
      let added = 0;
      while (pot.length < target) {
        const c = spawn(colors[pot.length % colors.length], 'pot', { delay: instant ? 0 : added * 0.06, dur: 0.95 });
        if (!c) break;
        if (instant) c.t = c.dur;
        added++;
      }
      while (pot.length > target) removeChip(pot[pot.length - 1]);
      return added;
    },
    potCount: () => groups.pot.length,
    clear(opts) {
      clearAll(opts);
    },
    /** La bolsa se reparte: fichas a Verdadero (cian) y a Falso (rosa); luego el banco paga y cobra. */
    reveal({ truth, onTrue, onFalse, instant = false }) {
      const pot = [...groups.pot];
      const total = onTrue + onFalse;
      const nTrue = total ? Math.round((pot.length * onTrue) / total) : 0;
      pot.forEach((chip, i) => {
        const toTrue = i < nTrue;
        recolor(chip, toTrue ? 'cyan' : 'pink', toTrue ? 'true' : 'false', instant ? 0 : i * 0.012);
      });
      if (instant) for (const c of chips) c.t = c.dur;
      const win = truth ? 'true' : 'false';
      const lose = truth ? 'false' : 'true';
      const payout = () => {
        lightBoost = { true: truth ? 1 : 0, false: truth ? 0 : 1 };
        const losers = [...groups[lose]];
        losers.forEach((chip, i) => {
          groups[lose].splice(groups[lose].indexOf(chip), 1);
          chip.group = null;
          sendAway(chip, ZONES.bank.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random(), 0)), instant ? 0 : i * 0.01);
        });
        const winners = groups[win].length;
        for (let i = 0; i < winners; i++) {
          const c = spawn(truth ? 'cyan' : 'pink', win, { lift: 3.5, delay: instant ? 0 : 0.5 + i * 0.03, dur: 1 });
          if (c && instant) c.t = c.dur;
        }
      };
      if (instant || reduced) payout();
      else setTimeout(payout, 1900);
    },
    /** Torres del podio: alturas proporcionales al patrimonio de los tres primeros. */
    setPodium(entries) {
      clearAll({ animate: !reduced });
      const max = Math.max(1, ...entries.map((e) => e.net));
      const plan = [
        { group: 'p3', color: 'pink', entry: entries[2], wait: 0 },
        { group: 'p2', color: 'cyan', entry: entries[1], wait: 1.4 },
        { group: 'p1', color: 'gold', entry: entries[0], wait: 2.8 },
      ];
      for (const p of plan) {
        if (!p.entry) continue;
        const n = Math.round(6 + 18 * Math.max(0, p.entry.net) / max);
        for (let i = 0; i < n; i++) spawn(p.color, p.group, { delay: p.wait + i * 0.035, dur: 0.75 });
      }
    },
    /** Ancla un elemento HTML a un punto de la mesa: 'pot' | 'true' | 'false' | 'p1' | 'p2' | 'p3'. */
    anchor(el, where) {
      if (!el) return;
      anchors.set(el, () => {
        if (!groups[where]) return null;
        return groupTop(where);
      });
    },
    unanchor(el) {
      anchors.delete(el);
    },
    flash(side) {
      if (side === undefined) return;
      lightBoost = { true: side ? 0.6 : 0, false: side ? 0 : 0.6 };
      setTimeout(() => (lightBoost = { true: 0, false: 0 }), 400);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      anchors.clear();
      renderer.dispose();
    },
  };
}

function heroTexture() {
  return canvasTexture(512, 512, (g, w) => {
    const c = w / 2;
    const grad = g.createLinearGradient(0, 0, w, w);
    grad.addColorStop(0, '#ff4f9a');
    grad.addColorStop(0.5, '#b061e8');
    grad.addColorStop(1, '#22d3ee');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, c, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 12; i++) {
      g.save();
      g.translate(c, c);
      g.rotate((i * Math.PI) / 6);
      g.fillRect(-16, -c, 32, 52);
      g.restore();
    }
    g.fillStyle = '#0b1026';
    g.beginPath();
    g.arc(c, c, c * 0.64, 0, Math.PI * 2);
    g.fill();
    g.setLineDash([18, 14]);
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(c, c, c * 0.56, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.save();
    g.translate(c, c);
    g.rotate(-Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.font = '800 200px Sora, Inter, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(255,79,154,0.8)';
    g.shadowBlur = 24;
    g.fillText('S', 0, 10);
    g.restore();
  });
}
