# Common Ground

An anonymous online board of handwritten notes. Every note finishes the same sentence: "I wish I could…"

People write their wish by hand, scan a QR code, and upload a photo from their phone. Each note becomes a point on a shared 3D map, and notes with similar meanings drift together into groups.

Senior thesis project by Aiya Zhumagaliyeva, Communication Design, Parsons School of Design.
[aiyazhumagaliyeva.com](https://aiyazhumagaliyeva.com)

## How it works
- **Map:** [3d-force-graph](https://github.com/vasturiano/3d-force-graph) + Three.js
- **Meaning:** a small AI model ([all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2)) runs in the browser and turns each wish into numbers; similar wishes are grouped and placed near each other
- **Upload + review:** Google Apps Script + Google Sheets (moderation queue) + Google Cloud Vision (reads handwriting)

## Run locally
Open the folder in VS Code → right-click `index.html` → **Open with Live Server**.

Setup for the server side is in [`SETUP.md`](SETUP.md). The Vision API key is stored in Apps Script, never in this repository.
