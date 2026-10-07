const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve("output");
const recording = path.join(root, "recording");
const manifestPath = path.join(recording, "manifest.json");

if (!fs.existsSync(manifestPath)) throw new Error("DEMO. capture manifest not found.");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const footage = manifest.realFootage && manifest.realFootage.file;
if (!footage) throw new Error("DEMO. did not produce real product footage.");

const footagePath = path.join(recording, footage);
if (!fs.existsSync(footagePath) || fs.statSync(footagePath).size === 0) {
  throw new Error("Real product footage is missing or empty.");
}

const director = manifest.director || {};
const name = String(director.product || "Your product").replace(/[<>]/g, "");
const promise = String(director.promise || "A real product solving a real problem.").replace(/[<>]/g, "");
const workflow = Array.isArray(director.workflow) ? director.workflow : [];
const states = (manifest.steps || []).filter(s => s.type === "state-captured");

function esc(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fitCopy(value, maxChars) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const words = clean.split(" ");
  let out = "";
  for (const word of words) {
    const next = out ? out + " " + word : word;
    if (next.length > maxChars - 1) break;
    out = next;
  }
  return (out || clean.slice(0, maxChars - 1)).trim() + "…";
}

function durationSeconds(file) {
  const result = spawnSync(
    process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { encoding: "utf8" }
  );
  const value = Number.parseFloat((result.stdout || "").trim());
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Could not determine real product footage duration.");
  }
  return Math.min(Math.max(value, 1), 25);
}

const sourceDuration = durationSeconds(footagePath);
const duration = Math.min(sourceDuration, 20);
const compositionRoot = path.join(root, "hyperframes-composition");
const compositionDir = path.join(compositionRoot, "composition");
const assetsDir = path.join(compositionDir, "assets");

fs.rmSync(compositionRoot, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });

const gsapSource = path.join(process.cwd(), "node_modules", "gsap", "dist", "gsap.min.js");
const gsapTarget = path.join(assetsDir, "gsap.min.js");
if (!fs.existsSync(gsapSource)) throw new Error("GSAP runtime not installed. Run npm install before composing.");
fs.copyFileSync(gsapSource, gsapTarget);

const assetName = "real-product-footage.mp4";
const normalizedFootagePath = path.join(assetsDir, assetName);

const transcode = spawnSync(
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
  [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", footagePath, "-t", String(duration),
    "-vf", "scale=960:600:flags=lanczos,fps=24",
    "-an", "-c:v", "libx264", "-preset", "veryfast",
    "-pix_fmt", "yuv420p", "-r", "24", "-g", "24",
    "-keyint_min", "24", "-sc_threshold", "0", "-crf", "30",
    "-movflags", "+faststart", normalizedFootagePath
  ],
  { encoding: "utf8" }
);

if (transcode.status !== 0 || !fs.existsSync(normalizedFootagePath) || fs.statSync(normalizedFootagePath).size === 0) {
  throw new Error("Could not normalize real product footage for Hyperframes." +
    (transcode.stderr ? " " + transcode.stderr.trim() : ""));
}

const label = states[0] && states[0].action
  ? states[0].action.text
  : (workflow[0] || "real product workflow");

