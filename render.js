const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const packagePath = process.argv[2] || "output/demo/package.json";
if (!fs.existsSync(packagePath)) {
  console.error("Demo package not found. Run: npm run demo -- <url> first.");
  process.exit(1);
}

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("FFmpeg is required for local rendering. Install FFmpeg, then run npm run render.");
  process.exit(2);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const root = path.join(path.dirname(packagePath), "..");
const manifestPath = path.join(root, "recording", "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("Recording manifest not found.");
  process.exit(1);
}

const audioManifestPath = path.join(path.dirname(packagePath), "audio", "manifest.json");
const audioManifest = fs.existsSync(audioManifestPath)
  ? JSON.parse(fs.readFileSync(audioManifestPath, "utf8"))
  : null;

const outDir = path.join(root, "render");
const workDir = path.join(outDir, ".scenes");
fs.mkdirSync(workDir, { recursive: true });

const formats = {
  "16x9": { width: 1280, height: 720 },
  "9x16": { width: 720, height: 1280 },
  "1x1": { width: 1080, height: 1080 }
};

function escFilter(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function writeText(file, value) {
  fs.writeFileSync(file, String(value || "").replace(/\r?\n/g, " ").trim() || " ");
}

function sourceFile(scene) {
  if (!scene.footage) return null;
  const file = path.join(root, "recording", scene.footage);
  return fs.existsSync(file) ? file : null;
}

function motionFilter(motion, duration, fps, width, height) {
  const type = motion && motion.type ? motion.type : "static";
  const from = Number(motion && motion.from) || 1;
  const to = Number(motion && motion.to) || from;
  const frames = Math.max(2, Math.round(duration * fps));
  const step = (to - from) / Math.max(1, frames - 1);
  const zoom = "z='1*(" + from + "+" + step.toFixed(6) + "*on)'";

  if (type === "push-left") {
    return "zoompan=" + zoom + ":x='iw-iw/zoom':y='(ih-oh/zoom)/2':d=" + frames + ":s=" + width + "x" + height + ":fps=" + fps;
  }
  if (type === "push-right") {
    return "zoompan=" + zoom + ":x='0':y='(ih-oh/zoom)/2':d=" + frames + ":s=" + width + "x" + height + ":fps=" + fps;
  }
  if (type === "slow-zoom") {
    return "zoompan=" + zoom + ":x='(iw-iw/zoom)/2':y='(ih-oh/zoom)/2':d=" + frames + ":s=" + width + "x" + height + ":fps=" + fps;
  }
  return "zoompan=z='1':x='(iw-iw/zoom)/2':y='(ih-oh/zoom)/2':d=" + frames + ":s=" + width + "x" + height + ":fps=" + fps;
}

function buildScene(scene, index, formatKey, size) {
  const input = sourceFile(scene);
  if (!input) return null;

  const fps = 30;
  const duration = Number(scene.duration) || 5;
  const captionFile = path.join(workDir, formatKey + "-" + index + "-caption.txt");
  const labelFile = path.join(workDir, formatKey + "-" + index + "-label.txt");
  writeText(captionFile, scene.narration || "");
  writeText(labelFile, scene.id ? scene.id.replace(/[-_]+/g, " ").toUpperCase() : "BRAG");

  const filters = [
    "scale=" + size.width + ":" + size.height + ":force_original_aspect_ratio=increase",
    "crop=" + size.width + ":" + size.height,
    motionFilter(scene.motion, duration, fps, size.width, size.height),
    "drawtext=font='DejaVu Sans':textfile='" + escFilter(labelFile) + "':x=48:y=42:fontsize=" + (formatKey === "9x16" ? 30 : 26) + ":fontcolor=white@0.92:box=1:boxcolor=black@0.42:boxborderw=12",
    "drawtext=font='DejaVu Sans':textfile='" + escFilter(captionFile) + "':x=48:y=h-" + (formatKey === "9x16" ? 250 : 120) + ":fontsize=" + (formatKey === "9x16" ? 30 : 28) + ":fontcolor=white:box=1:boxcolor=black@0.58:boxborderw=18:line_spacing=8"
  ];

  if (scene.cursor && Number.isFinite(Number(scene.cursor.x)) && Number.isFinite(Number(scene.cursor.y))) {
    const cx = Math.round(size.width * Number(scene.cursor.x) / 1440);
    const cy = Math.round(size.height * Number(scene.cursor.y) / 900);
    filters.push("drawbox=x=" + Math.max(0, cx - 30) + ":y=" + Math.max(0, cy - 30) + ":w=60:h=60:color=white@0.88:t=4");
  }

  const output = path.join(workDir, formatKey + "-" + index + ".mp4");
  execFileSync("ffmpeg", [
    "-y", "-loop", "1", "-i", input, "-t", String(duration),
    "-vf", filters.join(","),
    "-an", "-r", String(fps), "-c:v", "libx264", "-pix_fmt", "yuv420p", output
  ], { stdio: "inherit" });

  return { output, duration };
}

function buildAudio() {
  if (!audioManifest || !audioManifest.scenes?.length) return null;

  const audioScenes = audioManifest.scenes.filter(s => s.audio);
  if (!audioScenes.length) return null;

  const inputs = [];
  const filters = [];
  audioScenes.forEach((scene, i) => {
    const file = path.join(path.dirname(packagePath), "audio", scene.audio);
    if (!fs.existsSync(file)) return;
    inputs.push("-i", file);
    const duration = Number(scene.targetDuration) || 5;
    filters.push("[" + i + ":a]apad,atrim=duration=" + duration.toFixed(3) + ",asetpts=N/SR/TB[a" + i + "]");
  });

  if (!inputs.length) return null;

  let last = "[a0]";
  for (let i = 1; i < inputs.length / 2; i++) {
    const out = "[af" + i + "]";
    filters.push(last + "[a" + i + "]acrossfade=d=0.35:c1=tri:c2=tri" + out);
    last = out;
  }

  const output = path.join(workDir, "narration.wav");
  execFileSync("ffmpeg", [
    "-y", ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", last, "-c:a", "pcm_s16le", output
  ], { stdio: "inherit" });

  return output;
}

function concatClips(clips, formatKey, size, narration) {
  if (!clips.length) throw new Error("No renderable scenes were found.");
  const inputs = [];
  clips.forEach(c => inputs.push("-i", c.output));

  const parts = [];
  let last = "[0:v]";
  let elapsed = clips[0].duration;

  for (let i = 1; i < clips.length; i++) {
    const next = "[" + i + ":v]";
    const out = "[v" + i + "]";
    const offset = Math.max(0, elapsed - 0.35);
    parts.push(last + next + "xfade=transition=fade:duration=0.35:offset=" + offset.toFixed(3) + out);
    last = out;
    elapsed += clips[i].duration - 0.35;
  }

  const finalPath = path.join(outDir, "brag-demo-" + formatKey + ".mp4");
  const args = [
    "-y", ...inputs,
    ...(narration ? ["-i", narration] : []),
    "-filter_complex", parts.join(";"),
    "-map", last,
    ...(narration ? ["-map", String(clips.length) + ":a", "-shortest"] : []),
    "-r", "30", "-s", size.width + "x" + size.height,
    "-c:v", "libx264",
    ...(narration ? ["-c:a", "aac", "-b:a", "160k"] : ["-an"]),
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", finalPath
  ];

  execFileSync("ffmpeg", args, { stdio: "inherit" });
  return finalPath;
}

const planPath = path.join(path.dirname(packagePath), "edit-plan.json");
if (!fs.existsSync(planPath)) {
  execFileSync(process.execPath, ["edit-plan.js", packagePath], { stdio: "inherit" });
}
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const scenes = plan.scenes || pkg.scenes || [];

const narration = buildAudio();
if (narration) console.log("Narration audio:", narration);

for (const [formatKey, size] of Object.entries(formats)) {
  console.log("\\nRendering " + formatKey + " " + size.width + "x" + size.height + "...");
  const clips = scenes.map((scene, index) => buildScene(scene, index + 1, formatKey, size)).filter(Boolean);
  const finalPath = concatClips(clips, formatKey, size, narration);
  console.log("Rendered:", finalPath);
}

console.log("\\nBRAG v0.8 render complete.");
