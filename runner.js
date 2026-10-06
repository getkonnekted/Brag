const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const {
  buildIntelligence,
  buildShotPlan,
  evaluateCapturedState
} = require("./director");

const SAFE =
  /^(start|get started|try|try it|demo|explore|learn more|discover|play|begin|launch|view demo|see demo|continue|next|open|view|details|dashboard|features|how it works)$/i;

const BLOCKED =
  /(delete|remove|cancel|logout|log out|pay|purchase|buy|subscribe|checkout|transfer|withdraw|send money|confirm payment|publish|post|deploy|password|reset password|verify|sign in|signin|login|log in|upload|download)/i;

function clean(v) {
  return (v || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

async function waitForStability(page) {
  await page
    .waitForLoadState("domcontentloaded", { timeout: 12000 })
    .catch(() => {});

  await page
    .waitForLoadState("networkidle", { timeout: 5000 })
    .catch(() => {});

  await page.waitForTimeout(350);
}

function isSafeHref(href, origin) {
  if (!href) return false;

  try {
    const u = new URL(href, origin);

    return (
      u.origin === origin &&
      !["mailto:", "tel:", "javascript:"].includes(u.protocol)
    );
  } catch {
    return false;
  }
}

async function visibleActions(page) {
  return page
    .locator("a,button,[role=button],input[type=submit]")
    .evaluateAll((els) =>
      els
        .slice(0, 100)
        .map((el, index) => {
          const r = el.getBoundingClientRect();

          /*
           * IMPORTANT:
           * This callback executes inside the browser.
           * It cannot access the Node.js clean() function.
           */
          const rawText =
            el.innerText ||
            el.value ||
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.href ||
            "";

          const text = String(rawText)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 140);

          return {
            index,
            tag: el.tagName.toLowerCase(),
            text,
            href: el.tagName === "A" ? el.href : null,
            type: el.getAttribute("type"),
            visible: r.width > 0 && r.height > 0,
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height)
          };
        })
        .filter((x) => x.visible && x.text)
    );
}

function directorScore(action, intelligence) {
  if (BLOCKED.test(action.text)) {
    return -1000;
  }

  const text = action.text;

  if (action.type === "submit") {
    return -800;
  }

  const priority =
    /get started|try|demo|start|launch|play|continue|next|explore|discover|create|order|book/i;

  let score = SAFE.test(text) ? 50 : 0;

  if (priority.test(text)) {
    score += 30;
  }

  if (
    intelligence?.strongestAction &&
    text.toLowerCase() === intelligence.strongestAction.toLowerCase()
  ) {
    score += 100;
  }

  if (
    intelligence?.archetype === "game" &&
    /play|start/i.test(text)
  ) {
    score += 35;
  }

  if (
    intelligence?.archetype === "commerce" &&
    /order|explore|start/i.test(text)
  ) {
    score += 25;
  }

  if (
    intelligence?.archetype === "creation-workflow" &&
    /create|start|try/i.test(text)
  ) {
    score += 25;
  }

  if (
    action.tag === "a" &&
    !isSafeHref(action.href, intelligence.origin)
  ) {
    return -900;
  }

  return score;
}

async function inspectForDirector(page, url) {
  return {
    url,

    title: await page.title(),

    description: await page
      .locator('meta[name="description"]')
      .getAttribute("content")
      .catch(() => null),

    headings: await page
      .locator("h1,h2,h3")
      .allTextContents(),

    /*
     * IMPORTANT:
     * clean() cannot be called inside evaluateAll().
     * The normalization is performed directly inside
     * the browser callback instead.
     */
    buttons: await page
      .locator("button,[role=button],input[type=submit]")
      .evaluateAll((els) =>
        els
          .slice(0, 30)
          .map((el) => {
            const rawText =
              el.innerText ||
              el.value ||
              el.getAttribute("aria-label") ||
              "";

            const text = String(rawText)
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 140);

            return { text };
          })
          .filter((x) => x.text)
      ),

    /*
     * Same fix for links.
     */
    links: await page
      .locator("a")
      .evaluateAll((as) =>
        as
          .slice(0, 40)
          .map((a) => {
            const text = String(a.innerText || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 140);

            return {
              text,
              href: a.href
            };
          })
          .filter((x) => x.text || x.href)
      )
  };
}