const safeName = fitCopy(name, 72);
const safePromise = fitCopy(promise, 150);
const safeLabel = fitCopy(label, 86);
const safeArchetype = fitCopy(director.archetype || "product workflow", 34);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1920,height=1080">
<script src="assets/gsap.min.js"></script>
<style>
*{box-sizing:border-box}
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#080808;color:#fff;font-family:Inter,system-ui,sans-serif}
#main{position:relative;width:1920px;height:1080px;overflow:hidden}
.frame{position:absolute;z-index:10;left:115px;top:65px;width:1690px;height:950px;background:#111;border:1px solid #333;border-radius:22px;overflow:hidden;box-shadow:0 30px 100px #000}
video{display:block;width:100%;height:100%;object-fit:cover}
.scrim{position:absolute;z-index:20;left:115px;top:65px;width:1690px;height:950px;border-radius:22px;background:linear-gradient(180deg,rgba(0,0,0,.52),transparent 36%,rgba(0,0,0,.68));pointer-events:none}
.vignette{position:absolute;z-index:21;left:115px;top:65px;width:1690px;height:950px;border-radius:22px;box-shadow:inset 0 0 140px rgba(0,0,0,.72);pointer-events:none}
.brand{position:absolute;z-index:40;left:135px;top:78px;font:600 14px ui-monospace,monospace;letter-spacing:.16em}
.kicker{position:absolute;z-index:40;left:135px;top:118px;width:1420px;min-height:30px;white-space:normal;overflow-wrap:anywhere;font:500 12px/1.35 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;opacity:.72}
.pill{position:absolute;z-index:40;right:135px;top:78px;max-width:360px;min-height:38px;border:1px solid #777;border-radius:999px;padding:9px 14px;font:500 11px/1.2 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;background:#0008;overflow-wrap:anywhere}
.title{position:absolute;z-index:40;left:135px;bottom:72px;width:1420px;height:340px;max-height:340px;overflow-wrap:anywhere;white-space:normal;font-size:clamp(48px,5.2vw,82px);line-height:1.02;letter-spacing:-.045em;font-weight:650}
#promise{display:block;max-width:1140px;margin-top:20px;font-size:clamp(28px,2.65vw,48px);line-height:1.12;letter-spacing:-.025em;font-weight:400;opacity:.78;overflow-wrap:anywhere;white-space:normal}
</style>
</head>
<body>
<div id="main" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${duration}">
  <div id="product-frame" class="frame">
    <video id="real-product-footage" class="clip" src="assets/${assetName}" data-start="0" data-duration="${duration}" data-track-index="0" autoplay muted playsinline></video>
  </div>
  <div id="scrim" class="scrim"></div>
  <div id="vignette" class="vignette"></div>
  <div id="brand" class="brand">DEMO. / REAL PRODUCT</div>
  <div id="archetype-pill" class="pill">${esc(safeArchetype)}</div>
  <div id="workflow-kicker" class="kicker">${esc(safeLabel)}</div>
  <div id="title" class="title">${esc(safeName)}<span id="promise">${esc(safePromise)}</span></div>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
const revealEnd = Math.min(Math.max(${duration.toFixed(3)}, 3.2), 5.5);
tl.from(".frame", { opacity: 0, scale: 1.035, duration: 0.55, ease: "power2.out" }, 0);
tl.from(".brand,.pill", { opacity: 0, y: -8, duration: 0.35, stagger: 0.08 }, 0.15);
tl.from("#workflow-kicker,#title", { opacity: 0, y: 28, duration: 0.65, stagger: 0.08, ease: "power3.out" }, 0.35);
tl.to("#title,#workflow-kicker,#archetype-pill,#scrim", { opacity: 0, duration: 0.55, ease: "power2.inOut" }, Math.max(2.1, revealEnd - 2.2));
tl.to(".frame", { scale: 1.012, duration: Math.max(0.8, revealEnd - 2.1), ease: "none", overwrite: "auto" }, 0);
window.__timelines["main"] = tl;
</script>
</body>
</html>`;

fs.writeFileSync(path.join(compositionDir, "index.html"), html, "utf8");

fs.writeFileSync(path.join(compositionRoot, "brag-plan.md"),
  "# DEMO. Plan\n\nProduct: " + name +
  "\nPromise: " + promise +
  "\nArchetype: " + (director.archetype || "product") +
  "\nSource duration: " + sourceDuration.toFixed(2) + "s" +
  "\nDuration: " + duration.toFixed(2) + "s" +
  "\n\nReal workflow evidence:\n" +
  states.slice(0, 5).map((s, i) =>
    (i + 1) + ". " + ((s.action && s.action.text) || s.title || "Observed product state")
  ).join("\n"), "utf8");

fs.writeFileSync(path.join(compositionRoot, "composition-brief.md"),
  "# Composition Brief\n\n" +
  "Objective: Turn the observed product workflow into a concise product story.\n" +
  "Visual source: real Playwright browser footage.\n" +
  "Creative rule: product evidence first; no invented interface.\n" +
  "Workflow: " + workflow.join(" -> ") +
  "\nSource duration: " + sourceDuration.toFixed(2) + " seconds.\n" +
  "Duration: " + duration.toFixed(2) + " seconds.", "utf8");

console.log(JSON.stringify({ ok: true, composition: compositionDir, states: states.length, duration, footage: footagePath }, null, 2));