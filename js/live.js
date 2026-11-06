// ============================================================
//  LIVE CONNECTION between the phone and the big screen (Firebase)
//  The screen opens a tiny "room" named after the QR code's session code.
//  The phone writes into that room at each step; the screen sees it instantly:
//    connected → photo → sent (with the note)
//  The room is deleted as soon as the note has arrived.
//  If CONFIG.FIREBASE is empty, the site falls back to asking Google
//  Apps Script every 1.5 s (slower, no "Phone connected" step).
// ============================================================
import { CONFIG } from './config.js';

const V = "10.12.2";                          // Firebase version (pinned)
let db = null, api = null;

export const liveOn = () => !!(CONFIG.FIREBASE && CONFIG.FIREBASE.databaseURL);

async function init() {
  if (db) return;
  const app = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  api = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`);
  db = api.getDatabase(app.initializeApp(CONFIG.FIREBASE));
}

// big screen: open the room and react to every change. Returns a "close" function.
export async function listen(session, onChange) {
  await init();
  const room = api.ref(db, "rooms/" + session);
  await api.set(room, { step: "waiting", t: Date.now() });
  const off = api.onValue(room, snap => { if (snap.exists()) onChange(snap.val()); });
  return () => { off(); api.remove(room).catch(() => {}); };
}

// phone: tell the screen what is happening
export async function tell(session, data) {
  if (!session || !liveOn()) return;
  try {
    await init();
    await api.update(api.ref(db, "rooms/" + session), { ...data, t: Date.now() });
  } catch (e) { console.warn("live connection failed", e); }
}
