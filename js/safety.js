// ============================================================
//  SAFETY CHECK — simple rules, run before anything is saved.
//  This is a first filter only. Every note still waits for
//  human review (you) before it is public.
// ============================================================

// Phrases that suggest the writer may be thinking about suicide or self-harm.
const SELF_HARM = [
  "kill myself", "killing myself", "suicide", "suicidal", "end my life",
  "end it all", "want to die", "wanna die", "don't want to live",
  "dont want to live", "not want to be alive", "hurt myself", "self harm",
  "self-harm", "cut myself", "unalive", "not wake up", "disappear forever"
];

// Personal info that would break anonymity.
const PERSONAL_INFO = [
  /[\w.+-]+@[\w-]+\.[\w.]+/,                 // email
  /(\+?\d[\s-]?){7,}/,                       // phone-like number
  /(^|\s)@[\w.]{2,}/,                        // @handle
  /https?:\/\/|www\./i                       // links
];

// Add words you want held for review (e.g. slurs) in lowercase.
// Kept empty on purpose: hate is judged by you during review.
const HOLD_WORDS = [];

export function checkNote(text) {
  const t = text.toLowerCase();
  if (SELF_HARM.some(p => t.includes(p))) return "self-harm";
  if (PERSONAL_INFO.some(r => r.test(text))) return "personal-info";
  if (HOLD_WORDS.some(w => t.includes(w))) return "hold";
  return "ok";
}
