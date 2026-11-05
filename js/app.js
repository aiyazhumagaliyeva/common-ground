// ============================================================
//  COMMON GROUND — map + writing flow
// ============================================================
// exact versions, built for Safari too (target=es2020), sharing ONE Three.js
import ForceGraph3D from 'https://esm.sh/3d-force-graph@1.80.1?deps=three@0.181.0&target=es2020';
import * as THREE from 'https://esm.sh/three@0.181.0?target=es2020';
import { CONFIG } from './config.js';
import { embed, layout } from './cluster.js';
import { checkNote } from './safety.js';
import { photoNotes, typedNotes } from './seed.js';
import { drawQR } from './qr.js';
import { makeCrumple } from './crumple.js';

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
  id: "p" + i, text: "I wish I could " + p.text, image: `notes/${p.file}.jpg`,
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

// ---- one note = a crumpled paper ball made from its photo ----
let introPending = true;              // balls stay hidden until the opening animation
function makeBall(node) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  node.__ctx = canvas.getContext("2d");
  node.__tex = new THREE.CanvasTexture(canvas);
  node.__tex.colorSpace = THREE.SRGBColorSpace;
  if (node.image) {
    node.__img = new Image();
    node.__img.onload = () => paint(node);
    node.__img.src = node.image;
  }
  paint(node);

  const seed = [...String(node.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 97;
  node.__crumple = makeCrumple(THREE, node.__tex, CONFIG.NOTE_SIZE * 1.6, seed);
  node.__phase = seed;                                   // each ball floats on its own rhythm
  const group = new THREE.Group();
  group.add(node.__crumple.mesh);
  node.__group = group;

  if (node.__arriving) {                                 // new note: starts flat and big
    node.__crumple.setProgress(0);
    group.scale.setScalar(CONFIG.ARRIVE_SCALE);
  } else if (introPending) {
    group.scale.setScalar(0.001);                        // pops in during the intro
  }
  return group;
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
  .backgroundColor("#ffffff")
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

// ---- every frame: balls float and tumble; open notes face you ----
function tick(now) {
  const cam = graph.camera(), t = now / 1000;
  notes.forEach(n => {
    const g = n.__group;
    if (!g) return;
    g.quaternion.copy(cam.quaternion);                    // flat side always faces the camera
    const m = n.__crumple.mesh;
    const isBall = n.__crumple.progress >= 0.999;
    if (n.__arriving || !isBall) {                        // flat or unfolding: hold still
      m.rotation.x *= 0.85; m.rotation.y *= 0.85; m.position.y *= 0.85;
    } else {
      m.rotation.x += 0.0025; m.rotation.y += 0.0035;
      m.position.y = Math.sin(t * 0.8 + n.__phase) * CONFIG.NOTE_SIZE * CONFIG.FLOAT;
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
  const before = notes.map(n => n.group);
  const count = layout(notes);
  animateToTargets();
  $("mapInfo").textContent = count === 0
    ? `${notes.length} wishes · no groups yet`
    : `${notes.length} wishes · ${count} groups have formed`;
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
  const from = node.__crumple.progress;
  await tween(900, e => {
    node.__crumple.setProgress(from * (1 - e));
    node.__group.scale.setScalar(1 + e * (CONFIG.OPEN_SCALE - 1));
  });
}
function closeNote() {
  const n = selected;
  if (!n) return;
  selected = null;
  tween(700, e => {
    n.__crumple.setProgress(e);
    n.__group.scale.setScalar(CONFIG.OPEN_SCALE - e * (CONFIG.OPEN_SCALE - 1));
  });
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
  try {
    const vecs = await embed(notes.map(n => n.text));
    notes.forEach((n, i) => (n.vec = vecs[i]));
    regroup();
    intro();
    showMyNote();
  } catch (e) {
    console.error(e);
    intro();
    $("mapInfo").textContent = "Could not load the AI model (check internet). Notes stay in the middle.";
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
}

$("navAdd").addEventListener("click", () => {
  openPage("addPage");
  $("qr").hidden = false; $("addDone").hidden = true;
  $("qrCaption").hidden = false;
  startHandoff();
});
$("navAbout").addEventListener("click", () => openPage("aboutPage"));
$("navContact").addEventListener("click", () => openPage("contactPage"));
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeAll));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });
$("seeNote").addEventListener("click", () => { closeAll(); if (lastNote) setTimeout(() => flyTo(lastNote), 400); });

async function startHandoff() {
  if (!serverOn) {
    $("addStatus").textContent = "Add your server URL in js/config.js to use this.";
    return;
  }
  // a random code links THIS screen to the phone that scans it
  const session = Math.random().toString(36).slice(2, 10);
  const url = CONFIG.PHONE_URL + "?s=" + session;      // the phone page on your GitHub Pages site
  drawQR($("qr"), url);                                  // rounded style: edit js/qr.js
  $("addStatus").textContent = "Waiting for your photo…";

  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(CONFIG.SERVER_URL + "?action=session&s=" + session);
      const data = await res.json();
      if (data.status !== "received") return;     // still waiting (or old server script)
      clearInterval(pollTimer);
      if (data.flag === "self-harm") {
        $("addStatus").textContent = "Thank you. This note won't be posted. Please check your phone.";
        return;
      }
      if (data.flag !== "ok") {
        $("addStatus").textContent = "Thank you. Your note will be reviewed before it appears.";
        return;
      }
      lastNote = await arrive(data);              // back to the map: the note flies in
    } catch (e) { console.warn("poll failed", e); }
  }, 1500);
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
  try { node.vec = (await embed([node.text]))[0]; } catch (e) { console.error(e); }
  notes.push(node);
  if (node.vec) regroup();                      // finds its spot; the others shift a little
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
    node.__group.scale.setScalar(CONFIG.ARRIVE_SCALE + (1 - CONFIG.ARRIVE_SCALE) * e);
  });
  node.__arriving = false;
  node.__pos = null;

  // 5. step back to see the whole map
  await wait(500);
  fitCamera(1800);
  return node;
}

function setPos(n, v) {
  n.fx = n.x = n.tx = v.x; n.fy = n.y = n.ty = v.y; n.fz = n.z = n.tz = v.z;
}
