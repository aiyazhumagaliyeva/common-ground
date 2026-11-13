// ============================================================
//  COMMON GROUND — the 3D map of notes
// ============================================================
// exact versions, built for Safari too (target=es2020), sharing ONE Three.js
import ForceGraph3D from 'https://esm.sh/3d-force-graph@1.80.1?deps=three@0.181.0&target=es2020';
import * as THREE from 'https://esm.sh/three@0.181.0?target=es2020';
import { CONFIG } from './config.js';
import { embed, layout, knownVector, loadModel } from './cluster.js';
import { photoNotes } from './seed.js';
import { drawQR } from './qr.js';
import { liveOn, listen } from './live.js';
import { makeGlass } from './glass.js';
import { track, startTracking, SOURCE, optOut, optedOut } from './track.js';

startTracking("map");
makeGlass(document.getElementById("nav"));      // liquid glass menu (settings from Figma)

const $ = id => document.getElementById(id);
window.appStarted = true;
const serverOn = CONFIG.SERVER_URL.trim() !== "";

// ============================================================
//  NOTES
// ============================================================
const notes = [];
const responsesFor = {};        // note id → [{ text, image, pending }]
// preview only: white placeholder responses so the layout can be judged before real ones exist
Object.entries(CONFIG.RESPONSE_PREVIEW || {}).forEach(([id, count]) => {
  responsesFor[id] = Array.from({ length: count }, () => ({ placeholder: true }));
});
const rnd = () => (Math.random() - 0.5) * 40;

photoNotes.forEach(p => notes.push({
  id: p.file, text: p.text, image: `notes/${p.file}.jpg`,
  allowReplies: p.allowReplies !== false, group: -1
}));
notes.forEach(n => { n.fx = n.x = rnd(); n.fy = n.y = rnd(); n.fz = n.z = rnd(); });

// ============================================================
//  ONE NOTE ON THE MAP = its photo as a flat piece of paper,
//  with a soft shadow and a slight tilt, always facing you.
// ============================================================
let introPending = true;              // notes stay tiny until the opening animation
const LOOK = 512, LOOK_PAD = 40;      // picture size; extra room around the paper for the shadow
const hashUnit = (id, k) => {         // stable number between -1 and 1 per note
  let h = 2166136261 ^ k;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 20001) / 10000 - 1;
};

// draws the paper (photo + shadow) into the note's picture
function paintNote(n) {
  const c = document.createElement("canvas"); c.width = c.height = LOOK;
  const g = c.getContext("2d"), S = LOOK - LOOK_PAD * 2, x = LOOK_PAD, y = LOOK_PAD;
  if (CONFIG.NOTE_SHADOW) {
    g.save();
    g.shadowColor = "rgba(0,0,0,0.22)"; g.shadowBlur = 26; g.shadowOffsetY = 12;
    g.fillStyle = "#fff"; g.fillRect(x, y, S, S);
    g.restore();
  }
  if (n.__img && n.__img.naturalWidth) {
    g.drawImage(n.__img, x, y, S, S);                    // the photo
  } else {                                               // no photo: plain paper with the words
    g.fillStyle = "#f3e6a8"; g.fillRect(x, y, S, S);
    g.fillStyle = "#222"; g.font = "32px Helvetica, Arial, sans-serif";
    wrapText(g, n.text, S - 60).slice(0, 10).forEach((l, i) => g.fillText(l, x + 30, y + 60 + i * 40));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = n.__note.material;
  if (m.map) m.map.dispose();
  m.map = tex; m.opacity = 1; m.needsUpdate = true;
}
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(" "), lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  lines.push(line);
  return lines;
}

// ---- notes with responses: small notes stuck on the bottom-right corner (like Figma flow 3) ----
const whiteTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function addResponseBadges(n) {
  if (!n.__note) return;
  const list = responsesFor[n.id] || [];
  const want = Math.min(list.length, 2);
  n.__badges = n.__badges || [];
  while (n.__badges.length < want) {
    const r = list[n.__badges.length];
    const mat = new THREE.SpriteMaterial({ map: whiteTex, transparent: true, depthWrite: false });
    if (r.image) new THREE.TextureLoader().load(r.image, t => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; });
    const b = new THREE.Sprite(mat);
    const i = n.__badges.length;
    b.scale.setScalar(0.34);                                   // a third of the note
    b.position.set(0.3 + i * 0.07, -0.3 - i * 0.05, 0.02 + i * 0.01);   // over the bottom-right corner
    b.renderOrder = 2;
    n.__note.add(b);
    n.__badges.push(b);
  }
}

// the 3D object for one note (3d-force-graph calls this once per note)
function makeNote(node) {
  const group = new THREE.Group();
  node.__group = group;
  const note = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0 }));   // invisible until the photo loads
  note.material.rotation = hashUnit(node.id, 7) * (CONFIG.NOTE_TILT * Math.PI / 180);         // a slight tilt
  note.scale.setScalar(CONFIG.NOTE_SIZE * LOOK / (LOOK - LOOK_PAD * 2));
  node.__note = note;
  node.__phase = [...String(node.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 97;   // so notes float out of step
  group.add(note);
  if (node.image) {
    node.__img = new Image();
    node.__img.onload = () => paintNote(node);
    node.__img.onerror = () => paintNote(node);
    node.__img.src = node.image;
  } else paintNote(node);
  addResponseBadges(node);
  if (node.__arriving) group.scale.setScalar(CONFIG.ARRIVE_SCALE);   // new note: big while it flies in
  else if (introPending) group.scale.setScalar(0.001);              // pops in during the intro
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
// "orbit" controls: drag = rotate, right-drag = move, pinch = zoom (scroll is handled below: it turns the map)
const graph = ForceGraph3D({ controlType: "orbit" })($("map"));
graph.width(window.innerWidth).height(window.innerHeight)
  .backgroundColor(CONFIG.BG_COLOR || "#ffffff")
  .showNavInfo(false)
  .enableNodeDrag(false)                 // dragging always turns the whole map, never moves one note
  .nodeLabel(() => "")                  // no small text box on hover or tap
  .nodeThreeObject(makeNote)
  .cooldownTime(2500);
// Retina screens draw 4× the pixels; above this the map gets laggy (most of all when zoomed in)
graph.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.MAX_PIXEL_RATIO || 1.5));
graph.d3Force("charge", null);           // no physics: positions come from meaning
graph.d3Force("link", null);
graph.d3Force("center", null);
graph.graphData({ nodes: notes, links: [] });
graph.cameraPosition({ x: 0, y: 0, z: CONFIG.MAX_ZOOM * 1.8 });    // intro starts far away

