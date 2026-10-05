const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const { buildStoryboard } = require("./director");
const { runWorkflow } = require("./runner");

const PORT = process.env.PORT || 4173;
const ENGINE_TOKEN = process.env.BRAG_ENGINE_TOKEN || "";
const ALLOWED_ORIGIN = process.env.BRAG_ALLOWED_ORIGIN || "*";

function corsHeaders() {
return {
"Access-Control-Allow-Origin": ALLOWED_ORIGIN,
"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
"Access-Control-Allow-Headers": "Content-Type, Authorization",
"Vary": "Origin"
};
}

function jsonHeaders() {
return {
"Content-Type": "application/json",
...corsHeaders()
};
}

function sendJson(res, status, payload) {
res.writeHead(status, jsonHeaders());
res.end(JSON.stringify(payload));
}

function authorized(req) {
if (!ENGINE_TOKEN) return true;

const value = req.headers.authorization || "";
return value === `Bearer ${ENGINE_TOKEN}`;
}

function requireAuth(req, res) {
if (authorized(req)) return true;

sendJson(res, 401, {
error: "Unauthorized. Configure the BRAG engine token."
});

return false;
}

function readBody(req) {
return new Promise((resolve, reject) => {
let body = "";

```
req.on("data", chunk => {
  body += chunk.toString();

  // Prevent unexpectedly large request bodies.
  if (body.length > 2 * 1024 * 1024) {
    reject(new Error("Request body is too large."));
    req.destroy();
  }
});

req.on("end", () => {
  try {
    resolve(JSON.parse(body || "{}"));
  } catch {
    reject(new Error("Invalid JSON request body."));
  }
});

req.on("error", reject);
```

});
}

function validUrl(url) {
return typeof url === "string" && /^https?:///i.test(url);
}

const root = __dirname;

const mime = {
".html": "text/html",
".js": "text/javascript",
".css": "text/css",
".json": "application/json",
".png": "image/png",
".jpg": "image/jpeg",
".jpeg": "image/jpeg",
".svg": "image/svg+xml",
".webm": "video/webm",
".mp4": "video/mp4"
};

/**

* Inspect a real product with Playwright.
  */
  async function inspect(url) {
  let browser;

try {
browser = await chromium.launch({
headless: true
});

```
const page = await browser.newPage({
  viewport: {
    width: 1440,
    height: 900
  }
});

const errors = [];

page.on("console", message => {
  if (message.type() === "error") {
    errors.push(message.text());
  }
});

page.on("pageerror", error => {
  errors.push(error.message);
});

await page.goto(url, {
  waitUntil: "domcontentloaded",
  timeout: 30000
});

await page
  .waitForLoadState("networkidle", {
    timeout: 12000
  })
  .catch(() => {});

const result = {
  url,
  title: await page.title(),

  description: await page
    .locator('meta[name="description"]')
    .getAttribute("content")
    .catch(() => null),

  headings: await page
    .locator("h1,h2,h3")
    .allTextContents(),

  buttons: await page
    .locator('button,[role="button"],input[type="submit"]')
    .evaluateAll(elements =>
      elements
        .slice(0, 30)
        .map(element => ({
          text: (
            element.innerText ||
            element.value ||
            element.getAttribute("aria-label") ||
            ""
          ).trim()
        }))
        .filter(item => item.text)
    ),

  links: await page
    .locator("a")
    .evaluateAll(elements =>
      elements
        .slice(0, 40)
        .map(element => ({
          text: (element.innerText || "").trim(),
          href: element.href
        }))
        .filter(item => item.text || item.href)
    ),

  consoleErrors: errors
};

return result;
```

} finally {
if (browser) {
await browser.close().catch(() => {});
}
}
}

