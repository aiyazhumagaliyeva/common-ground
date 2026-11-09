// ============================================================
//  GROUP NAMES — the words the AI can choose from
//  The AI can't write new words. For each group it compares the group's
//  meaning with every name below and picks the closest one
//  (and never gives the same name to two groups).
//  Edit freely: add, remove or rename (1–2 words each).
//  After editing, ask Claude to re-run the label vectors
//  (otherwise new names are read by the AI model in the browser, which is slower).
// ============================================================

export const LABELS = [
  // work & money
  "Work", "Career", "Money", "Wealth", "Job search", "Financial security", "Success", "Ambition",
  // self
  "Confidence", "Self-worth", "Self-improvement", "Identity", "Appearance", "Body image", "Courage",
  "Self-discipline", "Boundaries", "Inner peace", "Acceptance",
  // mind & feelings
  "Happiness", "Joy", "Calm", "Less worry", "Anxiety", "Mental health", "Healing", "Hope",
  // body & health
  "Health", "Sleep", "Rest", "Energy", "Fitness", "Habits", "Addiction", "Food",
  // time & life
  "Time", "Freedom", "Balance", "Purpose", "Meaning", "Motivation", "Direction", "Passion",
  "Creativity", "Making things", "Productivity", "Procrastination", "Life choices", "Second chances",
  // people
  "Friendship", "Family", "Love", "Dating", "Belonging", "Connection", "Loneliness", "Community",
  "Understanding others", "Helping others", "Kindness", "Parents", "Home", "Homesickness",
  // world & dreams
  "Travel", "Adventure", "Languages", "Learning", "Knowledge", "Skills", "Dance", "Nature",
  "Immortality", "Superpowers", "Fantasy", "Escape", "Social justice", "Equality", "Impact",
  "Fame", "Privilege", "Luck", "Immigration", "Opportunity", "Future", "Change", "Growth",
];
