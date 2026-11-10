// ============================================================
//  WHERE YOU SHARE THE SITE ("channels")
//  Every link / QR gets a code: <channel> or <channel>-<name>, e.g. poster-bushwick.
//  The "sources" tab in the Sheet groups visits by the channel (the part before the first "-").
//  To add a channel: add one line here AND the same line in server/Code.gs (CHANNELS).
//  ids: lowercase, no "-" (use "_").
// ============================================================
export const CHANNELS = [
  // print + in person
  { group: "Print and in person", id: "poster",        label: "Poster (QR on the street)" },
  { group: "Print and in person", id: "flyer",         label: "Flyer or postcard handed out" },
  { group: "Print and in person", id: "sticker",       label: "Sticker" },
  { group: "Print and in person", id: "table_sign",    label: "Sign at a table, café or shop" },
  { group: "Print and in person", id: "event",         label: "Event, exhibition or open studio" },
  { group: "Print and in person", id: "class",         label: "Class, crit or presentation" },
  { group: "Print and in person", id: "business_card", label: "Business card" },
  // Instagram
  { group: "Instagram", id: "ig_post",  label: "Instagram post" },
  { group: "Instagram", id: "ig_reel",  label: "Instagram reel" },
  { group: "Instagram", id: "ig_story", label: "Instagram story" },
  { group: "Instagram", id: "ig_bio",   label: "Instagram bio" },
  { group: "Instagram", id: "ig_dm",    label: "Instagram DM" },
  // TikTok
  { group: "TikTok", id: "tiktok_video", label: "TikTok video" },
  { group: "TikTok", id: "tiktok_bio",   label: "TikTok bio" },
  // other social
  { group: "Other social", id: "linkedin",  label: "LinkedIn" },
  { group: "Other social", id: "x",         label: "X (Twitter)" },
  { group: "Other social", id: "threads",   label: "Threads" },
  { group: "Other social", id: "pinterest", label: "Pinterest" },
  { group: "Other social", id: "youtube",   label: "YouTube" },
  { group: "Other social", id: "facebook_post", label: "Facebook" },
  { group: "Other social", id: "reddit",    label: "Reddit" },
  { group: "Other social", id: "discord",   label: "Discord, Slack or a group chat" },
  { group: "Other social", id: "arena",     label: "Are.na" },
  // messages
  { group: "Messages", id: "chat",  label: "Sent in a chat (text, WhatsApp, iMessage…)" },
  { group: "Messages", id: "email", label: "Email or newsletter" },
  // web
  { group: "Web", id: "portfolio", label: "Your portfolio site" },
  { group: "Web", id: "press",     label: "Article, blog or interview" },
  { group: "Web", id: "website",   label: "Another website" },
  // anything else
  { group: "Other", id: "other", label: "Other" },
];
