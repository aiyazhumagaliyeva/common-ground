// ============================================================
//  ANONYMOUS VISIT TRACKING (for research)
//  - Where people came from: ?src=… in the link/QR (e.g. poster-bushwick,
//    tiktok, instagram-reel), otherwise the referring website, otherwise "direct".
//  - What they did: a short list of events (opened a note, opened Add a note…)
//  - Saved to your Google Sheet, "events" tab. No names, no IP, no exact location.
//  - Heatmaps / cursor recordings: Microsoft Clarity (only if CLARITY_ID is set).
//  - Nothing is recorded until the visitor says OK to the notice.
// ============================================================
import { CONFIG } from './config.js';

const store = (kind, key, value) => {
  try {
    const s = kind === "local" ? localStorage : sessionStorage;
    if (value === undefined) return s.getItem(key);
    s.setItem(key, value);
  } catch (e) { return null; }
};
const rid = () => Math.random().toString(36).slice(2, 10);

// ---- where did this visit come from? (decided once per visit) ----
function findSource() {
  const q = new URLSearchParams(location.search);
  const tagged = q.get("src") || q.get("utm_source");
  if (tagged) {
    const campaign = q.get("utm_campaign");
    return (tagged + (campaign ? "-" + campaign : "")).toLowerCase().replace(/[^a-z0-9\-_]/g, "").slice(0, 60);
  }
  const ref = document.referrer;
  if (!ref) return "direct";                           // typed, bookmark, or sent in a chat app
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    if (host === location.hostname) return "internal";
    if (/instagram/.test(host)) return "instagram";
    if (/tiktok/.test(host)) return "tiktok";
    if (/(^|\.)t\.co$|twitter|x\.com/.test(host)) return "twitter";
    if (/facebook|fb\.com/.test(host)) return "facebook";
    if (/google\./.test(host)) return "google";
    return "ref-" + host;
  } catch (e) { return "direct"; }
}

let src = store("session", "cg:src");
if (!src) { src = findSource(); store("session", "cg:src", src); }
export const SOURCE = src;

let visitor = store("local", "cg:vid");               // random, stays on this device
if (!visitor) { visitor = rid(); store("local", "cg:vid", visitor); }
let visit = store("session", "cg:sid");               // one per visit (tab)
if (!visit) { visit = rid(); store("session", "cg:sid", visit); }

const device = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "phone"
             : /iPad|Tablet/i.test(navigator.userAgent) ? "tablet" : "desktop";

// ---- consent ----
export function consent() { return store("local", "cg:consent"); }   // "yes" | "no" | null
const enabled = () => CONFIG.TRACKING && consent() === "yes" && CONFIG.SERVER_URL;

// ---- sending: events are grouped and sent every few seconds ----
let queue = [];
export function track(event, detail = {}) {
  if (!enabled()) return;
  queue.push({
    t: new Date().toISOString(), visitor, visit, event, src, device,
    page: location.pathname.split("/").pop() || "index.html",
    detail: JSON.stringify(detail).slice(0, 500)
  });
}
function flush(useBeacon = false) {
  if (!queue.length || !enabled()) return;
  const body = JSON.stringify({ action: "events", events: queue.splice(0) });
  if (useBeacon && navigator.sendBeacon) navigator.sendBeacon(CONFIG.SERVER_URL, body);
  else fetch(CONFIG.SERVER_URL, { method: "POST", body, keepalive: true }).catch(() => {});
}
setInterval(flush, 5000);

// time on page + leaving
const startedAt = performance.now();
addEventListener("pagehide", () => {
  track("leave", { seconds: Math.round((performance.now() - startedAt) / 1000) });
  flush(true);
});

// ---- Microsoft Clarity (heatmaps, scroll maps, session recordings) ----
function loadClarity() {
  if (!CONFIG.CLARITY_ID || window.clarity) return;
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", CONFIG.CLARITY_ID);
  window.clarity("set", "source", src);              // so you can filter recordings by source
}

// ---- start: show the notice once, then track if allowed ----
export function startTracking(pageName) {
  if (!CONFIG.TRACKING) return;
  const go = () => {
    loadClarity();
    track("page_view", {
      page: pageName, referrer: document.referrer ? new URL(document.referrer).hostname : "",
      screen: `${screen.width}x${screen.height}`, lang: navigator.language
    });
  };
  if (consent() === "yes") return go();
  if (consent() === "no") return;
  showNotice(answer => {
    store("local", "cg:consent", answer);
    if (answer === "yes") go();
  });
}

function showNotice(done) {
  const box = document.createElement("div");
  box.id = "cg-notice";
  box.innerHTML = `
    <p>This is a student research project. We count visits anonymously (where you came from, what you click) to learn how people use it. No names, no exact location.</p>
    <div><button data-a="yes">OK</button><button data-a="no">No thanks</button></div>`;
  const style = document.createElement("style");
  style.textContent = `
    #cg-notice { position: fixed; left: 16px; bottom: 16px; z-index: 50; max-width: 340px;
      background: rgba(255,255,255,0.96); color: #111; border: 1px solid #000; border-radius: 16px;
      padding: 14px 16px; font: 13px/1.4 Helvetica, Arial, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,0.08); }
    #cg-notice div { display: flex; gap: 8px; margin-top: 10px; }
    #cg-notice button { all: unset; cursor: pointer; padding: 7px 14px; border-radius: 40px; border: 1px solid #000; font-size: 13px; }
    #cg-notice button[data-a="yes"] { background: #111; color: #fff; }
    @media (max-width: 600px) { #cg-notice { left: 12px; right: 12px; bottom: 12px; max-width: none; } }`;
  document.head.appendChild(style);
  document.body.appendChild(box);
  box.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { box.remove(); done(b.dataset.a); }));
}
