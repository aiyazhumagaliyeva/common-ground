// ============================================================
//  COMMON GROUND — Google Apps Script server
//  It does 5 things:
//   1. reads handwriting from photos (Google Cloud Vision)
//   2. saves every note to the "notes" tab, status = pending
//   3. tells the big screen when a phone sent a note (session code)
//   4. gives the website only the notes YOU marked "approved"
//   5. saves anonymous visit events to the "events" tab (research)
// ============================================================

const VERSION = 9;   // 5 = responses (replyTo column)   // the website checks this to know the script is up to date

const SHEET_NAME = "notes";
const HEADERS = ["id", "createdAt", "status", "flag", "text", "allowReplies", "color", "image", "session", "source", "replyTo"];
const EVENT_HEADERS = ["time", "visitor", "visit", "event", "source", "device", "page", "detail"];
const STATUSES = ["pending", "approved", "rejected", "flagged"];

// ---------- moderation settings ----------
const AUTO_APPROVE = true;    // true = safe notes and responses go live right away (you can still reject them in the Sheet)
const DIGEST_EVERY = 10;      // email me a summary after this many new notes + responses
const REJECT_GIBBERISH = true;    // test notes like "vhfbglsjfnv" are rejected automatically
const REJECT_FACES = true;        // photos with a person's face are rejected automatically (keeps everyone anonymous)

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
  if (!ss.getSheetByName("responses")) getResponsesSheet();   // made automatically, no need to run setup
  if (!ss.getSheetByName("sources")) getSourcesSheet();
  if (!ss.getSheetByName("links")) getLinksSheet();
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

  // the phone opened the QR link → the big screen can close its QR page
  if (p.action === "connect") {
    const s = String(p.s || "").replace(/[^a-z0-9]/gi, "").slice(0, 20);
    if (s) CacheService.getScriptCache().put("c_" + s, "1", 1800);
    return json({ ok: true });
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
    if (!r) return json({ status: s && CacheService.getScriptCache().get("c_" + s) ? "connected" : "waiting" });
    return json({
      status: "received", id: r[0], flag: r[3], text: r[3] === "ok" ? r[4] : "",
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
  // checks: safety words → gibberish → a face in the photo
  let flag = checkNote(text);
  if (flag === "ok" && REJECT_GIBBERISH && looksLikeGibberish(text)) flag = "gibberish";
  if (flag === "ok" && REJECT_FACES && image && hasFace(image)) flag = "person-in-photo";
  const autoReject = flag === "gibberish" || flag === "person-in-photo";
  const status = flag === "ok" ? (AUTO_APPROVE ? "approved" : "pending") : autoReject ? "rejected" : "flagged";
  const session = String(body.session || "").replace(/[^a-z0-9]/gi, "").slice(0, 20);
  const source = String(body.source || "").replace(/[^a-z0-9\-_]/gi, "").slice(0, 60);
  const id = Utilities.getUuid();
  getSheet().appendRow([
    id, new Date(), status, flag, text,
    replyTo ? false : body.allowReplies === true, String(body.color || ""), image, session, source, replyTo
  ]);
  if (status === "flagged") notifyMe(text, flag, replyTo);     // flagged: email right away
  countForDigest();                                             // every DIGEST_EVERY: a summary email
  return { ok: true, status, flag, id };     // id: so the screen can give the note its real id
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

// ---------- automatic checks ----------
// Gibberish: keyboard mashing ("vhfbglsjfnv") or a misread photo that's mostly stray letters ("V ? LA OK } d I C").
// Tested on all 81 starting notes: none of them is caught.
function looksLikeGibberish(text) {
  const core = String(text).replace(/^\s*i\s*wish\s*i\s*could\s*/i, "").toLowerCase();
  const words = core.match(/[a-z]+/g) || [];
  if (!words.length) return true;
  const odd = w => w.length > 3 && (!/[aeiouy]/.test(w) || /[bcdfghjklmnpqrstvwxz]{5,}/.test(w) || /(.)\1\1/.test(w));
  const letters = words.join("").length, oddLetters = words.filter(odd).join("").length;
  if (oddLetters / letters > 0.4) return true;
  const SHORT = ["a","i","to","me","my","be","go","do","so","no","up","in","on","of","it","is","us","we","an","at","or","if","by","he","ok","am","as","oh","hi","ai","tv"];
  const stray = words.filter(w => w.length <= 2 && SHORT.indexOf(w) === -1).length;
  return words.length >= 3 && stray / words.length >= 0.5;
}

// A person in the photo: Google Cloud Vision face detection (same key as the handwriting reading)
function hasFace(dataUrl) {
  try {
    const b64 = String(dataUrl).split(",")[1];
    if (!b64) return false;
    const key = PropertiesService.getScriptProperties().getProperty("VISION_API_KEY");
    const res = UrlFetchApp.fetch("https://vision.googleapis.com/v1/images:annotate?key=" + key, {
      method: "post", contentType: "application/json", muteHttpExceptions: true,
      payload: JSON.stringify({ requests: [{ image: { content: b64 }, features: [{ type: "FACE_DETECTION", maxResults: 3 }] }] })
    });
    const r = (JSON.parse(res.getContentText()).responses || [])[0] || {};
    return (r.faceAnnotations || []).some(f => f.detectionConfidence >= 0.6);
  } catch (e) { return false; }           // if the check fails, don't block the note
}

// ---------- emails ----------
function sheetLink() { return SpreadsheetApp.getActiveSpreadsheet().getUrl(); }

// flagged (self-harm, personal info, held words): email right away. Flagged notes are NOT shown on the site.
function notifyMe(text, flag, replyTo) {
  const what = replyTo ? "A response" : "A note";
  const why = flag === "self-harm" ? "self-harm. The writer was shown the 988 support message"
    : flag === "personal-info" ? "possible personal information (email, phone number, @handle or link)"
    : "a word on your hold list";
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
    "Common Ground: " + what.toLowerCase() + " was flagged",
    what + " was flagged for " + why + ".\nIt is NOT shown on the site.\n\n" +
    "Text: " + text + "\n\nTo post it anyway, change its status to \"approved\" in the Sheet:\n" + sheetLink());
}

// every DIGEST_EVERY new notes + responses: one summary email
function countForDigest() {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { return; }
  try {
    const props = PropertiesService.getScriptProperties();
    const n = Number(props.getProperty("SINCE_DIGEST") || 0) + 1;
    if (n < DIGEST_EVERY) { props.setProperty("SINCE_DIGEST", String(n)); return; }
    props.setProperty("SINCE_DIGEST", "0");
    const rows = getSheet().getDataRange().getValues().slice(1).slice(-DIGEST_EVERY);
    const lines = rows.map((r, i) => (i + 1) + ". [" + r[2] + (r[3] !== "ok" ? ", " + r[3] : "") + "] " +
      (r[10] ? "(response) " : "") + String(r[4]).slice(0, 140));
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      "Common Ground: " + DIGEST_EVERY + " new notes and responses",
      "These are already live on the site (except rejected / flagged ones).\n" +
      "To take one down, change its status to \"rejected\" in the Sheet.\n\n" + lines.join("\n") + "\n\n" + sheetLink());
  } finally { lock.releaseLock(); }
}

// ---------- "responses" tab: see every response next to the note it answers ----------
// Read-only view. To approve or reject a response, change its status in the "notes" tab.
// Starting notes (the scanned ones) live in the website, so their text is copied here for the lookup.
const STARTING_NOTES = [
  ["top-surgery", "I wish I could get top surgery"],
  ["hands", "I wish I could spend more time making things with my hands"],
  ["friends-time", "I wish I could have all the time in the world to spend with my friends"],
  ["leaked-video", "I wish I could watch a leaked video of my favorite band member without getting cancelled on twitter"],
  ["live-happily", "I wish I could live more happily"],
  ["pull-through", "I wish I could pull through all of that bs"],
  ["paid-job", "I wish I could find a paid job"],
  ["date", "I wish I could date a girlboy thing"],
  ["be-white", "I wish I could be white..."],
  ["confident", "I wish I could be more confident"],
  ["get-a-job", "I wish I could get a job"],
  ["belong", "I wish I could feel like I belong"],
  ["procrastinate", "I wish I could stop procrastinate and actually start working on things I said I'll do."],
  ["speaker", "I wish I could be a speaker who with more confidence."],
  ["earn", "I wish I could earn 500k $ a year."],
  ["read-minds", "I wish I could read people's mind"],
  ["creative-career", "I wish I could pursue a creative / artistic career without the fear of ending up homeless / not accepted / failing"],
  ["worry-less", "I wish I could worry less and do more"],
  ["get-job-lol", "I wish I could get a job lol"],
  ["sleep", "I wish I could go to sleep"],
  ["my-life", "I wish I could just know what I'm doing with my life"],
  ["fly", "I wish I could fly"],
  ["know-answer", "I wish I could know the answer to any question of mine"],
  ["passionate", "I wish I could find what I am really passionate about and be motivated."],
  ["more-time", "I wish I could have more time..."],
  ["billionaire", "I want to become a billionaire and buy my own island."],
  ["impact", "I wish I could make a long lasting impact on my community & beyond."],
  ["alaska", "I wish I could go to Alaska this December."],
  ["gender", "I wish I could change gender inequality in the workplace."],
  ["intention", "I wish I could know the intention behind every action. (social & emotional)"],
  ["whatever", "I wish I could do whatever I don't wish to do."],
  ["grow-up-us", "I wish I could grow up in the US as my parents originally planned."],
  ["forever", "I wish I could live forever."],
  ["be-a-plant", "I wish I could be a plant"],
  ["travel-world", "I wish I could travel around the world!!"],
  ["achieve-goals", "I wish I could had the ability to achieve my goals and help others."],
  ["five-languages", "I wish I could speak 5 languages fluently"],
  ["job-america", "I wish I could get a job in America and get H1B."],
  ["quit-nicotine", "I wish I could quit nicotine"],
  ["better-person", "I wish I could be a better person"],
  ["leave-friendships", "I wish I could leave some friendships behind"],
  ["rich-already", "I wish I could be rich already"],
  ["more-sleep", "I wish I could get more than 4 hours of sleep on a regular basis. :)"],
  ["broccoli", "I wish I could eat broccoli!"],
  ["happy-everyday", "I wish I could happy everyday :)"],
  ["nepo-baby", "I wish I could be born as a nepo baby in another life"],
  ["hug-mom", "I wish I could hug my mom whenever I want to."],
  ["better-health", "I wish I could have better health."],
  ["go-back-home", "I wish I could go back home"],
  ["say-no", "I wish I could learn how to say no to people & to myself."],
  ["dance-well", "I wish I could dance well."],
  ["clearer-skin", "I wish I could have clearer skin"],
  ["chatgpt-laundry", "I wish I could get ChatGPT to do my laundry"],
  ["glimpse-future", "I wish I could get a glimpse of my future and either feel re-assured or know what to change now"],
  ["keep-to-myself", "I wish I could keep some things to myself instead of telling others what's on my mind all the time"],
  ["work-apple", "I wish I could work in Apple"],
  ["without-worry", "I wish I could get where I want to without worry"],
  ["money-worry", "I wish I could not worry about money"],
  ["do-better-1", "I wish I could do better"],
  ["astronaut", "I wish I could become an astronaut"],
  ["hard-things", "I wish I could talk about hard things without crying so easily"],
  ["economy", "I wish I could make the economy of my country & my family's business better."],
  ["financial", "I wish I could live life as I wish without worrying about financial difficulties"],
  ["share-family", "I wish I could share more with my family"],
  ["know-everything", "I wish I could just like know everything there is"],
  ["what-to-make", "I wish I could know what to make"],
  ["good-job", "I wish I could know who to talk to to get a good job bro"],
  ["what-to-talk", "I wish I could know what to talk about"],
  ["see-mom", "I wish I could see my mom at least once a month"],
  ["brothers", "I wish I could go back in time and be very nice and spend all the time I could with my brothers while we still lived in the same home. I miss them so much."],
  ["be-okay", "I wish I could be sure that everything will be okay"],
  ["thesis", "I wish I could have my thesis speak to me so we can figure it out together"],
  ["do-better-2", "I wish I could do better"],
  ["siblings", "I wish I could be there for my siblings"],
  ["slow-time", "I wish I could slow down the time..."],
  ["see-family", "I wish I could see my family more than twice a year"],
  ["debtless", "I wish I could be debtless"],
  ["opinions", "I wish I could stop worrying about other people's opinions"],
  ["screening", "I wish I could find an easy way of screening people before I invest too much into a relationship with them"],
  ["future-holds", "I wish I could understand what the future holds"],
  ["less-awkward", "I wish I could be less awkward when I first meet people"]
];
function getResponsesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let ids = ss.getSheetByName("note ids");
  if (!ids) ids = ss.insertSheet("note ids");
  ids.clear();
  ids.getRange(1, 1, 1, 2).setValues([["note id", "note text"]]);
  ids.getRange(2, 1, STARTING_NOTES.length, 2).setValues(STARTING_NOTES);
  ids.hideSheet();
  let sh = ss.getSheetByName("responses");
  if (!sh) sh = ss.insertSheet("responses");
  sh.clear();
  // B:F = every row of "notes" that is a response, newest first
  sh.getRange("B1").setFormula("=QUERY(notes!A:K, \"select E, C, B, D, K where K <> '' order by B desc label E 'response', C 'status', B 'sent', D 'flag', K 'note id'\", 1)");
  // A = the text of the note it answers (starting note, or a note from the notes tab)
  sh.getRange("A1").setFormula("={\"replying to\"; ARRAYFORMULA(IF(F2:F = \"\", , IFERROR(VLOOKUP(F2:F, 'note ids'!A:B, 2, FALSE), IFERROR(VLOOKUP(REGEXREPLACE(F2:F, \"^s\", \"\"), notes!A:E, 5, FALSE), F2:F))))}");
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 360); sh.setColumnWidth(2, 360);
  sh.getRange("A1:F1").setFontWeight("bold");
  return sh;
}

