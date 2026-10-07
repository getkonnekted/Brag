const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const {
buildIntelligence,
buildShotPlan,
evaluateCapturedState
} = require("./director");

const SAFE =
/^(start|get started|try|try it|demo|explore|learn more|discover|play|begin|launch|view demo|see demo|continue|next|view|details|dashboard|features|how it works|create|new|draw|diagram|design|edit)$/i;

const BLOCKED =
/(delete|remove|cancel|logout|log out|pay|purchase|buy|subscribe|checkout|transfer|withdraw|send money|confirm payment|publish|post|deploy|password|reset password|verify|sign in|signin|login|log in|upload|download|export|import|save|settings|help|keyboard|shortcut)/i;

function clean(value) {
return String(value || "")
.replace(/\s+/g, " ")
.trim()
.slice(0, 140);
}

function isCreationProduct(intelligence) {
if (!intelligence) return false;

if (intelligence.archetype === "creation-workflow") {
return true;
}

const corpus = [
intelligence.product,
intelligence.promise,
...(intelligence.evidence?.headings || []),
...(intelligence.evidence?.actions || [])
].join(" ");

return /\b(excalidraw|whiteboard|canvas|diagram|drawing|draw|design|visualize|mindmap|mind map)\b/i.test(
corpus
);
}

async function waitForStability(page) {
await page
.waitForLoadState("domcontentloaded", {
timeout: 12000
})
.catch(() => {});

await page
.waitForLoadState("networkidle", {
timeout: 5000
})
.catch(() => {});

await page.waitForTimeout(700);
}

function isSafeHref(href, origin) {
if (!href) return false;

try {
const url = new URL(href, origin);


return (
  url.origin === origin &&
  !["mailto:", "tel:", "javascript:"].includes(
    url.protocol
  )
);


} catch {
return false;
}
}

async function visibleActions(page) {
return page
.locator(
"a,button,[role=button],input[type=submit]"
)
.evaluateAll((elements) =>
elements
.slice(0, 100)
.map((element, index) => {
const rect =
element.getBoundingClientRect();


      const rawText =
        element.innerText ||
        element.value ||
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.href ||
        "";

      const text = String(rawText)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140);

      return {
        index,
        tag: element.tagName.toLowerCase(),
        text,
        href:
          element.tagName === "A"
            ? element.href
            : null,
        type: element.getAttribute("type"),
        visible:
          rect.width > 0 &&
          rect.height > 0,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    })
    .filter(
      (action) =>
        action.visible &&
        action.text
    )
);


}

function directorScore(action, intelligence) {
const text = action.text;

if (!text) return -1000;
if (BLOCKED.test(text)) return -1000;

if (action.type === "submit") {
return -800;
}

if (
action.tag === "a" &&
!isSafeHref(
action.href,
intelligence.origin
)
) {
return -900;
}

const priority =
/get started|try|demo|start|launch|play|continue|next|explore|discover|create|new|draw|diagram|design|edit/i;

let score = SAFE.test(text)
? 50
: 0;

if (priority.test(text)) {
score += 30;
}

if (
intelligence?.strongestAction &&
text.toLowerCase() ===
intelligence.strongestAction.toLowerCase()
) {
score += 100;
}

if (
intelligence?.archetype ===
"creation-workflow" &&
/create|new|start|try|draw|diagram|design|edit/i.test(
text
)
) {
score += 40;
}

return score;
}

async function inspectForDirector(page, url) {
return {
url,


title: await page.title(),

description: await page
  .locator(
    'meta[name="description"]'
  )
  .getAttribute("content")
  .catch(() => null),

headings: await page
  .locator("h1,h2,h3")
  .allTextContents(),

buttons: await page
  .locator(
    "button,[role=button],input[type=submit]"
  )
  .evaluateAll((elements) =>
    elements
      .slice(0, 30)
      .map((element) => {
        const rawText =
          element.innerText ||
          element.value ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          "";

        return {
          text: String(rawText)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 140)
        };
      })
      .filter((item) => item.text)
  ),

links: await page
  .locator("a")
  .evaluateAll((elements) =>
    elements
      .slice(0, 40)
      .map((element) => ({
        text: String(
          element.innerText || ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 140),
        href: element.href
      }))
      .filter(
        (item) =>
          item.text ||
          item.href
      )
  )


};
}

