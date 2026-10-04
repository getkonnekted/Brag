const fs = require("fs");
const path = require("path");

const input = process.argv[2] || "output/demo/package.json";
if (!fs.existsSync(input)) {
  console.error("Demo package not found. Run npm run demo -- <url> first.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(input, "utf8"));
const out = path.join(path.dirname(input), "edit-plan.json");

const plan = {
  version: "1.7",
  product: pkg.product,
  source: pkg.source,
  canvas: { width: 1280, height: 720, fps: 30 },
  safeAreas: {
    landscape: { x: 80, y: 60, width: 1120, height: 600 },
    portrait: { x: 48, y: 100, width: 624, height: 920 },
    square: { x: 60, y: 60, width: 780, height: 780 }
  },
  scenes: pkg.scenes.map((scene, index) => ({
    index: index + 1,
    id: scene.id,
    duration: scene.duration,
    footage: scene.footage,
    narration: scene.narration,
    purpose: scene.purpose,
    motion: scene.motion || { type: "static", from: 1, to: 1 },
    cursor: scene.cursor || null,
    overlays: {
      caption: true,
      sceneLabel: scene.id,
      cursorHighlight: Boolean(scene.cursor)
    },
    transition: index === 0 ? "cut" : "crossfade"
  }))
};

fs.writeFileSync(out, JSON.stringify(plan, null, 2));
console.log(out);