// zoom goes toward where the mouse points, so far-away notes are easy to reach
const controls = graph.controls();
controls.zoomToCursor = CONFIG.ZOOM_TO_MOUSE;   // false = zoom toward the middle, so the map stays centered
controls.screenSpacePanning = true;
controls.zoomSpeed = CONFIG.ZOOM_SPEED;
controls.minDistance = 15;          // how close you can get to a note
controls.maxDistance = 1200;
controls.autoRotate = true;           // slow drift until someone touches the map
controls.autoRotateSpeed = CONFIG.DRIFT_SPEED;
controls.addEventListener("start", () => (controls.autoRotate = false));

// ---- scroll turns the map, pinch zooms (smoothly) ----
// Scroll up/down (mouse wheel or two fingers on the trackpad) tilts the map up/down,
// scroll left/right turns it left/right. The map follows your fingers, like dragging it.
// Strength and easing are the same as comfortmagazine.world's drag: 0.005 per pixel sideways,
// 0.003 up/down, eased 10% / 8% per frame, tilt stops at about 50° up or down.
// Pinch on the trackpad (or Ctrl + mouse wheel) zooms. Drag still turns it too. Phones keep finger drag + pinch.
let turnLeft = 0, tiltLeft = 0; // how much turning is still to come (eases out by itself)
let zoomGoal = null;          // distance the camera is gliding to
let camTweenUntil = 0;        // while the camera flies somewhere (open a note, walkthrough), scroll waits
const camPos = graph.cameraPosition;
graph.cameraPosition = function (pos, look, ms) {
  if (pos) { turnLeft = tiltLeft = 0; zoomGoal = null; if (ms) camTweenUntil = performance.now() + ms; }
  return camPos.apply(this, arguments);
};
function camDistance() { return graph.camera().position.distanceTo(controls.target); }
function zoomBy(factor) {
  const from = zoomGoal ?? camDistance();
  zoomGoal = Math.min(controls.maxDistance, Math.max(controls.minDistance, from * factor));
}
function mapBusy() { return selected || !$("tour").hidden || performance.now() < camTweenUntil; }
$("map").addEventListener("wheel", e => {
  e.preventDefault();
  e.stopPropagation();                                   // the orbit controls never see it: scroll no longer zooms
  if (mapBusy()) return;
  controls.autoRotate = false;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;   // lines / pages → pixels
  const dx = e.deltaX * unit, dy = e.deltaY * unit;
  if (e.ctrlKey) {                                       // trackpad pinch (Chrome, Firefox) or Ctrl + wheel
    zoomBy(Math.exp(Math.max(-30, Math.min(30, dy)) * 0.0051 * CONFIG.ZOOM_SPEED));
    return;
  }
  turnLeft += dx * 0.005 * CONFIG.SCROLL_TURN;           // left / right
  tiltLeft += dy * 0.003 * CONFIG.SCROLL_TURN;           // up / down
}, { capture: true, passive: false });
// Safari sends trackpad pinch as "gesture" events instead
let gestureFrom = 1;
$("map").addEventListener("gesturestart", e => { e.preventDefault(); gestureFrom = e.scale || 1; });
$("map").addEventListener("gesturechange", e => {
  e.preventDefault();
  if (mapBusy()) return;
  controls.autoRotate = false;
  const s = e.scale || 1;
  zoomBy(Math.pow(gestureFrom / s, CONFIG.ZOOM_SPEED));
  gestureFrom = s;
});
// ---- moving the mouse turns the map gently (like comfortmagazine.world, but softer) ----
// The map leans toward where the mouse is: mouse right → the map turns right, mouse down → it tilts down.
// It holds still while the mouse is on a note (so the note doesn't run away from the click),
// while you press/drag, while a note or the walkthrough is open. MOUSE_TURN in config: 0 = off.
let mouseAim = null, aimNow = { x: 0, y: 0 }, mousePressed = false;
$("map").addEventListener("pointermove", e => {
  if (e.pointerType !== "mouse") return;                // phones and tablets: finger drag only
  mouseAim = { x: e.clientX / innerWidth * 2 - 1, y: e.clientY / innerHeight * 2 - 1 };   // -1 … 1 from the middle
});
$("map").addEventListener("pointerdown", () => (mousePressed = true));
window.addEventListener("pointerup", () => (mousePressed = false));
document.addEventListener("mouseleave", () => (mouseAim = null));   // left the window: stay where it is
function mouseLean() {                                   // how much to turn / tilt this frame because of the mouse
  const k = CONFIG.MOUSE_TURN ?? 1;
  if (!k || !mouseAim || mousePressed || hoverNote || mapBusy() || document.body.classList.contains("page-open")) return [0, 0];
  const dx = (mouseAim.x - aimNow.x) * 0.05, dy = (mouseAim.y - aimNow.y) * 0.05;
  aimNow.x += dx; aimNow.y += dy;
  return [-dx * 0.6 * k, -dy * 0.25 * k];               // up to ~34° left/right and ~14° up/down from where you are
}