const server = http.createServer(async (req, res) => {
console.log(
"BRAG REQUEST:",
req.method,
JSON.stringify(req.url)
);

// CORS preflight
if (req.method === "OPTIONS") {
res.writeHead(204, corsHeaders());
return res.end();
}

try {
/**
* HEALTH
*/
if (
req.method === "GET" &&
req.url === "/api/health"
) {
return sendJson(res, 200, {
ok: true,
service: "brag-engine",
version: "2.3",
capabilities: [
"inspect",
"record",
"produce"
],
timestamp: new Date().toISOString()
});
}

```
/**
 * RECORD
 */
if (
  req.method === "POST" &&
  req.url === "/api/record"
) {
  if (!requireAuth(req, res)) return;

  try {
    const { url, maxSteps } = await readBody(req);

    if (!validUrl(url)) {
      throw new Error(
        "A valid http(s) URL is required."
      );
    }

    console.log(
      "BRAG RECORD START:",
      url
    );

    const result = await runWorkflow(url, {
      maxSteps
    });

    console.log(
      "BRAG RECORD COMPLETE:",
      url
    );

    return sendJson(res, 200, result);
  } catch (error) {
    console.error(
      "BRAG RECORD ERROR:",
      error
    );

    return sendJson(res, 400, {
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}

/**
 * PRODUCE
 */
if (
  req.method === "POST" &&
  req.url === "/api/produce"
) {
  if (!requireAuth(req, res)) return;

  try {
    const {
      url,
      maxSteps,
      description
    } = await readBody(req);

    if (!validUrl(url)) {
      throw new Error(
        "A valid http(s) URL is required."
      );
    }

    console.log(
      "BRAG PRODUCE START:",
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
        cwd: root,
        env: process.env
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", data => {
      const text = data.toString();
      stdout += text;
      console.log(
        "[BRAG]",
        text.trim()
      );
    });

    child.stderr.on("data", data => {
      const text = data.toString();
      stderr += text;
      console.error(
        "[BRAG STDERR]",
        text.trim()
      );
    });

    child.on("error", error => {
      console.error(
        "BRAG PRODUCE SPAWN ERROR:",
        error
      );
    });

    child.on("close", code => {
      try {
        const qaPath = path.join(
          root,
          "output",
          "qa",
          "report.json"
        );

        const qa = fs.existsSync(qaPath)
          ? JSON.parse(
              fs.readFileSync(
                qaPath,
                "utf8"
              )
            )
          : null;

        const finalFiles = [
          "output/final/product-demo-16x9.mp4",
          "output/final/product-demo-9x16.mp4",
          "output/final/product-demo-1x1.mp4"
        ].filter(file =>
          fs.existsSync(
            path.join(root, file)
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
          "BRAG PRODUCE COMPLETE:",
          JSON.stringify({
            ok: result.ok,
            exitCode: result.exitCode,
            final: result.final
          })
        );

        sendJson(
          res,
          code === 0 ? 200 : 500,
          result
        );
      } catch (error) {
        console.error(
          "BRAG PRODUCE RESULT ERROR:",
          error
        );

        sendJson(res, 500, {
          error:
            error instanceof Error
              ? error.message
              : String(error)
        });
      }
    });

    return;
  } catch (error) {
    console.error(
      "BRAG PRODUCE REQUEST ERROR:",
      error
    );

    return sendJson(res, 400, {
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}

/**
 * INSPECT
 */
if (
  req.method === "POST" &&
  req.url === "/api/inspect"
) {
  if (!requireAuth(req, res)) return;

  try {
    const { url } = await readBody(req);

    if (!validUrl(url)) {
      throw new Error(
        "A valid http(s) URL is required."
      );
    }

    console.log(
      "BRAG INSPECT START:",
      url
    );

    const inspection =
      await inspect(url);

    console.log(
      "BRAG INSPECTION COMPLETE:",
      JSON.stringify({
        title: inspection.title,
        headings:
          inspection.headings?.length || 0,
        buttons:
          inspection.buttons?.length || 0,
        links:
          inspection.links?.length || 0,
        consoleErrors:
          inspection.consoleErrors?.length || 0
      })
    );

    const storyboard =
      buildStoryboard(inspection);

    return sendJson(res, 200, {
      inspection,
      storyboard
    });
  } catch (error) {
    console.error(
      "BRAG INSPECT ERROR:",
      error
    );

    return sendJson(res, 400, {
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

/**
 * STATIC FILES
 */
let file =
  req.url === "/"
    ? "/index.html"
    : req.url;

file = path
  .normalize(file)
  .replace(/^\\.{2}/, "");

const target = path.join(
  root,
  file
);

if (!target.startsWith(root)) {
  res.writeHead(
    403,
    corsHeaders()
  );
  return res.end("Forbidden");
}

if (
  !fs.existsSync(target) ||
  fs.statSync(target).isDirectory()
) {
  res.writeHead(
    404,
    corsHeaders()
  );
  return res.end("Not found");
}

res.writeHead(200, {
  "Content-Type":
    mime[path.extname(target)] ||
    "application/octet-stream",
  ...corsHeaders()
});

return fs
  .createReadStream(target)
  .pipe(res);
```

} catch (error) {
console.error(
"BRAG SERVER ERROR:",
error
);

```
if (!res.headersSent) {
  sendJson(res, 500, {
    error:
      error instanceof Error
        ? error.message
        : String(error),

    stage: "server",
    timestamp:
      new Date().toISOString()
  });
} else {
  res.end();
}
```

}
});

server.listen(PORT, () => {
console.log(
`BRAG running at http://localhost:${PORT}`
);
});
