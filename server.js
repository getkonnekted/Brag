const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { chromium } = require("playwright");
const { buildStoryboard } = require("./director");
const { runWorkflow } = require("./runner");

const PORT = Number(process.env.PORT || 4173);
const ENGINE_TOKEN = process.env.BRAG_ENGINE_TOKEN || "";
const ALLOWED_ORIGIN =
  process.env.BRAG_ALLOWED_ORIGIN || "*";

const ROOT = __dirname;

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function sendJson(res, status, data) {
  if (res.headersSent) {
    return;
  }

  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8",
    ...corsHeaders()
  });

  res.end(JSON.stringify(data));
}

/* =========================================================
   AUTH
========================================================= */

function isAuthorized(req) {
  if (!ENGINE_TOKEN) {
    return true;
  }

  const authorization =
    req.headers.authorization || "";

  return (
    authorization ===
    `Bearer ${ENGINE_TOKEN}`
  );
}

function requireAuth(req, res) {
  if (isAuthorized(req)) {
    return true;
  }

  sendJson(res, 401, {
    ok: false,
    error: "Unauthorized"
  });

  return false;
}

/* =========================================================
   REQUEST BODY
========================================================= */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();

      if (body.length > 2 * 1024 * 1024) {
        reject(
          new Error(
            "Request body is too large."
          )
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
      } catch (error) {
        reject(
          new Error(
            "Invalid JSON request body."
          )
        );
      }
    });

    req.on("error", reject);
  });
}

/* =========================================================
   VALIDATION
========================================================= */

function validUrl(url) {
  return (
    typeof url === "string" &&
    /^https?:\/\//i.test(url)
  );
}

/* =========================================================
   PRODUCT INSPECTION
========================================================= */