// ---------- "sources" tab: where visitors came from (QR codes, links, Instagram…) ----------
// One row per source, counted live from the events and notes tabs. Read-only.
function getSourcesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getEventsSheet();
  let sh = ss.getSheetByName("sources");
  if (!sh) sh = ss.insertSheet("sources");
  sh.clear();
  sh.getRange("A1:F1").setValues([["source", "visits to the map", "people", "notes opened", "notes added", "responses"]]).setFontWeight("bold");
  sh.getRange("A2").setFormula('=SORT(UNIQUE(FILTER(events!E2:E, events!E2:E<>"")))');
  sh.getRange("B2").setFormula('=ARRAYFORMULA(IF(A2:A="",, COUNTIFS(events!E:E, A2:A, events!D:D, "page_view", events!G:G, "index.html")))');
  sh.getRange("C2").setFormula('=MAP(A2:A, LAMBDA(s, IF(s="",, COUNTUNIQUE(FILTER(events!B:B, events!E:E=s)))))');
  sh.getRange("D2").setFormula('=ARRAYFORMULA(IF(A2:A="",, COUNTIFS(events!E:E, A2:A, events!D:D, "note_open")))');
  sh.getRange("E2").setFormula('=ARRAYFORMULA(IF(A2:A="",, COUNTIFS(notes!J:J, A2:A, notes!K:K, "")))');
  sh.getRange("F2").setFormula('=ARRAYFORMULA(IF(A2:A="",, COUNTIFS(notes!J:J, A2:A, notes!K:K, "<>")))');
  sh.getRange("H1").setValue("What the sources mean").setFontWeight("bold");
  sh.getRange("H2:H6").setValues([["Your own codes (from the links tab or make-qr.html), e.g. poster-bushwick"],
    ["instagram / tiktok / twitter / facebook / google: came from that site"], ["direct: typed the address, a bookmark, or a link sent in a chat app"],
    ["internal: moved between pages of the site"], ["ref-…: came from another website"]]);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 200); sh.setColumnWidth(8, 420);
  return sh;
}

