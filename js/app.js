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
import QRCode from 'https://esm.sh/qrcode@1.5.4?target=es2020';

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
  if (node.pending) {                                           // your note, waiting
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(0, S - 90, S, 90);
    ctx.fillStyle = "#111";
    ctx.font = "600 36px Inter, sans-serif";
    ctx.fillText("pending review", 40, S - 32);
  }
  node.__tex.needsUpdate = true;
}

function makeSprite(node) {
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: node.__tex, transparent: true }));
  sprite.scale.set(CONFIG.NOTE_SIZE, CONFIG.NOTE_SIZE, 1);
  return sprite;
}

// ============================================================
//  GRAPH
// ============================================================
const graph = ForceGraph3D()($("map"));
graph.width(window.innerWidth).height(window.innerHeight)
  .backgroundColor("#ffffff")
  .showNavInfo(false)
  .nodeLabel(n => n.text)
  .nodeThreeObject(makeSprite)
  .cooldownTime(2500);
graph.d3Force("charge", null);           // no physics: positions come from meaning
graph.d3Force("link", null);
graph.d3Force("center", null);
graph.graphData({ nodes: notes, links: [] });
graph.cameraPosition({ x: 0, y: 0, z: CONFIG.START_ZOOM });

window.addEventListener("resize", () => graph.width(window.innerWidth).height(window.innerHeight));

// ---- move every note to its new spot (smooth) ----
function animateToTargets(ms = 1600) {
  const from = notes.map(n => [n.fx, n.fy, n.fz]);
  const start = performance.now();
  graph.d3ReheatSimulation();
  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // ease in-out
    notes.forEach((n, i) => {
      if (n.tx === undefined) return;
      n.fx = from[i][0] + (n.tx - from[i][0]) * e;
      n.fy = from[i][1] + (n.ty - from[i][1]) * e;
      n.fz = from[i][2] + (n.tz - from[i][2]) * e;
    });
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---- regroup everything (after load, and after every new note) ----
function regroup() {
  const before = notes.map(n => n.group);
  const count = layout(notes);
  notes.forEach((n, i) => { if (n.__tex && n.group !== before[i]) paint(n); });
  animateToTargets();
  $("mapInfo").textContent = count === 0
    ? `${notes.length} wishes · no groups yet`
    : `${notes.length} wishes · ${count} groups have formed`;
}

// start zoom depends on how many notes there are:
// few notes → START_ZOOM (close), many notes → farther, up to MAX_ZOOM
function fitCamera() {
  const r = Math.max(...notes.map(n => Math.hypot(n.tx || 0, n.ty || 0, n.tz || 0))) + CONFIG.NOTE_SIZE;
  const fov = (graph.camera().fov * Math.PI) / 180;               // vertical field of view
  const aspect = window.innerWidth / window.innerHeight;
  const fitV = r / Math.tan(fov / 2);                              // fit top-to-bottom
  const fitH = r / (Math.tan(fov / 2) * aspect);                   // fit left-to-right
  const z = Math.min(CONFIG.MAX_ZOOM, Math.max(CONFIG.START_ZOOM, Math.max(fitV, fitH) * 1.1));
  graph.cameraPosition({ x: 0, y: 0, z }, { x: 0, y: 0, z: 0 }, 1200);
}

function flyTo(node) {
  const dist = 45, r = Math.hypot(node.tx, node.ty, node.tz) || 1;
  const k = 1 + dist / r;
  graph.cameraPosition({ x: node.tx * k, y: node.ty * k, z: node.tz * k },
                       { x: node.tx, y: node.ty, z: node.tz }, 1500);
}

graph.onNodeClick(node => {
  flyTo(node);
  $("selectedText").textContent = node.text;
  $("selectedMeta").textContent = node.pending ? "Your wish · pending review"
    : node.allowReplies ? "Open to responses" : "Just sharing";
  $("selected").hidden = false;
});

// ---- start: load saved notes, read meaning, arrange ----
async function start() {
  $("mapInfo").textContent = "Reading the wishes…";
  if (serverOn) {
    try {
      const res = await fetch(CONFIG.SERVER_URL + "?action=approved");
      const saved = await res.json();
      saved.forEach(s => notes.push({
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
    fitCamera();
  } catch (e) {
    console.error(e);
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
  const url = CONFIG.SERVER_URL + "?page=upload&s=" + session;
  await QRCode.toCanvas($("qr"), url, { width: 360, margin: 1 });   // sharp; CSS sets the size
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
      $("qr").hidden = true;                      // → "Thank you" inside the QR card
      $("qrCaption").hidden = true;
      $("addStatus").textContent = "";
      $("addDone").hidden = false;
      lastNote = await addPendingNote(data);
    } catch (e) { console.warn("poll failed", e); }
  }, 3000);
}

async function addPendingNote(data) {
  const node = {
    id: "n" + Date.now(), text: data.text, image: data.image || null,
    allowReplies: data.allowReplies, pending: true, group: -1, fx: 0, fy: 0, fz: 0
  };
  notes.push(node);
  graph.graphData({ nodes: notes, links: [] });
  try {
    node.vec = (await embed([node.text]))[0];
    regroup();
  } catch (e) { console.error(e); }
  return node;
}
