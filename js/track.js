// ============================================================
//  ANONYMOUS VISIT TRACKING (for research)
//  - Where people came from: ?src=… in the link/QR (e.g. poster-bushwick,
//    tiktok, instagram-reel), otherwise the referring website, otherwise "direct".
//  - What they did: a short list of events (opened a note, opened Add a note…)
//  - Saved to your Google Sheet, "events" tab. No names, no IP, no exact location.
//  - Heatmaps / cursor recordings: Microsoft Clarity (only if CLARITY_ID is set).
//  - No popup. The About page explains it and has a "Don't count my visits" button.
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

// ---- opt-out (no popup: visits count unless someone opts out on the About page) ----
export function optedOut() { return store("local", "cg:optout") === "1"; }
export function optOut() {
  store("local", "cg:optout", "1");
  queue = [];
  if (window.clarity) window.clarity("consent", false);
}
const enabled = () => CONFIG.TRACKING && !optedOut() && CONFIG.SERVER_URL;

// ---- sending: events are grouped and sent every few seconds ----
let queue = [];
export function track(event, detail = {}) {
  if (!enabled()) return;
  if (window.clarity) try { window.clarity("event", event); } catch (e) {}   // filter heatmaps/recordings by event in Clarity
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

// ---- start ----
export function startTracking(pageName) {
  if (!CONFIG.TRACKING || optedOut()) return;
  loadClarity();
  track("page_view", {
    page: pageName, referrer: document.referrer ? new URL(document.referrer).hostname : "",
    screen: `${screen.width}x${screen.height}`, lang: navigator.language
  });
}
