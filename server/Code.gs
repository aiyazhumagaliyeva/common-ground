// ============================================================
//  COMMON GROUND — Google Apps Script server
//  It does 5 things:
//   1. reads handwriting from photos (Google Cloud Vision)
//   2. saves every note to the "notes" tab, status = pending
//   3. tells the big screen when a phone sent a note (session code)
//   4. gives the website only the notes YOU marked "approved"
//   5. saves anonymous visit events to the "events" tab (research)
// ============================================================

const VERSION = 5;   // 5 = responses (replyTo column)   // the website checks this to know the script is up to date

const SHEET_NAME = "notes";
const HEADERS = ["id", "createdAt", "status", "flag", "text", "allowReplies", "color", "image", "session", "source", "replyTo"];
const EVENT_HEADERS = ["time", "visitor", "visit", "event", "source", "device", "page", "detail"];
const STATUSES = ["pending", "approved", "rejected", "flagged"];

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
    sh.getRange("C2:C").setDataValidation(rule);
  }
  // older sheets: add missing columns
  if (sh.getRange(1, 9).getValue() !== "session") sh.getRange(1, 9).setValue("session");
  if (sh.getRange(1, 10).getValue() !== "source") sh.getRange(1, 10).setValue("source");
  if (sh.getRange(1, 11).getValue() !== "replyTo") sh.getRange(1, 11).setValue("replyTo");   // which note a response answers
  return sh;
}

function getEventsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("events");
  if (!sh) {
    sh = ss.insertSheet("events");
    sh.appendRow(EVENT_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  GET requests
// ============================================================
function doGet(e) {
  const p = e.parameter;

  if (p.action === "version") return json({ version: VERSION });

  // the phone page (opened from the QR code)
  if (p.page === "upload") {
    const t = HtmlService.createTemplateFromFile("Upload");
    t.session = String(p.s || "").replace(/[^a-z0-9]/gi, "").slice(0, 20);
    return t.evaluate()
      .setTitle("Common Ground — add yours")
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }

  // the website asks for approved notes
  if (p.action === "approved") {
    const rows = getSheet().getDataRange().getValues().slice(1);
    return json(rows.filter(r => r[2] === "approved").map(r => ({
      id: r[0], text: r[4], allowReplies: r[5] === true || r[5] === "TRUE",
      color: r[6], image: r[7] || null, replyTo: r[10] || ""
    })));
  }

  // the website asks: "did the phone with this code send something yet?"
  if (p.action === "session") {
    const s = String(p.s || "");
    const rows = getSheet().getDataRange().getValues().slice(1);
    const r = rows.reverse().find(row => s && row[8] === s);
    if (!r) return json({ status: "waiting" });
    return json({
      status: "received", flag: r[3], text: r[3] === "ok" ? r[4] : "",
      image: r[3] === "ok" ? r[7] : "", allowReplies: r[5] === true, replyTo: r[10] || ""
    });
  }

  return json({ error: "unknown action" });
}

// ============================================================
//  POST requests (from the website's own write/photo form)
// ============================================================
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.action === "ocr") return json({ text: readPhoto(body.image) });
  if (body.action === "submit") return json(saveNote(body));
  if (body.action === "events") return json(saveEvents(body.events));
  return json({ error: "unknown action" });
}

// ============================================================
//  Functions the phone page calls (google.script.run)
// ============================================================
function readPhoto(base64) {
  if (!base64 || base64.length > 8000000) return "";
  const key = PropertiesService.getScriptProperties().getProperty("VISION_API_KEY");
  const res = UrlFetchApp.fetch("https://vision.googleapis.com/v1/images:annotate?key=" + key, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      requests: [{
        image: { content: base64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["en"] }
      }]
    })
  });
  const data = JSON.parse(res.getContentText());
  const r = (data.responses || [])[0] || {};
  const text = (r.fullTextAnnotation && r.fullTextAnnotation.text) || "";
  return text.replace(/\s+/g, " ").replace(/^\s*i\s*wish\s*i\s*could\s*/i, "").trim();
}

function saveNote(body) {
  let text = String(body.text || "").trim().slice(0, 600);
  if (!text) return { error: "empty" };
  const replyTo = String(body.replyTo || "").replace(/[^a-z0-9\-_:]/gi, "").slice(0, 80);
  if (!replyTo && !/^i\s*wish\s*i\s*could/i.test(text)) text = "I wish I could " + text;   // responses keep their own words
  let image = String(body.image || "");
  if (image.length > 49000) image = "";              // a cell holds max 50,000 characters
  const flag = checkNote(text);
  const status = flag === "ok" ? "pending" : "flagged";
  const session = String(body.session || "").replace(/[^a-z0-9]/gi, "").slice(0, 20);
  const source = String(body.source || "").replace(/[^a-z0-9\-_]/gi, "").slice(0, 60);
  getSheet().appendRow([
    Utilities.getUuid(), new Date(), status, flag, text,
    replyTo ? false : body.allowReplies === true, String(body.color || ""), image, session, source, replyTo
  ]);
  if (flag === "self-harm") notifyMe(text);
  return { ok: true, status, flag };
}

// ---------- anonymous visit events (from js/track.js) ----------
function saveEvents(events) {
  if (!Array.isArray(events) || !events.length) return { ok: true };
  const clean = v => String(v == null ? "" : v).slice(0, 500);
  const rows = events.slice(0, 50).map(ev => [
    clean(ev.t), clean(ev.visitor), clean(ev.visit), clean(ev.event),
    clean(ev.src), clean(ev.device), clean(ev.page), clean(ev.detail)
  ]);
  const sh = getEventsSheet();
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true };
}

// ============================================================
//  Safety check (same rules as js/safety.js on the website)
// ============================================================
const SELF_HARM = [
  "kill myself", "killing myself", "suicide", "suicidal", "end my life",
  "end it all", "want to die", "wanna die", "don't want to live",
  "dont want to live", "not want to be alive", "hurt myself", "self harm",
  "self-harm", "cut myself", "unalive", "not wake up", "disappear forever"
];
const PERSONAL_INFO = [/[\w.+-]+@[\w-]+\.[\w.]+/, /(\+?\d[\s-]?){7,}/, /(^|\s)@[\w.]{2,}/, /https?:\/\/|www\./i];
const HOLD_WORDS = [];   // add words (lowercase) you want held for review

function checkNote(text) {
  const t = text.toLowerCase();
  if (SELF_HARM.some(p => t.indexOf(p) !== -1)) return "self-harm";
  if (PERSONAL_INFO.some(r => r.test(text))) return "personal-info";
  if (HOLD_WORDS.some(w => t.indexOf(w) !== -1)) return "hold";
  return "ok";
}

function notifyMe(text) {
  MailApp.sendEmail(
    Session.getEffectiveUser().getEmail(),
    "Common Ground: a note needs attention",
    "A submitted note was flagged for self-harm and was NOT published.\n\n" +
    "Text: " + text + "\n\nThe writer was shown the 988 support message."
  );
}

// Run once from the editor (select "setup" → Run).
function setup() { getSheet(); getEventsSheet(); }
