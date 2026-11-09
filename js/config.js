// ============================================================
//  SETTINGS — the only file you need to edit for setup/tuning
// ============================================================

export const CONFIG = {
  // Paste your Google Apps Script web app URL here (see SETUP.md).
  // Leave it empty ("") for DEMO MODE: no server, you type what the photo says,
  // and new notes are not saved after refresh.
  // The page people open on their phone after scanning the QR (must be online, https).
  PHONE_URL: "https://aiyazhumagaliyeva.github.io/common-ground/phone.html",

  SERVER_URL: "https://script.google.com/macros/s/AKfycbwa0cd4Ol5RapX61Fpu_8MPG97eLArUGOW05cOlM4cplj_C7UlwWMoeenpa9M0JmxPY2A/exec",

  // ---- LIVE PHONE → SCREEN CONNECTION (Firebase, see SETUP.md) ----
  // Paste the firebaseConfig from your Firebase project here. Empty = slower Apps Script check.
  FIREBASE: {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    appId: "",
  },

  // ---- RESEARCH TRACKING (see js/track.js) ----
  TRACKING: true,         // false = record nothing
  CLARITY_ID: "",         // Microsoft Clarity project ID for heatmaps (clarity.microsoft.com)

  // ---- CLUSTERING (how groups emerge) ----
  // How similar two notes must be to belong together (0 = anything, 1 = identical).
  // Higher = more, smaller groups. Lower = fewer, bigger groups.
  JOIN_SIMILARITY: 0.40,

  // A group only "emerges" once it has this many notes.
  // Smaller sets stay in the general middle cloud.
  MIN_GROUP_SIZE: 3,

  // ---- LAYOUT (3D units) ----
  MIDDLE_RADIUS: 55,      // size of the general middle cloud
  GROUP_DISTANCE: 40,    // how far groups sit from the middle
  GROUP_SPACING: 100,     // minimum distance between two groups
  GROUP_SPREAD: 40,       // how loose each group is
  NOTE_SIZE: 15,           // size of one note in 3D
  START_ZOOM: 250,        // closest the camera starts (smaller = closer)
  MAX_ZOOM: 400,          // farthest it starts, when there are many notes
  ZOOM_SPEED: 1.4,        // how fast scrolling zooms (1 = normal)
  DOT_STYLE: "group",     // "group" = color per group (like TensorFlow), "ink" = all dark dots
  BG_COLOR: "#ffffff",    // map background (also change body background-color in index.html to match)
  // ---- COLORS ----
  COLOR_BY: "meaning",    // "meaning" = each group gets a color, notes in between get gradients; "random" = random per note
  // sticky-note colors, given to groups in order (biggest group first). The first 4 are the main ones;
  // the others are only used if more than 4 groups form.
  DOT_COLORS: ["#FFE14D", "#FF7EB6", "#5CC8FF", "#7BE07B", "#FF9F43", "#B58CFF", "#FF5C5C"],
  COLOR_SOFTNESS: 0.025,  // how gently colors blend between groups (bigger = more gradients)
  GRADIENT_FROM: 0.12,    // how mixed a note must be to get a gradient dot (0–0.5)
  DOT_COLOR: "",          // one color for every dot instead (e.g. "#f3dd96"); "" = use DOT_COLORS
  DOT_SIZE: 7,            // size of a dot on the map
  DRIFT_SPEED: 0.35,      // slow turning of the map until someone touches it (0 = off)
  FLOAT: 0.08,            // how much the balls bob up and down
  OPEN_SCALE: 1.3,        // how big a note gets when you click a ball
  ARRIVE_SCALE: 1.65,     // how big a new note is when it flies in
  ARRIVE_HOLD: 1200,      // ms you get to see a new note before it crumples
  PHOTO_NOTES_ONLY: true, // true = hide notes without a photo (typed test notes)
  SHOW_GROUP_FRAMES: false, // true = colored outline per group
};
