// ============================================================
//  COMMON GROUND — map + writing flow
// ============================================================
// exact versions, built for Safari too (target=es2020), sharing ONE Three.js
import ForceGraph3D from 'https://esm.sh/3d-force-graph@1.80.1?deps=three@0.181.0&target=es2020';
import * as THREE from 'https://esm.sh/three@0.181.0?target=es2020';
import { CONFIG } from './config.js';
import { embed, layout, knownVector, loadModel } from './cluster.js';
import { checkNote } from './safety.js';
import { photoNotes, typedNotes } from './seed.js';
import { drawQR } from './qr.js';
import { makeCrumple } from './crumple.js';
import { liveOn, listen } from './live.js';
import { makeGlass } from './glass.js';
import { colorByMeaning } from './colors.js';
import { track, startTracking, SOURCE, optOut, optedOut } from './track.js';

startTracking("map");
makeGlass(document.getElementById("nav"));      // liquid glass menu (settings from Figma)

const $ = id => document.getElementById(id);
window.appStarted = true;

// ---- COLORS ----
const noteColors  = ["#7BB8FF", "#F5A84A", "#FFEE7A", "#8BE35B", "#F58BD8", "#B98BF5", "#F05050"];
const groupColors = ["#2557A7", "#C2410C", "#15803D", "#7E22CE", "#BE123C", "#0E7490", "#A16207", "#4D7C0F", "#9D174D", "#334155"];

// ---- STATE ----
let chosenColor = noteColors[0];
let allowReplies = true;
let mode = "write";           // "write" or "photo"
let photo = null;             // { thumb: dataURL } after a photo is chosen
const serverOn = CONFIG.SERVER_URL.trim() !== "";

// ============================================================
//  NOTES
// ============================================================
const notes = [];
const rnd = () => (Math.random() - 0.5) * 40;

photoNotes.forEach((p, i) => notes.push({
  id: "p" + i, text: p.text, image: `notes/${p.file}.jpg`, paper: p.paper,
  allowReplies: p.allowReplies !== false, group: -1
}));
typedNotes.forEach((t, i) => notes.push({
  id: "t" + i, text: "I wish I could " + t,
  color: noteColors[i % noteColors.length], allowReplies: i % 3 !== 0, group: -1
}));
notes.forEach(n => { n.fx = n.x = rnd(); n.fy = n.y = rnd(); n.fz = n.z = rnd(); });

// ============================================================
//  DRAWING ONE NOTE (a square image made in code)
// ============================================================
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" "), lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  lines.push(line);
  return lines;
}

function paint(node) {
  const S = 512, ctx = node.__ctx;
  ctx.clearRect(0, 0, S, S);
  if (node.__img && node.__img.complete && node.__img.naturalWidth) {
    ctx.drawImage(node.__img, 0, 0, S, S);                      // the photo
  } else {
    ctx.fillStyle = node.color || "#FFF6B8";                    // typed note
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#111111";
    ctx.font = "500 40px Inter, sans-serif";
    wrapText(ctx, node.text, S - 80).slice(0, 9)
      .forEach((l, i) => ctx.fillText(l, 40, 76 + i * 50));
  }
  if (CONFIG.SHOW_GROUP_FRAMES && node.group >= 0) {          // group frame (off)
    ctx.strokeStyle = groupColors[node.group % groupColors.length];
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, S - 18, S - 18);
  }
  node.__tex.needsUpdate = true;
}

// ============================================================
//  ONE NOTE = a flat dot on the map.
//  The paper (photo) only appears when a note arrives or is opened:
//  it unfolds out of the dot / crumples back into it.
// ============================================================
let introPending = true;              // dots stay hidden until the opening animation

// soft round dot texture (shared)
const dotTexture = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

