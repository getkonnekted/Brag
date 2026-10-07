const fs = require("fs");
const path = require("path");

const { runWorkflow } =
  require("./runner");

const {
  buildNarrative
} = require("./director");

const {
  applyInteractionToScenes
} = require("./cinematography");

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function productName(url, title) {
  if (title && title.trim()) {
    return title.trim();
  }

  try {
    return new URL(url)
      .hostname
      .replace(/^www\./, "")
      .split(".")[0];
  } catch {
    return "your product";
  }
}

function recordingDir() {
  return path.join(
    process.cwd(),
    "output",
    "recording"
  );
}

function validFile(file) {
  if (!file) return false;

  const fullPath =
    path.join(
      recordingDir(),
      file
    );

  return (
    fs.existsSync(fullPath) &&
    fs.statSync(fullPath).size >
      0
  );
}

function capturedStates(manifest) {
  return (
    manifest.steps || []
  ).filter(
    (step) =>
      step.type ===
        "state-captured" &&
      step.screenshot
  );
}

function buildNarration(
  name,
  description,
  fallback
) {
  return (
    clean(fallback) ||
    clean(description) ||
    `This is ${name}, shown working in the real product.`
  );
}

function buildDemoPackage(
  manifest,
  description = ""
) {
  const states =
    capturedStates(
      manifest
    );

  const realFootage =
    manifest.realFootage?.file;

  if (!validFile(realFootage)) {
    throw new Error(
      "BRAG did not produce a valid real browser recording. Screenshots are reference evidence only."
    );
  }

  if (!states.length) {
    throw new Error(
      "BRAG captured no usable product states."
    );
  }

  const narrative =
    buildNarrative(
      manifest.director ||
        {},
      states
    );

  const name =
    productName(
      manifest.source,
      states[0]?.title
    );

  const scenes = [];

  // Keep the cut tight: roughly 20 seconds, with every shot using a
  // different section of the real browser recording.
  scenes.push({
    id: "hook",
    duration: 3,
    footage: realFootage,
    footageType: "real-browser-recording",
    videoStart: 0,
    videoEnd: 3,
    narration: buildNarration(name, description, narrative.scenes?.[0]?.text || narrative.scenes?.[0]),
    purpose: "Establish the real product.",
    motion: { type: "push-in", from: 1.00, to: 1.05 }
  });

  states.slice(0, 3).forEach((state, index) => {
    const recordingMs = Number(state.recordingMs) || 0;
    const stateTime = recordingMs / 1000;
    const startTime = Math.max(0, stateTime - 1.8);
    const endTime = Math.max(startTime + 2.8, stateTime + 0.8);

    scenes.push({
      id: `workflow-${index + 1}`,
      duration: 4,
      footage: realFootage,
      footageType: "real-browser-recording",
      videoStart: startTime,
      videoEnd: endTime,
      narration: clean(state.action?.text)
        ? `${name} responds as the user ${state.action.text.toLowerCase()}.`
        : "The workflow moves to the next useful step.",
      purpose: "Show real product interaction.",
      cursor: state.cursor || null,
      interaction: {
        focus: state.cursor || null,
        effects: ["focus-hold", "click-ring"]
      },
      sourceState: state.step,
      sourceScreenshot: state.screenshot,
      motion: {
        type: index % 2 === 0 ? "push-in" : "pull-out",
        from: index % 2 === 0 ? 1.00 : 1.05,
        to: index % 2 === 0 ? 1.05 : 1.00
      }
    });
  });

  const last = states[states.length - 1];
  const lastMs = Number(last.recordingMs) || 0;
  const resultStart = Math.max(0, lastMs / 1000 - 2.4);
  const resultEnd = Math.max(resultStart + 3.0, lastMs / 1000 + 0.6);

  scenes.push({
    id: "result",
    duration: 4,
    footage: realFootage,
    footageType: "real-browser-recording",
    videoStart: resultStart,
    videoEnd: resultEnd,
    narration: narrative.scenes?.[3]?.text || "The useful result is visible in the real product.",
    purpose: "Show the useful result.",
    cursor: last.cursor || null,
    interaction: { focus: last.cursor || null, effects: ["focus-hold"] },
    sourceState: last.step,
    sourceScreenshot: last.screenshot,
    motion: { type: "push-in", from: 1.00, to: 1.08 }
  });

  let finalScenes =
    scenes;

  try {
    const edited =
      applyInteractionToScenes(
        scenes,
        manifest
      );

    if (
      Array.isArray(
        edited
      )
    ) {
      finalScenes =
        edited;
    }
  } catch (error) {
    console.warn(
      `Cinematography pass skipped: ${error.message}`
    );
  }

  const invalid =
    finalScenes.filter(
      (scene) =>
        !validFile(
          scene.footage
        )
    );

  if (invalid.length) {
    throw new Error(
      "Invalid scene footage: " +
        invalid
          .map(
            (scene) =>
              scene.id
          )
          .join(", ")
    );
  }

  const totalDuration =
    finalScenes.reduce(
      (sum, scene) =>
        sum +
        Number(
          scene.duration ||
            0
        ),
      0
    );

  return {
    version:
      "3.0",

    product:
      name,

    source:
      manifest.source,

    generatedAt:
      new Date().toISOString(),

    totalDuration,

    capturedStateCount:
      states.length,

    sceneCount:
      finalScenes.length,

    scenes:
      finalScenes,

    realFootage:
      manifest.realFootage,

    shotPlan:
      manifest.shotPlan ||
      null,

    narrative,

    footageDirectory:
      "output/recording",

    sourcePolicy:
      "Real browser recording is the primary visual source. Screenshots are evidence/reference only.",

    formats: [
      "16:9",
      "9:16"
    ],

    visualLanguage: {
      cursor:
        "highlight-click-target",

      captions:
        "bottom-safe",

      transitions:
        "short-crossfade"
    }
  };
}

async function main() {
  const url =
    process.argv[2];

  if (!url) {
    console.error(
      "Usage: node demo.js https://example.com [maxSteps] [description]"
    );

    process.exit(1);
  }

  const maxSteps =
    process.argv[3] ||
    4;

  const description =
    process.argv
      .slice(4)
      .join(" ");

  const manifest =
    await runWorkflow(
      url,
      {
        maxSteps
      }
    );

  const pkg =
    buildDemoPackage(
      manifest,
      description
    );

  fs.mkdirSync(
    "output/demo",
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    "output/demo/package.json",
    JSON.stringify(
      pkg,
      null,
      2
    )
  );

  fs.writeFileSync(
    "output/demo/narration.txt",
    pkg.scenes
      .map(
        (scene, index) =>
          `[Scene ${index + 1} | ${scene.duration}s]\n${scene.narration}`
      )
      .join("\n\n")
  );

  console.log(
    JSON.stringify(
      pkg,
      null,
      2
    )
  );
}

main().catch(
  (error) => {
    console.error(
      error.stack ||
        error
    );

    process.exit(1);
  }
);
