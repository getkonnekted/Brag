const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const packagePath = process.argv[2] || "output/demo/package.json";
const modelPath = process.env.PIPER_MODEL;
const piper = process.env.PIPER_BIN || "piper";

if (!fs.existsSync(packagePath)) {
  console.error("Demo package not found. Run: npm run demo -- <url> first.");
  process.exit(1);
}

if (!modelPath) {
  console.error("PIPER_MODEL is not set. BRAG v0.9 uses local Piper TTS.");
  console.error("Example: PIPER_MODEL=/path/to/voice.onnx npm run voice");
  process.exit(2);
}

try {
  execFileSync(piper, ["--help"], { stdio: "ignore" });
} catch {
  console.error("Piper executable not found. Set PIPER_BIN if it is not on PATH.");
  process.exit(2);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const outDir = path.join(path.dirname(packagePath), "audio");
fs.mkdirSync(outDir, { recursive: true });

const scenes = [];
let totalDuration = 0;

for (let i = 0; i < pkg.scenes.length; i++) {
  const scene = pkg.scenes[i];
  const id = String(scene.id || "scene-" + (i + 1));
  const text = String(scene.narration || "").replace(/\s+/g, " ").trim();
  const output = path.join(outDir, String(i + 1).padStart(2, "0") + "-" + id + ".wav");

  if (!text) {
    scenes.push({ index: i + 1, id, duration: scene.duration, text, audio: null });
    totalDuration += Number(scene.duration) || 0;
    continue;
  }

  execFileSync(piper, [
    "--model", modelPath,
    "--output_file", output
  ], { input: text + "\n", stdio: ["pipe", "inherit", "inherit"] });

  scenes.push({
    index: i + 1,
    id,
    targetDuration: Number(scene.duration) || 5,
    text,
    audio: path.relative(path.dirname(packagePath), output).replace(/\\/g, "/")
  });
  totalDuration += Number(scene.duration) || 0;
}

const manifest = {
  version: "0.9",
  engine: "piper",
  generatedAt: new Date().toISOString(),
  totalDuration,
  scenes
};

const manifestPath = path.join(outDir, "manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(manifestPath);
