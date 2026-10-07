const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const packagePath =
  process.argv[2] || "output/demo/package.json";

const demoDir = path.dirname(packagePath);
const outputRoot = path.join(demoDir, "..");
const recordingDir = path.join(outputRoot, "recording");
const renderDir = path.join(outputRoot, "render");
const qaDir = path.join(outputRoot, "qa");

if (!fs.existsSync(packagePath)) {
  console.error(
    "Demo package not found. Run: npm run demo -- <url> first."
  );
  process.exit(1);
}

fs.mkdirSync(qaDir, { recursive: true });

const pkg = JSON.parse(
  fs.readFileSync(packagePath, "utf8")
);

const manifestPath = path.join(
  recordingDir,
  "manifest.json"
);

const planPath = path.join(
  demoDir,
  "edit-plan.json"
);

const audioManifestPath = path.join(
  demoDir,
  "audio",
  "manifest.json"
);

let manifest = null;
let plan = null;
let audioManifest = null;

const checks = [];

function add(
  id,
  severity,
  message,
  detail = ""
) {
  checks.push({
    id,
    severity,
    message,
    detail
  });
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function fileSize(filePath) {
  return exists(filePath)
    ? fs.statSync(filePath).size
    : 0;
}

function readJson(filePath) {
  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch (error) {
    return null;
  }
}

function probe(filePath) {
  try {
    return JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=index,codec_type,width,height",
          "-of",
          "json",
          filePath
        ],
        {
          encoding: "utf8"
        }
      )
    );
  } catch {
    return null;
  }
}

/*
 * ---------------------------------------------------------
 * TOOLING
 * ---------------------------------------------------------
 */

try {
  execFileSync(
    "ffprobe",
    ["-version"],
    {
      stdio: "ignore"
    }
  );
} catch {
  add(
    "ffprobe",
    "warning",
    "ffprobe is not installed; media duration and dimension checks are limited."
  );
}

/*
 * ---------------------------------------------------------
 * LOAD PIPELINE ARTIFACTS
 * ---------------------------------------------------------
 */

if (exists(manifestPath)) {
  manifest = readJson(manifestPath);

  if (!manifest) {
    add(
      "recording-manifest",
      "fail",
      "Recording manifest could not be parsed."
    );
  }
} else {
  add(
    "recording-manifest",
    "fail",
    "Recording manifest is missing.",
    "Run npm run demo before QA."
  );
}

if (exists(planPath)) {
  plan = readJson(planPath);

  if (!plan) {
    add(
      "edit-plan",
      "warning",
      "Edit plan exists but could not be parsed."
    );
  }
} else {
  add(
    "edit-plan",
    "warning",
    "Edit plan is missing.",
    "Run npm run edit-plan before QA."
  );
}

if (exists(audioManifestPath)) {
  audioManifest = readJson(
    audioManifestPath
  );
}

/*
 * ---------------------------------------------------------
 * DEMO / SCENE DATA
 * ---------------------------------------------------------
 */

const scenes = Array.isArray(pkg.scenes)
  ? pkg.scenes
  : [];

const states =
  manifest &&
  Array.isArray(manifest.steps)
    ? manifest.steps.filter(
        step => step.type === "state-captured"
      )
    : [];

/*
 * ---------------------------------------------------------
 * SCENE CHECK
 * ---------------------------------------------------------
 */

if (!scenes.length) {
  add(
    "scenes",
    "fail",
    "Demo package contains no scenes."
  );
} else if (scenes.length < 3) {
  add(
    "scenes",
    "warning",
    "Demo has fewer than 3 scenes.",
    `${scenes.length} scenes detected.`
  );
} else {
  add(
    "scenes",
    "pass",
    "Demo has a usable scene sequence.",
    `${scenes.length} scenes detected.`
  );
}

/*
 * ---------------------------------------------------------
 * WORKFLOW CHECK
 * ---------------------------------------------------------
 */

if (states.length === 0) {
  add(
    "workflow",
    "fail",
    "No captured workflow states were found."
  );
} else if (states.length === 1) {
  add(
    "workflow",
    "warning",
    "Only one workflow state was captured."
  );
} else {
  add(
    "workflow",
    "pass",
    "Workflow captured multiple product states.",
    `${states.length} states detected.`
  );
}

