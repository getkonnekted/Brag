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

const duration = durationSeconds(footagePath);
const compositionRoot = path.join(root, "hyperframes-composition");
const compositionDir = path.join(compositionRoot, "composition");
const assetsDir = path.join(compositionDir, "assets");

fs.rmSync(compositionRoot, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });

const gsapSource = path.join(process.cwd(), "node_modules", "gsap", "dist", "gsap.min.js");
const gsapTarget = path.join(assetsDir, "gsap.min.js");
if (!fs.existsSync(gsapSource)) throw new Error("GSAP runtime not installed. Run npm install before composing.");
fs.copyFileSync(gsapSource, gsapTarget);

const assetName = "real-product-footage.webm";
fs.copyFileSync(footagePath, path.join(assetsDir, assetName));

const label = states[0] && states[0].action
  ? states[0].action.text
  : (workflow[0] || "real product workflow");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1920,height=1080">
<script src="assets/gsap.min.js"></script>
<style>
*{box-sizing:border-box}
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#080808;color:#fff;font-family:Inter,system-ui,sans-serif}
.stage{position:relative;width:1920px;height:1080px}
.frame{position:absolute;left:115px;top:65px;width:1690px;height:950px;background:#111;border:1px solid #333;border-radius:22px;overflow:hidden;box-shadow:0 30px 100px #000}
video{width:100%;height:100%;object-fit:cover}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.52),transparent 36%,rgba(0,0,0,.68));pointer-events:none}
.vignette{position:absolute;inset:0;box-shadow:inset 0 0 140px rgba(0,0,0,.72);pointer-events:none}
.brand{position:absolute;left:135px;top:78px;font:600 14px ui-monospace,monospace;letter-spacing:.16em}
.kicker{position:absolute;left:135px;bottom:175px;font:500 12px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;opacity:.72}
.title{position:absolute;left:135px;bottom:78px;max-width:1420px;font-size:clamp(42px,6vw,88px);line-height:.95;letter-spacing:-.045em;font-weight:650}
.pill{position:absolute;right:135px;top:78px;border:1px solid #777;border-radius:999px;padding:9px 14px;font:500 11px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;background:#0008}
</style>
</head>
<body>
<div id="main" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${duration}">
  <div class="stage clip" data-duration="${duration}" data-track-index="0">
    <div class="frame">
      <video id="real-product-footage" class="clip" src="assets/${assetName}" data-start="0" data-duration="${duration}" data-track-index="0" autoplay muted playsinline></video>
      <div class="scrim"></div>
      <div class="vignette"></div>
    </div>
    <div class="brand">DEMO. / REAL PRODUCT</div>
    <div class="pill">${esc(director.archetype || "product workflow")}</div>
    <div class="kicker">${esc(label)}</div>
    <div class="title">${esc(name)}<br><span style="font-weight:400;opacity:.78">${esc(promise)}</span></div>
  </div>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
const revealEnd = Math.min(Math.max(${duration.toFixed(3)}, 3.2), 5.5);
tl.from(".frame", { opacity: 0, scale: 1.035, duration: 0.55, ease: "power2.out" }, 0);
tl.from(".brand,.pill", { opacity: 0, y: -8, duration: 0.35, stagger: 0.08 }, 0.15);
tl.from(".kicker,.title", { opacity: 0, y: 28, duration: 0.65, stagger: 0.08, ease: "power3.out" }, 0.35);
tl.to(".title,.kicker,.pill,.scrim", { opacity: 0, duration: 0.55, ease: "power2.inOut" }, Math.max(2.1, revealEnd - 2.2));
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
  "\nDuration: " + duration.toFixed(2) + " seconds.", "utf8");

console.log(JSON.stringify({ ok: true, composition: compositionDir, states: states.length, duration, footage: footagePath }, null, 2));
