const fs = require("fs");
const path = require("path");
const {
  execFileSync
} = require("child_process");

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
  },

  "1x1": {
    width: 1080,
    height: 1080
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
  0.35;

function esc(value) {
  return String(
    value || ""
  )
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /:/g,
      "\\:"
    )
    .replace(
      /'/g,
      "\\'"
    );
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
    /\.(webm|mp4|mov|mkv)$/i.test(
      input
    );

  const common = [
    `drawtext=font='DejaVu Sans':textfile='${esc(
      labelFile
    )}':x=48:y=42:fontsize=26:fontcolor=white@0.94:box=1:boxcolor=black@0.42:boxborderw=12`,

    `drawtext=font='DejaVu Sans':textfile='${esc(
      captionFile
    )}':x=48:y=h-120:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.58:boxborderw=18:line_spacing=8`,

    ...interactionFilters(
      scene.interaction,
      size
    )
  ];

  let filters;

  if (isVideo) {
    /*
     * REAL BROWSER RECORDING.
     *
     * The critical difference from the
     * old implementation:
     *
     * We never treat this as a still image.
     *
     * We also select a real time window
     * from the browser recording.
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

    filters = [
      `trim=start=${start.toFixed(
        3
      )}:duration=${clipDuration.toFixed(
        3
      )}`,

      "setpts=PTS-STARTPTS",

      `scale=${size.width}:${size.height}:force_original_aspect_ratio=increase`,

      `crop=${size.width}:${size.height}`,

      ...common
    ];
  } else {
    /*
     * Screenshots are supported only as
     * fallback/reference media.
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

      filters.push(
        `[${index}:a]apad,atrim=duration=${item.duration.toFixed(
          3
        )},asetpts=N/SR/TB[a${index}]`
      );
    }
  );

  let current =
    "[a0]";

  for (
    let i = 1;
    i < audioFiles.length;
    i++
  ) {
    const output =
      `[af${i}]`;

    filters.push(
      `${current}[a${i}]acrossfade=d=${TRANSITION}:c1=tri:c2=tri${output}`
    );

    current =
      output;
  }

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
      current,

      "-c:a",
      "pcm_s16le",

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
  buildNarrationAudio();

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

console.log(
  "\nBRAG render complete."
);