async function findCanvas(page) {
const selectors = [
"canvas",
".excalidraw__canvas",
"[data-testid*='canvas']",
"svg"
];

let best = null;

for (const selector of selectors) {
const candidates = await page
.locator(selector)
.evaluateAll((elements) =>
elements
.map((element, index) => {
const rect =
element.getBoundingClientRect();


        return {
          index,
          tag:
            element.tagName.toLowerCase(),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          area:
            rect.width *
            rect.height
        };
      })
      .filter(
        (item) =>
          item.width >= 250 &&
          item.height >= 200
      )
  )
  .catch(() => []);

for (const candidate of candidates) {
  if (
    !best ||
    candidate.area > best.area
  ) {
    best = {
      ...candidate,
      selector
    };
  }
}


}

return best;
}

async function performCanvasCreation(
page,
intelligence,
creationStep
) {
if (!isCreationProduct(intelligence)) {
return {
success: false,
reason:
"Product is not classified as a creation workflow."
};
}

const canvas = await findCanvas(page);

if (!canvas) {
return {
success: false,
reason:
"No usable canvas was found."
};
}

const locator = page.locator(
canvas.selector
);

const box =
await locator
.nth(canvas.index)
.boundingBox()
.catch(() => null);

if (!box) {
return {
success: false,
reason:
"Canvas bounding box unavailable."
};
}

const margin = 80;

const left =
box.x + margin;

const top =
box.y + margin;

const right =
box.x +
box.width -
margin;

const bottom =
box.y +
box.height -
margin;

if (
right <= left ||
bottom <= top
) {
return {
success: false,
reason:
"Canvas usable area is too small."
};
}

const centerX =
(left + right) / 2;

const centerY =
(top + bottom) / 2;

const width = Math.min(
260,
(right - left) * 0.32
);

const height = Math.min(
170,
(bottom - top) * 0.28
);

/*

* Deliberately create different
* movements for each captured state.
*
* This is important: the browser
* recording must contain actual
* progression, not the same gesture
* repeated in the same location.
  */
  let startX;
  let startY;
  let endX;
  let endY;

if (creationStep === 1) {
startX =
centerX - width / 2;


startY =
  centerY - height / 2;

endX =
  centerX + width / 2;

endY =
  centerY + height / 2;


} else if (creationStep === 2) {
startX =
centerX - width * 0.95;


startY =
  centerY + height * 0.75;

endX =
  centerX - width * 0.15;

endY =
  centerY + height * 0.75;


} else if (creationStep === 3) {
startX =
centerX + width * 0.15;


startY =
  centerY + height * 0.75;

endX =
  centerX + width * 0.95;

endY =
  centerY + height * 0.75;


} else {
startX =
centerX - width * 0.8;


startY =
  centerY - height * 0.9;

endX =
  centerX + width * 0.8;

endY =
  centerY + height * 0.9;


}

await page.mouse.move(
startX,
startY,
{ steps: 12 }
);

await page.waitForTimeout(350);

await page.mouse.down();

await page.mouse.move(
endX,
endY,
{
steps: 36
}
);

await page.mouse.up();

/*

* Give the real product time to
* visually update before recording
* the state.
  */
  await page.waitForTimeout(1000);

return {
success: true,


type: "canvas-draw",

action:
  creationStep === 1
    ? "Draw a primary shape"
    : creationStep === 2
      ? "Add a second canvas element"
      : creationStep === 3
        ? "Add a third canvas element"
        : "Complete the visual composition",

canvas: {
  selector:
    canvas.selector,
  x: Math.round(box.x),
  y: Math.round(box.y),
  width:
    Math.round(box.width),
  height:
    Math.round(box.height)
},

coordinates: {
  startX:
    Math.round(startX),
  startY:
    Math.round(startY),
  endX:
    Math.round(endX),
  endY:
    Math.round(endY)
}


};
}

