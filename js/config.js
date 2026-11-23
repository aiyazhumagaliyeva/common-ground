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
  LAPTOP_START_ZOOM: 230, // laptops: how close the map starts (smaller = closer; 0 = fit the whole map)
  PHONE_START_ZOOM: 170,  // phones: how close the map starts (smaller = closer; 0 = same as laptops)
  MAX_PIXEL_RATIO: 1.5,   // sharpness on Retina screens: 2 = sharpest but laggy, 1 = smoothest but softer
  ZOOM_TO_MOUSE: false,   // true = zoom toward the mouse (map can drift off-center); false = zoom toward the middle
  ZOOM_SPEED: 1.4,        // how fast pinching zooms (1 = normal)
  LOCK_CENTER: true,      // the map stays in the center: dragging turns it, never moves it (false = drag moves the map)
  DRAG_TURN: 1.6,         // laptop: how strongly click-and-drag turns the map
  PHONE_DRAG_TURN: 4,     // phone: how strongly a finger swipe turns the map (higher = lighter)
  PHONE_DRAG_STOP: 0.15,  // phone: how quickly it stops gliding after you lift your finger (lower = longer glide)
  DRAG_SPEED: 0.1,        // only if LOCK_CENTER is false: how far click-and-drag moves the map
  DRAG_STOP: 0.3,         // how quickly it stops gliding after you let go (0.1 = long glide, 0.5 = stops right away)
  SCROLL_TURN: 1,         // how strongly scrolling turns the map (1 = same as comfortmagazine.world, 0.5 = half)
  // ---- how a note looks as paper ----
  NOTE_TILT: 5,           // random tilt of each note, in degrees (0 = straight)
  BRIGHTEN_NOTES: true,   // lift photos taken in poor light (false = show photos exactly as taken)
  BRIGHTEN_TO: 235,       // how bright the paper becomes (0–255; 255 = white)
  // paper colour comes from the note's group (people no longer pick a colour)
  GROUP_COLORS: true,     // false = show every photo in its own colour, as taken
  // notes not in a group keep their own colour, as photographed
  // one real sticky-note colour per group, biggest group first (repeats if there are more groups)
  GROUP_PAPERS: ["#ffb6d2", "#a9dcf7", "#c4ee9f", "#ffc58c", "#d7c6f5", "#9fe5dc", "#ff9fa0", "#e6f39a", "#b8c9fa", "#f6b0ea", "#e8cfa9", "#c4f0fb"],
  SHOW_LEGEND: true,      // the colour index in the bottom right (false = hide it)
  // names for the groups in the index. Each group gets the theme whose words appear in most of its notes
  // (the AI only makes groups, it doesn't name them). A group that matches nothing is called "Mixed".
  // Add or change themes and words freely: [name, [words...]]
  GROUP_THEMES: [
    //  name                    colour      words
    ["Becoming better",      "#d7c6f5", ["better", "belong", "laugh", "improve", "person"]],                         // lavender
    ["Confidence",           "#ffc58c", ["confident", "confidence", "awkward", "shy", "speaker"]],                     // orange
    ["Family & friends",     "#ffb6d2", ["mom", "mother", "dad", "family", "friend", "friends", "friendship", "sibling", "siblings", "brother", "sister", "bro", "hug"]],   // pink
    ["Motivation",           "#ff9fa0", ["procrastinate", "motivated", "motivation", "lazy", "push", "passionate", "say no", "start working", "making things"]],          // coral
    ["Money",                "#b9e89a", ["rich", "money", "billionaire", "earn", "economy", "debt", "debtless", "financial", "$", "nepo"]],                             // green
    ["Worry & the future",   "#a9dcf7", ["worry", "worrying", "future", "okay", "reassured", "sure", "holds"]],       // blue
    ["Work & career",        "#e8cfa9", ["job", "jobs", "work", "career", "designer", "h1b", "apple", "paid"]],        // kraft brown
    ["Happiness",            "#ffd9b0", ["happy", "happily", "happiness", "joy", "live", "life as"]],                 // peach (no yellow: the paper notes are yellow already)
    ["Sleep & rest",         "#b8c9fa", ["sleep", "rest", "tired", "hours of"]],                                     // periwinkle
    ["Knowing & meaning",    "#9fe5dc", ["know", "knowing", "answer", "understand", "everything", "what i'm doing"]], // aqua
    ["Other people",         "#f6b0ea", ["opinions", "people's", "mind", "others", "myself"]],                       // magenta
    ["Travel & freedom",     "#c4f0fb", ["travel", "world", "alaska", "fly", "free", "astronaut"]],                  // sky
    ["Time",                 "#e6f39a", ["time", "slow down", "forever", "back in time"]],                           // lime
    ["Health & body",        "#bff0d4", ["health", "skin", "nicotine", "surgery", "eat"]],                           // mint
    ["Love",                 "#f7a1b5", ["boyfriend", "girlfriend", "date", "love", "relationship", "laid"]],         // rose
  ],
  MIXED_PAPER: "#dcdcdc",  // a group that matches no theme ("Mixed"): light grey
  TINT: 0.55,             // how strong the colour is (1 = full sticky-note colour, 0 = no colour)
  NOTE_SHADOW: true,      // soft shadow under each note
  NOTE_GAP: 0,            // space between notes (0 = off, 1 = edges touch). Bigger = more spread out
  BG_COLOR: "#ffffff",    // map background (also change body background-color in index.html to match)
  // ---- RESPONSES ----
  // PREVIEW ONLY: white placeholder responses on these notes, to judge the layout. Set to {} before launch.
  RESPONSE_PREVIEW: {},
  TOUR_SHOW: "never",       // walkthrough shows by itself: "every-visit" (each new visit), "first-visit" (once per browser), "never" (only with ?)
  DRIFT_SPEED: 0.35,      // slow turn to the right, all the time (0 = off)
  DRIFT_RESUME: 4000,     // ms after the last touch/scroll before the slow turn comes back
  FLOAT: 0,               // how much the notes bob up and down (0 = still)
  ARRIVE_SCALE: 1.65,     // how big a new note is when it flies in
  ARRIVE_HOLD: 1200,      // ms you get to see a new note big before it shrinks to its place
  PHOTO_NOTES_ONLY: true, // true = hide notes without a photo (typed test notes)
};
