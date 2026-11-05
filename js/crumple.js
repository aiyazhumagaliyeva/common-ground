// ============================================================
//  CRUMPLED PAPER NOTE
//  One 3D shape that can be anywhere between:
//    progress 0 = flat square note (facing you)
//    progress 1 = crumpled paper ball
//  The note's photo is printed on it, so the ball is made of the note.
// ============================================================

const SEG = 22;                       // detail of the paper (higher = smoother, slower)

export function makeCrumple(THREE, texture, size, seed = Math.random() * 100) {
  const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const n = pos.count;

  const flat = new Float32Array(pos.array);          // flat note
  const ball = new Float32Array(n * 3);              // crumpled ball
  const mess = new Float32Array(n * 3);              // extra wrinkles while crumpling
  const R = size * 0.3;                              // ball radius

  for (let i = 0; i < n; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    // wrap the square around a sphere
    const theta = u * Math.PI * 2, phi = (1 - v) * Math.PI;
    const dx = Math.sin(phi) * Math.cos(theta), dy = Math.cos(phi), dz = Math.sin(phi) * Math.sin(theta);
    // bumpy radius = crumpled look
    const bump = 1 + 0.32 * (noise(dx * 2.3 + seed, dy * 2.3, dz * 2.3) - 0.5)
                   + 0.18 * (noise(dx * 6 + seed, dy * 6 + 3, dz * 6) - 0.5);
    ball[i * 3] = dx * R * bump;
    ball[i * 3 + 1] = dy * R * bump;
    ball[i * 3 + 2] = dz * R * bump;
    // wrinkles: random pushes that only show halfway through
    const fx = flat[i * 3] / size, fy = flat[i * 3 + 1] / size;
    mess[i * 3] = (noise(fx * 5 + seed, fy * 5, 1) - 0.5) * size * 0.25;
    mess[i * 3 + 1] = (noise(fx * 5, fy * 5 + seed, 2) - 0.5) * size * 0.25;
    mess[i * 3 + 2] = (noise(fx * 4 + 7, fy * 4, seed) - 0.5) * size * 0.6;
  }

  const mat = new THREE.MeshStandardMaterial({
    map: texture, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, flatShading: true
  });
  const mesh = new THREE.Mesh(geo, mat);

  let current = -1;
  function setProgress(p) {
    p = Math.max(0, Math.min(1, p));
    if (Math.abs(p - current) < 1e-4) return;
    current = p;
    const e = p * p * (3 - 2 * p);                   // smooth start + end
    const w = Math.sin(Math.PI * e);                 // wrinkles peak in the middle
    const a = pos.array;
    for (let i = 0; i < n * 3; i++) a[i] = flat[i] + (ball[i] - flat[i]) * e + mess[i] * w;
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  setProgress(1);

  return { mesh, setProgress, get progress() { return current; } };
}

// ---------- small smooth-noise helper (value noise) ----------
function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const f = t => t * t * (3 - 2 * t);
  const u = f(xf), v = f(yf), w = f(zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