/*
 * ---------------------------------------------------------
 * CAPTURE HEALTH
 * ---------------------------------------------------------
 */

const captureHealth =
  manifest?.captureHealth || null;

if (captureHealth) {
  if (captureHealth.pageCrashed) {
    add(
      "capture-health",
      "fail",
      "Browser page crashed during capture."
    );
  } else if (
    captureHealth.actionFailures
  ) {
    add(
      "capture-health",
      "warning",
      "One or more browser actions required recovery.",
      `${captureHealth.actionFailures} action failure(s).`
    );
  } else {
    add(
      "capture-health",
      "pass",
      "Capture health checks completed."
    );
  }

  if (
    captureHealth.recordingValid === false
  ) {
    add(
      "recording-health",
      "fail",
      "Browser recording was not validated."
    );
  }
}

/*
 * ---------------------------------------------------------
 * CONSOLE ERRORS
 * ---------------------------------------------------------
 */

const errors =
  manifest?.consoleErrors || [];

if (errors.length) {
  add(
    "console-errors",
    "warning",
    "Browser console errors were captured.",
    `${errors.length} error(s) recorded.`
  );
} else {
  add(
    "console-errors",
    "pass",
    "No browser console errors were recorded."
  );
}

/*
 * ---------------------------------------------------------
 * FOOTAGE CHECK
 * ---------------------------------------------------------
 */

const missingFootage =
  scenes.filter(scene => {
    if (!scene.footage) {
      return true;
    }

    const footagePath = path.join(
      recordingDir,
      scene.footage
    );

    return !exists(footagePath);
  });

if (missingFootage.length) {
  add(
    "footage",
    "fail",
    "One or more scenes have missing footage.",
    missingFootage
      .map(scene => scene.id || "unknown")
      .join(", ")
  );
} else if (scenes.length) {
  add(
    "footage",
    "pass",
    "All scene footage files exist.",
    `${scenes.length} scene assets verified.`
  );
}

/*
 * ---------------------------------------------------------
 * FOOTAGE SIZE CHECK
 * ---------------------------------------------------------
 */

const emptyFootage =
  scenes.filter(scene => {
    if (!scene.footage) {
      return false;
    }

    const footagePath = path.join(
      recordingDir,
      scene.footage
    );

    return (
      exists(footagePath) &&
      fileSize(footagePath) === 0
    );
  });

if (emptyFootage.length) {
  add(
    "footage-size",
    "fail",
    "One or more footage files are empty.",
    emptyFootage
      .map(scene => scene.id || "unknown")
      .join(", ")
  );
} else if (scenes.length) {
  add(
    "footage-size",
    "pass",
    "Scene footage files contain data."
  );
}

/*
 * ---------------------------------------------------------
 * DURATION CHECK
 * ---------------------------------------------------------
 */

const zeroDuration =
  scenes.filter(scene => {
    const duration =
      Number(scene.duration);

    return (
      !Number.isFinite(duration) ||
      duration <= 0
    );
  });

if (zeroDuration.length) {
  add(
    "durations",
    "fail",
    "One or more scenes have invalid duration.",
    zeroDuration
      .map(scene => scene.id || "unknown")
      .join(", ")
  );
} else if (scenes.length) {
  add(
    "durations",
    "pass",
    "All scene durations are positive."
  );
}

/*
 * ---------------------------------------------------------
 * CAPTION CHECK
 * ---------------------------------------------------------
 */

const longCaptions =
  scenes.filter(scene => {
    return (
      String(scene.narration || "")
        .length > 180
    );
  });

if (longCaptions.length) {
  add(
    "captions",
    "warning",
    "Some narration captions may be difficult to read.",
    longCaptions
      .map(
        scene =>
          `${scene.id || "unknown"} (${String(
            scene.narration
          ).length} chars)`
      )
      .join(", ")
  );
} else if (scenes.length) {
  add(
    "captions",
    "pass",
    "Narration lengths are within the conservative caption threshold."
  );
}

/*
 * ---------------------------------------------------------
 * CURSOR CHECK
 * ---------------------------------------------------------
 */

const cursorProblems =
  scenes.filter(scene => {
    const cursor = scene.cursor;

    if (!cursor) {
      return false;
    }

    const x = Number(cursor.x);
    const y = Number(cursor.y);

    return (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > 1440 ||
      y < 0 ||
      y > 900
    );
  });

