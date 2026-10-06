const fs = require("fs");
const path = require("path");
const {
  execFileSync,
  spawnSync
} = require("child_process");

const url =
  process.argv.find(
    (arg) =>
      /^https?:\/\//i.test(arg)
  ) || null;

const checkOnly =
  process.argv.includes(
    "--check"
  );

function run(
  label,
  script,
  args = []
) {
  console.log(
    `\n=== ${label} ===`
  );

  const result =
    spawnSync(
      process.execPath,
      [
        script,
        ...args
      ],
      {
        stdio:
          "inherit",
        env:
          process.env
      }
    );

  if (
    result.status !== 0
  ) {
    throw new Error(
      `${label} failed with exit code ${result.status}`
    );
  }
}

function ensureCommand(
  command
) {
  try {
    execFileSync(
      command,
      ["-version"],
      {
        stdio:
          "ignore"
      }
    );

    return true;
  } catch {
    return false;
  }
}

function checkEnvironment() {
  const checks = [
    [
      "Node.js",
      Boolean(
        process.version
      )
    ],

    [
      "FFmpeg",
      ensureCommand(
        "ffmpeg"
      )
    ],

    [
      "espeak-ng",
      ensureCommand(
        "espeak-ng"
      )
    ],

    [
      "Playwright",
      fs.existsSync(
        path.join(
          __dirname,
          "node_modules",
          "playwright"
        )
      )
    ]
  ];

  const result =
    Object.fromEntries(
      checks
    );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  if (
    !checks.every(
      ([, ok]) => ok
    )
  ) {
    throw new Error(
      "BRAG environment check failed."
    );
  }
}

function finalOutputs() {
  return [
    "brag-demo-16x9.mp4",
    "brag-demo-9x16.mp4",
    "brag-demo-1x1.mp4"
  ].map(
    (name) =>
      path.join(
        "output",
        "render",
        name
      )
  );
}

function writeFinalManifest(
  qaReport
) {
  const finalDir =
    path.join(
      "output",
      "final"
    );

  fs.mkdirSync(
    finalDir,
    {
      recursive: true
    }
  );

  const files =
    finalOutputs();

  for (
    const file of files
  ) {
    if (
      !fs.existsSync(
        file
      ) ||
      fs.statSync(
        file
      ).size === 0
    ) {
      throw new Error(
        `Missing final render: ${file}`
      );
    }

    const destination =
      path.join(
        finalDir,
        path
          .basename(
            file
          )
          .replace(
            "brag-demo-",
            "product-demo-"
          )
      );

    fs.copyFileSync(
      file,
      destination
    );
  }

  fs.writeFileSync(
    path.join(
      finalDir,
      "production.json"
    ),
    JSON.stringify(
      {
        version:
          "3.0",

        generatedAt:
          new Date().toISOString(),

        outputs:
          files.map(
            (file) =>
              path.join(
                "output",
                "final",
                path
                  .basename(
                    file
                  )
                  .replace(
                    "brag-demo-",
                    "product-demo-"
                  )
              )
          ),

        qa:
          qaReport || null,

        visualSource:
          "playwright-real-browser-recording",

        narration:
          true
      },
      null,
      2
    )
  );
}

function main() {
  checkEnvironment();

  if (checkOnly) {
    console.log(
      "BRAG environment is ready."
    );

    return;
  }

  if (!url) {
    console.error(
      "Usage: npm run brag -- https://example.com [maxSteps] [description]"
    );

    process.exit(1);
  }

  const urlIndex =
    process.argv.indexOf(
      url
    );

  const maxSteps =
    process.argv[
      urlIndex + 1
    ] || "4";

  const description =
    process.argv
      .slice(
        urlIndex + 2
      )
      .filter(
        (value) =>
          !value.startsWith(
            "--"
          )
      )
      .join(" ");

  fs.mkdirSync(
    "output",
    {
      recursive: true
    }
  );

  run(
    "INSPECT",
    "capture.js",
    [url]
  );

  run(
    "DIRECT",
    "director.js"
  );

  run(
    "CAPTURE",
    "runner.js",
    [
      url,
      maxSteps
    ]
  );

  run(
    "BUILD DEMO PACKAGE",
    "demo.js",
    [
      url,
      maxSteps,
      description
    ]
  );

  run(
    "HUMAN EDIT PLAN",
    "edit-plan.js",
    [
      "output/demo/package.json"
    ]
  );

  /*
   * Narration is no longer optional.
   *
   * voice.js will use:
   *
   * 1. Piper if PIPER_MODEL exists
   * 2. espeak-ng otherwise
   */
  run(
    "NARRATE",
    "voice.js",
    [
      "output/demo/package.json"
    ]
  );

  run(
    "RENDER",
    "render.js",
    [
      "output/demo/package.json"
    ]
  );

  run(
    "QA",
    "qa.js",
    [
      "output/demo/package.json"
    ]
  );

  const qaPath =
    "output/qa/report.json";

  const qa =
    fs.existsSync(
      qaPath
    )
      ? JSON.parse(
          fs.readFileSync(
            qaPath,
            "utf8"
          )
        )
      : null;

  if (
    qa &&
    qa.status ===
      "fail"
  ) {
    console.error(
      "\nBRAG stopped because QA failed."
    );

    process.exit(2);
  }

  writeFinalManifest(
    qa
  );

  console.log(
    "\nBRAG production complete."
  );

  console.log(
    "Final videos: output/final/"
  );
}

main();