// every frame: apply part of what is left of the turn, tilt and zoom, easing out
const TILT_MIN = Math.PI / 2 - 0.9, TILT_MAX = Math.PI / 2 + 0.9;
const _off = new THREE.Vector3(), _sph = new THREE.Spherical();
function glide() {
  const cam = graph.camera(), t = controls.target;
  const [leanTurn, leanTilt] = mouseLean();
  if (turnLeft || tiltLeft || zoomGoal !== null || Math.abs(leanTurn) > 1e-5 || Math.abs(leanTilt) > 1e-5) {
    _off.copy(cam.position).sub(t);
    _sph.setFromVector3(_off);
    const turn = turnLeft * 0.1 + leanTurn, tilt = tiltLeft * 0.08 + leanTilt;
    turnLeft -= turnLeft * 0.1; tiltLeft -= tiltLeft * 0.08;
    if (Math.abs(turnLeft) < 0.0002) turnLeft = 0;
    if (Math.abs(tiltLeft) < 0.0002) tiltLeft = 0;
    _sph.theta += turn;
    const phi = _sph.phi + tilt;                          // stop at the top / bottom limit (never pushes further out)
    if (tilt > 0) _sph.phi = Math.max(_sph.phi, Math.min(phi, TILT_MAX));
    else if (tilt < 0) _sph.phi = Math.min(_sph.phi, Math.max(phi, TILT_MIN));
    if ((tilt > 0 && _sph.phi >= TILT_MAX) || (tilt < 0 && _sph.phi <= TILT_MIN)) tiltLeft = 0;
    if (zoomGoal !== null) {
      _sph.radius += (zoomGoal - _sph.radius) * 0.16;    // glide toward the zoom, no jumps
      if (Math.abs(zoomGoal - _sph.radius) < 0.05) { _sph.radius = zoomGoal; zoomGoal = null; }
    }
    _off.setFromSpherical(_sph);
    cam.position.copy(t).add(_off);
    cam.lookAt(t);
  }
  requestAnimationFrame(glide);
}
requestAnimationFrame(glide);

// ---- every frame: notes float gently and face you ----
function tick(now) {
  const cam = graph.camera(), t = now / 1000;
  notes.forEach(n => {
    const g = n.__group;
    if (!g) return;
    g.quaternion.copy(cam.quaternion);                    // paper always faces the camera
    n.__note.position.y = Math.sin(t * 0.8 + n.__phase) * CONFIG.NOTE_SIZE * CONFIG.FLOAT;
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
  notes.forEach(addResponseBadges);                       // responses loaded from the server show on the map
  animateToTargets();
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

// The camera flies close to the note, on the line from the map's center through the note,
// and keeps looking at the center: the note is in the middle of the screen, and the map
// still turns around its own center afterwards (it never becomes the clicked note).
function flyTo(node, ms = 1500) {
  const dist = CONFIG.NOTE_SIZE * 4;                     // how close it flies
  let dir = new THREE.Vector3(node.tx, node.ty, node.tz);
  const r = dir.length();
  if (r < 1) dir = graph.camera().position.clone();      // a note right at the center: come from where you are
  dir.normalize();
  const p = dir.multiplyScalar(r + dist);
  graph.cameraPosition({ x: p.x, y: p.y, z: p.z }, { x: 0, y: 0, z: 0 }, ms);
}

// ---- click a note: the camera flies close, then the note view opens ----
let selected = null, openViewTimer = null;
function openNote(node) {
  if (selected === node || node.__arriving) return;
  if (selected) closeNote();
  selected = node;
  controls.autoRotate = false;
  track("note_open", { id: node.id });
  node.__openedAt = performance.now();
  flyTo(node, 1100);
  clearTimeout(openViewTimer);
  openViewTimer = setTimeout(() => { if (selected === node) showNoteView(node); }, 300);
}
function closeNote() {
  const n = selected;
  if (!n) return;
  selected = null;
  track("note_close", { id: n.id, seconds: Math.round((performance.now() - n.__openedAt) / 1000) });
  clearTimeout(openViewTimer);
  hideNoteView();
  setTimeout(() => { if (!selected) controls.autoRotate = CONFIG.DRIFT_SPEED > 0; }, 500);   // after the note is back on the map
}
graph.onNodeClick(openNote);
graph.onBackgroundClick(closeNote);

// research: which notes people stop on (hovered at least 1 second). Clarity can't see inside the 3D map,
// so this goes to the events tab (and to Clarity as an event, to filter recordings by it)
let hoverNote = null, hoverSince = 0;
graph.onNodeHover(n => {
  const now = performance.now();
  if (hoverNote && now - hoverSince >= 1000) track("note_hover", { id: hoverNote.id, seconds: Math.round((now - hoverSince) / 100) / 10 });
  hoverNote = n || null; hoverSince = now;
});

// ---- opening animation: notes pop in ----
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
  if (serverOn) {
    try {
      const res = await fetch(CONFIG.SERVER_URL + "?action=approved");
      const saved = await res.json();
      saved.filter(s => !CONFIG.PHOTO_NOTES_ONLY || s.image).forEach(s => {
        if (s.replyTo) { (responsesFor[s.replyTo] = responsesFor[s.replyTo] || []).push({ text: s.text, image: s.image }); return; }
        notes.push({
          id: "s" + s.id, text: s.text, image: s.image || null, color: s.color,
          allowReplies: s.allowReplies, group: -1, fx: rnd(), fy: rnd(), fz: rnd()
        });
      });
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
    console.warn("Could not load the AI model. New notes stay in the middle.");
  }
}
start();

// ============================================================
//  NAVIGATION + "ADD YOURS" (phone handoff with a QR code)
//  Desktop shows a QR → phone opens phone.html → phone sends the
//  photo → desktop sees it and the note flies onto the map.
// ============================================================

let pollTimer = null;
let closeLive = null;          // closes the live (Firebase) room

function openPage(id) {
  closeAll();
  document.body.classList.add("page-open");
  $(id).classList.add("open");
}
function closeAll() {
  hidePages();
  clearInterval(pollTimer);
  if (closeLive) { closeLive(); closeLive = null; }
  $("handoffPill").hidden = true;
}
function hidePages() {
  document.body.classList.remove("page-open");
  document.querySelectorAll(".page").forEach(p => p.classList.remove("open"));
}
// the phone scanned the QR: close the add page, keep waiting for the note in the background
function phoneConnected(title) {
  $("handoffText").textContent = title;
  $("handoffPill").hidden = false;
  if ($("addPage").classList.contains("open")) { hidePages(); track("add_autoclose"); }
}

const isPhone = () => innerWidth <= 600 || (matchMedia("(pointer: coarse)").matches && innerWidth < 900);   // narrow window counts too (phone preview on a laptop)
$("navAdd").addEventListener("click", () => {
  openPage("addPage");
  track("add_open", { phone: isPhone() });
  if (!isPhone()) loadModel().catch(() => {});        // get the AI ready before the note arrives
  $("qr").hidden = false;
  $("qrCaption").hidden = false;
  startHandoff();
});
$("navAbout").addEventListener("click", () => { openPage("aboutPage"); track("about_open"); });
// phone menu (Figma: phone-menu): the same three buttons as the desktop pill
function setMenu(open) {
  $("phoneMenu").hidden = !open;
  $("menuBtn").setAttribute("aria-expanded", open);
  if (open) track("menu_open");
}
$("menuBtn").addEventListener("click", () => setMenu(true));
$("menuClose").addEventListener("click", () => setMenu(false));
document.querySelectorAll("#phoneMenu [data-go]").forEach(b => b.addEventListener("click", () => { setMenu(false); $(b.dataset.go).click(); }));
$("optOut").addEventListener("click", () => { optOut(); $("optOut").outerHTML = "<span>Done, your visits aren’t counted.</span>"; });
if (optedOut()) $("optOut").outerHTML = "<span>Your visits aren’t counted.</span>";
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeAll));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });

async function startHandoff() {
  if (isPhone()) {                                     // on a phone: no QR, go straight to the camera
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
    if (data.flag === "self-harm") { pillMessage("Thank you. This note won’t be posted. Please check your phone."); return; }
    if (data.flag === "gibberish") { pillMessage("We couldn’t read that note. Please try again with a clearer photo."); return; }
    if (data.flag === "person-in-photo") { pillMessage("That photo has a person in it, so it wasn’t posted. Please photograph just the note."); return; }
    if (data.flag && data.flag !== "ok") { pillMessage("Thank you. Your note will be checked before it appears."); return; }
    $("handoffPill").hidden = true;
    hidePages();
    arrive(data);                               // back to the map: the note flies in
  }

  // 1. LIVE (Firebase): instant, with "Phone connected" → "on the way" → arrival
  if (liveOn()) {
    try {
      closeLive = await listen(session, room => {
        if (room.step === "connected") phoneConnected("Phone connected. Your note will land here.");
        if (room.step === "photo") phoneConnected("Your note is on the way…");
        if (room.step === "sent" && room.note) receive(room.note);
      });
    } catch (e) { console.warn("live connection failed, using the slower check", e); }
  }

  // 2. BACKUP (Apps Script): asks Google every 1.5 s
  fetch(CONFIG.SERVER_URL + "?action=version").then(r => r.json()).then(v => {
    if (!(v.version >= 5)) console.warn("Common Ground: the server script (Code.gs) is out of date. Phones can't send notes to this screen until a new version is deployed.");
  }).catch(() => {});
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(CONFIG.SERVER_URL + "?action=session&s=" + session);
      const data = await res.json();
      if (data.status === "received") receive(data);
      else if (data.status === "connected" && $("handoffPill").hidden) phoneConnected("Phone connected. Your note will land here.");
    } catch (e) { console.warn("poll failed", e); }
  }, liveOn() ? 4000 : 1500);
}

function pillMessage(t) {
  $("handoffText").textContent = t; $("handoffPill").hidden = false;
  $("handoffPill").querySelector(".pulse").hidden = true;
  setTimeout(() => { $("handoffPill").hidden = true; $("handoffPill").querySelector(".pulse").hidden = false; }, 6000);
}

// just sent from this phone (no laptop)? the camera page sends you here:
//   ?mine=1     → your note flies onto the map
//   ?replied=1  → the note you answered opens and your response lands on it
async function showMyNote() {
  const q = new URLSearchParams(location.search);
  if (!q.has("mine") && !q.has("replied")) return;
  history.replaceState(null, "", location.pathname);      // a refresh shouldn't play it again
  const key = q.has("mine") ? "cg:myNote" : "cg:myReply";
  let data = null;
  try { data = JSON.parse(localStorage.getItem(key)); } catch (e) {}
  if (!data || Date.now() - (data.t || 0) > 10 * 60 * 1000) return;   // only right after sending
  await wait(2800);                            // let the intro finish first
  if (q.has("mine")) { arrive(data); return; }
  const n = notes.find(x => x.id === data.replyTo);
  if (!n) return;
  openNote(n);
  await wait(1300);
  if (viewNote !== n) return;
  (responsesFor[n.id] = responsesFor[n.id] || []).push({ text: data.text, image: data.image, pending: true });
  addResponseBadges(n);
  drawResponses(n, true);
}