// ---------- "links" tab: make a tracked link + QR for each place you share the site ----------
// Type a short name in column A (e.g. poster-bushwick, instagram-story). The link and QR fill in by themselves.
// Visits from that link show up under the same name in the "sources" tab.
function getLinksSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("links");
  if (!sh) sh = ss.insertSheet("links");
  sh.clear();
  sh.getRange("A1:C1").setValues([["name (type here)", "link to share", "QR code"]]).setFontWeight("bold");
  sh.getRange("A2:A4").setValues([["poster-parsons"], ["instagram-story"], ["flyer-bushwick"]]);
  const base = "https://aiyazhumagaliyeva.github.io/common-ground/?src=";
  sh.getRange("B2").setFormula('=ARRAYFORMULA(IF(A2:A="",, "' + base + '" & LOWER(SUBSTITUTE(TRIM(A2:A), " ", "-"))))');
  sh.getRange("C2").setFormula('=ARRAYFORMULA(IF(B2:B="",, IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=" & ENCODEURL(B2:B))))');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 460); sh.setColumnWidth(3, 130);
  sh.setRowHeights(2, 50, 120);
  sh.getRange("E1").setValue("For printing, make-qr.html makes the same link as a styled QR (your Figma look).");
  return sh;
}

// Run once from the editor (select "setup" → Run).
function setup() { getSheet(); getEventsSheet(); getResponsesSheet(); getSourcesSheet(); getLinksSheet(); }
