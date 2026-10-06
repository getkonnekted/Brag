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
  if (!intelligence) {
    return false;
  }

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

  await page.waitForTimeout(350);
}

function isSafeHref(href, origin) {
  if (!href) {
    return false;
  }

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
            type:
              element.getAttribute("type"),
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

  if (!text) {
    return -1000;
  }

  if (BLOCKED.test(text)) {
    return -1000;
  }

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

  if (
    intelligence?.archetype === "game" &&
    /play|start/i.test(text)
  ) {
    score += 35;
  }

  if (
    intelligence?.archetype ===
      "commerce" &&
    /order|explore|start/i.test(text)
  ) {
    score += 25;
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
              element.getAttribute(
                "aria-label"
              ) ||
              element.getAttribute(
                "title"
              ) ||
              "";

            const text = String(rawText)
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 140);

            return {
              text
            };
          })
          .filter(
            (item) => item.text
          )
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
              className:
                element.className?.baseVal ||
                element.className ||
                "",
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

  if (!best) {
    return null;
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
        "Current product is not classified as a creation product."
    };
  }

  const canvas = await findCanvas(page);

  if (!canvas) {
    return {
      success: false,
      reason:
        "No sufficiently large canvas or SVG surface was found."
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
        "Canvas was found but its bounding box could not be read."
    };
  }

  const margin = 80;

  const usableLeft =
    box.x + margin;

  const usableTop =
    box.y + margin;

  const usableRight =
    box.x +
    box.width -
    margin;

  const usableBottom =
    box.y +
    box.height -
    margin;

  if (
    usableRight <= usableLeft ||
    usableBottom <= usableTop
  ) {
    return {
      success: false,
      reason:
        "Canvas usable area is too small."
    };
  }

  const centerX =
    (usableLeft + usableRight) /
    2;

  const centerY =
    (usableTop + usableBottom) /
    2;

  const shapeWidth = Math.min(
    260,
    (usableRight - usableLeft) *
      0.32
  );

  const shapeHeight = Math.min(
    170,
    (usableBottom - usableTop) *
      0.28
  );

  let startX;
  let startY;
  let endX;
  let endY;

  if (creationStep === 1) {
    startX =
      centerX -
      shapeWidth / 2;

    startY =
      centerY -
      shapeHeight / 2;

    endX =
      centerX +
      shapeWidth / 2;

    endY =
      centerY +
      shapeHeight / 2;
  } else if (creationStep === 2) {
    startX =
      centerX -
      shapeWidth / 2;

    startY =
      centerY +
      shapeHeight * 0.75;

    endX =
      centerX +
      shapeWidth / 2;

    endY =
      centerY +
      shapeHeight * 0.75;
  } else {
    startX =
      centerX -
      shapeWidth * 0.8;

    startY =
      centerY -
      shapeHeight * 0.9;

    endX =
      centerX +
      shapeWidth * 0.8;

    endY =
      centerY +
      shapeHeight * 0.9;
  }

  await page.mouse.move(
    startX,
    startY
  );

  await page.mouse.down();

  await page.mouse.move(
    endX,
    endY,
    {
      steps: 12
    }
  );

  await page.mouse.up();

  await page.waitForTimeout(500);

  return {
    success: true,

    type: "canvas-draw",

    action:
      creationStep === 1
        ? "Draw a primary shape"
        : creationStep === 2
          ? "Add a second canvas element"
          : "Add a connecting visual",

    canvas: {
      selector: canvas.selector,
      tag: canvas.tag,
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height)
    },

    coordinates: {
      startX: Math.round(startX),
      startY: Math.round(startY),
      endX: Math.round(endX),
      endY: Math.round(endY)
    }
  };
}