// ============================================================
//  ARRIVAL: a new note flies in from the bottom, big, you see it for a
//  moment, then the camera zooms out while it shrinks to its place.
// ============================================================
async function arrive(data) {
  closeAll();                                   // leave the "Add a note" page
  if (selected) closeNote();
  controls.autoRotate = false;
  const node = {
    id: data.id ? "s" + data.id : "n" + Date.now(),   // same id as after approval, so responses find it
    text: data.text, image: data.image || null,
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

  // 4. zoom out while it shrinks to its normal size
  graph.cameraPosition(T.clone().addScaledVector(out, D * 2.6), T, 1400);
  await tween(1400, e => node.__group.scale.setScalar(CONFIG.ARRIVE_SCALE + (1 - CONFIG.ARRIVE_SCALE) * e));
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


// ============================================================
//  WALKTHROUGH (Figma: home-how-to-*) + the "?" button
//  Shows on the first visit after the intro, and any time "?" is clicked.
//  Click anywhere to go to the next step; Esc closes it.
// ============================================================
const touch = matchMedia("(pointer: coarse)").matches;
const TOUR = [
  { id: "rotate", phone: "Drag with one finger to rotate the map", text: "Move the mouse to rotate the map",
    cursor: "move", from: [671, 532], to: [990, 579], textAt: [894, 740] },   // above the menu pill (now at the bottom)
  { id: "zoom", phone: "Pinch with two fingers to zoom in or zoom out", text: "Pinch with two fingers on the trackpad to zoom in or zoom out",
    image: "illustrations/zoom.png", textAt: [955, 648], imageAt: [955, 713, 409, 221] },
  { id: "open", phone: "Tap a note to open it", text: "Click to open a note",
    cursor: "click", textAt: [60, 130], opensNote: true },   // top left: clear of the open note and its responses
  // the next two only show when the walkthrough's note can have responses / has some
  { id: "respond", phone: "Tap “Respond with a photo” to answer a note with your own photo",
    text: "Click “Respond with a photo” to answer a note with your own photo",
    cursor: "click", textAt: [60, 130], keepNote: true, level: 1, target: () => $("nvRespond") },
  { id: "expand", phone: "Tap a small response to see it up close. Tap the small note to go back.",
    text: "Click a small response to see it up close. Click the small note to go back.",
    cursor: "click", textAt: [60, 130], keepNote: true, level: 2, target: () => $("nvResponses").querySelector(".canFocus") },
];
let tourStep = -1, tourNote = null, tourTimer = null, activeTour = TOUR, tourLevel = 0;

// what the walkthrough can show: 2 = a note with photo responses exists, 1 = a note open to responses, 0 = neither
const noteLevel = n => !n.allowReplies ? 0 : (responsesFor[n.id] || []).some(r => r.image) ? 2 : 1;
function startTour() {
  if (document.body.classList.contains("page-open")) closeAll();
  tourStep = -1;
  tourLevel = Math.max(0, ...notes.filter(n => n.__group && !n.__arriving).map(noteLevel));
  activeTour = TOUR.filter(st => !st.level || st.level <= tourLevel);
  const narrow = matchMedia("(max-width: 700px)").matches;
  (narrow ? $("tour") : $("tourStage")).appendChild($("tourCopy"));
  $("tourCopy").classList.toggle("phone", narrow);
  $("tour").hidden = false;
  document.body.classList.add("touring");
  track("tour_start");
  nextTourStep();
}
// zoom step: the map zooms in and back out, so you see what zooming does
let zoomDemoTimer = null, zoomDemoFrom = null;
function startZoomDemo() {
  const cam = graph.camera(), t = controls.target.clone();
  zoomDemoFrom = cam.position.clone();
  const near = t.clone().add(zoomDemoFrom.clone().sub(t).multiplyScalar(0.45));
  let zoomedIn = false;
  const step = () => {
    zoomedIn = !zoomedIn;
    graph.cameraPosition(zoomedIn ? near : zoomDemoFrom, t, 1300);
    if ($("tourCursor").classList.contains("hand")) $("tourCursor").src = zoomedIn ? "icons/hand-spread.png" : "icons/hand-pinch.png";
  };
  step();
  zoomDemoTimer = setInterval(step, 2200);
}
function stopZoomDemo() {
  if (!zoomDemoTimer) return false;
  clearInterval(zoomDemoTimer); zoomDemoTimer = null;
  graph.cameraPosition(zoomDemoFrom, controls.target, 600);
  return true;
}
function endTour() {
  stopZoomDemo();
  clearTimeout(tourTimer); clearInterval(tourTimer);
  if (demoAnim) { demoAnim.cancel(); demoAnim = null; }
  if (tourNote || viewNote || selected) { closeNote(); tourNote = null; fitCamera(1200); }
  $("tour").classList.remove("clear");
  controls.autoRotateSpeed = CONFIG.DRIFT_SPEED;
  $("tour").hidden = true;
  $("tourCopy").style.top = $("tourCopy").style.bottom = "";
  document.body.classList.remove("touring");
  try { localStorage.setItem("cg:toured", "1"); sessionStorage.setItem("cg:toured", "1"); } catch (e) {}
  track("tour_end", { step: tourStep });
}
// a point on the screen → the Figma artboard the cursor lives on
function toStage(x, y) {
  const k = $("tourStage").getBoundingClientRect().width / 1512 || 1;   // 1 Figma px on this screen
  const stage = $("tourStage").getBoundingClientRect();
  return [(x - stage.left) / k, (y - stage.top) / k];
}
// the walkthrough's note: one on screen near the middle that can show the most steps
function pickTourNote() {
  const ok = notes.filter(n => n.__group && !n.__arriving && noteLevel(n) >= tourLevel);
  const at = n => graph.graph2ScreenCoords(n.x || 0, n.y || 0, n.z || 0);
  const onScreen = ok.filter(n => { const c = at(n); return c.x > innerWidth * 0.2 && c.x < innerWidth * 0.8 && c.y > innerHeight * 0.2 && c.y < innerHeight * 0.75; });
  const pool = onScreen.length ? onScreen : ok;
  return pool.map(n => { const c = at(n); return [n, Math.hypot(c.x - innerWidth / 2, c.y - innerHeight / 2)]; }).sort((a, b) => a[1] - b[1])[0]?.[0] || null;
}
function nextTourStep() {
  const zoomWasOn = stopZoomDemo();
  clearTimeout(tourTimer); clearInterval(tourTimer);
  if (demoAnim) { demoAnim.cancel(); demoAnim = null; }
  if (tourNote && !activeTour[tourStep + 1]?.keepNote) { closeNote(); tourNote = null; }
  tourStep++;
  if (tourStep >= activeTour.length) return endTour();
  const st = activeTour[tourStep], cur = $("tourCursor"), img = $("tourImage");
  const at = (el, x, y) => { el.style.left = `calc(${x} * var(--k))`; el.style.top = `calc(${y} * var(--k))`; };
  $("tourText").textContent = touch || isPhone() ? st.phone : st.text;
  $("tourHint").textContent = `${touch || isPhone() ? "Tap" : "Click"} anywhere to continue · ${tourStep + 1} of ${activeTour.length}`;
  if (!$("tourCopy").classList.contains("phone")) at($("tourCopy"), st.textAt[0], st.textAt[1]);
  const hand = touch || isPhone();
  // drawing (zoom step, laptop only: phones get the pinching hand instead)
  img.hidden = !st.image || hand;
  if (st.image && !hand) {                                  // drawing sits under the text, so they never overlap
    img.src = st.image;
    img.style.width = `calc(${st.imageAt[2]} * var(--k))`;
  }
  // the white cursor on a laptop; hand drawings on a phone (pointing finger, pinch, tap)
  cur.hidden = true;
  cur.className = hand ? "hand" : "";
  controls.autoRotateSpeed = CONFIG.DRIFT_SPEED;
  if (hand && st.id === "zoom") { cur.hidden = false; cur.src = "icons/hand-spread.png"; at(cur, 700, 470); }
  if (st.id === "rotate") {                                  // the cursor moves across while the map turns
    cur.hidden = false;
    cur.src = hand ? "icons/hand-point.png" : "icons/cursor.svg";
    at(cur, st.from[0], st.from[1]);
    cur.style.setProperty("--dx", `calc(${st.to[0] - st.from[0]} * var(--k))`);
    cur.style.setProperty("--dy", `calc(${st.to[1] - st.from[1]} * var(--k))`);
    cur.className = hand ? "hand drag" : "move";             // laptop: just moving the mouse, no press
    controls.autoRotate = true;
    controls.autoRotateSpeed = 3;
  }
  if (st.id === "zoom") startZoomDemo();
  if (!st.keepNote) $("tour").classList.remove("clear");    // the note view already greys the map on note steps
  placePhoneCopy();

  // steps that click something: wait for the camera (after the zoom demo) or the note view, then glide there and click
  if (st.cursor === "click") {
    const run = (tries = 0) => {
      if (activeTour[tourStep] !== st) return;
      let x, y;
      if (st.opensNote) {
        controls.autoRotate = false;
        tourNote = pickTourNote();
        if (!tourNote) return;
        const c = graph.graph2ScreenCoords(tourNote.x || 0, tourNote.y || 0, tourNote.z || 0);
        x = Math.min(innerWidth - 40, Math.max(40, c.x)); y = Math.min(innerHeight - 40, Math.max(40, c.y));
      } else {
        const el = st.target();
        const r = el && !el.hidden ? el.getBoundingClientRect() : null;
        if (!r || !r.width || !viewNote) { if (tries < 30) tourTimer = setTimeout(() => run(tries + 1), 100); return; }
        x = r.left + r.width / 2; y = r.top + r.height / 2;
      }
      st.from = toStage(x, y);
      st.start = [st.from[0] + 240, st.from[1] + 150];
      at(cur, st.from[0], st.from[1]);
      cur.hidden = false;
      clickDemo(cur, st);
      tourTimer = setTimeout(() => {                         // the moment of the click
        if (activeTour[tourStep] !== st) return;
        if (st.opensNote) { openNote(tourNote); setTimeout(placePhoneCopy, 1100); }
        if (st.id === "respond" && !hand) tourRespondDemo(); // phones would open the camera: just show the tap
        if (st.id === "expand") { focusItem(st.target()); placePhoneCopy(); }
      }, 2600 * 0.55);
    };
    if (st.id === "expand" && $("noteView").classList.contains("responding")) {   // back from the QR card first
      $("noteView").classList.remove("responding"); $("nvCard").hidden = true;
    }
    tourTimer = setTimeout(run, zoomWasOn ? 650 : st.id === "expand" ? 550 : 0);
  }
}
// phones: while a note is open, the text goes under the note's button (not on top of it)
function placePhoneCopy() {
  const c = $("tourCopy");
  if (!c.classList.contains("phone")) return;
  if (!viewNote || $("tour").hidden) { c.style.top = ""; c.style.bottom = ""; return; }
  const el = $("nvRespond").hidden ? $("nvImg") : $("nvRespond");
  c.style.top = Math.round(el.getBoundingClientRect().bottom + 18) + "px";
  c.style.bottom = "auto";
}
// "Respond with a photo" in the walkthrough: show the QR card (a real link: scanning it opens the camera
// to respond to this note), without starting a live connection
function tourRespondDemo() {
  if (!viewNote) return;
  $("nvImg").style.transition = "";
  $("noteView").classList.add("responding");
  $("nvCard").hidden = false;
  drawQR($("nvQr"), CONFIG.PHONE_URL + "?reply=" + encodeURIComponent(viewNote.id));
}
// cursor glides from st.start to st.from, presses, (loops on the "add" step)
let demoAnim = null;
function clickDemo(cur, st) {
  const k = $("tourStage").getBoundingClientRect().width / 1512 || 1;   // 1 Figma px on this screen
  const dx = (st.start[0] - st.from[0]) * k, dy = (st.start[1] - st.from[1]) * k;
  const hand = cur.classList.contains("hand");
  cur.src = hand ? "icons/hand-point.png" : "icons/cursor.svg";
  if (demoAnim) demoAnim.cancel();
  demoAnim = cur.animate([
    { transform: `translate(${dx}px, ${dy}px)`, opacity: 0, offset: 0 },
    { transform: `translate(${dx}px, ${dy}px)`, opacity: 1, offset: 0.08 },
    { transform: "translate(0, 0) scale(1)", offset: 0.5, easing: "ease-out" },
    { transform: "translate(0, 0) scale(0.82)", offset: 0.58 },
    { transform: "translate(0, 0) scale(1)", offset: 0.68 },
    { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 0.9 },
    { transform: "translate(0, 0) scale(1)", opacity: st.loop ? 0 : 1, offset: 1 },
  ], { duration: 2600, iterations: st.loop ? Infinity : 1, fill: "forwards", easing: "ease-in-out" });
  // switch to the "clicking" cursor at the moment of the press
  const swap = () => {
    if (activeTour[tourStep] !== st) return;
    cur.src = hand ? "icons/hand-tap.png" : "icons/cursor-click.svg";
    setTimeout(() => { if (activeTour[tourStep] === st) cur.src = hand ? "icons/hand-point.png" : "icons/cursor.svg"; }, 700);
  };
  setTimeout(swap, 2600 * 0.5);
  if (st.loop) setInterval(swap, 2600);
}
$("tour").addEventListener("click", nextTourStep);
$("navHow").addEventListener("click", startTour);       // "How to navigate" in the menu (was the ? button)
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("tour").hidden) endTour(); });

