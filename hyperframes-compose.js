const fs = require("fs");
const path = require("path");

const root = path.resolve("output");
const recording = path.join(root, "recording");
const manifestPath = path.join(recording, "manifest.json");

if (!fs.existsSync(manifestPath)) throw new Error("BRAG capture manifest not found.");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const footage = manifest.realFootage && manifest.realFootage.file;
if (!footage) throw new Error("BRAG did not produce real product footage.");

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

const compositionRoot = path.join(root, "hyperframes-composition");
const compositionDir = path.join(compositionRoot, "composition");

fs.rmSync(compositionRoot, { recursive: true, force: true });
fs.mkdirSync(compositionDir, { recursive: true });

const videoSrc = path.relative(compositionDir, footagePath).replace(/\\/g, "/");
const label = states[0] && states[0].action
  ? states[0].action.text
  : (workflow[0] || "real product workflow");

const html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
'*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#080808;color:#fff;font-family:Inter,system-ui,sans-serif}' +
'.stage{position:relative;width:100vw;height:100vh}.frame{position:absolute;inset:6vh 6vw;background:#111;border:1px solid #333;border-radius:22px;overflow:hidden;box-shadow:0 30px 100px #000}' +
'video{width:100%;height:100%;object-fit:cover}.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.58),transparent 40%,rgba(0,0,0,.76))}' +
'.brand{position:absolute;left:7vw;top:7vh;font:600 14px ui-monospace,monospace;letter-spacing:.16em}.kicker{position:absolute;left:7vw;bottom:16vh;font:500 12px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;opacity:.72}' +
'.title{position:absolute;left:7vw;bottom:8vh;max-width:74vw;font-size:clamp(42px,6vw,88px);line-height:.95;letter-spacing:-.045em;font-weight:650}.pill{position:absolute;right:7vw;top:7vh;border:1px solid #777;border-radius:999px;padding:9px 14px;font:500 11px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;background:#0008}' +
'</style></head><body><div class="stage"><div class="frame"><video src="' + esc(videoSrc) + '" autoplay muted loop playsinline></video><div class="scrim"></div></div>' +
'<div class="brand">BRAG / REAL PRODUCT</div><div class="pill">' + esc(director.archetype || "product workflow") + '</div>' +
'<div class="kicker">' + esc(label) + '</div><div class="title">' + esc(name) + '<br><span style="font-weight:400;opacity:.78">' + esc(promise) + '</span></div>' +
'</div></body></html>';

fs.writeFileSync(path.join(compositionDir, "index.html"), html, "utf8");

fs.writeFileSync(
  path.join(compositionRoot, "brag-plan.md"),
  "# BRAG Plan\n\nProduct: " + name +
  "\nPromise: " + promise +
  "\nArchetype: " + (director.archetype || "product") +
  "\n\nReal workflow evidence:\n" +
  states.slice(0, 5).map((s, i) =>
    (i + 1) + ". " + ((s.action && s.action.text) || s.title || "Observed product state")
  ).join("\n"),
  "utf8"
);

fs.writeFileSync(
  path.join(compositionRoot, "composition-brief.md"),
  "# Composition Brief\n\n" +
  "Objective: Turn the observed product workflow into a concise product story.\n" +
  "Visual source: real Playwright browser footage.\n" +
  "Creative rule: product evidence first; no invented interface.\n" +
  "Workflow: " + workflow.join(" -> "),
  "utf8"
);

console.log(JSON.stringify({
  ok: true,
  composition: compositionDir,
  states: states.length,
  footage: footagePath
}, null, 2));
