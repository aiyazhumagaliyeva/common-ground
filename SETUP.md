# Common Ground — setup

## Run it now (demo mode)
1. Put this whole folder where your old `common-ground` folder is. Your own `text.svg`, `world.svg`, `lock.svg` must be in the same folder.
2. Open the folder in VS Code → right-click `index.html` → **Open with Live Server**.
3. Wait ~5 seconds. The AI model downloads once, then the notes move into their groups.

Demo mode: you type what a photo says, and new notes disappear on refresh.

## Turn on photo reading + saving (about 20 min, free)

### A. The Google Sheet + server
1. Make a new Google Sheet called **Common Ground notes**.
2. **Extensions → Apps Script**. Delete what's there, paste everything from `server/Code.gs`, save.
3. At the top, choose the function **setup** → **Run**. Allow the permissions. A **notes** tab appears in your Sheet.

### B. The handwriting reader (Google Cloud Vision)
1. Go to **console.cloud.google.com** → create a project (any name).
2. Search **Cloud Vision API** → **Enable**. It may ask you to add billing (a card). The first 1,000 photos a month are free.
3. **Billing → Budgets & alerts** → make a budget of **$1** so you get an email if anything costs money.
4. **APIs & Services → Credentials → Create credentials → API key**. Click the key → **Restrict key** → choose **Cloud Vision API** → save. Copy the key.
5. Back in Apps Script: **Project Settings (gear) → Script properties → Add**:
   - Property: `VISION_API_KEY`
   - Value: your key

### C. Publish the server
1. In Apps Script: **Deploy → New deployment → type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
2. **Deploy** → copy the **Web app URL**.
3. Open `js/config.js` and paste it into `SERVER_URL: "..."`. Save.

Done. Now photos are read by AI, and every note is saved to your Sheet.

## Reviewing notes (moderation)
- Every new note arrives in the **notes** tab with status **pending**.
- Change the **status** dropdown to **approved** → it appears on the map for everyone (on the next page load).
- **rejected** = never shown.
- **flagged** = the safety check caught it (self-harm, personal info). These are never shown.
- Self-harm notes also send **you** an email. The writer was shown the 988 message.

If you change `Code.gs` later: **Deploy → Manage deployments → edit → New version**, or the website keeps using the old code.

## Tuning the map (`js/config.js`)
| Setting | What it does |
|---|---|
| `JOIN_SIMILARITY` | Higher → more, smaller groups. Lower → fewer, bigger groups. 0.28 works for the current notes. |
| `MIN_GROUP_SIZE` | How many similar notes it takes for a group to appear. |
| `GROUP_DISTANCE` / `GROUP_SPACING` | How far groups sit from the middle / from each other. |
| `NOTE_SIZE`, `START_ZOOM` | Note size, starting camera distance. |

## Files
- `index.html` — page + styles
- `js/app.js` — map, write/photo flow, sending
- `js/cluster.js` — AI meaning + emergent groups
- `js/safety.js` — self-harm / personal-info check (add words to hold in `HOLD_WORDS`)
- `js/seed.js` — starting notes (13 real handwritten + fictional typed ones)
- `notes/` — cropped photos of the real notes (the self-harm note is not included)
- `server/Code.gs` — Google Apps Script server

## Live phone → screen connection (Firebase)
1. console.firebase.google.com → Add project → name it (e.g. common-ground) → Analytics off → Create.
2. Build → Realtime Database → Create database → location: United States → Start in **locked mode** → Enable.
3. Rules tab → delete everything → paste the contents of `server/firebase-rules.json` → Publish.
4. Project settings (gear) → General → Your apps → Web (</>) → nickname → Register (no hosting).
5. Copy the `firebaseConfig` values into `FIREBASE` in `js/config.js` (apiKey, authDomain, databaseURL, projectId, appId).
   These values are meant to be public; the rules protect the database.

## Heatmaps (Microsoft Clarity)
1. clarity.microsoft.com → sign in → New project → website: https://aiyazhumagaliyeva.github.io/common-ground/
2. Settings → Overview → copy the Project ID → paste into `CLARITY_ID` in `js/config.js`.
