const fs = require("fs");
const path = require("path");
const {
execFileSync
} = require("child_process");

const RENDERER_VERSION = "4.0";

const packagePath =
process.argv[2] ||
"output/demo/package.json";

if (
!fs.existsSync(
packagePath
)
) {
console.error(
"Demo package not found."
);

process.exit(1);
}

try {
execFileSync(
"ffmpeg",
["-version"],
{
stdio:
"ignore"
}
);
} catch {
console.error(
"FFmpeg is required."
);

process.exit(2);
}

const pkg =
JSON.parse(
fs.readFileSync(
packagePath,
"utf8"
)
);

const root =
path.join(
path.dirname(
packagePath
),
".."
);

const recordingDir =
path.join(
root,
"recording"
);

const audioDir =
path.join(
path.dirname(
packagePath
),
"audio"
);

const audioManifestPath =
path.join(
audioDir,
"manifest.json"
);

const audioManifest =
fs.existsSync(
audioManifestPath
)
? JSON.parse(
fs.readFileSync(
audioManifestPath,
"utf8"
)
)
: null;

const outDir =
path.join(
root,
"render"
);

const workDir =
path.join(
outDir,
".scenes"
);

fs.mkdirSync(
workDir,
{
recursive: true
}
);

const formats = {
"16x9": {
width: 1280,
height: 720
},

"9x16": {
width: 720,
height: 1280
}
};

/*

* Keep Railway memory usage predictable.
  */
  const ENCODE_ARGS = [
  "-c:v",
  "libx264",

"-preset",
"ultrafast",

"-threads",
"2"
];

const FPS = 30;

const TRANSITION =
0.18;

function esc(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/\x27/g, "\\x27");
}

function writeText(
file,
value
) {
fs.writeFileSync(
file,
String(
value || ""
)
.replace(
/\r?\n/g,
" "
)
.trim() ||
" "
);
}

function sourceFile(
scene
) {
if (
!scene.footage
) {
return null;
}

const file =
path.join(
recordingDir,
scene.footage
);

if (
!fs.existsSync(
file
)
) {
return null;
}

return file;
}

function interactionFilters(
interaction,
size
) {
if (
!interaction ||
!interaction.focus
) {
return [];
}

const x =
Math.round(
Number(
interaction
.focus
.x
) *
size.width /
1280
);

const y =
Math.round(
Number(
interaction
.focus
.y
) *
size.height /
720
);

if (
!Number.isFinite(x) ||
!Number.isFinite(y)
) {
return [];
}

const radius =
Math.max(
18,
Math.round(
Math.min(
size.width,
size.height
) *
0.035
)
);

const filters = [];

if (
(
interaction.effects ||
[]
).includes(
"focus-hold"
)
) {
filters.push(
`drawbox=x=${Math.max(
        0,
        x - radius
      )}:y=${Math.max(
        0,
        y - radius
      )}:w=${radius * 2}:h=${radius * 2}:color=white@0.75:t=3`
);
}

if (
(
interaction.effects ||
[]
).includes(
"click-ring"
)
) {
filters.push(
`drawbox=x=${x - radius}:y=${y - radius}:w=${radius * 2}:h=${radius * 2}:color=white@0.9:t=4:enable='between(t,0.15,0.85)'`
);
}

return filters;
}

