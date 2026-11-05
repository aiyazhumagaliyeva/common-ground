// ============================================================
//  EMERGENT CLUSTERING
//  1. An AI model turns each wish into 384 numbers ("embedding").
//     Similar meaning -> similar numbers. Runs in the browser:
//     wishes are not sent to any AI company for this step.
//  2. All notes are grouped AT ONCE (not one by one), so the order
//     notes arrived in does not matter. No first-mover advantage.
//  3. Groups smaller than MIN_GROUP_SIZE stay in the middle cloud.
//  4. The middle = the average of ALL notes. Groups sit around it,
//     farther away the more different they are from the average.
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
export const modelReady = () => !!extractor;

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
  const inGroup = new Set(groups.flat());

  // --- middle cloud: notes not (yet) in a group ---
  const middle = notes.map((_, i) => i).filter(i => !inGroup.has(i));
  middle.forEach(i => {
    const p = project(centered[i], pcs);
    const r = CONFIG.MIDDLE_RADIUS * (0.35 + 0.65 * Math.min(1, len3(p) / 0.6));
    const L = len3(p);
    const n = notes[i];
    n.group = -1;
    n.tx = (p[0] / L) * r + hash(n.id, 1) * 18;
    n.ty = (p[1] / L) * r + hash(n.id, 2) * 18;
    n.tz = (p[2] / L) * r + hash(n.id, 3) * 18;
  });

  // --- group centers: direction from PCA, distance from "how unusual" ---
  const centers = groups.map(g => {
    const c = mean(g.map(i => E[i]));
    const p = project(sub(c, M), pcs);
    const L = len3(p);
    const unusual = 1 - dot(c, M) / (norm(c) * norm(M));      // 0 = average
    const dist = CONFIG.GROUP_DISTANCE * (0.75 + unusual);
    return [(p[0] / L) * dist, (p[1] / L) * dist, (p[2] / L) * dist];
  });
  // push groups apart so they never overlap
  for (let it = 0; it < 80; it++) {
    for (let a = 0; a < centers.length; a++) {
      for (let b = a + 1; b < centers.length; b++) {
        const d = sub(centers[a], centers[b]), L = len3(d);
        if (L < CONFIG.GROUP_SPACING) {
          const push = scale(d, (CONFIG.GROUP_SPACING - L) / (2 * L));
          centers[a] = centers[a].map((v, i) => v + push[i]);
          centers[b] = centers[b].map((v, i) => v - push[i]);
        }
      }
      const L = len3(centers[a]), minR = CONFIG.MIDDLE_RADIUS + 70;
      if (L < minR) centers[a] = scale(centers[a], minR / L);
    }
  }

  // --- notes inside a group: spread by their own differences ---
  groups.forEach((g, gi) => {
    const gc = mean(g.map(i => E[i]));
    g.forEach(i => {
      const p = project(sub(E[i], gc), pcs);
      const n = notes[i];
      n.group = gi;
      const s = CONFIG.GROUP_SPREAD * 3;
      n.tx = centers[gi][0] + p[0] * s + hash(n.id, 1) * CONFIG.GROUP_SPREAD;
      n.ty = centers[gi][1] + p[1] * s + hash(n.id, 2) * CONFIG.GROUP_SPREAD;
      n.tz = centers[gi][2] + p[2] * s + hash(n.id, 3) * CONFIG.GROUP_SPREAD;
    });
  });

  return groups.length;
}