if (cursorProblems.length) {
  add(
    "cursor",
    "warning",
    "One or more cursor targets are outside the capture frame.",
    cursorProblems
      .map(scene => scene.id || "unknown")
      .join(", ")
  );
} else if (scenes.length) {
  add(
    "cursor",
    "pass",
    "Cursor targets are within the 1440x900 capture frame."
  );
}

/*
 * ---------------------------------------------------------
 * RENDERED VIDEO CHECKS
 * ---------------------------------------------------------
 */

const expected = {
  "16x9": [1280, 720],
  "9x16": [720, 1280]
};

let mediaChecks = 0;
let mediaFailures = 0;

for (
  const [formatKey, dimensions]
  of Object.entries(expected)
) {
  const [
    expectedWidth,
    expectedHeight
  ] = dimensions;

  const filePath = path.join(
    renderDir,
    `brag-demo-${formatKey}.mp4`
  );

  /*
   * File existence
   */
  if (
    !exists(filePath) ||
    fileSize(filePath) === 0
  ) {
    add(
      `render-${formatKey}`,
      "fail",
      `Rendered ${formatKey} output is missing or empty.`
    );

    mediaFailures++;
    continue;
  }

  /*
   * Media inspection
   */
  const info = probe(filePath);

  if (!info) {
    add(
      `render-${formatKey}`,
      "warning",
      `Rendered ${formatKey} output exists, but ffprobe could not inspect it.`
    );

    continue;
  }

  mediaChecks++;

  const videoStream =
    Array.isArray(info.streams)
      ? info.streams.find(
          stream =>
            stream.codec_type === "video"
        )
      : null;

  const duration = Number(
    info.format?.duration || 0
  );

  const expectedDuration =
    scenes.reduce(
      (sum, scene) =>
        sum +
        Number(scene.duration || 0),
      0
    ) -
    Math.max(
      0,
      scenes.length - 1
    ) *
      0.35;

  const dimensionOk =
    videoStream &&
    videoStream.width === expectedWidth &&
    videoStream.height === expectedHeight;

  const minimumDuration =
    Math.max(
      0,
      expectedDuration - 1.5
    );

  const maximumDuration =
    expectedDuration + 1.5;

  const durationOk =
    duration >= minimumDuration &&
    duration <= maximumDuration;

  if (
    !dimensionOk ||
    !durationOk
  ) {
    mediaFailures++;

    add(
      `render-${formatKey}`,
      "fail",
      `Rendered ${formatKey} output failed media validation.`,
      `Dimensions ${
        videoStream?.width || "?"
      }x${
        videoStream?.height || "?"
      }; duration ${
        duration.toFixed(2)
      }s; expected about ${
        expectedDuration.toFixed(2)
      }s.`
    );
  } else {
    add(
      `render-${formatKey}`,
      "pass",
      `Rendered ${formatKey} output passed media validation.`,
      `${expectedWidth}x${expectedHeight}, ${duration.toFixed(2)}s.`
    );
  }
}

/*
 * ---------------------------------------------------------
 * AUDIO CHECK
 * ---------------------------------------------------------
 */

if (audioManifest) {
  const audioScenes =
    Array.isArray(audioManifest.scenes)
      ? audioManifest.scenes
      : [];

  const missingAudio =
    audioScenes.filter(scene => {
      if (!scene.audio) {
        return false;
      }

      return !exists(
        path.join(
          demoDir,
          "audio",
          scene.audio
        )
      );
    });

  if (missingAudio.length) {
    add(
      "audio-assets",
      "fail",
      "Narration manifest references missing audio files.",
      missingAudio
        .map(scene => scene.id || "unknown")
        .join(", ")
    );
  } else {
    add(
      "audio-assets",
      "pass",
      "Narration assets referenced by the manifest exist."
    );
  }
} else {
  add(
    "audio",
    "warning",
    "No narration manifest found; silent rendering is allowed."
  );
}

/*
 * ---------------------------------------------------------
 * WORKFLOW STOP CHECK
 * ---------------------------------------------------------
 */

if (
  manifest &&
  Array.isArray(manifest.steps)
) {
  const stops =
    manifest.steps.filter(
      step => step.type === "stop"
    );

  if (stops.length) {
    add(
      "workflow-stop",
      "warning",
      "The browser runner stopped before reaching its maximum steps.",
      stops
        .map(stop => stop.reason || "Unknown reason")
        .join("; ")
    );
  }
}