function buildScene(
scene,
index,
formatKey,
size
) {
const input =
sourceFile(
scene
);

if (!input) {
throw new Error(
`Missing footage for scene ${scene.id || index}`
);
}

const duration =
Number(
scene.duration
) || 5;

const captionFile =
path.join(
workDir,
`${formatKey}-${index}-caption.txt`
);

const labelFile =
path.join(
workDir,
`${formatKey}-${index}-label.txt`
);

writeText(
captionFile,
scene.narration
);

writeText(
labelFile,
scene.id
? scene.id
.replace(
/[-_]+/g,
" "
)
.toUpperCase()
: "BRAG"
);

const isVideo =
/.(webm|mp4|mov|mkv)$/i.test(
input
);

const common = [
  ...interactionFilters(scene.interaction, size)
];

let filters;

if (isVideo) {
/*
* REAL BROWSER RECORDING.
*
* The recording itself contains the
* actual browser interaction.
*
* Do not convert it into a still image.
*/
const start =
Math.max(
0,
Number(
scene.videoStart
) || 0
);


const end =
  Number(
    scene.videoEnd
  );

const clipDuration =
  Number.isFinite(
    end
  ) &&
  end > start
    ? Math.max(
        0.8,
        end - start
      )
    : duration;

const focus = scene.interaction?.focus || null;
const inputWidth = 1440;
const inputHeight = 900;
const focusX = focus && Number.isFinite(Number(focus.x)) ? Math.max(0, Math.min(inputWidth, Number(focus.x))) : inputWidth / 2;
const scaleForHeight = size.height / inputHeight;
const scaledWidth = inputWidth * scaleForHeight;
const portraitX = Math.max(0, Math.min(scaledWidth - size.width, focusX * scaleForHeight - size.width / 2));
const landscapeHeight = inputHeight * (size.width / inputWidth);
const landscapeY = Math.max(0, (landscapeHeight - size.height) / 2);
const framing = size.height > size.width
  ? `scale=${scaledWidth.toFixed(2)}:${size.height.toFixed(2)},crop=${size.width}:${size.height}:${portraitX.toFixed(2)}:0`
  : `scale=${size.width}:${landscapeHeight.toFixed(2)},crop=${size.width}:${size.height}:0:${landscapeY.toFixed(2)}`;
const zoomFrom = Math.max(1, Number(scene.motion?.from) || 1);
const zoomTo = Math.max(1, Number(scene.motion?.to) || 1);
const zoom = `${zoomFrom.toFixed(3)}+(${zoomTo.toFixed(3)}-${zoomFrom.toFixed(3)})*t/${duration.toFixed(3)}`;
const focusNorm = Math.max(0, Math.min(1, focusX / inputWidth));
const motionFilter = `scale=iw*(${zoom}):ih*(${zoom}):eval=frame,crop=${size.width}:${size.height}:x=(iw-${size.width})*${focusNorm.toFixed(4)}:y=(ih-${size.height})/2`;
filters = [
  `trim=start=${start.toFixed(3)}:duration=${clipDuration.toFixed(3)}`,
  "setpts=PTS-STARTPTS",
  framing,
  motionFilter,
  ...common
];


} else {
/*
* Screenshot/reference fallback.
*/
filters = [
`scale=${size.width}:${size.height}:force_original_aspect_ratio=increase`,


  `crop=${size.width}:${size.height}`,

  ...common
];


}

const output =
path.join(
workDir,
`${formatKey}-${index}.mp4`
);

const args = [];

args.push(
"-y"
);

/*

* IMPORTANT:
*
* Real footage should normally be
* longer than the requested scene.
*
* We keep stream looping as a safety
* fallback only. With the new runner,
* the actual recording is now much
* longer and contains multiple states.
  */
  if (isVideo) {
  args.push(
  "-stream_loop",
  "-1"
  );
  } else {
  args.push(
  "-loop",
  "1"
  );
  }

args.push(
"-i",
input,


"-t",
String(duration),

"-vf",
filters.join(","),

"-an",

"-r",
String(FPS),

...ENCODE_ARGS,

"-pix_fmt",
"yuv420p",

output


);

console.log(
`\nRendering scene ${scene.id || index}`
);

console.log(
"Source:",
input
);

console.log(
"Source type:",
isVideo
? "REAL BROWSER VIDEO"
: "REFERENCE IMAGE"
);

console.log(
"Video window:",
isVideo
? `${scene.videoStart || 0}s → ${scene.videoEnd || "end"}`
: "N/A"
);

execFileSync(
"ffmpeg",
args,
{
stdio:
"inherit"
}
);

return {
output,
duration
};
}

