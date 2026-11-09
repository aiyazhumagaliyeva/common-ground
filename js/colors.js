// ============================================================
//  COLOR = MEANING
//  - Every group that emerges gets its own sticky-note color.
//  - A note's color comes from how close its meaning is to each group:
//      very close to one group  → that group's color (solid dot)
//      between two groups       → a gradient dot mixing both colors
//  - Each group is named after its most typical note (the note closest
//    to the group's center), so the key never invents words.
//  Colors are mixed in "OKLab", a color space where halfway between two
//  colors looks halfway to the eye (no muddy browns).
// ============================================================
import { CONFIG } from './config.js';
import { LABELS } from './labels.js';
import { knownVector } from './cluster.js';

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
function meanUnit(vs) {
  const m = new Array(vs[0].length).fill(0);
  vs.forEach(v => v.forEach((x, i) => (m[i] += x)));
  const L = Math.sqrt(dot(m, m)) || 1;
  return m.map(x => x / L);
}

// ---- OKLab color mixing ----
const toLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function hexToLab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function labToHex([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
               -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
               -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return "#" + rgb.map(c => Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255).toString(16).padStart(2, "0")).join("");
}
export function mix(hexA, hexB, t) {
  const a = hexToLab(hexA), b = hexToLab(hexB);
  return labToHex(a.map((v, i) => v + (b[i] - v) * t));
}

// short name from a note: "I wish I could get a job lol" → "get a job lol"
function shortName(text) {
  let t = text.replace(/^\s*i\s*wish\s*i\s*could\s*/i, "").replace(/[.…\s]+$/, "").trim();
  if (t.length > 26) t = t.slice(0, 25).replace(/\s+\S*$/, "") + "…";
  return t;
}

// ---- 1–2 word names: the AI picks the closest name from labels.js ----
// Best matches are handed out first, and no two groups get the same name.
// If no name fits well enough, the group keeps its most typical note as its name.
let labelVecs = null;
function nameGroups(groups) {
  if (!labelVecs) labelVecs = LABELS.map(l => [l, knownVector(l)]).filter(x => x[1]);
  const pairs = [];
  groups.forEach((g, gi) => labelVecs.forEach(([l, v], li) => pairs.push([dot(g.center, v), gi, li])));
  pairs.sort((a, b) => b[0] - a[0]);
  const named = new Set(), used = new Set();
  for (const [score, gi, li] of pairs) {
    if (named.has(gi) || used.has(li) || score < CONFIG.NAME_MIN_MATCH) continue;
    groups[gi].name = labelVecs[li][0];
    named.add(gi); used.add(li);
  }
}

// ---- main: give every note a color, return the key ----
// note.colorA / note.colorB / note.blend (0 = solid colorA, up to 0.5 = even gradient)
export function colorByMeaning(notes) {
  const palette = CONFIG.DOT_COLORS;
  const byGroup = new Map();
  notes.forEach(n => { if (n.vec && n.group >= 0) (byGroup.get(n.group) || byGroup.set(n.group, []).get(n.group)).push(n); });
  const ids = [...byGroup.keys()].sort((a, b) => a - b);

  if (!ids.length) {                                       // no groups yet: everyone shares the first color
    notes.forEach(n => Object.assign(n, { colorA: palette[0], colorB: palette[0], blend: 0 }));
    return { groups: [], mixed: 0 };
  }

  const groups = ids.map((g, i) => {
    const members = byGroup.get(g);
    const center = meanUnit(members.map(n => n.vec));
    const typical = members.reduce((best, n) => (dot(n.vec, center) > dot(best.vec, center) ? n : best));
    return { id: g, center, color: palette[i % palette.length], name: shortName(typical.text), count: members.length };
  });

  nameGroups(groups);

  const T = CONFIG.COLOR_SOFTNESS;                         // smaller = sharper color borders
  notes.forEach(n => {
    if (!n.vec) { Object.assign(n, { colorA: "#c9c9c9", colorB: "#c9c9c9", blend: 0 }); return; }
    // how close is this note to each group? (+ a bonus for its own group)
    const scores = groups.map(g => dot(n.vec, g.center) + (g.id === n.group ? 0.06 : 0));
    const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
    const [i1, i2] = order;
    const w2 = i2 === undefined ? 0 : 1 / (1 + Math.exp((scores[i1] - scores[i2]) / T));   // 0…0.5
    n.colorA = groups[i1].color;
    n.colorB = i2 === undefined ? groups[i1].color : groups[i2].color;
    n.blend = w2 < CONFIG.GRADIENT_FROM ? 0 : w2;        // clearly one meaning → solid
    n.meaning = groups[i1].id;
  });

  const mixed = notes.filter(n => n.blend > 0).length;
  return { groups, mixed };
}
