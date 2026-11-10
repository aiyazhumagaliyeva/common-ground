// ============================================================
//  EMERGENT CLUSTERING
//  1. An AI model turns each wish into 384 numbers ("embedding").
//     Similar meaning -> similar numbers. Runs in the browser:
//     wishes are not sent to any AI company for this step.
//  2. All notes are grouped AT ONCE (not one by one), so the order
//     notes arrived in does not matter. No first-mover advantage.
//  3. Groups smaller than MIN_GROUP_SIZE don't count as a group.
//  4. Like TensorFlow's Embedding Projector, every note sits where its own
//     meaning puts it (PCA = the 3 main directions of the data);
//     GROUP_PULL gently pulls notes of the same group together.
// ============================================================

import { CONFIG } from './config.js';
import { SEED_VECTORS } from './seed-vectors.js';

// The AI library loads only when needed, so the map still shows if it fails.
let extractor = null;
export async function loadModel() {
  if (extractor) return;
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
  env.allowLocalModels = false;    // always download the model from the web
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
}

// "I wish I could get a job" -> "get a job" (the prompt adds no meaning)
function core(text) {
  return text.replace(/^\s*i\s*wish\s*i\s*could\s*/i, "").trim() || text;
}

export async function embed(texts) {
  await loadModel();
  const out = await extractor(texts.map(core), { pooling: 'mean', normalize: true });
  const vecs = out.tolist();
  texts.forEach((t, i) => remember(t, vecs[i]));
  return vecs;
}

// ---------- FAST START: vectors we already know ----------
// The AI model is ~24 MB, so the map never waits for it.
// Starting notes have pre-computed vectors (seed-vectors.js);
// other notes are remembered on this device after the first time.
const SCALE = 0.35 / 127;
function decode(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const v = Array.from(new Int8Array(bytes.buffer), x => x * SCALE);
  const L = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / L);
}
function encode(v) {
  const q = Int8Array.from(v, x => Math.max(-127, Math.min(127, Math.round(x / SCALE))));
  return btoa(String.fromCharCode(...new Uint8Array(q.buffer)));
}
function remember(text, v) {
  try { localStorage.setItem("cg:vec:" + text, encode(v)); } catch (e) {}
}
export function knownVector(text) {
  if (SEED_VECTORS[text]) return decode(SEED_VECTORS[text]);
  try { const s = localStorage.getItem("cg:vec:" + text); if (s) return decode(s); } catch (e) {}
  return null;
}

// ---------- small vector helpers ----------
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const sub = (a, b) => a.map((v, i) => v - b[i]);
const norm = a => Math.sqrt(dot(a, a)) || 1;
const scale = (a, k) => a.map(v => v * k);
function mean(vs) {
  const m = new Array(vs[0].length).fill(0);
  vs.forEach(v => v.forEach((x, i) => (m[i] += x)));
  return m.map(x => x / vs.length);
}

// ---------- step 2: group everything at once ----------
// "Average linkage": two groups merge if their notes are, on average,
// similar enough. Same input -> same groups, whatever the order.
function groupAll(E) {
  const n = E.length;
  let groups = E.map((_, i) => [i]);
  const sim = E.map(a => E.map(b => dot(a, b)));
  let S = sim.map(r => r.slice());               // similarity between groups
  while (groups.length > 1) {
    let best = -1, bi = -1, bj = -1;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++)
        if (S[i][j] > best) { best = S[i][j]; bi = i; bj = j; }
    if (best < CONFIG.JOIN_SIMILARITY) break;
    const a = groups[bi].length, b = groups[bj].length;
    for (let k = 0; k < groups.length; k++) {   // update similarities
      if (k === bi || k === bj) continue;
      const v = (S[bi][k] * a + S[bj][k] * b) / (a + b);
      S[bi][k] = S[k][bi] = v;
    }
    groups[bi] = groups[bi].concat(groups[bj]);
    groups.splice(bj, 1);
    S.splice(bj, 1);
    S.forEach(r => r.splice(bj, 1));
  }
  return groups;
}

