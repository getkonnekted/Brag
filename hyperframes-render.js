const fs = require("fs");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");

const outputDir = path.resolve(process.argv[2] || "output/brag-output");
const compositionDir = path.resolve(process.argv[3] || path.join(outputDir, "composition"));
const outputFile = path.resolve(process.argv[4] || path.join(outputDir, "brag.mp4"));

function hyperframes(args) {
  console.log("\n$ npx hyperframes " + args.join(" "));
  return spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["hyperframes", ...args],
    {
      cwd: compositionDir,
      env: {
        ...process.env,
        HYPERFRAMES_BROWSER_PATH: browserPath,
        PRODUCER_HEADLESS_SHELL_PATH: browserPath,
      },
      stdio: "inherit"
    }
  );
}

function commandAvailable(command) {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function readCompositionCopy() {
  const index = fs.readFileSync(path.join(compositionDir, "index.html"), "utf8");
  const get = id => {
    const re = new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</');
    const match = index.match(re);
    return match
      ? match[1].replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\\s+/g, " ").trim()
      : "";
  };
  return {
    title: get("title"),
    promise: get("promise"),
    label: get("workflow-kicker")
  };
}

function writeText(name, value) {
  const file = path.join(compositionDir, name);
  fs.writeFileSync(file, String(value || "").trim(), "utf8");
  return file;
}

function safeFallback() {
  const source = path.join(compositionDir, "assets", "real-product-footage.mp4");
  if (!fs.existsSync(source) || fs.statSync(source).size === 0) {
    throw new Error("Hyperframes fallback source footage is missing.");
  }

  const copy = readCompositionCopy();
  const titleFile = writeText("render-title.txt", copy.title || "Your product");
  const promiseFile = writeText("render-promise.txt", copy.promise || "A real product solving a real problem.");
  const labelFile = writeText("render-label.txt", copy.label || "REAL PRODUCT / REAL INTERACTION / REAL PROOF");

  console.log("\nHyperframes check passed. Producing the master with deterministic FFmpeg.");
  console.log("Creative renderer: real footage + camera motion + title cards + audio.");

  fs.rmSync(outputFile, { force: true });

  const audioFile = path.join(compositionDir, "render-audio.wav");
  let hasNarration = false;

  if (commandAvailable("espeak-ng")) {
    const narration = [copy.title, copy.promise].filter(Boolean).join(". ");
    try {
      execFileSync("espeak-ng", [
        "-v", process.env.ESPEAK_VOICE || "en-us",
        "-s", process.env.ESPEAK_SPEED || "150",
        "-p", process.env.ESPEAK_PITCH || "48",
        "-a", process.env.ESPEAK_AMPLITUDE || "82",
        "-w", audioFile,
        narration
      ], { stdio: "inherit" });
      hasNarration = fs.existsSync(audioFile) && fs.statSync(audioFile).size > 0;
    } catch {
      console.warn("Narration generation unavailable; using a lightweight score.");
    }
  }

  const videoFilter = [
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=fast_bilinear",
    "crop=1920:1080",
    "zoompan=z='min(zoom+0.0007,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=24",
    "drawbox=x=0:y=0:w=1920:h=1080:color=black@0.18:t=fill",
    "drawtext=textfile='render-title.txt':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=74:fontcolor=white:x=120:y=820:alpha='if(lt(t,0.8),t/0.8,if(gt(t,5),max(0,(5.8-t)/0.8),1))'",
    "drawtext=textfile='render-promise.txt':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:fontsize=34:fontcolor=white@0.82:x=124:y=915:line_spacing=10:alpha='if(lt(t,1.0),t,if(gt(t,6),max(0,(6.8-t)/0.8),1))'",
    "drawtext=textfile='render-label.txt':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:fontsize=18:fontcolor=white@0.75:x=124:y=72:alpha='if(lt(t,0.5),t/0.5,if(gt(t,4),max(0,(4.6-t)/0.6),1))'",
    "vignette=PI/5",
    "format=yuv420p"
  ].join(",");

  const args = ["-y", "-hide_banner", "-loglevel", "warning", "-i", source];
  if (hasNarration) args.push("-i", audioFile);

  args.push(
    "-filter_complex",
    hasNarration
      ? "[0:v]" + videoFilter + "[v];[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.72,apad,atrim=duration=20[a]"
      : "[0:v]" + videoFilter + "[v];aevalsrc=0.015*sin(2*PI*220*t)+0.008*sin(2*PI*330*t):s=48000:d=20,afade=t=in:st=0:d=1,afade=t=out:st=18:d=2,volume=0.22[a]",
    "-map", "[v]", "-map", "[a]",
    "-t", "20", "-threads", "1",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-c:a", "aac", "-b:a", "96k", "-ar", "48000",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    outputFile
  );

  const result = spawnSync(
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    args,
    { cwd: compositionDir, stdio: "inherit" }
  );

  if (result.status !== 0 || !fs.existsSync(outputFile) || fs.statSync(outputFile).size < 1000) {
    throw new Error("FFmpeg cinematic renderer failed.");
  }

  console.log("Deterministic cinematic render complete.");
}

if (!fs.existsSync(compositionDir)) {
  console.error("Hyperframes composition directory not found:", compositionDir);
  process.exit(1);
}

const indexPath = path.join(compositionDir, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("Hyperframes composition index.html not found:", indexPath);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

console.log("demo. → Hyperframes");
console.log("Composition:", compositionDir);
console.log("Output:", outputFile);

const browserPath =
  process.env.HYPERFRAMES_BROWSER_PATH ||
  process.env.PRODUCER_HEADLESS_SHELL_PATH ||
  "/usr/bin/chromium";

if (!fs.existsSync(browserPath)) {
  console.error("Configured Chromium executable not found:", browserPath);
  process.exit(1);
}

console.log("Chromium:", browserPath);

const check = hyperframes(["check"]);
if (check.status !== 0) {
  console.error("Hyperframes composition check failed. Refusing to render an invalid layout.");
  process.exit(check.status || 1);
}

console.log("\nHyperframes check passed. Using deterministic cinematic FFmpeg rendering.");
safeFallback();
