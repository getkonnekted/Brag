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

function safeFallback() {
  const source = path.join(compositionDir, "assets", "real-product-footage.mp4");
  if (!fs.existsSync(source) || fs.statSync(source).size === 0) {
    throw new Error("Hyperframes fallback source footage is missing.");
  }

  console.log("\nProducing the master with the deterministic real-footage renderer.");
  console.log("Creative renderer: real footage + continuous camera movement + audio. No subtitles or text overlays.");

  fs.rmSync(outputFile, { force: true });

  const audioFile = path.join(compositionDir, "render-audio.wav");
  let hasNarration = false;

  const index = fs.readFileSync(path.join(compositionDir, "index.html"), "utf8");
  const get = id => {
    const re = new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</');
    const match = index.match(re);
    return match
      ? match[1].replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\\s+/g, " ").trim()
      : "";
  };

  const title = get("title");
  const promise = get("promise");

  // Build one short, non-repeating voiceover from the director's
  // observed workflow instead of reading the same product promise twice.
  let narration = "";
  const directorManifest = path.resolve(
    process.cwd(),
    "..",
    "..",
    "director-manifest.json"
  );
  const localDirectorManifest = path.resolve(
    compositionDir,
    "..",
    "..",
    "director-manifest.json"
  );

  try {
    const manifestPath = fs.existsSync(localDirectorManifest)
      ? localDirectorManifest
      : directorManifest;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const product = manifest.product?.name || title;
    const promiseText = manifest.product?.promise || promise;
    const shots = Array.isArray(manifest.storyboard) ? manifest.storyboard : [];
    const workflow = shots
      .filter(scene => ["workflow", "proof"].includes(scene.purpose))
      .map(scene => scene.text)
      .filter(Boolean)
      .slice(0, 2);

    const parts = [
      product ? product + "." : "",
      promiseText ? promiseText + "." : "",
      workflow[0] ? workflow[0] + "." : "",
      workflow[1] ? workflow[1] + "." : ""
    ].filter(Boolean);

    narration = parts.join(" ");
  } catch {
    narration = [title, promise].filter(Boolean).join(". ");
  }

  // Keep narration compact enough to fit once inside the 20-second master.
  narration = narration
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, 4)
    .join(" ");

  if (narration && commandAvailable("espeak-ng")) {
    try {
      require("child_process").execFileSync("espeak-ng", [
        "-v", process.env.ESPEAK_VOICE || "en-us+f3",
        "-s", process.env.ESPEAK_SPEED || "142",
        "-p", process.env.ESPEAK_PITCH || "46",
        "-a", process.env.ESPEAK_AMPLITUDE || "88",
        "-w", audioFile,
        narration
      ], { stdio: "inherit" });
      hasNarration = fs.existsSync(audioFile) && fs.statSync(audioFile).size > 0;
    } catch {
      console.warn("Narration generation unavailable; using a lightweight audio bed.");
    }
  }

  /*
   * The old renderer used zoompan with a tiny 3.5% ceiling and then
   * burned the composition copy into the image. In practice that was
   * visually imperceptible and the copy became subtitles.
   *
   * This renderer deliberately keeps the browser footage clean and
   * applies a visible, continuous camera move to the actual footage.
   * crop x/y are evaluated per frame by FFmpeg, so the movement is
   * temporal rather than a static transform.
   */
  const videoFilter = [
    "scale=w='2560+180*sin(t*0.42)':h='1440+101.25*sin(t*0.42)':eval=frame:flags=lanczos",
    "crop=w=1920:h=1080:x='320+280*sin(t*0.30)+40*sin(t*0.67)':y='180+130*cos(t*0.24)+35*sin(t*0.53)'",
    "eq=contrast=1.01:saturation=1.01:brightness=-0.005",
    "format=yuv420p"
  ].join(",");

  // Loop the real browser capture so short recordings still produce the
  // required 20-second master instead of silently ending early.
  const args = ["-y", "-hide_banner", "-loglevel", "warning", "-stream_loop", "-1", "-i", source];

  if (hasNarration) {
    args.push("-i", audioFile);
  }

  args.push(
    "-filter_complex",
    hasNarration
      ? "[0:v]" + videoFilter + "[v];[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.78,apad,atrim=duration=20,afade=t=in:st=0:d=0.4,afade=t=out:st=18.5:d=1.5[a]"
      : "[0:v]" + videoFilter + "[v];aevalsrc=0.012*sin(2*PI*220*t)+0.006*sin(2*PI*330*t):s=48000:d=20,afade=t=in:st=0:d=1,afade=t=out:st=18:d=2,volume=0.18[a]",
    "-map", "[v]",
    "-map", "[a]",
    "-t", "20",
    "-threads", "1",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "21",
    "-c:a", "aac",
    "-b:a", "96k",
    "-ar", "48000",
    "-ac", "2",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
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

function commandAvailable(command) {
  try {
    require("child_process").execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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
  console.warn("Hyperframes composition check failed; continuing with the safe real-footage renderer.");
  console.warn("The Hyperframes validator is non-blocking for production delivery.");
}

safeFallback();
