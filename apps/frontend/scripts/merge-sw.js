const fs = require("fs");
const path = require("path");

const swPath = path.join(__dirname, "../public/sw.js");
const customSwPath = path.join(__dirname, "../public/custom-sw.js");

try {
  if (fs.existsSync(swPath) && fs.existsSync(customSwPath)) {
    const swContent = fs.readFileSync(swPath, "utf-8");
    const customContent = fs.readFileSync(customSwPath, "utf-8");
    fs.writeFileSync(swPath, swContent + "\n\n" + customContent);
    console.log("✓ Merged custom service worker code");
  } else {
    console.warn("Service worker files not found, skipping merge");
  }
} catch (err) {
  console.error("Failed to merge service workers:", err);
  process.exit(1);
}

