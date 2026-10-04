const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const packagePath = process.argv[2] || "output/demo/package.json";
const demoDir = path.dirname(packagePath);
const outputRoot = path.join(demoDir, "..");
const recordingDir = path.join(outputRoot, "recording");
const renderDir = path.join(outputRoot, "render");
const qaDir = path.join(outputRoot, "qa");

if (!fs.existsSync(packagePath)) {
  console.error("Demo package not found. Run: npm run demo -- <url> first.");
  process.exit(1);
}

fs.mkdirSync(qaDir, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const manifestPath = path.join(recordingDir, "manifest.json");
const planPath = path.join(demoDir, "edit-plan.json");
const audioManifestPath = path.join(demoDir, "audio", "manifest.json");

let manifest = null;
let plan = null;
let audioManifest = null;
const checks = [];

function add(id, severity, message, detail = "") {
  checks.push({ id, severity, message, detail });
}

function exists(p) { return fs.existsSync(p); }
function fileSize(p) { return exists(p) ? fs.statSync(p).size : 0; }

function probe(file) {
  try {
    return JSON.parse(execFileSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=index,codec_type,width,height",
      "-of", "json", file
    ], { encoding: "utf8" }));
  } catch {
    return null;
  }
}

try {
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
} catch {
  add("ffprobe", "warning", "ffprobe is not installed; media duration and dimension checks are limited.");
}