// the dot is the color of the note's paper
function dotColor(node) {
  if (CONFIG.DOT_STYLE === "ink") return "#2b2b2b";
  if (CONFIG.DOT_COLOR) return CONFIG.DOT_COLOR;          // one color for every dot
  if (CONFIG.COLOR_BY === "meaning") return node.colorA || CONFIG.DOT_COLORS[0];
  const list = CONFIG.DOT_COLORS || [];
  if (list.length) {                                      // random sticky-note color, fixed per note
    let h = 0;
    for (const ch of String(node.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return list[h % list.length];
  }
  return node.paper || node.color || "#d3cfab";
}
// gradient dot: a note between two meanings shows both colors
const gradCache = new Map();
function gradientTexture(a, b, blend) {
  const key = a + b + blend.toFixed(2);
  if (gradCache.has(key)) return gradCache.get(key);
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const lg = g.createLinearGradient(20, 20, 108, 108);     // top-left → bottom-right
  lg.addColorStop(0, a);
  lg.addColorStop(Math.max(0, 0.5 - blend), a);           // more blend = more of the second color
  lg.addColorStop(1, b);
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fillStyle = lg; g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  gradCache.set(key, t);
  return t;
}
const imageLook = () => CONFIG.NOTE_LOOK === "image";
function paintDot(n) {
  const m = n.__dot && n.__dot.material;
  if (!m) return;
  if (imageLook()) {                                      // the note's photo, flat, always facing you
    m.map = n.__tex; m.color.set("#ffffff"); m.needsUpdate = true;
    n.__dot.scale.setScalar(CONFIG.NOTE_SIZE);
    return;
  }
  const grad = CONFIG.COLOR_BY === "meaning" && !CONFIG.DOT_COLOR && CONFIG.DOT_STYLE !== "ink" && n.blend > 0;
  m.map = grad ? gradientTexture(n.colorA, n.colorB, n.blend) : dotTexture;
  m.color.set(grad ? "#ffffff" : dotColor(n));
  m.needsUpdate = true;
}

// read the paper color from a photo: the lighter 60% of pixels is paper, the rest is ink
function paperColor(img) {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
  px.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const paper = px.slice(Math.floor(px.length * 0.4));
  const mid = k => paper.map(p => p[k]).sort((a, b) => a - b)[paper.length >> 1];
  return "#" + [0, 1, 2].map(k => mid(k).toString(16).padStart(2, "0")).join("");
}

function makeBall(node) {
  // the paper texture (photo, or typed text)
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  node.__ctx = canvas.getContext("2d");
  node.__tex = new THREE.CanvasTexture(canvas);
  node.__tex.colorSpace = THREE.SRGBColorSpace;
  if (node.image) {
    node.__img = new Image();
    node.__img.onload = () => {
      paint(node);
      if (!node.paper) {                                   // new photos: measure the paper
        try { node.paper = paperColor(node.__img); paintDot(node); } catch (e) {}
      }
    };
    node.__img.src = node.image;
  }
  paint(node);

  const group = new THREE.Group();
  node.__group = group;

  // the dot (always faces you, never shaded)
  const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture, color: dotColor(node), transparent: true }));
  dot.scale.setScalar(CONFIG.DOT_SIZE);
  node.__dot = dot;
  paintDot(node);
  group.add(dot);

  // the paper: hidden until needed
  const seed = [...String(node.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 97;
  node.__crumple = makeCrumple(THREE, node.__tex, CONFIG.NOTE_SIZE * 1.6, seed);
  node.__phase = seed;
  node.__crumple.mesh.visible = false;
  group.add(node.__crumple.mesh);

  if (node.__arriving) {                                 // new note: flat paper, big, no dot yet
    node.__crumple.setProgress(0);
    node.__crumple.mesh.visible = true;
    dot.visible = false;
    group.scale.setScalar(CONFIG.ARRIVE_SCALE);
  } else if (introPending) {
    group.scale.setScalar(0.001);                        // pops in during the intro
  }
  return group;
}

// paper → dot: shrink the ball away and fade the dot in
async function paperToDot(n, ms = 500) {
  const m = n.__crumple.mesh, d = n.__dot;
  d.visible = true;
  d.material.opacity = 0;
  const s0 = n.__group.scale.x;
  await tween(ms, e => {
    m.scale.setScalar(1 - e * 0.85);
    m.material.opacity = 1 - e;
    d.material.opacity = e;
    n.__group.scale.setScalar(s0 + (1 - s0) * e);
  });
  m.visible = false; m.scale.setScalar(1); m.material.opacity = 1;
}

// ---- small animation helpers ----
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeOutBack = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const wait = ms => new Promise(r => setTimeout(r, ms));
function tween(ms, fn, ease = easeInOut) {
  return new Promise(done => {
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / ms);
      fn(ease(t));
      t < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  });
}