// first visit: show it once, after the opening animation
let toured = false;
try {
  toured = CONFIG.TOUR_SHOW === "first-visit" ? localStorage.getItem("cg:toured") === "1"
         : CONFIG.TOUR_SHOW === "every-visit" ? sessionStorage.getItem("cg:toured") === "1"
         : true;                                                       // "never": only with the ? button
} catch (e) {}
if (!toured && !new URLSearchParams(location.search).has("mine")) {
  setTimeout(() => { if (!document.body.classList.contains("page-open")) startTour(); }, 3200);
}

// ============================================================
//  NOTE VIEW (Figma: home-responce-new, home-response-flow-1/2/3)
//  Click a note: the camera zooms toward it while the note itself grows
//  from its spot on the map into the middle, over a grey veil.
//  "Respond with a photo" moves it left and shows a QR card (flow 2).
//  A response sent from a phone lands on top of the note (flow 3).
// ============================================================
// where responses sit around the note (Figma placeholder positions, 1512 × 982 frame)
const RESPONSE_SLOTS = [[906, 615], [1020, 743], [381, 251], [270, 383], [122, 307], [223, 585], [906, 403], [1066, 527], [424, 615]];
let viewNote = null, respondTimer = null, closeRespondLive = null;

// where a note is on the screen right now (centre, size in px, tilt), from its 3D position
function noteOnScreen(n) {
  const cam = graph.camera(), v = new THREE.Vector3();
  n.__note.getWorldPosition(v);
  const d = v.distanceTo(cam.position) || 1;
  const p = v.clone().project(cam);
  const size = (CONFIG.NOTE_SIZE * n.__group.scale.x) / (2 * d * Math.tan(cam.fov * Math.PI / 360)) * innerHeight;
  return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, size, rot: -n.__note.material.rotation };
}
// the CSS transform that puts the big note image exactly over the small note on the map
function onMapTransform(n) {
  const r = $("nvImg").getBoundingClientRect(), s = noteOnScreen(n);
  return `translate(${s.x - (r.left + r.width / 2)}px, ${s.y - (r.top + r.height / 2)}px) scale(${Math.max(0.02, s.size / r.width)}) rotate(${s.rot}rad)`;
}
const VEIL = "rgba(38, 38, 38, 0.4)", NO_VEIL = "rgba(38, 38, 38, 0)";
let closingNote = null;
function stopViewAnimations() {
  [$("noteView"), $("nvImg"), $("nvLabel"), $("nvRespond"), $("nvResponses")].forEach(el => el.getAnimations().forEach(a => a.cancel()));
  if (closingNote) { closingNote.__note.visible = true; closingNote = null; }
  $("noteView").style.pointerEvents = "";
}