async function runWorkflow(url, options = {}) {
  const maxSteps = Math.min(
    Math.max(Number(options.maxSteps) || 4, 1),
    6
  );

  const outputDir =
    options.outputDir ||
    path.join(process.cwd(), "output", "recording");

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 900
    },

    recordVideo: {
      dir: path.join(outputDir, "video")
    }
  });

  const page = await context.newPage();

  const origin = new URL(url).origin;

  const errors = [];
  const requestFailures = [];

  let pageCrashed = false;

  const startedAt = Date.now();

  const steps = [];
  const visited = new Set();

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  page.on("requestfailed", (request) => {
    requestFailures.push({
      url: request.url(),
      failure:
        request.failure()?.errorText ||
        "request failed"
    });
  });

  page.on("crash", () => {
    pageCrashed = true;
    errors.push("Page crashed during capture.");
  });

  try {
    /*
     * STEP 1
     * Open the real product.
     */
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await waitForStability(page);

    /*
     * STEP 2
     * Inspect the real product.
     */
    const inspection = await inspectForDirector(
      page,
      url
    );

    /*
     * STEP 3
     * Let the director interpret the product.
     */
    const intelligence =
      buildIntelligence(inspection);

    intelligence.origin = origin;

    const shotPlan =
      buildShotPlan(intelligence);

    /*
     * STEP 4
     * Execute the director's workflow.
     */
    for (
      let step = 1;
      step <= maxSteps;
      step++
    ) {
      const shot =
        shotPlan.shots[
          Math.min(
            step - 1,
            shotPlan.shots.length - 1
          )
        ];

      const actionStartedAt = Date.now();

      const beforeUrl = page.url();

      const screenshot =
        `step-${String(step).padStart(2, "0")}-before.png`;

      await page.screenshot({
        path: path.join(
          outputDir,
          screenshot
        ),
        fullPage: false
      });

      /*
       * Discover visible actions.
       */
      const actions =
        await visibleActions(page);

      /*
       * Score them using the director.
       */
      const candidates = actions
        .map((action) => ({
          ...action,
          score: directorScore(
            action,
            intelligence
          )
        }))
        .filter(
          (action) => action.score > 0
        )
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.y - b.y
        );

      /*
       * Select an action we have not already visited.
       */
      const target = candidates.find(
        (action) =>
          !visited.has(
            `${page.url()}|${action.text}|${
              action.href || ""
            }`
          )
      );

      /*
       * Nothing safe to do.
       */
      if (!target) {
        steps.push({
          step,
          type: "stop",
          timestamp:
            new Date().toISOString(),
          reason:
            "No new director-approved safe action found",
          url: page.url(),
          screenshot
        });

        break;
      }

      visited.add(
        `${page.url()}|${target.text}|${
          target.href || ""
        }`
      );

      const locator = page
        .locator(
          "a,button,[role=button],input[type=submit]"
        )
        .filter({
          hasText: target.text
        })
        .first();

      /*
       * Record director decision.
       */
      steps.push({
        step,
        type: "action-selected",
        timestamp:
          new Date().toISOString(),

        action: {
          text: target.text,
          tag: target.tag,
          href: target.href || null
        },

        director: {
          archetype:
            intelligence.archetype,

          promise:
            intelligence.promise,

          strongestAction:
            intelligence.strongestAction,

          score: target.score
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
        screenshot
      });

      /*
       * Execute action.
       */
      let actionSucceeded = false;
      let actionError = null;

      for (
        let attempt = 1;
        attempt <= 2;
        attempt++
      ) {
        try {
          /*
           * Never follow an unsafe external link.
           */
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

          actionSucceeded = true;

          break;
        } catch (error) {
          actionError = error;

          steps.push({
            step,
            type: "action-retry",
            attempt,
            timestamp:
              new Date().toISOString(),

            action: {
              text: target.text,
              tag: target.tag
            },

            reason: clean(
              error.message
            )
          });

          await waitForStability(page);
        }
      }

      /*
       * Action failed.
       */
      if (!actionSucceeded) {
        steps.push({
          step,
          type: "action-failed",
          timestamp:
            new Date().toISOString(),

          action: {
            text: target.text,
            tag: target.tag
          },

          reason: clean(
            actionError?.message ||
              "Action failed"
          )
        });

        continue;
      }

      /*
       * Wait for the product to settle.
       */
      await waitForStability(page);

      const afterUrl = page.url();

      /*
       * Same-origin protection.
       */
      if (!afterUrl.startsWith(origin)) {
        steps.push({
          step,
          type: "blocked",
          reason:
            "Navigation left approved origin.",
          url: afterUrl
        });

        break;
      }

      /*
       * Capture result screenshot.
       */
      const afterScreenshot =
        `step-${String(step).padStart(
          2,
          "0"
        )}-after.png`;

      await page.screenshot({
        path: path.join(
          outputDir,
          afterScreenshot
        ),
        fullPage: false
      });

      const headings =
        await page
          .locator("h1,h2,h3")
          .allTextContents();

      /*
       * Cursor position represents the action
       * BRAG performed.
       */
      const cursor = {
        x:
          target.x +
          target.width / 2,

        y:
          target.y +
          target.height / 2
      };

      const state = {
        step,
        type: "state-captured",

        timestamp:
          new Date().toISOString(),

        url: afterUrl,

        urlChanged:
          beforeUrl !== afterUrl,

        shot: shot
          ? {
              id: shot.id,
              type: shot.type,
              goal: shot.goal
            }
          : null,

        title:
          await page.title(),

        headings:
          headings
            .map(clean)
            .filter(Boolean)
            .slice(0, 8),

        screenshot: afterScreenshot,

        cursor,

        elapsedMs:
          Date.now() -
          actionStartedAt
      };

      /*
       * Director evaluates what happened.
       */
      state.evaluation =
        evaluateCapturedState(
          state,
          intelligence
        );

      steps.push(state);

      /*
       * Useful result found.
       */
      if (
        state.evaluation?.decision ===
        "hold-result"
      ) {
        steps.push({
          step,
          type: "director-hold",
          reason:
            state.evaluation.reason
        });

        break;
      }

      /*
       * Director wants a different route.
       */
      if (
        state.evaluation?.decision ===
        "replan"
      ) {
        const freshActions =
          await visibleActions(page);

        const alternatives =
          freshActions
            .map((action) => ({
              ...action,
              score: directorScore(
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
                b.score - a.score ||
                a.y - b.y
            );

        const alternative =
          alternatives.find(
            (action) =>
              !visited.has(
                `${page.url()}|${action.text}|${
                  action.href || ""
                }`
              )
          );

        if (alternative) {
          steps.push({
            step,
            type: "replan",
            timestamp:
              new Date().toISOString(),

            from: target.text,
            to: alternative.text,

            reason:
              state.evaluation.reason
          });
        } else {
          steps.push({
            step,
            type: "replan-stop",

            reason:
              "No alternate safe action available."
          });

          break;
        }
      }
    }

    /*
     * Build capture manifest.
     */
    const manifest = {
      version: "1.6",

      source: url,

      capturedAt:
        new Date().toISOString(),

      maxSteps,

      director: intelligence,

      shotPlan,

      steps,

      elapsedMs:
        Date.now() - startedAt,

      consoleErrors: errors,

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

        recordingValid: false
      },

      policy: {
        sameOriginOnly: true,

        directorGuided: true,

        safeActionAllowlist:
          SAFE.source,

        blockedActionPattern:
          BLOCKED.source,

        maxSteps
      }
    };

    /*
     * Finalize Playwright recording.
     */
    const recordedVideo =
      page.video();

    await context.close();

    if (recordedVideo) {
      try {
        const videoPath =
          await recordedVideo.path();

        const target =
          path.join(
            outputDir,
            "real-product-footage.webm"
          );

        fs.copyFileSync(
          videoPath,
          target
        );

        manifest.captureHealth.recordingValid =
          fs.existsSync(target) &&
          fs.statSync(target).size > 0;

        manifest.realFootage = {
          file:
            "real-product-footage.webm",

          format: "webm",

          source:
            "playwright-browser-recording",

          path: target
        };
      } catch (error) {
        manifest.realFootage = {
          file: null,
          error: error.message
        };
      }
    }

    /*
     * Save manifest.
     */
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
    /*
     * Ensure the browser is not left running
     * if anything unexpected happens.
     */
    await browser
      .close()
      .catch(() => {});
  }
}

if (require.main === module) {
  const url = process.argv[2];

  if (!url) {
    console.error(
      "Usage: node runner.js https://example.com [maxSteps]"
    );

    process.exit(1);
  }

  runWorkflow(url, {
    maxSteps: process.argv[3]
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