// ============================================================
//  GRAPH
// ============================================================
// "orbit" controls: drag = rotate, right-drag = move, scroll/pinch = zoom
const graph = ForceGraph3D({ controlType: "orbit" })($("map"));
graph.width(window.innerWidth).height(window.innerHeight)
  .backgroundColor(CONFIG.BG_COLOR || "#ffffff")
  .showNavInfo(false)
  .nodeLabel(n => n.text)
  .nodeThreeObject(makeBall)
  .cooldownTime(2500);
graph.d3Force("charge", null);           // no physics: positions come from meaning
graph.d3Force("link", null);
graph.d3Force("center", null);
graph.graphData({ nodes: notes, links: [] });
graph.cameraPosition({ x: 0, y: 0, z: CONFIG.MAX_ZOOM * 1.8 });    // intro starts far away

// zoom goes toward where the mouse points, so far-away notes are easy to reach
const controls = graph.controls();
controls.zoomToCursor = true;
controls.screenSpacePanning = true;
controls.zoomSpeed = CONFIG.ZOOM_SPEED;
controls.minDistance = 15;          // how close you can get to a note
controls.maxDistance = 1200;
controls.autoRotate = true;           // slow drift until someone touches the map
controls.autoRotateSpeed = CONFIG.DRIFT_SPEED;
controls.addEventListener("start", () => (controls.autoRotate = false));

