const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const packagePath =
  process.argv[2] ||
  "output/demo/package.json";

if (!fs.existsSync(packagePath)) {
  console.error(
    `Demo package not found: ${packagePath}`
  );

  process.exit(1);
}

function commandAvailable(
  command,
  args = ["--version"]
) {
  try {
    execFileSync(
      command,
      args,
      {
        stdio: "ignore"
      }
    );

    return true;
  } catch {
    return false;
  }
}

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFileName(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "scene";
}

function main() {
  const pkg =
    JSON.parse(
      fs.readFileSync(
        packagePath,
        "utf8"
      )
    );

  if (
    !Array.isArray(
      pkg.scenes
    ) ||
    !pkg.scenes.length
  ) {
    throw new Error(
      "No scenes found in demo package."
    );
  }

  if (
    !commandAvailable(
      "espeak-ng",
      ["--version"]
    )
  ) {
    throw new Error(
      "espeak-ng is required for narration but was not found."
    );
  }

  const audioDir =
    path.join(
      path.dirname(
        packagePath
      ),
      "audio"
    );

  fs.mkdirSync(
    audioDir,
    {
      recursive: true
    }
  );

  const scenes = [];
  const usedNames =
    new Set();

  pkg.scenes.forEach(
    (scene, index) => {
      const text =
        clean(
          scene.narration
        );

      if (!text) {
        throw new Error(
          `Scene ${index + 1} has no narration text.`
        );
      }

      const baseName =
        `${String(
          index + 1
        ).padStart(
          2,
          "0"
        )}-${safeFileName(
          scene.id ||
            `scene-${index + 1}`
        )}`;

      let fileName =
        `${baseName}.wav`;

      let suffix = 2;

      while (
        usedNames.has(
          fileName
        )
      ) {
        fileName =
          `${baseName}-${suffix++}.wav`;
      }

      usedNames.add(
        fileName
      );

      const output =
        path.join(
          audioDir,
          fileName
        );

      console.log(
        `Narrating scene ${index + 1}: ${
          scene.id || "scene"
        }`
      );

      execFileSync(
        "espeak-ng",
        [
          "-v",
          process.env.ESPEAK_VOICE ||
            "en-us",

          "-s",
          process.env.ESPEAK_SPEED ||
            "155",

          "-p",
          process.env.ESPEAK_PITCH ||
            "50",

          "-a",
          process.env.ESPEAK_AMPLITUDE ||
            "100",

          "-w",
          output,

          text
        ],
        {
          stdio:
            "inherit"
        }
      );

      if (
        !fs.existsSync(
          output
        ) ||
        fs.statSync(
          output
        ).size === 0
      ) {
        throw new Error(
          `Narration audio was not created for scene ${
            index + 1
          }.`
        );
      }

      scenes.push({
        id:
          scene.id ||
          `scene-${index + 1}`,

        audio:
          fileName,

        targetDuration:
          Number(
            scene.duration
          ) || 5,

        text
      });
    }
  );

  const manifest = {
    version:
      "1.0",

    engine:
      "espeak-ng",

    generatedAt:
      new Date().toISOString(),

    scenes
  };

  fs.writeFileSync(
    path.join(
      audioDir,
      "manifest.json"
    ),
    JSON.stringify(
      manifest,
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(
      path.dirname(
        packagePath
      ),
      "narration.txt"
    ),
    scenes
      .map(
        (scene, index) =>
          `[Scene ${index + 1} | ${
            scene.targetDuration
          }s]\n${scene.text}`
      )
      .join(
        "\n\n"
      )
  );

  console.log(
    JSON.stringify(
      manifest,
      null,
      2
    )
  );

  console.log(
    "\nBRAG narration complete."
  );
}

main();