if (exists(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
else add("recording-manifest", "fail", "Recording manifest is missing.", "Run npm run demo before QA.");

if (exists(planPath)) plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
else add("edit-plan", "warning", "Edit plan is missing.", "Run npm run edit-plan before QA.");

if (exists(audioManifestPath)) audioManifest = JSON.parse(fs.readFileSync(audioManifestPath, "utf8"));

const scenes = Array.isArray(pkg.scenes) ? pkg.scenes : [];
const states = manifest?.steps?.filter(s => s.type === "state-captured") || [];

if (!scenes.length) add("scenes", "fail", "Demo package contains no scenes.");
else if (scenes.length < 3) add("scenes", "warning", "Demo has fewer than 3 scenes.", `${scenes.length} scenes detected.`);
else add("scenes", "pass", "Demo has a usable scene sequence.", `${scenes.length} scenes detected.`);

if (states.length === 0) add("workflow", "fail", "No captured workflow states were found.");
else if (states.length === 1) add("workflow", "warning", "Only one workflow state was captured.");
else add("workflow", "pass", "Workflow captured multiple product states.", `${states.length} states detected.`);

const captureHealth = manifest?.captureHealth || null;
if (captureHealth) {\n  if (captureHealth.pageCrashed) add("capture-health", "fail", "Browser page crashed during capture.");\n  else if (captureHealth.actionFailures) add("capture-health", "warning", "One or more browser actions required recovery.", `${captureHealth.actionFailures} action failure(s).`);\n  else add("capture-health", "pass", "Capture health checks completed.");\n  if (captureHealth.recordingValid === false) add("recording-health", "fail", "Browser recording was not validated.");
}\n\nconst errors = manifest?.consoleErrors || [];
if (errors.length) add("console-errors", "warning", "Browser console errors were captured.", `${errors.length} error(s) recorded.`);
else add("console-errors", "pass", "No browser console errors were recorded.");

const missingFootage = scenes.filter(s => !s.footage || !exists(path.join(recordingDir, s.footage)));
if (missingFootage.length) add("footage", "fail", "One or more scenes have missing footage.", missingFootage.map(s => s.id).join(", "));
else add("footage", "pass", "All scene footage files exist.", `${scenes.length} scene assets verified.`);

const zeroDuration = scenes.filter(s => !Number.isFinite(Number(s.duration)) || Number(s.duration) <= 0);
if (zeroDuration.length) add("durations", "fail", "One or more scenes have invalid duration.", zeroDuration.map(s => s.id).join(", "));
else add("durations", "pass", "All scene durations are positive.");

const longCaptions = scenes.filter(s => String(s.narration || "").length > 180);
if (longCaptions.length) add("captions", "warning", "Some narration captions may be difficult to read.", longCaptions.map(s => `${s.id} (${String(s.narration).length} chars)`).join(", "));
else add("captions", "pass", "Narration lengths are within the conservative caption threshold.");

const cursorProblems = scenes.filter(s => {
  const c = s.cursor;
  return c && (!Number.isFinite(Number(c.x)) || !Number.isFinite(Number(c.y)) || Number(c.x) < 0 || Number(c.x) > 1440 || Number(c.y) < 0 || Number(c.y) > 900);
});
if (cursorProblems.length) add("cursor", "warning", "One or more cursor targets are outside the capture frame.", cursorProblems.map(s => s.id).join(", "));
else add("cursor", "pass", "Cursor targets are within the 1440x900 capture frame.");

const expected = {
  "16x9": [1280, 720],
  "9x16": [720, 1280],
  "1x1": [1080, 1080]
};

let mediaChecks = 0;
let mediaFailures = 0;
for (const [key, [w, h]] of Object.entries(expected)) {
  const file = path.join(renderDir, `brag-demo-${key}.mp4`);
  if (!exists(file) || fileSize(file) === 0) {
    add(`render-${key}`, "fail", `Rendered ${key} output is missing or empty.`);
    mediaFailures++;
    continue;
  }
  const info = probe(file);
  if (!info) {
    add(`render-${key}`, "warning", `Rendered ${key} output exists, but ffprobe could not inspect it.`);
    continue;
  }
  mediaChecks++;
  const video = (info.streams || []).find(s => s.codec_type === "video");
  const duration = Number(info.format?.duration || 0);
  const expectedDuration = scenes.reduce((sum, s) => sum + Number(s.duration || 0), 0) - Math.max(0, scenes.length - 1) * 0.35;
  const dimensionOk = video?.width === w && video?.height === h;
  const durationOk = duration >= Math.max(0, expectedDuration - 1.5) && duration <= expectedDuration + 1.5;
  if (!dimensionOk || !durationOk) {
    mediaFailures++;
    add(`render-${key}`, "fail", `Rendered ${key} output failed media validation.`, `Dimensions ${video?.width || "?"}x${video?.height || "?"}; duration ${duration.toFixed(2)}s; expected about ${expectedDuration.toFixed(2)}s.`);
  } else {
    add(`render-${key}`, "pass", `Rendered ${key} output passed media validation.`, `${w}x${h}, ${duration.toFixed(2)}s.`);
  }
}

if (audioManifest) {
  const missingAudio = (audioManifest.scenes || []).filter(s => s.audio && !exists(path.join(demoDir, "audio", s.audio)));
  if (missingAudio.length) add("audio-assets", "fail", "Narration manifest references missing audio files.", missingAudio.map(s => s.id).join(", "));
  else add("audio-assets", "pass", "Narration assets referenced by the manifest exist.");
} else {
  add("audio", "warning", "No narration manifest found; silent rendering is allowed.");
}

if (manifest?.steps) {
  const stops = manifest.steps.filter(s => s.type === "stop");
  if (stops.length) add("workflow-stop", "warning", "The browser runner stopped before reaching its maximum steps.", stops.map(s => s.reason).join("; "));
}

const failures = checks.filter(c => c.severity === "fail").length;
const warnings = checks.filter(c => c.severity === "warning").length;
const passes = checks.filter(c => c.severity === "pass").length;
const score = Math.max(0, Math.round(100 - failures * 25 - warnings * 7));
const status = failures ? "fail" : warnings ? "warning" : "pass";

const report = {
  version: "1.0",
  generatedAt: new Date().toISOString(),
  product: pkg.product || null,
  source: pkg.source || null,
  status,
  score,
  summary: { passes, warnings, failures, mediaChecks, mediaFailures },
  checks,
  recommendedActions: [
    ...(missingFootage.length ? ["Regenerate the demo capture so every scene has real footage."] : []),
    ...(states.length < 2 ? ["Review the product workflow manually or increase the safe workflow path so BRAG can capture a stronger story."] : []),
    ...(errors.length ? ["Inspect captured browser console errors before publishing the demo."] : []),
    ...(longCaptions.length ? ["Shorten long narration or split it across scenes to protect caption readability."] : []),
    ...(mediaFailures ? ["Re-render the affected output formats and inspect the FFmpeg logs."] : []),
    ...(warnings === 0 && failures === 0 ? ["Publish only after a quick human watch-through of the final MP4."] : [])
  ]
};

const md = [
  "# BRAG QA Report",
  "",
  `**Status:** ${status.toUpperCase()}  `,
  `**Score:** ${score}/100  `,
  `**Product:** ${pkg.product || "Unknown"}  `,
  `**Generated:** ${report.generatedAt}`,
  "",
  `## Summary`,
  `- Pass: ${passes}`,
  `- Warning: ${warnings}`,
  `- Fail: ${failures}`,
  "",
  "## Checks",
  "",
  "| Check | Severity | Result | Detail |",
  "|---|---|---|---|",
  ...checks.map(c => `| ${c.id} | ${c.severity} | ${c.message.replace(/\|/g, "/")} | ${(c.detail || "").replace(/\|/g, "/")} |`),
  "",
  "## Recommended actions",
  "",
  ...report.recommendedActions.map(a => `- ${a}`),
  "",
  "## Release rule",
  "",
  "A **fail** means BRAG should not hand off the MP4 as production-ready. Warnings require judgment. A clean QA report still requires a human watch-through."
].join("\n");

fs.writeFileSync(path.join(qaDir, "report.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(qaDir, "report.md"), md);

console.log(JSON.stringify(report, null, 2));
if (failures) process.exitCode = 1;