async function inspectProduct(url) {
  let browser = null;

  try {
    console.log(
      "[BRAG] Launching Chromium..."
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
        consoleErrors.push(
          message.text()
        );
      }
    });

    page.on("pageerror", error => {
      pageErrors.push(
        error.message
      );
    });

    console.log(
      "[BRAG] Visiting:",
      url
    );

    const response = await page.goto(
      url,
      {
        waitUntil:
          "domcontentloaded",
        timeout: 30000
      }
    );

    const status = response
      ? response.status()
      : null;

    console.log(
      "[BRAG] HTTP status:",
      status
    );

    await page
      .waitForLoadState(
        "networkidle",
        {
          timeout: 12000
        }
      )
      .catch(() => {});

    const title =
      await page
        .title()
        .catch(() => "");

    const description =
      await page
        .locator(
          'meta[name="description"]'
        )
        .getAttribute("content")
        .catch(() => null);

    const headings =
      await page
        .locator("h1,h2,h3")
        .allTextContents()
        .catch(() => []);

    const buttons =
      await page
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
                element.getAttribute(
                  "aria-label"
                ) ||
                ""
              )
                .trim()
                .replace(
                  /\s+/g,
                  " "
                )
            }))
            .filter(
              item => item.text
            )
        )
        .catch(() => []);

    const links =
      await page
        .locator("a")
        .evaluateAll(elements =>
          elements
            .slice(0, 40)
            .map(element => ({
              text: (
                element.innerText ||
                ""
              )
                .trim()
                .replace(
                  /\s+/g,
                  " "
                ),
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

/* =========================================================
   INSPECT ENDPOINT
========================================================= */

async function handleInspect(
  req,
  res
) {
  if (!requireAuth(req, res)) {
    return;
  }

  try {
    const data =
      await readBody(req);

    if (!validUrl(data.url)) {
      return sendJson(
        res,
        400,
        {
          ok: false,
          error:
            "A valid http(s) URL is required."
        }
      );
    }

    console.log(
      "[BRAG] INSPECT START:",
      data.url
    );

    const inspection =
      await inspectProduct(
        data.url
      );

    console.log(
      "[BRAG] INSPECTION COMPLETE"
    );

    console.log(
      "[BRAG] Building storyboard..."
    );

    const storyboard =
      buildStoryboard(
        inspection
      );

    console.log(
      "[BRAG] STORYBOARD COMPLETE"
    );

    return sendJson(
      res,
      200,
      {
        ok: true,
        inspection,
        storyboard
      }
    );
  } catch (error) {
    console.error(
      "[BRAG] INSPECT ERROR:",
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
        stage: "inspect",
        timestamp:
          new Date().toISOString()
      }
    );
  }
}

/* =========================================================
   RECORD ENDPOINT
========================================================= */

async function handleRecord(
  req,
  res
) {
  if (!requireAuth(req, res)) {
    return;
  }

  try {
    const data =
      await readBody(req);

    if (!validUrl(data.url)) {
      return sendJson(
        res,
        400,
        {
          ok: false,
          error:
            "A valid http(s) URL is required."
        }
      );
    }

    console.log(
      "[BRAG] RECORD START:",
      data.url
    );

    const result =
      await runWorkflow(
        data.url,
        {
          maxSteps:
            data.maxSteps
        }
      );

    console.log(
      "[BRAG] RECORD COMPLETE"
    );

    return sendJson(
      res,
      200,
      {
        ok: true,
        ...result
      }
    );
  } catch (error) {
    console.error(
      "[BRAG] RECORD ERROR:",
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
        stage: "record",
        timestamp:
          new Date().toISOString()
      }
    );
  }
}

/* =========================================================
   PRODUCE ENDPOINT
========================================================= */

async function handleProduce(
  req,
  res
) {
  if (!requireAuth(req, res)) {
    return;
  }

  try {
    const data =
      await readBody(req);

    if (!validUrl(data.url)) {
      return sendJson(
        res,
        400,
        {
          ok: false,
          error:
            "A valid http(s) URL is required."
        }
      );
    }

    const maxSteps =
      data.maxSteps || 4;

    const args = [
      "brag.js",
      data.url,
      String(maxSteps)
    ];

    if (data.description) {
      args.push(
        String(data.description)
      );
    }

    console.log(
      "[BRAG] PRODUCE START:",
      data.url
    );

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
          "[BRAG] SPAWN ERROR:",
          error
        );
      }
    );

    child.on(
      "close",
      code => {
        let qa = null;

        const qaPath =
          path.join(
            ROOT,
            "output",
            "qa",
            "report.json"
          );

        if (
          fs.existsSync(
            qaPath
          )
        ) {
          try {
            qa =
              JSON.parse(
                fs.readFileSync(
                  qaPath,
                  "utf8"
                )
              );
          } catch (error) {
            console.error(
              "[BRAG] QA READ ERROR:",
              error
            );
          }
        }

        const files = [
          "output/final/product-demo-16x9.mp4",
          "output/final/product-demo-9x16.mp4",
          "output/final/product-demo-1x1.mp4"
        ];

        const finalFiles =
          files.filter(file =>
            fs.existsSync(
              path.join(
                ROOT,
                file
              )
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
          result.ok
        );

        sendJson(
          res,
          code === 0
            ? 200
            : 500,
          result
        );
      }
    );
  } catch (error) {
    console.error(
      "[BRAG] PRODUCE ERROR:",
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

/* =========================================================
   SERVER
========================================================= */

const server =
  http.createServer(
    async (req, res) => {
      console.log(
        "[BRAG REQUEST]",
        req.method,
        req.url
      );

      /*
       * CORS PREFLIGHT
       */

      if (
        req.method ===
        "OPTIONS"
      ) {
        res.writeHead(
          204,
          corsHeaders()
        );

        return res.end();
      }

      /*
       * HEALTH
       */

      if (
        req.method === "GET" &&
        req.url ===
          "/api/health"
      ) {
        return sendJson(
          res,
          200,
          {
            ok: true,
            service:
              "brag-engine",
            version: "3.0",
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

      /*
       * INSPECT
       */

      if (
        req.method === "POST" &&
        req.url ===
          "/api/inspect"
      ) {
        return handleInspect(
          req,
          res
        );
      }

      /*
       * RECORD
       */

      if (
        req.method === "POST" &&
        req.url ===
          "/api/record"
      ) {
        return handleRecord(
          req,
          res
        );
      }

      /*
       * PRODUCE
       */

      if (
        req.method === "POST" &&
        req.url ===
          "/api/produce"
      ) {
        return handleProduce(
          req,
          res
        );
      }

      /*
       * UNKNOWN ROUTE
       */

      return sendJson(
        res,
        404,
        {
          ok: false,
          error:
            "BRAG endpoint not found",
          path: req.url
        }
      );
    }
  );

/* =========================================================
   SERVER ERROR
========================================================= */

server.on(
  "error",
  error => {
    console.error(
      "[BRAG] SERVER ERROR:",
      error
    );
  }
);

/* =========================================================
   START SERVER
========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "========================================"
    );

    console.log(
      "BRAG ENGINE"
    );

    console.log(
      "Status: RUNNING"
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Authentication: ${
        ENGINE_TOKEN
          ? "ENABLED"
          : "DISABLED"
      }`
    );

    console.log(
      `CORS: ${ALLOWED_ORIGIN}`
    );

    console.log(
      "========================================"
    );
  }
);
```