/*
 * ---------------------------------------------------------
 * SCORE
 * ---------------------------------------------------------
 */

const failures =
  checks.filter(
    check =>
      check.severity === "fail"
  ).length;

const warnings =
  checks.filter(
    check =>
      check.severity === "warning"
  ).length;

const passes =
  checks.filter(
    check =>
      check.severity === "pass"
  ).length;

const score = Math.max(
  0,
  Math.round(
    100 -
      failures * 25 -
      warnings * 7
  )
);

const status =
  failures > 0
    ? "fail"
    : warnings > 0
      ? "warning"
      : "pass";

/*
 * ---------------------------------------------------------
 * RECOMMENDED ACTIONS
 * ---------------------------------------------------------
 */

const recommendedActions = [];

if (missingFootage.length) {
  recommendedActions.push(
    "Regenerate the demo capture so every scene has real footage."
  );
}

if (states.length < 2) {
  recommendedActions.push(
    "Review the product workflow manually or increase the safe workflow path so BRAG can capture a stronger story."
  );
}

if (errors.length) {
  recommendedActions.push(
    "Inspect captured browser console errors before publishing the demo."
  );
}

if (longCaptions.length) {
  recommendedActions.push(
    "Shorten long narration or split it across scenes to protect caption readability."
  );
}

if (mediaFailures) {
  recommendedActions.push(
    "Re-render the affected output formats and inspect the FFmpeg logs."
  );
}

if (
  warnings === 0 &&
  failures === 0
) {
  recommendedActions.push(
    "Publish only after a quick human watch-through of the final MP4."
  );
}

/*
 * ---------------------------------------------------------
 * REPORT
 * ---------------------------------------------------------
 */

const report = {
  version: "1.0",

  generatedAt:
    new Date().toISOString(),

  product:
    pkg.product || null,

  source:
    pkg.source || null,

  status,

  score,

  summary: {
    passes,
    warnings,
    failures,
    mediaChecks,
    mediaFailures
  },

  checks,

  recommendedActions
};

/*
 * ---------------------------------------------------------
 * MARKDOWN REPORT
 * ---------------------------------------------------------
 */

const markdownChecks =
  checks.map(check => {
    const message =
      String(check.message || "")
        .replace(/\|/g, "/");

    const detail =
      String(check.detail || "")
        .replace(/\|/g, "/");

    return `| ${check.id} | ${check.severity} | ${message} | ${detail} |`;
  });

const markdownActions =
  recommendedActions.map(
    action => `- ${action}`
  );

const markdown = [
  "# BRAG QA Report",
  "",
  `**Status:** ${status.toUpperCase()}  `,
  `**Score:** ${score}/100  `,
  `**Product:** ${pkg.product || "Unknown"}  `,
  `**Generated:** ${report.generatedAt}`,
  "",
  "## Summary",
  "",
  `- Pass: ${passes}`,
  `- Warning: ${warnings}`,
  `- Fail: ${failures}`,
  "",
  "## Checks",
  "",
  "| Check | Severity | Result | Detail |",
  "|---|---|---|---|",
  ...markdownChecks,
  "",
  "## Recommended actions",
  "",
  ...markdownActions,
  "",
  "## Release rule",
  "",
  "A **fail** means BRAG should not hand off the MP4 as production-ready.",
  "Warnings require judgment.",
  "A clean QA report still requires a human watch-through."
].join("\n");

/*
 * ---------------------------------------------------------
 * WRITE REPORTS
 * ---------------------------------------------------------
 */

fs.writeFileSync(
  path.join(
    qaDir,
    "report.json"
  ),
  JSON.stringify(
    report,
    null,
    2
  )
);

fs.writeFileSync(
  path.join(
    qaDir,
    "report.md"
  ),
  markdown
);

/*
 * ---------------------------------------------------------
 * OUTPUT
 * ---------------------------------------------------------
 */

console.log(
  JSON.stringify(
    report,
    null,
    2
  )
);

/*
 * ---------------------------------------------------------
 * EXIT
 * ---------------------------------------------------------
 */

if (failures) {
  process.exitCode = 1;
}
