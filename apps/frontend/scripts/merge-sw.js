const fs = require("fs");
const path = require("path");

const swPath = path.join(__dirname, "../public/sw.js");
const customSwPath = path.join(__dirname, "../public/custom-sw.js");

try {
  if (fs.existsSync(swPath) && fs.existsSync(customSwPath)) {
    let swContent = fs.readFileSync(swPath, "utf-8");
    const customContent = fs.readFileSync(customSwPath, "utf-8");

    // Remove app-build-manifest.json from precache list
    // Match the entry in the precache array: {url:"/_next/app-build-manifest.json",...}
    swContent = swContent.replace(
      /,\s*\{url:"\/_next\/app-build-manifest\.json"[^}]*\}/g,
      ""
    );
    // Also handle if it's the first entry (no preceding comma)
    swContent = swContent.replace(
      /\{url:"\/_next\/app-build-manifest\.json"[^}]*\},\s*/g,
      ""
    );

    fs.writeFileSync(swPath, swContent + "\n\n" + customContent);
    console.log(
      "✓ Merged custom service worker code and removed app-build-manifest.json from precache"
    );
  } else {
    console.warn("Service worker files not found, skipping merge");
  }
} catch (err) {
  console.error("Failed to merge service workers:", err);
  process.exit(1);
}
