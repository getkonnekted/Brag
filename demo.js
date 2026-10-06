const fs = require("fs");
const path = require("path");
const { runWorkflow } = require("./runner");
const { buildNarrative } = require("./director");
const { applyInteractionToScenes } = require("./cinematography");

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

function validFootagePath(recordingDir, footage) {
  if (!footage) {
    return false;
  }

  return fs.existsSync(
    path.join(recordingDir, footage)
  );
}

function capturedStates(manifest) {
  return (manifest.steps || []).filter(
    (step) =>
      step.type === "state-captured" &&
      step.screenshot
  );
}

function firstScreenshot(manifest) {
  const step = (manifest.steps || []).find(
    (item) =>
      item.screenshot &&
      validFootagePath(
        path.join(
          process.cwd(),
          "output",
          "recording"
        ),
        item.screenshot
      )
  );

  return step?.screenshot || null;
}

function buildDemoPackage(
  manifest,
  description = ""
) {
  const recordingDir = path.join(
    process.cwd(),
    "output",
    "recording"
  );

  const states =
    capturedStates(manifest);

  const narrative = buildNarrative(
    manifest.director || {},
    states
  );

  const name = productName(
    manifest.source,
    states[0]?.title ||
      manifest.steps?.find(
        (step) => step.title
      )?.title
  );

  const realFootage =
    manifest.realFootage?.file &&
    validFootagePath(
      recordingDir,
      manifest.realFootage.file
    )
      ? manifest.realFootage.file
      : null;

  const openingScreenshot =
    firstScreenshot(manifest);

  const first = states[0] || null;
  const last =
    states[states.length - 1] ||
    null;

  const scenes = [];

  /*
   * HOOK
   *
   * Use an actual captured frame whenever
   * available. Never invent a screenshot path.
   */
  if (openingScreenshot) {
    scenes.push({
      id: "hook",

      duration: 4,

      footage:
        openingScreenshot,

      footageType:
        "captured-screenshot",

      narration:
        narrative.scenes[0]?.text ||
        (description
          ? clean(description).slice(
              0,
              220
            )
          : `${name} is built to solve a specific problem without adding unnecessary complexity.`),

      purpose:
        "Establish the problem and promise.",

      motion: {
        type: "slow-zoom",
        from: 1,
        to: 1.06
      }
    });
  }

  /*
   * PRODUCT
   *
   * Prefer the real Playwright browser
   * recording because this is the strongest
   * proof that BRAG captured the actual product.
   */
  if (realFootage) {
    scenes.push({
      id: "product",

      duration: 5,

      footage:
        realFootage,

      footageType:
        "real-browser-recording",

      narration:
        narrative.scenes[1]?.text ||
        `Meet ${name}. This is the product in its real environment, not a mockup.`,

      purpose:
        "Orient the viewer inside the actual product.",

      motion: {
        type: "static",
        from: 1,
        to: 1
      }
    });
  } else if (first?.screenshot) {
    scenes.push({
      id: "product",

      duration: 5,

      footage:
        first.screenshot,

      footageType:
        "state-screenshot",

      narration:
        narrative.scenes[1]?.text ||
        `Meet ${name}. This is the product in its real environment, not a mockup.`,

      purpose:
        "Orient the viewer inside the actual product.",

      cursor:
        first.cursor || null,

      motion: {
        type: "static",
        from: 1,
        to: 1
      }
    });
  }

  /*
   * WORKFLOW
   *
   * Every workflow scene must correspond
   * to a real state captured by runner.js.
   */
  states
    .slice(0, 3)
    .forEach((state, index) => {
      scenes.push({
        id:
          `workflow-${index + 1}`,

        duration: 7,

        footage:
          state.screenshot,

        footageType:
          "state-screenshot",

        narration:
          state.headings?.length
            ? `From here, the important path is ${state.headings
                .slice(0, 2)
                .join(" and ")}.`
            : state.action?.text
              ? `The product responds to ${state.action.text}.`
              : "This is an important step in the user workflow.",

        purpose:
          "Show the real product doing the work.",

        cursor:
          state.cursor || null,

        motion: {
          type:
            index % 2
              ? "slow-zoom"
              : "push-left",

          from: 1,

          to: 1.05
        }
      });
    });

  /*
   * RESULT
   *
   * Only create a result scene when
   * we have an actual captured state.
   *
   * This prevents the old bug where the
   * renderer received a scene with null
   * footage.
   */
  if (last?.screenshot) {
    const resultEvidence =
      last.evaluation?.proof
        ? "The captured state shows evidence of the intended outcome."
        : last.headings?.length
          ? `The captured state reveals ${last.headings
              .slice(0, 2)
              .join(" and ")}.`
          : "The captured state shows the product after the core interaction.";

    scenes.push({
      id: "result",

      duration: 6,

      footage:
        last.screenshot,

      footageType:
        "state-screenshot",

      narration:
        narrative.scenes[3]?.text ||
        resultEvidence,

      purpose:
        "Make the value visible.",

      cursor:
        last.cursor || null,

      motion: {
        type: "slow-zoom",
        from: 1.02,
        to: 1.07
      }
    });
  }

  /*
   * CLOSE
   *
   * A close can safely reuse the final
   * captured state. It must never point to
   * missing footage.
   */
  if (last?.screenshot) {
    const finalAction =
      manifest.director
        ?.strongestAction;

    scenes.push({
      id: "close",

      duration: 4,

      footage:
        last.screenshot,

      footageType:
        "state-screenshot",

      narration: finalAction
        ? `That's ${name}. The product demonstrates its value through ${finalAction}.`
        : `That's ${name}. Show the product, show the workflow, then let the result speak for itself.`,

      purpose:
        "Close with the strongest captured product evidence.",

      cursor:
        last.cursor || null,

      motion: {
        type: "push-right",
        from: 1.03,
        to: 1.08
      }
    });
  }

  /*
   * Fail early if the capture produced no
   * usable evidence. This is much better than
   * sending an invalid package to the renderer.
   */
  if (scenes.length === 0) {
    throw new Error(
      "BRAG captured no usable footage or screenshots. The demo package cannot be created."
    );
  }

  /*
   * Verify every scene has a real file.
   */
  const invalidScenes =
    scenes.filter(
      (scene) =>
        !validFootagePath(
          recordingDir,
          scene.footage
        )
    );

  if (invalidScenes.length) {
    const ids =
      invalidScenes
        .map((scene) => scene.id)
        .join(", ");

    throw new Error(
      `Demo package contains scenes without valid footage: ${ids}`
    );
  }

  /*
   * Apply cinematography only after the
   * evidence-backed scene list is complete.
   */
  let finalScenes = scenes;

  try {
    const edited =
      applyInteractionToScenes(
        scenes,
        manifest
      );

    if (
      Array.isArray(edited)
    ) {
      finalScenes = edited;
    }
  } catch (error) {
    /*
     * Cinematography is an enhancement.
     * It must never destroy an otherwise
     * valid evidence-backed package.
     */
    console.warn(
      `Cinematography pass skipped: ${error.message}`
    );
  }

  /*
   * Revalidate after cinematography.
   */
  const invalidFinalScenes =
    finalScenes.filter(
      (scene) =>
        !validFootagePath(
          recordingDir,
          scene.footage
        )
    );

  if (
    invalidFinalScenes.length
  ) {
    const ids =
      invalidFinalScenes
        .map((scene) => scene.id)
        .join(", ");

    throw new Error(
      `Cinematography produced scenes without valid footage: ${ids}`
    );
  }

  const totalDuration =
    finalScenes.reduce(
      (sum, scene) =>
        sum +
        Number(scene.duration || 0),
      0
    );

  return {
    version: "2.0",

    product: name,

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
      manifest.realFootage ||
      null,

    shotPlan:
      manifest.shotPlan ||
      null,

    narrative,

    footageDirectory:
      "output/recording",

    next:
      "Feed this evidence-backed edit decision list into the renderer and TTS layer.",

    formats: [
      "16:9",
      "9:16",
      "1:1"
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
    process.argv[3] || 4;

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

main().catch((error) => {
  console.error(
    error.stack || error
  );

  process.exit(1);
});
