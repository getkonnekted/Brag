const fs = require("fs");
const { execFileSync } = require("child_process");

const files = [
  ["master", "output/final/brag.mp4", 1920, 1080],
  ["16:9", "output/final/product-demo-16x9.mp4", 1920, 1080],
  ["9:16", "output/final/product-demo-9x16.mp4", 1080, 1920]
];

function inspect(file) {
  const data = JSON.parse(execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height",
    "-of", "json", file
  ], { encoding: "utf8" }));
  const video = (data.streams || []).find(s => s.codec_type === "video");
  return { duration: Number(data.format?.duration || 0), width: video?.width, height: video?.height };
}

const results = files.map(([label, file, width, height]) => {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(label + " output is missing or empty.");
  }
  const media = inspect(file);
  if (media.width !== width || media.height !== height) {
    throw new Error(label + " output is " + media.width + "x" + media.height + ", expected " + width + "x" + height + ".");
  }
  if (!Number.isFinite(media.duration) || media.duration < 2) {
    throw new Error(label + " output has invalid duration: " + media.duration + "s.");
  }
  return { label, file, bytes: fs.statSync(file).size, ...media };
});

const masterDuration = results[0].duration;
for (const result of results.slice(1)) {
  if (Math.abs(result.duration - masterDuration) > 1.5) {
    throw new Error(result.label + " duration differs from master by more than 1.5s.");
  }
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