async function captureState(
page,
outputDir,
step,
shot,
cursor,
recordingStartedAt
) {
const screenshot =
`step-${String(step).padStart(
      2,
      "0"
    )}-after.png`;

await page.screenshot({
path: path.join(
outputDir,
screenshot
),
fullPage: false
});

const headings =
await page
.locator("h1,h2,h3")
.allTextContents();

return {
step,


type:
  "state-captured",

timestamp:
  new Date().toISOString(),

url: page.url(),

title:
  await page.title(),

headings:
  headings
    .map(clean)
    .filter(Boolean)
    .slice(0, 8),

screenshot,

cursor:
  cursor || null,

recordingMs:
  recordingStartedAt
    ? Math.max(
        0,
        Date.now() -
          recordingStartedAt
      )
    : null,

shot: shot
  ? {
      id: shot.id,
      type: shot.type,
      goal: shot.goal,
      plannedDuration:
        shot.duration
    }
  : null


};
}

async function runWorkflow(
url,
options = {}
) {
const maxSteps = Math.min(
Math.max(
Number(options.maxSteps) || 4,
1
),
6
);

const outputDir =
options.outputDir ||
path.join(
process.cwd(),
"output",
"recording"
);

fs.mkdirSync(
outputDir,
{
recursive: true
}
);

const browser =
await chromium.launch({
headless: true
});

const context =
await browser.newContext({
viewport: {
width: 1440,
height: 900
},


  recordVideo: {
    dir: path.join(
      outputDir,
      "video"
    ),
    size: {
      width: 1440,
      height: 900
    }
  }
});


const page =
await context.newPage();

const origin =
new URL(url).origin;

const startedAt =
Date.now();

const errors = [];
const requestFailures = [];
const steps = [];
const visited = new Set();

let pageCrashed = false;
let intelligence = null;
let shotPlan = null;

page.on(
"console",
(message) => {
if (
message.type() ===
"error"
) {
errors.push(
message.text()
);
}
}
);

page.on(
"pageerror",
(error) => {
errors.push(
error.message
);
}
);

page.on(
"requestfailed",
(request) => {
requestFailures.push({
url: request.url(),
failure:
request
.failure()
?.errorText ||
"request failed"
});
}
);

page.on(
"crash",
() => {
pageCrashed = true;


  errors.push(
    "Page crashed during capture."
  );
}


);

try {
try {
await page.goto(url, {
waitUntil:
"domcontentloaded",
timeout: 30000
});
} catch (error) {
const requestSummary = requestFailures
.slice(-8)
.map(item =>
`${item.url} — ${item.failure}`
)
.join("\n");

throw new Error(
`Navigation failed for ${url}: ${error.message}\n${requestSummary ? "Recent request failures:\n" + requestSummary : "No request failures were recorded."}`
);
}


await waitForStability(
  page
);

const inspection =
  await inspectForDirector(
    page,
    url
  );

intelligence =
  buildIntelligence(
    inspection
  );

intelligence.origin =
  origin;

shotPlan =
  buildShotPlan(
    intelligence
  );

const creationProduct =
  isCreationProduct(
    intelligence
  );

let creationStep = 0;

for (
  let step = 1;
  step <= maxSteps;
  step++
) {
  const shot =
    shotPlan.shots[
      Math.min(
        step - 1,
        shotPlan.shots.length -
          1
      )
    ];

  const beforeUrl =
    page.url();

  const beforeScreenshot =
    `step-${String(step).padStart(
      2,
      "0"
    )}-before.png`;

  await page.screenshot({
    path: path.join(
      outputDir,
      beforeScreenshot
    ),
    fullPage: false
  });

  /*
   * CREATION WORKFLOW
   *
   * Keep going after proof is found.
   * The purpose is to build a continuous
   * piece of real browser footage with
   * multiple meaningful states.
   */
  if (creationProduct) {
    creationStep++;

    const result =
      await performCanvasCreation(
        page,
        intelligence,
        creationStep
      );

    if (result.success) {
      const cursor =
        result.coordinates
          ? {
              x:
                result
                  .coordinates
                  .endX,
              y:
                result
                  .coordinates
                  .endY
            }
          : null;

      const state =
        await captureState(
          page,
          outputDir,
          step,
          shot,
          cursor,
          startedAt
        );

      state.action = {
        type:
          result.type,

        text:
          result.action
      };

      state.canvas =
        result.canvas;

      state.coordinates =
        result.coordinates;

      state.urlChanged =
        beforeUrl !==
        state.url;

      state.evaluation =
        evaluateCapturedState(
          state,
          intelligence
        );

      steps.push({
        step,

        type:
          "action-selected",

        timestamp:
          new Date().toISOString(),

        action: {
          type:
            result.type,
          text:
            result.action
        },

        director: {
          archetype:
            intelligence.archetype,

          promise:
            intelligence.promise,

          strongestAction:
            intelligence.strongestAction
        },

        shot: shot
          ? {
              id: shot.id,
              type: shot.type,
              goal: shot.goal,
              plannedDuration:
                shot.duration
            }
          : null,

        screenshot:
          beforeScreenshot,

        url:
          page.url()
      });

      steps.push(state);

      /*
       * IMPORTANT:
       *
       * Do NOT break here.
       *
       * Previously BRAG stopped at the
       * first proof state, producing a
       * ~3.5 second recording which the
       * renderer then had to loop.
       *
       * We now keep recording until
       * maxSteps so the final editor has
       * genuine temporal material.
       */
      if (
        state.evaluation
          ?.proof
      ) {
        steps.push({
          step,

          type:
            "director-hold",

          reason:
            state.evaluation
              .reason
        });
      }

      await page.waitForTimeout(
        700
      );

      continue;
    }

    steps.push({
      step,

      type:
        "canvas-unavailable",

      reason:
        result.reason
    });
  }

  /*
   * SAFE DOM FALLBACK
   */
  const actions =
    await visibleActions(
      page
    );

  const candidates =
    actions
      .map((action) => ({
        ...action,

        score:
          directorScore(
            action,
            intelligence
          )
      }))
      .filter(
        (action) =>
          action.score > 0
      )
      .sort(
        (a, b) =>
          b.score -
            a.score ||
          a.y - b.y
      );

  const target =
    candidates.find(
      (action) =>
        !visited.has(
          `${page.url()}|${action.text}|${action.href || ""}`
        )
    );

  if (!target) {
    steps.push({
      step,

      type:
        "stop",

      reason:
        "No new director-approved safe action found",

      screenshot:
        beforeScreenshot,

      url:
        page.url()
    });

    break;
  }

  visited.add(
    `${page.url()}|${target.text}|${target.href || ""}`
  );

  const locator =
    page
      .locator(
        "a,button,[role=button],input[type=submit]"
      )
      .filter({
        hasText:
          target.text
      })
      .first();

  let success = false;

  try {
    if (
      target.tag === "a" &&
      !isSafeHref(
        target.href,
        origin
      )
    ) {
      throw new Error(
        "Unsafe navigation target."
      );
    }

    await locator.click({
      timeout: 8000
    });

    success = true;
  } catch (error) {
    steps.push({
      step,

      type:
        "action-failed",

      action: {
        text:
          target.text,
        tag:
          target.tag
      },

      reason:
        clean(error.message)
    });
  }

  if (!success) {
    continue;
  }

  await waitForStability(
    page
  );

  if (
    !page
      .url()
      .startsWith(origin)
  ) {
    steps.push({
      step,

      type:
        "blocked",

      reason:
        "Navigation left approved origin.",

      url:
        page.url()
    });

    break;
  }

  const state =
    await captureState(
      page,
      outputDir,
      step,
      shot,
      {
        x:
          target.x +
          target.width /
            2,

        y:
          target.y +
          target.height /
            2
      },
      startedAt
    );

  state.action = {
    type:
      "dom-click",

    text:
      target.text
  };

  state.urlChanged =
    beforeUrl !==
    state.url;

  state.evaluation =
    evaluateCapturedState(
      state,
      intelligence
    );

  steps.push({
    step,

    type:
      "action-selected",

    action: {
      text:
        target.text,
      tag:
        target.tag,
      href:
        target.href ||
        null
    },

    screenshot:
      beforeScreenshot
  });

  steps.push(state);

  if (
    state.evaluation
      ?.decision ===
    "hold-result"
  ) {
    steps.push({
      step,

      type:
        "director-hold",

      reason:
        state.evaluation
          .reason
    });

    /*
     * For normal DOM workflows,
     * a proven result is still a
     * legitimate stopping point.
     */
    break;
  }
}

const manifest = {
  version:
    "1.9",

  source:
    url,

  capturedAt:
    new Date().toISOString(),

  maxSteps,

  director:
    intelligence,

  shotPlan,

  steps,

  elapsedMs:
    Date.now() -
    startedAt,

  consoleErrors:
    errors,

  requestFailures,

  captureHealth: {
    pageCrashed,

    requestFailureCount:
      requestFailures.length,

    actionFailures:
      steps.filter(
        (step) =>
          step.type ===
          "action-failed"
      ).length,

    canvasActions:
      steps.filter(
        (step) =>
          step.action?.type ===
          "canvas-draw"
      ).length,

    stateCaptures:
      steps.filter(
        (step) =>
          step.type ===
          "state-captured"
      ).length,

    recordingValid:
      false
  },

  policy: {
    sameOriginOnly:
      true,

    directorGuided:
      true,

    creationCanvasEnabled:
      true,

    screenshotsAreEvidenceOnly:
      true,

    maxSteps
  }
};

const recordedVideo =
  page.video();

/*
 * Closing the context finalizes
 * Playwright's WebM recording.
 */
await context.close();

if (recordedVideo) {
  const videoPath =
    await recordedVideo.path();

  const targetPath =
    path.join(
      outputDir,
      "real-product-footage.webm"
    );

  fs.copyFileSync(
    videoPath,
    targetPath
  );

  const valid =
    fs.existsSync(
      targetPath
    ) &&
    fs.statSync(
      targetPath
    ).size > 0;

  manifest.captureHealth.recordingValid =
    valid;

  manifest.realFootage = {
    file:
      "real-product-footage.webm",

    format:
      "webm",

    source:
      "playwright-browser-recording",

    path:
      targetPath,

    size:
      valid
        ? fs.statSync(
            targetPath
          ).size
        : 0
  };
}

fs.writeFileSync(
  path.join(
    outputDir,
    "manifest.json"
  ),
  JSON.stringify(
    manifest,
    null,
    2
  )
);

await browser.close();

return manifest;


} catch (error) {
await context
.close()
.catch(() => {});


await browser
  .close()
  .catch(() => {});

throw error;


}
}

if (require.main === module) {
const url =
process.argv[2];

if (!url) {
console.error(
"Usage: node runner.js https://example.com [maxSteps]"
);


process.exit(1);


}

runWorkflow(url, {
maxSteps:
process.argv[3]
})
.then((result) => {
console.log(
JSON.stringify(
result,
null,
2
)
);
})
.catch((error) => {
console.error(
error.stack ||
error
);


  process.exit(1);
});


}

module.exports = {
runWorkflow
};