// ---------- 3 main directions of the data (PCA), to turn 384D into 3D ----------
let prevPCs = null;
function pca3(X) {
  const d = X[0].length, pcs = [];
  let R = X.map(r => r.slice());
  for (let c = 0; c < 3; c++) {
    let v = new Array(d).fill(0).map((_, i) => Math.sin(i * 12.9898 + c * 78.233)); // fixed start
    for (let it = 0; it < 60; it++) {
      const w = new Array(d).fill(0);
      R.forEach(r => { const p = dot(r, v); r.forEach((x, i) => (w[i] += p * x)); });
      v = scale(w, 1 / norm(w));
    }
    // keep the same orientation as last time so the map doesn't flip
    if (prevPCs && dot(v, prevPCs[c]) < 0) v = scale(v, -1);
    pcs.push(v);
    R = R.map(r => sub(r, scale(v, dot(r, v))));
  }
  prevPCs = pcs;
  return pcs;
}
const project = (v, pcs) => pcs.map(p => dot(v, p));
const len3 = p => Math.hypot(p[0], p[1], p[2]) || 1;

// stable pseudo-random number per note, so notes don't jump randomly
function hash(id, k) {
  let h = 2166136261 ^ k;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000 - 0.5;
}

// ---------- main: notes (with .vec) -> positions + group ids ----------
export function layout(notes) {
  if (notes.length < 2) {
    notes.forEach(n => Object.assign(n, { tx: 0, ty: 0, tz: 0, group: -1 }));
    return 0;
  }
  const E = notes.map(n => n.vec);
  const M = mean(E);                                   // the "average wish"
  const centered = E.map(v => sub(v, M));
  const pcs = pca3(centered);

  const all = groupAll(E);
  const groups = all.filter(g => g.length >= CONFIG.MIN_GROUP_SIZE)
                    .sort((a, b) => b.length - a.length);
  notes.forEach(n => (n.group = -1));                  // -1 = not in a group
  groups.forEach((g, gi) => g.forEach(i => (notes[i].group = gi)));

  // --- one continuous cloud, like TensorFlow ---
  // Every note sits where its own meaning puts it (PCA), not on a group island.
  // GROUP_PULL gently pulls notes of the same group toward each other (0 = pure PCA).
  const P = centered.map(v => project(v, pcs));
  const radii = P.map(len3).sort((a, b) => a - b);
  const R = radii[Math.floor(radii.length * 0.9)] || 1;      // ignore the few extreme notes
  const k = CONFIG.MAP_RADIUS / R;
  const gMean = groups.map(g => [0, 1, 2].map(d => g.reduce((t, i) => t + P[i][d], 0) / g.length));
  notes.forEach((n, i) => {
    let q = P[i];
    if (n.group >= 0 && CONFIG.GROUP_PULL) q = q.map((v, d) => v + (gMean[n.group][d] - v) * CONFIG.GROUP_PULL);
    n.tx = q[0] * k + hash(n.id, 1) * CONFIG.NOTE_SIZE * 0.6;
    n.ty = q[1] * k + hash(n.id, 2) * CONFIG.NOTE_SIZE * 0.6;
    n.tz = q[2] * k + hash(n.id, 3) * CONFIG.NOTE_SIZE * 0.6;
  });

  // --- keep notes from sitting inside each other (groups stay together) ---
  const minD = CONFIG.NOTE_SIZE * (CONFIG.NOTE_GAP || 0);
  if (minD > 0) {
    for (let it = 0; it < 60; it++) {
      let moved = false;
      for (let a = 0; a < notes.length; a++) {
        for (let b = a + 1; b < notes.length; b++) {
          const A = notes[a], B = notes[b];
          let dx = A.tx - B.tx, dy = A.ty - B.ty, dz = A.tz - B.tz;
          let d = Math.hypot(dx, dy, dz);
          if (d >= minD) continue;
          if (d < 1e-6) { dx = hash(A.id, 4); dy = hash(A.id, 5); dz = hash(A.id, 6); d = Math.hypot(dx, dy, dz) || 1; }
          const push = (minD - d) / 2 / d;
          A.tx += dx * push; A.ty += dy * push; A.tz += dz * push;
          B.tx -= dx * push; B.ty -= dy * push; B.tz -= dz * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // --- center the whole map, so it always sits in the middle of the screen (like TensorFlow) ---
  // (middle of the outer edges, so the cloud looks centered on screen)
  const mid = k => (Math.min(...notes.map(n => n[k])) + Math.max(...notes.map(n => n[k]))) / 2;
  const cx = mid("tx"), cy = mid("ty"), cz = mid("tz");
  notes.forEach(n => { n.tx -= cx; n.ty -= cy; n.tz -= cz; });

  return groups.length;
}
