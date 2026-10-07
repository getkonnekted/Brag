const fs = require("fs");
const path = require("path");

const input = process.argv[2] || "output/demo/package.json";
if (!fs.existsSync(input)) {
  console.error("Demo package not found. Run: npm run demo -- <url> first.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(input, "utf8"));
const overridePath = process.env.BRAG_OVERRIDE || path.join(path.dirname(input), "override.json");
const recordingManifestPath = path.join(path.dirname(input), "..", "recording", "manifest.json");
const recordingManifest = fs.existsSync(recordingManifestPath) ? JSON.parse(fs.readFileSync(recordingManifestPath, "utf8")) : null;
const override = fs.existsSync(overridePath)
  ? JSON.parse(fs.readFileSync(overridePath, "utf8"))
  : { scenes: {} };

const sceneOverrides = override.scenes || {};
const global = override.global || { captions: false };

function applyOverride(scene, index) {
  const local = sceneOverrides[scene.id] || sceneOverrides[String(index + 1)] || {};
  if (local.skip === true) return null;

  const next = { ...scene, ...local };
  if (local.duration != null) next.duration = Math.max(0.5, Number(local.duration));
  if (local.narration != null) next.narration = String(local.narration);
  if (local.motion != null) next.motion = local.motion;
  if (local.cursor === null) next.cursor = null;
  return next;
}

const out = path.join(path.dirname(input), "edit-plan.json");

const scenes = pkg.scenes
  .map(applyOverride)
  .filter(Boolean);

const plan = {
  version: "2.1",
  product: pkg.product,
  source: pkg.source,
  editedAt: new Date().toISOString(),
  timeline: {
    source: recordingManifest ? "recording-manifest" : "scene-duration-plan",
    captureDurationMs: recordingManifest?.elapsedMs || null,
    cuts: (recordingManifest?.steps || []).filter(s => s.type === "state-captured").map(s => ({ step: s.step, timestamp: s.timestamp || null, durationMs: s.elapsedMs || null }))
  },
  overrideFile: fs.existsSync(overridePath) ? overridePath : null,
  canvas: { width: 1280, height: 720, fps: 30 },
  safeAreas: {
    landscape: { x: 80, y: 60, width: 1120, height: 600 },
    portrait: { x: 48, y: 100, width: 624, height: 920 },
    square: { x: 60, y: 60, width: 780, height: 780 }
  },
  scenes: scenes.map((scene, index) => ({
    index: index + 1,
    id: scene.id,
    duration: scene.duration,
    footage: scene.footage,
    narration: scene.narration,
    purpose: scene.purpose,
    motion: scene.motion || { type: "static", from: 1, to: 1 },
    cursor: scene.cursor || null,
    overlays: {
      caption: false,
      sceneLabel: scene.id,
      cursorHighlight: Boolean(scene.cursor)
    },
    transition: index === 0 ? "cut" : "fade"
  }))
};

fs.writeFileSync(out, JSON.stringify(plan, null, 2));
console.log(out);
if (fs.existsSync(overridePath)) {
  console.log("Human overrides applied from " + overridePath);
}
