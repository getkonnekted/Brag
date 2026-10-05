```js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { chromium } = require("playwright");
const { buildStoryboard } = require("./director");
const { runWorkflow } = require("./runner");

const PORT = Number(process.env.PORT || 4173);
const ENGINE_TOKEN = process.env.BRAG_ENGINE_TOKEN || "";
const ALLOWED_ORIGIN = process.env.BRAG_ALLOWED_ORIGIN || "*";

const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8"
};

/* ---------------------------------------------------------
   CORS
--------------------------------------------------------- */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders()
  };
}

function sendJson(res, status, payload) {
  if (res.headersSent) {
    return;
  }

  res.writeHead(status, jsonHeaders());
  res.end(JSON.stringify(payload));
}

/* ---------------------------------------------------------
   AUTH
--------------------------------------------------------- */

function isAuthorized(req) {
  if (!ENGINE_TOKEN) {
    return true;
  }

  const authorization =
    req.headers.authorization || "";

  return authorization === `Bearer ${ENGINE_TOKEN}`;
}

function requireAuth(req, res) {
  if (isAuthorized(req)) {
    return true;
  }

  sendJson(res, 401, {
    ok: false,
    error: "Unauthorized. Configure the BRAG engine token."
  });

  return false;
}

/* ---------------------------------------------------------
   REQUEST BODY
--------------------------------------------------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();

      if (body.length > 2 * 1024 * 1024) {
        reject(
          new Error("Request body is too large.")
        );

        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(
          new Error("Invalid JSON request body.")
        );
      }
    });

    req.on("error", reject);
  });
}

/* ---------------------------------------------------------
   VALIDATION
--------------------------------------------------------- */

function validUrl(url) {
  return (
    typeof url === "string" &&
    /^https?:\/\//i.test(url)
  );
}

/* ---------------------------------------------------------
   PRODUCT INSPECTION
--------------------------------------------------------- */

async function inspectProduct(url) {
  let browser = null;

  try {
    console.log(
      "[BRAG] Launching Chromium for:",
      url
    );

    browser = await chromium.launch({
      headless: true
    });

    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 900
      }
    });

    const consoleErrors = [];
    const pageErrors = [];

    page.on("console", message => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    page.on("pageerror", error => {
      pageErrors.push(error.message);
    });

    console.log(
      "[BRAG] Navigating to:",
      url
    );

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const status = response
      ? response.status()
      : null;

    console.log(
      "[BRAG] Page loaded:",
      status
    );

    await page
      .waitForLoadState("networkidle", {
        timeout: 12000
      })
      .catch(() => {});

    const title = await page
      .title()
      .catch(() => "");

    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content")
      .catch(() => null);

    const headings = await page
      .locator("h1,h2,h3")
      .allTextContents()
      .catch(() => []);

    const buttons = await page
      .locator(
        'button,[role="button"],input[type="submit"]'
      )
      .evaluateAll(elements =>
        elements
          .slice(0, 30)
          .map(element => ({
            text: (
              element.innerText ||
              element.value ||
              element.getAttribute("aria-label") ||
              ""
            )
              .trim()
              .replace(/\s+/g, " ")
          }))
          .filter(item => item.text)
      )
      .catch(() => []);

    const links = await page
      .locator("a")
      .evaluateAll(elements =>
        elements
          .slice(0, 40)
          .map(element => ({
            text: (
              element.innerText || ""
            )
              .trim()
              .replace(/\s+/g, " "),
            href:
              element.href || ""
          }))
          .filter(
            item =>
              item.text ||
              item.href
          )
      )
      .catch(() => []);

    return {
      url,
      status,
      title,
      description,
      headings,
      buttons,
      links,
      consoleErrors,
      pageErrors
    };
  } finally {
    if (browser) {
      await browser
        .close()
        .catch(() => {});
    }
  }
}

/* ---------------------------------------------------------
   RECORD
--------------------------------------------------------- */

async function handleRecord(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  try {
    const body = await readBody(req);

    const {
      url,
      maxSteps
    } = body;

    if (!validUrl(url)) {
      return sendJson(res, 400, {
        ok: false,
        error:
          "A valid http(s) URL is required."
      });
    }

    console.log(
      "[BRAG] RECORD START:",
      url
    );

    const result = await runWorkflow(
      url,
      {
        maxSteps
      }
    );

    console.log(
      "[BRAG] RECORD COMPLETE:",
      url
    );

    return sendJson(res, 200, {
      ok: true,
      ...result
    });
  } catch (error) {
    console.error(
      "[BRAG] RECORD ERROR:",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
      stage: "record",
      timestamp:
        new Date().toISOString()
    });
  }
}

/* ---------------------------------------------------------
   INSPECT
--------------------------------------------------------- */

async function handleInspect(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  try {
    const body = await readBody(req);

    const { url } = body;

    if (!validUrl(url)) {
      return sendJson(res, 400, {
        ok: false,
        error:
          "A valid http(s) URL is required."
      });
    }

    console.log(
      "[BRAG] INSPECT START:",
      url
    );

    const inspection =
      await inspectProduct(url);

    console.log(
      "[BRAG] INSPECTION COMPLETE:",
      JSON.stringify({
        title: inspection.title,
        status: inspection.status,
        headings:
          inspection.headings.length,
        buttons:
          inspection.buttons.length,
        links:
          inspection.links.length,
        consoleErrors:
          inspection.consoleErrors.length,
        pageErrors:
          inspection.pageErrors.length
      })
    );

    console.log(
      "[BRAG] BUILDING STORYBOARD"
    );

    const storyboard =
      buildStoryboard(inspection);

    console.log(
      "[BRAG] STORYBOARD COMPLETE"
    );

    return sendJson(res, 200, {
      ok: true,
      inspection,
      storyboard
    });
  } catch (error) {
    console.error(
      "[BRAG] INSPECT ERROR:",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
      stage: "inspect",
      timestamp:
        new Date().toISOString()
    });
  }
}

/* ---------------------------------------------------------
   PRODUCE
--------------------------------------------------------- */

async function handleProduce(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  try {
    const body = await readBody(req);

    const {
      url,
      maxSteps,
      description
    } = body;

    if (!validUrl(url)) {
      return sendJson(res, 400, {
        ok: false,
        error:
          "A valid http(s) URL is required."
      });
    }

    console.log(
      "[BRAG] PRODUCE START:",
      url
    );

    const args = [
      "brag.js",
      url,
      String(maxSteps || 4)
    ];

    if (description) {
      args.push(String(description));
    }

    const child = spawn(
      process.execPath,
      args,
      {
        cwd: ROOT,
        env: process.env
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on(
      "data",
      chunk => {
        const text =
          chunk.toString();

        stdout += text;

        console.log(
          "[BRAG]",
          text.trim()
        );
      }
    );

    child.stderr.on(
      "data",
      chunk => {
        const text =
          chunk.toString();

        stderr += text;

        console.error(
          "[BRAG STDERR]",
          text.trim()
        );
      }
    );

    child.on(
      "error",
      error => {
        console.error(
          "[BRAG] PRODUCE SPAWN ERROR:",
          error
        );
      }
    );

    child.on(
      "close",
      code => {
        try {
          const qaPath =
            path.join(
              ROOT,
              "output",
              "qa",
              "report.json"
            );

          const qa =
            fs.existsSync(qaPath)
              ? JSON.parse(
                  fs.readFileSync(
                    qaPath,
                    "utf8"
                  )
                )
              : null;

          const possibleFiles = [
            "output/final/product-demo-16x9.mp4",
            "output/final/product-demo-9x16.mp4",
            "output/final/product-demo-1x1.mp4"
          ];

          const finalFiles =
            possibleFiles.filter(file =>
              fs.existsSync(
                path.join(ROOT, file)
              )
            );

          const result = {
            ok: code === 0,
            exitCode: code,
            qa,
            final: finalFiles,
            log: (
              stdout +
              "\n" +
              stderr
            ).slice(-12000)
          };

          console.log(
            "[BRAG] PRODUCE COMPLETE:",
            JSON.stringify({
              ok: result.ok,
              exitCode:
                result.exitCode,
              final:
                result.final
            })
          );

          return sendJson(
            res,
            code === 0
              ? 200
              : 500,
            result
          );
        } catch (error) {
          console.error(
            "[BRAG] PRODUCE RESULT ERROR:",
            error
          );

          return sendJson(
            res,
            500,
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
              stage: "produce"
            }
          );
        }
      }
    );
  } catch (error) {
    console.error(
      "[BRAG] PRODUCE REQUEST ERROR:",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
      stage: "produce"
    });
  }
}

/* ---------------------------------------------------------
   STATIC FILES
--------------------------------------------------------- */

function serveStatic(req, res) {
  let requestPath =
    req.url || "/";

  if (requestPath === "/") {
    requestPath = "/index.html";
  }

  const cleanPath =
    requestPath.split("?")[0];

  const relativePath =
    path
      .normalize(cleanPath)
      .replace(/^(\.\.[/\\])+/, "");

  const target =
    path.join(
      ROOT,
      relativePath
    );

  if (
    !target.startsWith(ROOT)
  ) {
    res.writeHead(
      403,
      corsHeaders()
    );

    return res.end(
      "Forbidden"
    );
  }

  if (
    !fs.existsSync(target) ||
    fs.statSync(target).isDirectory()
  ) {
    res.writeHead(
      404,
      corsHeaders()
    );

    return res.end(
      "Not found"
    );
  }

  const extension =
    path.extname(target)
      .toLowerCase();

  res.writeHead(200, {
    "Content-Type":
      MIME_TYPES[extension] ||
      "application/octet-stream",
    ...corsHeaders()
  });

  return fs
    .createReadStream(target)
    .pipe(res);
}

/* ---------------------------------------------------------
   SERVER
--------------------------------------------------------- */

const server =
  http.createServer(
    async (req, res) => {
      console.log(
        "[BRAG REQUEST]",
        req.method,
        req.url
      );

      if (
        req.method === "OPTIONS"
      ) {
        res.writeHead(
          204,
          corsHeaders()
        );

        return res.end();
      }

      try {
        /* HEALTH */

        if (
          req.method === "GET" &&
          req.url === "/api/health"
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              service:
                "brag-engine",
              version: "2.4",
              capabilities: [
                "inspect",
                "record",
                "produce"
              ],
              timestamp:
                new Date().toISOString()
            }
          );
        }

        /* INSPECT */

        if (
          req.method === "POST" &&
          req.url === "/api/inspect"
        ) {
          return await handleInspect(
            req,
            res
          );
        }

        /* RECORD */

        if (
          req.method === "POST" &&
          req.url === "/api/record"
        ) {
          return await handleRecord(
            req,
            res
          );
        }

        /* PRODUCE */

        if (
          req.method === "POST" &&
          req.url === "/api/produce"
        ) {
          return await handleProduce(
            req,
            res
          );
        }

        /* STATIC */

        return serveStatic(
          req,
          res
        );
      } catch (error) {
        console.error(
          "[BRAG] SERVER ERROR:",
          error
        );

        if (!res.headersSent) {
          return sendJson(
            res,
            500,
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
              stage: "server",
              timestamp:
                new Date().toISOString()
            }
          );
        }

        res.end();
      }
    }
  );

/* ---------------------------------------------------------
   STARTUP
--------------------------------------------------------- */

server.on(
  "error",
  error => {
    console.error(
      "[BRAG] SERVER STARTUP ERROR:",
      error
    );
  }
);

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `[BRAG] Engine listening on port ${PORT}`
    );

    console.log(
      `[BRAG] Environment: ${
        process.env.NODE_ENV ||
        "production"
      }`
    );

    console.log(
      `[BRAG] Auth: ${
        ENGINE_TOKEN
          ? "enabled"
          : "disabled"
      }`
    );

    console.log(
      `[BRAG] CORS origin: ${ALLOWED_ORIGIN}`
    );
  }
);
```