// ---- every frame: dots float gently; paper faces you ----
function tick(now) {
  const cam = graph.camera(), t = now / 1000;
  notes.forEach(n => {
    const g = n.__group;
    if (!g) return;
    g.quaternion.copy(cam.quaternion);                    // paper always faces the camera
    const bob = Math.sin(t * 0.8 + n.__phase) * CONFIG.NOTE_SIZE * CONFIG.FLOAT;
    n.__dot.position.y = bob;
    const m = n.__crumple.mesh;
    if (m.visible && n.__crumple.progress >= 0.999 && !n.__arriving) {
      m.rotation.x += 0.004; m.rotation.y += 0.006;      // a crumpled ball tumbles a bit
    } else {
      m.rotation.x *= 0.85; m.rotation.y *= 0.85;
    }
    if (n.__pos) {                                        // arrival animation controls it
      g.position.copy(n.__pos);
      n.x = n.fx = n.__pos.x; n.y = n.fy = n.__pos.y; n.z = n.fz = n.__pos.z;
    }
  });
requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.addEventListener("resize", () => graph.width(window.innerWidth).height(window.innerHeight));

// ---- move every note to its new spot (smooth) ----
function animateToTargets(ms = 1600) {
  const from = new Map(notes.map(n => [n, [n.fx, n.fy, n.fz]]));   // start spot of each note
  const start = performance.now();
  graph.d3ReheatSimulation();
  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // ease in-out
    notes.forEach(n => {
      if (n.tx === undefined || n.__arriving) return;
      const f = from.get(n) || [n.fx || 0, n.fy || 0, n.fz || 0];   // note added mid-animation
      n.fx = f[0] + (n.tx - f[0]) * e;
      n.fy = f[1] + (n.ty - f[1]) * e;
      n.fz = f[2] + (n.tz - f[2]) * e;
    });
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---- regroup everything (after load, and after every new note) ----
function regroup() {
  const known = notes.filter(n => n.vec);
  const count = layout(known);
  notes.forEach(n => {                                   // not read yet: wait near the middle
    if (n.vec || n.tx !== undefined) return;
    n.tx = rnd() * 0.6; n.ty = rnd() * 0.6; n.tz = rnd() * 0.6;
  });
  const key = colorByMeaning(notes);                      // colors follow meaning
  notes.forEach(paintDot);
  drawKey(key);
  animateToTargets();
  $("mapInfo").textContent = count === 0
    ? `${notes.length} wishes · no groups yet`
    : `${notes.length} wishes · ${count} groups have formed`;
}

// ---- the color key (bottom left) ----
function drawKey(key) {
  const box = $("colorKey");
  if (!box) return;
  if (imageLook() || CONFIG.COLOR_BY !== "meaning" || CONFIG.DOT_COLOR || !key.groups.length) { box.hidden = true; return; }
  box.hidden = false;
  const rows = key.groups.map(g =>
    `<li><button type="button" data-group="${g.id}"><i style="background:${g.color}"></i>` +
    `<span>${g.name.replace(/</g, "&lt;")}</span><em>${g.count}</em></button></li>`).join("");
  const c = key.groups.map(g => g.color);
  const between = key.mixed ? `<li class="between"><i style="background:linear-gradient(135deg, ${c[0]} 35%, ${c[1] || c[0]})"></i>` +
    `<span>In between two meanings</span><em>${key.mixed}</em></li>` : "";
  box.innerHTML = `<p>Color = meaning</p><ul>${rows}${between}</ul>`;
  box.querySelectorAll("button[data-group]").forEach(b => b.addEventListener("click", () => flyToGroup(+b.dataset.group)));
}
// click a row in the key: the camera flies to that group
function flyToGroup(id) {
  const g = notes.filter(n => n.group === id && n.tx !== undefined);
  if (!g.length) return;
  if (selected) closeNote();
  controls.autoRotate = false;
  const c = g.reduce((a, n) => [a[0] + n.tx / g.length, a[1] + n.ty / g.length, a[2] + n.tz / g.length], [0, 0, 0]);
  const r = Math.max(30, ...g.map(n => Math.hypot(n.tx - c[0], n.ty - c[1], n.tz - c[2])));
  const L = Math.hypot(...c) || 1, d = r * 3.2;
  graph.cameraPosition({ x: c[0] + (c[0] / L) * d, y: c[1] + (c[1] / L) * d, z: c[2] + (c[2] / L) * d },
                       { x: c[0], y: c[1], z: c[2] }, 1400);
  track("key_click", { group: id });
}

// start zoom depends on how many notes there are:
// few notes → START_ZOOM (close), many notes → farther, up to MAX_ZOOM
function fitCamera(ms = 1200) {
  const r = Math.max(...notes.map(n => Math.hypot(n.tx || 0, n.ty || 0, n.tz || 0))) + CONFIG.NOTE_SIZE;
  const fov = (graph.camera().fov * Math.PI) / 180;               // vertical field of view
  const aspect = window.innerWidth / window.innerHeight;
  const fitV = r / Math.tan(fov / 2);                              // fit top-to-bottom
  const fitH = r / (Math.tan(fov / 2) * aspect);                   // fit left-to-right
  const z = Math.min(CONFIG.MAX_ZOOM, Math.max(CONFIG.START_ZOOM, Math.max(fitV, fitH) * 1.1));
  graph.cameraPosition({ x: 0, y: 0, z }, { x: 0, y: 0, z: 0 }, ms);
}

function flyTo(node) {
  const dist = CONFIG.NOTE_SIZE * 4, r = Math.hypot(node.tx, node.ty, node.tz) || 1;   // how close it flies
  const k = 1 + dist / r;
  graph.cameraPosition({ x: node.tx * k, y: node.ty * k, z: node.tz * k },
                       { x: node.tx, y: node.ty, z: node.tz }, 1500);
}

// ---- click a ball: it flies close and unfolds into the note ----
let selected = null;
async function openNote(node) {
  if (selected === node || node.__arriving) return;
  if (selected) closeNote();
  selected = node;
  controls.autoRotate = false;
  flyTo(node);
  track("note_open", { id: node.id });
  node.__openedAt = performance.now();
  if (imageLook()) {                                      // photo notes: just come closer and grow
    await tween(700, e => node.__group.scale.setScalar(1 + e * (CONFIG.OPEN_SCALE - 1)));
    return;
  }
  const m = node.__crumple.mesh;
  m.visible = true; m.material.opacity = 1;
  node.__crumple.setProgress(1);
  node.__dot.visible = false;
  await tween(900, e => {
    node.__crumple.setProgress(1 - e);
    node.__group.scale.setScalar(1 + e * (CONFIG.OPEN_SCALE - 1));
  });
}
async function closeNote() {
  const n = selected;
  if (!n) return;
  selected = null;
  track("note_close", { id: n.id, seconds: Math.round((performance.now() - n.__openedAt) / 1000) });
  if (imageLook()) {
    await tween(500, e => n.__group.scale.setScalar(CONFIG.OPEN_SCALE - e * (CONFIG.OPEN_SCALE - 1)));
    return;
  }
  await tween(600, e => {
    n.__crumple.setProgress(e);
    n.__group.scale.setScalar(CONFIG.OPEN_SCALE - e * (CONFIG.OPEN_SCALE - 1));
  });
  await paperToDot(n, 400);
}
graph.onNodeClick(openNote);
graph.onBackgroundClick(closeNote);

// ---- opening animation: balls pop out of the middle into their groups ----
function intro() {
  introPending = false;
  fitCamera(2600);
  notes.forEach((n, i) => {
    if (!n.__group) return;
    setTimeout(() => tween(800, e => n.__group.scale.setScalar(Math.max(0.001, e)), easeOutBack), 250 + i * 45);
  });
}

// ---- start: load saved notes, read meaning, arrange ----
async function start() {
  $("mapInfo").textContent = "Reading the wishes…";
  if (serverOn) {
    try {
      const res = await fetch(CONFIG.SERVER_URL + "?action=approved");
      const saved = await res.json();
      saved.filter(s => !CONFIG.PHOTO_NOTES_ONLY || s.image).forEach(s => notes.push({
        id: "s" + s.id, text: s.text, image: s.image || null, color: s.color,
        allowReplies: s.allowReplies, group: -1, fx: rnd(), fy: rnd(), fz: rnd()
      }));
      graph.graphData({ nodes: notes, links: [] });
    } catch (e) { console.warn("Could not load saved notes", e); }
  }
  // 1. show the map right away with the notes we already understand
  notes.forEach(n => (n.vec = knownVector(n.text)));
  regroup();
  intro();
  showMyNote();
  track("map_ready", { notes: notes.length, ms: Math.round(performance.now()) });

  // 2. notes we haven't read before: the AI model loads quietly in the background
  const unknown = notes.filter(n => !n.vec);
  if (!unknown.length) return;
  try {
    const vecs = await embed(unknown.map(n => n.text));
    unknown.forEach((n, i) => (n.vec = vecs[i]));
    regroup();
  } catch (e) {
    console.error(e);
    $("mapInfo").textContent = "Could not load the AI model (check internet). New notes stay in the middle.";
  }
}
start();

// ============================================================
//  SIDEBAR: write / photo
// ============================================================
function setMode(m) {
  mode = m;
  $("tabWrite").classList.toggle("active", m === "write");
  $("tabPhoto").classList.toggle("active", m === "photo");
  $("photoBox").hidden = m !== "photo";
  $("wishInput").placeholder = m === "photo"
    ? "your note's text will appear here" : "finish the sentence";
}
$("tabWrite").addEventListener("click", () => setMode("write"));
$("tabPhoto").addEventListener("click", () => setMode("photo"));

// ---- photo chosen ----
$("photoInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  setStatus("Preparing photo…");
  // Redrawing the photo on a canvas removes hidden data (like GPS location).
  const bmp = await createImageBitmap(file);
  const big = toCanvas(bmp, 1400);                      // for reading the text
  const thumb = squareThumb(bmp, 320);                  // for the map
  photo = { thumb: thumb.toDataURL("image/jpeg", 0.7) };
  $("photoPreview").src = photo.thumb;
  $("photoPreview").hidden = false;

  if (!serverOn) {
    setStatus("Demo mode: type what your note says, then Send.");
    $("wishInput").focus();
    return;
  }
  setStatus("Reading your handwriting…");
  try {
    const b64 = big.toDataURL("image/jpeg", 0.85).split(",")[1];
    const res = await post({ action: "ocr", image: b64 });
    $("wishInput").value = cleanOcr(res.text || "");
    setStatus("Is this what you wrote? Fix anything the AI misread, then Send.");
  } catch (err) {
    console.error(err);
    setStatus("Couldn't read the photo. Type what it says instead.");
  }
});

function toCanvas(bmp, max) {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
function squareThumb(bmp, size) {
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return c;
}
function cleanOcr(t) {
  return t.replace(/\s+/g, " ").replace(/^\s*i\s*wish\s*i\s*could\s*/i, "").trim();
}

// ---- color + public/private ----
$("colorPicker").addEventListener("click", () => {
  chosenColor = noteColors[(noteColors.indexOf(chosenColor) + 1) % noteColors.length];
  $("colorPicker").style.background = chosenColor;
  $("writeBox").style.background = chosenColor;
});
$("PublicMode").addEventListener("click", () => {
  allowReplies = true;
  $("PublicMode").classList.add("selected"); $("PrivateMode").classList.remove("selected");
});
$("PrivateMode").addEventListener("click", () => {
  allowReplies = false;
  $("PrivateMode").classList.add("selected"); $("PublicMode").classList.remove("selected");
});

// ---- SEND ----
$("sendButton").addEventListener("click", async () => {
  const text = $("wishInput").value.trim();
  if (text === "") { setStatus(mode === "photo" ? "Add a photo first, or type your wish." : ""); return; }
  const full = "I wish I could " + text;

  // 1. safety check
  const check = checkNote(full);
  if (check === "self-harm") { showSupport(); saveToServer(full, "self-harm"); return; }
  if (check !== "ok") {
    saveToServer(full, check);
    resetForm();
    setStatus("Thanks. Your note will be reviewed before it appears. (Please leave out names, numbers and links.)");
    return;
  }

  // 2. save (waits for review on the server)
  saveToServer(full, "ok");

  // 3. show it on YOUR map right away, marked pending
  const node = {
    id: "n" + Date.now(), text: full, color: chosenColor,
    image: mode === "photo" && photo ? photo.thumb : null,
    allowReplies, pending: true, group: -1, fx: 0, fy: 0, fz: 0
  };
  resetForm();
  setStatus("Your wish is on its way. It appears for others after review.");
  notes.push(node);
  graph.graphData({ nodes: notes, links: [] });
  try {
    node.vec = (await embed([full]))[0];
    regroup();
  } catch (e) { console.error(e); }
  return node;
});

function saveToServer(text, flag) {
  if (!serverOn) return;
  post({
    action: "submit", text, flag, allowReplies, color: chosenColor,
    image: mode === "photo" && photo ? photo.thumb : ""
  }).catch(e => console.error("Save failed", e));
}

async function post(body) {
  // text/plain avoids the browser's extra "preflight" request that Apps Script can't answer
  const res = await fetch(CONFIG.SERVER_URL, { method: "POST", body: JSON.stringify(body) });
  return res.json();
}

function resetForm() {
  $("wishInput").value = "";
  photo = null;
  $("photoPreview").hidden = true;
  $("photoInput").value = "";
}
function setStatus(t) { $("status").textContent = t; }

// ---- support message (self-harm) ----
function showSupport() {
  resetForm();
  setStatus("");
  $("composer").hidden = true;
  $("support").hidden = false;
}
$("supportBack").addEventListener("click", () => {
  $("support").hidden = true;
  $("composer").hidden = false;
});

if (!serverOn) $("modeNote").hidden = false;

// ============================================================
//  NAVIGATION + "ADD YOURS" (phone handoff with a QR code)
//  Desktop shows a QR → phone opens the upload page (served by
//  your Apps Script) → phone sends the photo → desktop sees it.
// ============================================================

let pollTimer = null;
let closeLive = null;          // closes the live (Firebase) room
let lastNote = null;

function openPage(id) {
  closeAll();
  document.body.classList.add("page-open");
  $(id).classList.add("open");
}
function closeAll() {
  document.body.classList.remove("page-open");
  document.querySelectorAll(".page").forEach(p => p.classList.remove("open"));
  clearInterval(pollTimer);
  if (closeLive) { closeLive(); closeLive = null; }
}

const isPhone = matchMedia("(pointer: coarse)").matches && innerWidth < 900;
$("navAdd").addEventListener("click", () => {
  openPage("addPage");
  track("add_open", { phone: isPhone });
  if (!isPhone) loadModel().catch(() => {});        // get the AI ready before the note arrives
  $("qr").hidden = false; $("addDone").hidden = true;
  $("qrCaption").hidden = false;
  $("liveStep").hidden = true;
  startHandoff();
});
$("navAbout").addEventListener("click", () => { openPage("aboutPage"); track("about_open"); });
$("optOut").addEventListener("click", () => { optOut(); $("optOut").outerHTML = "<span>Done, your visits aren’t counted.</span>"; });
if (optedOut()) $("optOut").outerHTML = "<span>Your visits aren’t counted.</span>";
$("navContact").addEventListener("click", () => { openPage("contactPage"); track("contact_open"); });
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeAll));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });
$("seeNote").addEventListener("click", () => { closeAll(); if (lastNote) setTimeout(() => flyTo(lastNote), 400); });

