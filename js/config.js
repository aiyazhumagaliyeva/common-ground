// ============================================================
//  SETTINGS — the only file you need to edit for setup/tuning
// ============================================================

export const CONFIG = {
  // Paste your Google Apps Script web app URL here (see SETUP.md).
  // Leave it empty ("") for DEMO MODE: no server, you type what the photo says,
  // and new notes are not saved after refresh.
  SERVER_URL: "https://script.google.com/macros/s/AKfycbwa0cd4Ol5RapX61Fpu_8MPG97eLArUGOW05cOlM4cplj_C7UlwWMoeenpa9M0JmxPY2A/exec",

  // ---- CLUSTERING (how groups emerge) ----
  // How similar two notes must be to belong together (0 = anything, 1 = identical).
  // Higher = more, smaller groups. Lower = fewer, bigger groups.
  JOIN_SIMILARITY: 0.28,

  // A group only "emerges" once it has this many notes.
  // Smaller sets stay in the general middle cloud.
  MIN_GROUP_SIZE: 3,

  // ---- LAYOUT (3D units) ----
  MIDDLE_RADIUS: 55,      // size of the general middle cloud
  GROUP_DISTANCE: 40,    // how far groups sit from the middle
  GROUP_SPACING: 100,     // minimum distance between two groups
  GROUP_SPREAD: 40,       // how loose each group is
  NOTE_SIZE: 14,           // size of one note in 3D
  START_ZOOM: 200,        // camera distance at start (smaller = closer)
  SHOW_GROUP_FRAMES: false, // true = colored outline per group
};