/*

* Build narration as a SINGLE sequential
* audio stream.
*
* Previous implementation used acrossfade
* between every narration clip. That made
* spoken words overlap and produced the
* distorted/smeared voice effect.
*
* New approach:
*
* scene 1 → scene 2 → scene 3 → scene 4
*
* No overlapping speech.
  */
  function buildNarrationAudio() {
  if (
  !audioManifest ||
  !Array.isArray(
  audioManifest.scenes
  )
  ) {
  return null;
  }

const audioFiles =
audioManifest.scenes
.map(
(scene) => {
if (
!scene.audio
) {
return null;
}


      const file =
        path.join(
          audioDir,
          scene.audio
        );

      if (
        !fs.existsSync(
          file
        )
      ) {
        return null;
      }

      return {
        file,

        duration:
          Number(
            scene.targetDuration
          ) || 5
      };
    }
  )
  .filter(Boolean);


if (
!audioFiles.length
) {
return null;
}

const inputs = [];
const filters = [];

audioFiles.forEach(
(item, index) => {
inputs.push(
"-i",
item.file
);


  /*
   * Normalize each narration segment
   * gently before concatenation.
   *
   * Volume below unity prevents
   * clipping, while alimiter catches
   * peaks from the synthesized voice.
   */
  filters.push(
    `[${index}:a]apad,atrim=duration=${item.duration.toFixed(
      3
    )},asetpts=N/SR/TB,volume=0.82,alimiter=limit=0.95[a${index}]`
  );
}


);

/*

* Concatenate sequentially.
*
* This is intentionally NOT acrossfade.
  */
  const labels =
  audioFiles.map(
  (_, index) =>
  `[a${index}]`
  );

const concatOutput =
"[narration]";

filters.push(
`${labels.join(
      ""
    )}concat=n=${audioFiles.length}:v=0:a=1${concatOutput}`
);

const output =
path.join(
workDir,
"narration.wav"
);

execFileSync(
"ffmpeg",
[
"-y",


  ...inputs,

  "-filter_complex",
  filters.join(";"),

  "-map",
  concatOutput,

  "-c:a",
  "pcm_s16le",

  "-ar",
  "48000",

  "-ac",
  "2",

  output
],
{
  stdio:
    "inherit"
}


);

return output;
}

function compose(
clips,
formatKey,
size,
narration
) {
if (
!clips.length
) {
throw new Error(
"No scenes to render."
);
}

const inputs = [];

clips.forEach(
(clip) => {
inputs.push(
"-i",
clip.output
);
}
);

const filters = [];

let current =
"[0:v]";

let elapsed =
clips[0].duration;

for (
let i = 1;
i < clips.length;
i++
) {
const next =
`[${i}:v]`;


const output =
  `[v${i}]`;

const offset =
  Math.max(
    0,
    elapsed -
      TRANSITION
  );

filters.push(
  `${current}${next}xfade=transition=fade:duration=${TRANSITION}:offset=${offset.toFixed(
    3
  )}${output}`
);

current =
  output;

elapsed +=
  clips[i].duration -
  TRANSITION;


}

const finalPath =
path.join(
outDir,
`brag-demo-${formatKey}.mp4`
);

const args = [
"-y",


...inputs


];

if (narration) {
args.push(
"-i",
narration
);
}

args.push(
"-filter_complex",
filters.join(";"),


"-map",
current


);

if (narration) {
args.push(
"-map",
`${clips.length}:a`
);
}

args.push(
"-r",
String(FPS),


"-s",
`${size.width}x${size.height}`,

...ENCODE_ARGS


);

if (narration) {
args.push(
"-c:a",
"aac",


  "-b:a",
  "160k",

  /*
   * Prevent audio from extending beyond
   * the actual finished video.
   */
  "-shortest"
);


} else {
args.push(
"-an"
);
}

args.push(
"-pix_fmt",
"yuv420p",


"-movflags",
"+faststart",

finalPath


);

console.log(
`\nComposing ${formatKey}...`
);

console.log(
"Narration:",
narration
? "YES"
: "NO"
);

execFileSync(
"ffmpeg",
args,
{
stdio:
"inherit"
}
);

return finalPath;
}

const planPath =
path.join(
path.dirname(
packagePath
),
"edit-plan.json"
);

if (
!fs.existsSync(
planPath
)
) {
execFileSync(
process.execPath,
[
"edit-plan.js",
packagePath
],
{
stdio:
"inherit"
}
);
}

const plan =
JSON.parse(
fs.readFileSync(
planPath,
"utf8"
)
);

const scenes =
plan.scenes ||
pkg.scenes ||
[];

if (
!scenes.length
) {
throw new Error(
"No scenes found."
);
}

const narration =
  process.env.DEMO_ENABLE_NARRATION === "1" ? buildNarrationAudio() : null;

for (
const [
formatKey,
size
] of Object.entries(
formats
)
) {
const clips =
scenes.map(
(scene, index) =>
buildScene(
scene,
index + 1,
formatKey,
size
)
);

const finalPath =
compose(
clips,
formatKey,
size,
narration
);

console.log(
"Rendered:",
finalPath
);
}

console.log(`\ndemo. render complete. Renderer ${RENDERER_VERSION}`);