async function captureState(
  page,
  outputDir,
  step,
  shot,
  cursor = null
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

    type: "state-captured",

    timestamp:
      new Date().toISOString(),

    url: page.url(),

    title:
      await page.title(),

    headings: headings
      .map(clean)
      .filter(Boolean)
      .slice(0, 8),

    screenshot,

    cursor,

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
        )
      }
    });

  const page =
    await context.newPage();

  const origin =
    new URL(url).origin;

  const errors = [];
  const requestFailures = [];

  let pageCrashed = false;

  const startedAt =
    Date.now();

  const steps = [];
  const visited = new Set();

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
    await page.goto(url, {
      waitUntil:
        "domcontentloaded",
      timeout: 30000
    });

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

      const actionStartedAt =
        Date.now();

      const beforeUrl =
        page.url();

      const beforeScreenshot =
        `step-${String(
          step
        ).padStart(
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
       * CREATION PRODUCTS
       *
       * For Excalidraw-like products,
       * do not hunt for generic DOM
       * buttons such as "Open Ctrl+O".
       *
       * The director should control the
       * actual creative surface.
       */
      if (
        creationProduct &&
        step >= 1
      ) {
        creationStep += 1;

        const canvasResult =
          await performCanvasCreation(
            page,
            intelligence,
            creationStep
          );

        if (
          canvasResult.success
        ) {
          const cursor =
            canvasResult.coordinates
              ? {
                  x:
                    canvasResult
                      .coordinates
                      .endX,
                  y:
                    canvasResult
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
              cursor
            );

          state.urlChanged =
            beforeUrl !==
            state.url;

          state.elapsedMs =
            Date.now() -
            actionStartedAt;

          state.action = {
            type:
              canvasResult.type,

            text:
              canvasResult.action
          };

          state.canvas =
            canvasResult.canvas;

          state.coordinates =
            canvasResult.coordinates;

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
                canvasResult.type,

              text:
                canvasResult.action
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

            url: page.url(),

            screenshot:
              beforeScreenshot
          });

          steps.push(
            state
          );

          /*
           * Once the director sees
           * useful canvas evidence,
           * hold the final state.
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

            break;
          }

          continue;
        }

        /*
         * If a creation surface was not
         * found, fall back to safe DOM
         * actions rather than failing
         * the entire capture.
         */
        steps.push({
          step,

          type:
            "canvas-unavailable",

          reason:
            canvasResult.reason
        });
      }

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

          type: "stop",

          timestamp:
            new Date().toISOString(),

          reason:
            "No new director-approved safe action found",

          url: page.url(),

          screenshot:
            beforeScreenshot
        });

        break;
      }

      visited.add(
        `${page.url()}|${target.text}|${target.href || ""}`
      );

      steps.push({
        step,

        type:
          "action-selected",

        timestamp:
          new Date().toISOString(),

        action: {
          text:
            target.text,

          tag:
            target.tag,

          href:
            target.href || null
        },

        director: {
          archetype:
            intelligence.archetype,

          promise:
            intelligence.promise,

          strongestAction:
            intelligence.strongestAction,

          score:
            target.score
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

        url:
          page.url(),

        screenshot:
          beforeScreenshot
      });

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

      let actionSucceeded =
        false;

      let actionError =
        null;

      for (
        let attempt = 1;
        attempt <= 2;
        attempt++
      ) {
        try {
          if (
            target.tag === "a" &&
            !isSafeHref(
              target.href,
              origin
            )
          ) {
            throw new Error(
              "Destination is outside approved origin or unsafe."
            );
          }

          await locator.click({
            timeout: 8000
          });

          actionSucceeded =
            true;

          break;
        } catch (error) {
          actionError =
            error;

          steps.push({
            step,

            type:
              "action-retry",

            attempt,

            timestamp:
              new Date().toISOString(),

            action: {
              text:
                target.text,

              tag:
                target.tag
            },

            reason:
              clean(
                error.message
              )
          });

          await waitForStability(
            page
          );
        }
      }

      if (!actionSucceeded) {
        steps.push({
          step,

          type:
            "action-failed",

          timestamp:
            new Date().toISOString(),

          action: {
            text:
              target.text,

            tag:
              target.tag
          },

          reason:
            clean(
              actionError?.message ||
                "Action failed"
            )
        });

        continue;
      }

      await waitForStability(
        page
      );

      const afterUrl =
        page.url();

      if (
        !afterUrl.startsWith(
          origin
        )
      ) {
        steps.push({
          step,

          type: "blocked",

          reason:
            "Navigation left approved origin.",

          url: afterUrl
        });

        break;
      }

      const targetX =
        target.x +
        target.width / 2;

      const targetY =
        target.y +
        target.height / 2;

      const state =
        await captureState(
          page,
          outputDir,
          step,
          shot,
          {
            x: targetX,
            y: targetY
          }
        );

      state.urlChanged =
        beforeUrl !==
        afterUrl;

      state.elapsedMs =
        Date.now() -
        actionStartedAt;

      state.action = {
        type: "dom-click",

        text:
          target.text
      };

      state.evaluation =
        evaluateCapturedState(
          state,
          intelligence
        );

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

        break;
      }

      if (
        state.evaluation
          ?.decision ===
        "replan"
      ) {
        const freshActions =
          await visibleActions(
            page
          );

        const alternatives =
          freshActions
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

        const alternative =
          alternatives.find(
            (action) =>
              !visited.has(
                `${page.url()}|${action.text}|${action.href || ""}`
              )
          );

        if (alternative) {
          steps.push({
            step,

            type:
              "replan",

            timestamp:
              new Date().toISOString(),

            from:
              target.text,

            to:
              alternative.text,

            reason:
              state.evaluation
                .reason
          });
        } else {
          steps.push({
            step,

            type:
              "replan-stop",

            reason:
              "No alternate safe action available."
          });

          break;
        }
      }
    }

    const manifest = {
      version: "1.7",

      source: url,

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

        safeActionAllowlist:
          SAFE.source,

        blockedActionPattern:
          BLOCKED.source,

        maxSteps
      }
    };

    const recordedVideo =
      page.video();

    await context.close();

    if (recordedVideo) {
      try {
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

        manifest.captureHealth.recordingValid =
          fs.existsSync(
            targetPath
          ) &&
          fs.statSync(
            targetPath
          ).size > 0;

        manifest.realFootage = {
          file:
            "real-product-footage.webm",

          format:
            "webm",

          source:
            "playwright-browser-recording",

          path:
            targetPath
        };
      } catch (error) {
        manifest.realFootage = {
          file: null,

          error:
            error.message
        };
      }
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
  } finally {
    await browser
      .close()
      .catch(() => {});
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
        error.stack || error
      );

      process.exit(1);
    });
}

module.exports = {
  runWorkflow
};