async function startHandoff() {
  if (isPhone) {                                     // on a phone: no QR, go straight to the camera
    $("qr").hidden = true;
    $("qrCaption").hidden = true;
    $("openCamera").hidden = false;
    $("openCamera").href = "phone.html?src=" + encodeURIComponent(SOURCE);
    $("addStatus").textContent = "";
    return;
  }
  if (!serverOn) {
    $("addStatus").textContent = "Add your server URL in js/config.js to use this.";
    return;
  }
  // a random code links THIS screen to the phone that scans it
  // (short link = fewer dots in the QR)
  const session = Math.random().toString(36).slice(2, 8);
  // the code links THIS screen to the phone; src = where this visitor came from (left out if "direct")
  const url = CONFIG.PHONE_URL + "?s=" + session + (SOURCE !== "direct" ? "&src=" + encodeURIComponent(SOURCE) : "");
  drawQR($("qr"), url);                                  // rounded style: edit js/qr.js
  $("addStatus").textContent = "";

  // the note arrived (from Firebase or from the Apps Script check, whichever is first)
  let done = false;
  async function receive(data) {
    if (done) return;
    done = true;
    clearInterval(pollTimer);
    if (closeLive) { closeLive(); closeLive = null; }
    track("note_arrived", { flag: data.flag, live: liveOn() });
    if (data.flag === "self-harm") { showStep("Thank you.", "This note won’t be posted. Please check your phone."); return; }
    if (data.flag && data.flag !== "ok") { showStep("Thank you.", "Your note will be reviewed before it appears."); return; }
    lastNote = await arrive(data);              // back to the map: the note flies in
  }

  // 1. LIVE (Firebase): instant, with "Phone connected" → "on the way" → arrival
  if (liveOn()) {
    try {
      closeLive = await listen(session, room => {
        if (room.step === "connected") showStep("Phone connected", "Take a photo of your note");
        if (room.step === "photo") showStep("Your note is on the way…", "Check the text on your phone, then submit");
        if (room.step === "sent" && room.note) receive(room.note);
      });
    } catch (e) { console.warn("live connection failed, using the slower check", e); }
  }

  // 2. BACKUP (Apps Script): asks Google every 1.5 s
  fetch(CONFIG.SERVER_URL + "?action=version").then(r => r.json()).then(v => {
    if (!(v.version >= 4) && !liveOn()) $("addStatus").textContent =
      "Heads up: the server script is out of date, so a note sent from a phone won't show up here. Update Code.gs in Apps Script and deploy a new version.";
  }).catch(() => {});
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(CONFIG.SERVER_URL + "?action=session&s=" + session);
      const data = await res.json();
      if (data.status === "received") receive(data);
    } catch (e) { console.warn("poll failed", e); }
  }, liveOn() ? 4000 : 1500);
}