function showNoteView(n) {
  stopViewAnimations();
  viewNote = n;
  const v = $("noteView"), img = $("nvImg");
  img.src = n.image || "";
  img.alt = n.text;
  $("nvLabel").hidden = $("nvRespond").hidden = !n.allowReplies;
  $("nvCard").hidden = true;
  v.classList.remove("responding");
  drawResponses(n);
  v.hidden = false;
  if (!$("tour").hidden) $("tour").classList.add("clear");   // walkthrough: the note view greys the map now
  // the note grows out of its spot on the map into the middle; the veil darkens behind it
  const from = onMapTransform(n);
  n.__note.visible = false;                                   // the big image takes its place
  img.animate([{ transform: from, boxShadow: "none" }, { transform: "none" }], { duration: 700, easing: "cubic-bezier(.2,.75,.2,1)" });
  v.animate([{ backgroundColor: NO_VEIL }, { backgroundColor: VEIL }], { duration: 600, easing: "ease-out" });
  [$("nvLabel"), $("nvRespond"), $("nvResponses")].forEach(el =>
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 500, fill: "backwards" }));
}
function hideNoteView() {
  stopRespond();
  resetFocus();                                                // the note (not a response) shrinks back to the map
  const n = viewNote, v = $("noteView"), img = $("nvImg");
  viewNote = null;
  if (!n || v.hidden) { v.hidden = true; if (n) n.__note.visible = true; return; }
  stopViewAnimations();
  $("nvCard").hidden = true;
  img.style.transition = "none";                               // jump back from the "responding" spot without sliding
  v.classList.remove("responding");
  // the note shrinks back into its spot on the map; the veil lightens
  closingNote = n;
  v.style.pointerEvents = "none";                              // while it shrinks away, clicks already reach the map
  [$("nvLabel"), $("nvRespond"), $("nvResponses")].forEach(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }));
  v.animate([{ backgroundColor: VEIL }, { backgroundColor: NO_VEIL }], { duration: 450, fill: "forwards" });
  const a = img.animate([{ transform: "none" }, { transform: onMapTransform(n), boxShadow: "none" }],
    { duration: 450, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
  a.onfinish = () => {
    if (closingNote !== n) return;                           // another note opened meanwhile
    v.hidden = true;
    stopViewAnimations();
    img.style.transition = "";
  };
}
const PHONE_SLOTS = [[50, 52], [-8, 56], [56, -10], [-10, -8], [22, 62], [60, 22], [-12, 24], [24, -14], [36, 40]];
const phoneView = () => matchMedia("(max-width: 700px)").matches;
function drawResponses(n, animateLast = false) {
  resetFocus();
  const box = $("nvResponses"), list = responsesFor[n.id] || [];
  box.innerHTML = "";
  list.slice(0, RESPONSE_SLOTS.length).forEach((r, i) => {
    const el = document.createElement(r.image ? "img" : "div");
    el.className = "nvResp" + (animateLast && i === list.length - 1 ? " landing" : "");
    if (r.image) { el.src = r.image; el.alt = r.text || "A response"; }
    if (phoneView()) {
      const [x, y] = PHONE_SLOTS[i % PHONE_SLOTS.length];
      el.style.left = `calc(14vw + ${x}vw)`;
      el.style.top = `calc(var(--nvTop) + ${y}vw)`;
    } else {
      el.style.left = `calc(${RESPONSE_SLOTS[i][0]} * var(--k))`;
      el.style.top = `calc(${RESPONSE_SLOTS[i][1]} * var(--k))`;
    }
    if (r.image) {                                            // click a response: see it up close
      el.dataset.item = i;
      el.classList.add("canFocus");
      el.addEventListener("click", e => { e.stopPropagation(); focusItem(el); });
    }
    box.appendChild(el);
  });
  bigItem = "note";
}

// ---- see a response up close ----
// Click a response: it grows into the note's big spot and the note shrinks into the response's spot.
// Click the small note (or another response) to switch again.
let bigItem = "note";              // what is big right now: "note" or the number of a response
function itemImage(n, item) { return item === "note" ? n.image : (responsesFor[n.id] || [])[item].image; }
function focusItem(el) {
  const n = viewNote;
  if (!n || !$("nvCard").hidden) return;
  const big = $("nvImg"), was = bigItem, next = el.dataset.item === "note" ? "note" : +el.dataset.item;
  const a = big.getBoundingClientRect(), b = el.getBoundingClientRect();
  // swap pictures, then animate each one from where the other was (so they trade places)
  big.src = itemImage(n, next) || "";
  el.src = itemImage(n, was) || "";
  el.dataset.item = was;
  bigItem = next;
  const fromRect = (to, from) => `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  const ease = { duration: 500, easing: "cubic-bezier(.2,.75,.2,1)" };
  big.animate([{ transform: fromRect(a, b) }, { transform: "none" }], ease);
  el.animate([{ transform: fromRect(b, a), zIndex: 3 }, { transform: "none", zIndex: 3 }], ease);
  el.classList.toggle("isNote", was === "note");
  // label and button belong to the note: show them only while the note is big
  $("nvLabel").textContent = next === "note" ? "Open to responses" : "Response";
  $("nvLabel").hidden = next === "note" ? !n.allowReplies : false;
  $("nvRespond").hidden = next === "note" ? !n.allowReplies : true;
  $("nvImg").alt = next === "note" ? n.text : ((responsesFor[n.id] || [])[next].text || "A response");
  track("response_view", { id: n.id, item: next });
}
// put the note back in the big spot at once (before closing or redrawing)
function resetFocus() {
  if (bigItem === "note" || !viewNote) return;
  const el = $("nvResponses").querySelector(".nvResp.isNote");
  if (el) { el.src = itemImage(viewNote, bigItem) || ""; el.dataset.item = bigItem; el.classList.remove("isNote"); }
  $("nvImg").src = viewNote.image || "";
  $("nvImg").alt = viewNote.text;
  $("nvLabel").textContent = "Open to responses";
  $("nvLabel").hidden = $("nvRespond").hidden = !viewNote.allowReplies;
  bigItem = "note";
}

// "Click here to get a response QR code" → instructions + QR (flow 2)
async function startRespond() {
  if (!viewNote) return;
  const n = viewNote;
  if (isPhone() && $("tour").hidden) {
    track("respond_open", { id: n.id, phone: true });
    location.href = "phone.html?reply=" + encodeURIComponent(n.id) + (SOURCE !== "direct" ? "&src=" + encodeURIComponent(SOURCE) : "");
    return;
  }
  $("nvImg").style.transition = "";
  $("noteView").classList.add("responding");
  $("nvCard").hidden = false;
  track("respond_open", { id: n.id });
  if (!serverOn) return;
  const session = Math.random().toString(36).slice(2, 8);
  const url = CONFIG.PHONE_URL + "?s=" + session + "&reply=" + encodeURIComponent(n.id);
  drawQR($("nvQr"), url);
  let done = false;
  const receive = data => {
    if (done || !viewNote) return;
    done = true;
    stopRespond();
    track("response_arrived", { flag: data.flag });
    if (data.flag && data.flag !== "ok") return;
    (responsesFor[n.id] = responsesFor[n.id] || []).push({ text: data.text, image: data.image, pending: true });
    addResponseBadges(n);
    $("noteView").classList.remove("responding");          // back to flow 3: the response lands on the corner
    $("nvCard").hidden = true;
    drawResponses(n, true);
  };
  if (liveOn()) {
    try {
      closeRespondLive = await listen(session, room => { if (room.step === "sent" && room.note) receive(room.note); });
    } catch (e) { console.warn(e); }
  }
  respondTimer = setInterval(async () => {
    try {
      const d = await (await fetch(CONFIG.SERVER_URL + "?action=session&s=" + session)).json();
      if (d.status === "received") receive(d);
    } catch (e) {}
  }, liveOn() ? 4000 : 1500);
}
function stopRespond() {
  clearInterval(respondTimer); respondTimer = null;
  if (closeRespondLive) { closeRespondLive(); closeRespondLive = null; }
}
$("nvRespond").addEventListener("click", e => { e.stopPropagation(); startRespond(); });
$("nvCard").addEventListener("click", e => e.stopPropagation());
$("nvImg").addEventListener("click", e => e.stopPropagation());
$("noteView").addEventListener("click", () => {             // click the veil: back (card first, then the map)
  if (!$("nvCard").hidden) { stopRespond(); $("nvCard").hidden = true; $("noteView").classList.remove("responding"); return; }
  closeNote();
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && selected && $("tour").hidden) closeNote(); });   // also while it is still opening
