const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

function writeTextFile(file, value) {
  fs.writeFileSync(file, String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), "utf8");
}

function safeFallback() {
  const source = path.join(compositionDir, "assets", "real-product-footage.mp4");
  if (!fs.existsSync(source) || fs.statSync(source).size === 0) {
    throw new Error("Hyperframes fallback source footage is missing.");
  }

  const html = fs.readFileSync(path.join(compositionDir, "index.html"), "utf8");
  const titleMatch = html.match(/id="title"[^>]*>([\s\S]*?)<span id="promise">/i);
  const promiseMatch = html.match(/id="promise"[^>]*>([\s\S]*?)<\/span>/i);
  const titleFile = path.join(compositionDir, "fallback-title.txt");
  const promiseFile = path.join(compositionDir, "fallback-promise.txt");

  writeTextFile(titleFile, titleMatch ? titleMatch[1] : "DEMO.");
  writeTextFile(promiseFile, promiseMatch ? promiseMatch[1] : "Real product. Real workflow. Real proof.");

  const fontCandidates = [
    process.env.DEMO_FONT,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"
  ].filter(Boolean);
  const font = fontCandidates.find(fs.existsSync);
  if (!font) throw new Error("No fallback renderer font is available.");

  const vf = [
    "scale=1920:1080:force_original_aspect_ratio=decrease",
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
    "drawbox=x=0:y=0:w=iw:h=260:color=black@0.38:t=fill",
    "drawbox=x=0:y=ih-420:w=iw:h=420:color=black@0.62:t=fill",
    "drawtext=fontfile='" + font.replace(/'/g, "\\'") + "':text='DEMO. / REAL PRODUCT':x=135:y=78:fontsize=28:fontcolor=white@0.92:fontweight=600",
    "drawtext=fontfile='" + font.replace(/'/g, "\\'") + "':textfile='" + titleFile.replace(/'/g, "\\'") + "':x=135:y=700:fontsize=82:fontcolor=white:line_spacing=8:fix_bounds=true",
    "drawtext=fontfile='" + font.replace(/'/g, "\\'") + "':textfile='" + promiseFile.replace(/'/g, "\\'") + "':x=135:y=800:fontsize=42:fontcolor=white@0.78:line_spacing=8:fix_bounds=true"
  ].join(",");

  console.log("\nHyperframes render stalled. Using deterministic FFmpeg delivery fallback.");
  const result = spawnSync(
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", source,
      "-vf", vf,
      "-an",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      outputFile
    ],
    { stdio: "inherit" }
  );

  if (result.status !== 0 || !fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
    throw new Error("FFmpeg delivery fallback failed.");
  }

  console.log("FFmpeg fallback render complete.");
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

const render = hyperframes(["render", "--output", outputFile]);
if (render.status === 0 && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0) {
  console.log("\nHyperframes render complete.");
  console.log(outputFile);
  process.exit(0);
}

safeFallback();
