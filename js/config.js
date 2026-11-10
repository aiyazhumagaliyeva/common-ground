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
  CLARITY_ID: "zb9q6pp08y",         // Microsoft Clarity project ID for heatmaps (clarity.microsoft.com)

  // ---- CLUSTERING (how groups emerge) ----
  // How similar two notes must be to belong together (0 = anything, 1 = identical).
  // Higher = more, smaller groups. Lower = fewer, bigger groups.
  JOIN_SIMILARITY: 0.30,

  // A group only "emerges" once it has this many notes.
  // Smaller sets just sit where their meaning puts them.
  MIN_GROUP_SIZE: 3,

  // ---- LAYOUT (3D units) ----
  MAP_RADIUS: 130,        // size of the whole cloud
  GROUP_PULL: 0.3,        // how much notes of one group pull together (0 = none, 1 = tight)
  NOTE_SIZE: 15,           // size of one note in 3D
  START_ZOOM: 250,        // closest the camera starts (smaller = closer)
  MAX_ZOOM: 400,          // farthest it starts, when there are many notes
  MAX_PIXEL_RATIO: 1.5,   // sharpness on Retina screens: 2 = sharpest but laggy, 1 = smoothest but softer
  ZOOM_TO_MOUSE: false,   // true = zoom toward the mouse (map can drift off-center); false = zoom toward the middle
  ZOOM_SPEED: 1.4,        // how fast scrolling zooms (1 = normal)
  // ---- how a note looks as paper ----
  NOTE_TILT: 5,           // random tilt of each note, in degrees (0 = straight)
  NOTE_SHADOW: true,      // soft shadow under each note
  NOTE_GAP: 0,            // space between notes (0 = off, 1 = edges touch). Bigger = more spread out
  BG_COLOR: "#ffffff",    // map background (also change body background-color in index.html to match)
  // ---- RESPONSES ----
  // PREVIEW ONLY: white placeholder responses on these notes, to judge the layout. Set to {} before launch.
  RESPONSE_PREVIEW: {},
  TOUR_SHOW: "never",       // walkthrough shows by itself: "every-visit" (each new visit), "first-visit" (once per browser), "never" (only with ?)
  DRIFT_SPEED: 0.15,      // slow turning of the map until someone touches it (0 = off)
  FLOAT: 0.08,            // how much the notes bob up and down
  ARRIVE_SCALE: 1.65,     // how big a new note is when it flies in
  ARRIVE_HOLD: 1200,      // ms you get to see a new note big before it shrinks to its place
  PHOTO_NOTES_ONLY: true, // true = hide notes without a photo (typed test notes)
};
