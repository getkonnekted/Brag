const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const packagePath = process.argv[2] || "output/demo/package.json";
if (!fs.existsSync(packagePath)) {
  console.error("Demo package not found. Run: npm run demo -- <url>");
  process.exit(1);
}

let ffmpeg;
try {
  ffmpeg = execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("FFmpeg is required for local rendering. Install FFmpeg, then run npm run render.");
  process.exit(2);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const root = path.dirname(path.dirname(packagePath));
const manifestPath = path.join(root, "recording", "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("Recording manifest not found.");
  process.exit(1);
}

const outDir = path.join(root, "render");
fs.mkdirSync(outDir, { recursive: true });

const shots = pkg.scenes.map((scene, i) => ({
  scene,
  file: scene.footage ? path.join(root, "recording", scene.footage) : null,
  index: i + 1
})).filter(x => x.file && fs.existsSync(x.file));

if (!shots.length) {
  console.error("No captured screenshots available for rendering.");
  process.exit(1);
}

const listFile = path.join(outDir, "concat.txt");
const lines = [];
for (const shot of shots) {
  const duration = Number(shot.scene.duration) || 5;
  lines.push(`file '${shot.file.replace(/'/g, "'\\''")}'`);
  lines.push(`duration ${duration}`);
}
lines.push(`file '${shots[shots.length - 1].file.replace(/'/g, "'\\''")}'`);
fs.writeFileSync(listFile, lines.join("\n"));

const output = path.join(outDir, "brag-demo.mp4");
execFileSync("ffmpeg", [
  "-y", "-f", "concat", "-safe", "0", "-i", listFile,
  "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
  "-r", "30", "-c:v", "libx264", "-movflags", "+faststart", output
], { stdio: "inherit" });

console.log("Rendered:", output);