// laptop: replace the QR with what's happening on the phone
function showStep(title, sub) {
  $("qr").hidden = true;
  $("qrCaption").hidden = true;
  $("liveStep").hidden = false;
  $("liveTitle").textContent = title;
  $("liveSub").textContent = sub;
}

// came from the phone page ("See where it landed")? show that person's note
async function showMyNote() {
  if (!new URLSearchParams(location.search).has("mine")) return;
  let data = null;
  try { data = JSON.parse(localStorage.getItem("cg:myNote")); } catch (e) {}
  if (!data) return;
  await wait(2800);                            // let the intro finish first
  arrive(data);
}

// ============================================================
//  ARRIVAL: a new note flies in from the bottom, you see it for a
//  second, then it zooms out, crumples into a ball and joins its group.
// ============================================================
async function arrive(data) {
  closeAll();                                   // leave the "Add a note" page
  if (selected) closeNote();
  controls.autoRotate = false;
  const node = {
    id: "n" + Date.now(), text: data.text, image: data.image || null,
    allowReplies: data.allowReplies, pending: true, group: -1, __arriving: true
  };
  node.vec = knownVector(node.text);
  if (!node.vec) {
    try {                                         // wait for the AI at most 8 s, then place it in the middle
      node.vec = await Promise.race([embed([node.text]).then(v => v[0]), wait(8000).then(() => null)]);
    } catch (e) { console.error(e); }
  }
  notes.push(node);
  regroup();
  if (!node.vec) embed([node.text]).then(v => { node.vec = v[0]; regroup(); }).catch(() => {});                      // finds its spot; the others shift a little
  const T = new THREE.Vector3(node.tx || 0, node.ty || 0, node.tz || 0);
  setPos(node, T);

  // 1. camera turns to where the note will land
  const out = T.length() > 1 ? T.clone().normalize() : new THREE.Vector3(0, 0, 1);
  const D = CONFIG.NOTE_SIZE * 6;
  graph.cameraPosition(T.clone().addScaledVector(out, D), T, 1200);
  await wait(1250);

  // 2. the note appears below the screen, flat and big, and flies up into view
  const cam = graph.camera();
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(cam.quaternion);
  const halfH = D * Math.tan((cam.fov * Math.PI) / 360);
  const S = T.clone().addScaledVector(down, halfH * 2);
  node.__pos = S.clone();
  graph.graphData({ nodes: notes, links: [] });
  await wait(60);
  await tween(1100, e => node.__pos.lerpVectors(S, T, e), easeOut);

  // 3. a second to read it
  await wait(CONFIG.ARRIVE_HOLD);

  // 4. zoom out while it crumples into a ball
  graph.cameraPosition(T.clone().addScaledVector(out, D * 2.6), T, 1400);
  await tween(1400, e => {
    node.__crumple.setProgress(e);
    node.__group.scale.setScalar(CONFIG.ARRIVE_SCALE + (1.2 - CONFIG.ARRIVE_SCALE) * e);
  });
  node.__arriving = false;
  node.__pos = null;
  await paperToDot(node, 600);

  // 5. step back to see the whole map
  await wait(500);
  fitCamera(1800);
  return node;
}

function setPos(n, v) {
  n.fx = n.x = n.tx = v.x; n.fy = n.y = n.ty = v.y; n.fz = n.z = n.tz = v.z;
}
