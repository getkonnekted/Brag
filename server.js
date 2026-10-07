const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const { chromium } = require("playwright");
const { buildStoryboard } = require("./director");
const { runWorkflow } = require("./runner");

const PORT = Number(process.env.PORT || 4173);
const ENGINE_TOKEN = process.env.BRAG_ENGINE_TOKEN || "";
const ALLOWED_ORIGIN = process.env.BRAG_ALLOWED_ORIGIN || "*";

const ROOT = __dirname;
const ENGINE_VERSION = "3.4";

const productionJobs = new Map();
const PRODUCTION_JOB_TTL = 30 * 60 * 1000;
const PRODUCTION_TIMEOUT_MS = 10 * 60 * 1000;
function createProductionJob(){const id="job-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);const job={id,status:"starting",stage:"preflight",progress:2,message:"Starting production…",startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),elapsedMs:0,log:"",error:null,result:null};productionJobs.set(id,job);return job;}
function updateProductionJob(job,patch){Object.assign(job,patch,{updatedAt:new Date().toISOString(),elapsedMs:Date.now()-Date.parse(job.startedAt)});}
function inferProductionProgress(job,text){const clean=String(text||"").trim();if(!clean)return;job.log=(job.log+"\n"+clean).slice(-12000);if(/REAL PRODUCT INSPECTION/i.test(clean))updateProductionJob(job,{status:"running",stage:"inspect",progress:12,message:"Understanding the real product…"});else if(/BRAG DIRECTOR EVIDENCE/i.test(clean))updateProductionJob(job,{status:"running",stage:"direct",progress:28,message:"Choosing the strongest workflow…"});else if(/REAL PRODUCT WORKFLOW/i.test(clean))updateProductionJob(job,{status:"running",stage:"capture",progress:42,message:"Capturing real product interaction…"});else if(/BRAG HYPERFRAMES COMPOSITION/i.test(clean))updateProductionJob(job,{status:"running",stage:"compose",progress:68,message:"Building the demo composition…"});else if(/HYPERFRAMES CHECK \+ RENDER/i.test(clean))updateProductionJob(job,{status:"running",stage:"render",progress:74,message:"Rendering the final video…"});else if(/BRAG production complete/i.test(clean))updateProductionJob(job,{status:"running",stage:"verify",progress:98,message:"Verifying the finished demo…"});const m=clean.match(/(?:DEMO_PROGRESS[^0-9]*)?(\d{1,3})%/);const p=Number(m?.[1]);if(p>=1&&p<=99&&job.stage==="render")updateProductionJob(job,{progress:Math.max(74,Math.min(98,p)),message:`Rendering the final video… ${p}%`});}

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
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
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
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

    const detail =
      error instanceof Error
        ? (error.stack || error.message)
        : String(error);

    return sendJson(
      res,
      502,
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
        stage: "inspect",
        log: detail.slice(-12000),
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

async function handleProduce(req,res){
  if(!requireAuth(req,res))return;
  try{
    const data=await readBody(req);
    if(!validUrl(data.url))return sendJson(res,400,{ok:false,error:"A valid http(s) URL is required."});
    const formats=Array.isArray(data.formats)?data.formats.filter(format=>["16x9","1x1","9x16"].includes(format)):["16x9","1x1","9x16"];
    const args=["brag.js",data.url,String(data.maxSteps||4)];if(data.description)args.push(String(data.description));
    const job=createProductionJob();job.formats=formats;console.log("[BRAG] PRODUCE START:",data.url,job.id,formats);
    for(const target of ["brag.js","capture.js","director.js","runner.js","hyperframes-compose.js","hyperframes-render.js"]){const check=spawnSync(process.execPath,["--check",target],{cwd:ROOT,env:process.env,encoding:"utf8"});if(check.status!==0){const log=(check.stderr||check.stdout||`Node syntax check failed for ${target}.`).trim();updateProductionJob(job,{status:"error",stage:"preflight",progress:0,message:"Engine code check failed.",error:`Engine code check failed in ${target}.`,log});return sendJson(res,500,{ok:false,jobId:job.id,status:job.status,stage:job.stage,progress:job.progress,message:job.message,error:job.error});}}
    const child=spawn(process.execPath,args,{cwd:ROOT,env:{...process.env,DEMO_PRODUCTION_JOB_ID:job.id,DEMO_OUTPUT_FORMATS:formats.join(",")}});
    const productionTimeout=setTimeout(()=>{if(child.exitCode===null){console.error("[BRAG] PRODUCTION TIMEOUT:",job.id);updateProductionJob(job,{status:"error",stage:job.stage||"production",progress:job.progress,message:"Production timed out.",error:"Production exceeded the 10-minute safety limit. The render worker was stopped."});child.kill("SIGTERM");setTimeout(()=>{if(child.exitCode===null)child.kill("SIGKILL");},10000);}},PRODUCTION_TIMEOUT_MS);
    child.stdout.on("data",chunk=>{const t=chunk.toString();console.log("[BRAG]",t.trim());inferProductionProgress(job,t);});
    child.stderr.on("data",chunk=>{const t=chunk.toString();console.error("[BRAG STDERR]",t.trim());inferProductionProgress(job,t);});
    child.on("error",error=>updateProductionJob(job,{status:"error",stage:"production",message:"Production process failed to start.",error:error.message}));
    child.on("close",code=>{clearTimeout(productionTimeout);if(job.status==="error"&&job.error==="Production exceeded the 10-minute safety limit. The render worker was stopped.")return;let qa=null;const qaPath=path.join(ROOT,"output","qa","report.json");if(fs.existsSync(qaPath)){try{qa=JSON.parse(fs.readFileSync(qaPath,"utf8"));}catch{}}const formats=Array.isArray(job.formats)?job.formats:["16x9","1x1","9x16"];const artifactCandidates=["output/final/brag.mp4",...formats.map(format=>({ "16x9":"output/final/product-demo-16x9.mp4","1x1":"output/final/product-demo-1x1.mp4","9x16":"output/final/product-demo-9x16.mp4"}[format]).filter(Boolean)),"output/final/production.json"];const artifacts=artifactCandidates.map(f=>{const absolute=path.join(ROOT,f);return {file:f,exists:fs.existsSync(absolute),bytes:fs.existsSync(absolute)?fs.statSync(absolute).size:0};});console.log("[BRAG] DELIVERY ARTIFACTS:",JSON.stringify(artifacts));const finalFiles=artifactCandidates.filter(f=>/product-demo-(?:16x9|1x1|9x16)\.mp4$/i.test(f)&&fs.existsSync(path.join(ROOT,f))&&fs.statSync(path.join(ROOT,f)).size>0);const qaFailures=Array.isArray(qa?.checks)?qa.checks.filter(c=>c.status==="fail"):[];const log=job.log.trim();const errorLines=log.split("\n").filter(Boolean).filter(line=>/(?:Error:|TimeoutError|TargetClosedError|Navigation failed|page\.|browser|chromium|playwright)/i.test(line));const runtimeError=qaFailures.map(c=>c.detail||c.message||c.name).filter(Boolean).join(" | ")||errorLines.slice(-6).join("\n")||"Demo production process exited with an error.";const ok=code===0&&finalFiles.length>0;const result={ok,exitCode:code,stage:qaFailures.length?"qa":ok?"complete":"production",qa,final:finalFiles,error:ok?null:`${runtimeError}\nArtifacts: ${JSON.stringify(artifacts)}`,log:log.slice(-12000)};updateProductionJob(job,{status:ok?"complete":"error",stage:ok?"complete":(qaFailures.length?"qa":"production"),progress:ok?100:job.progress,message:ok?"Demo ready.":"Production failed.",error:result.error,result});console.log("[BRAG] PRODUCE COMPLETE:",ok,job.id);});
    return sendJson(res,202,{ok:true,jobId:job.id,status:job.status,stage:job.stage,progress:job.progress,message:job.message});
  }catch(error){return sendJson(res,500,{ok:false,error:error instanceof Error?error.message:String(error),stage:"produce"});}
}
async function handleProductionStatus(req,res){if(!requireAuth(req,res))return;const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);const jobId=safeJobId(u.searchParams.get("jobId"));if(!jobId)return sendJson(res,400,{ok:false,error:"A valid jobId is required."});const job=productionJobs.get(jobId);if(!job)return sendJson(res,404,{ok:false,error:"Production job not found or expired."});return sendJson(res,200,{ok:true,jobId:job.id,status:job.status,stage:job.stage,progress:job.progress,message:job.message,startedAt:job.startedAt,updatedAt:job.updatedAt,elapsedMs:job.elapsedMs,error:job.error,result:job.result});}
setInterval(()=>{const cutoff=Date.now()-PRODUCTION_JOB_TTL;for(const [id,job] of productionJobs)if(Date.parse(job.startedAt)<cutoff)productionJobs.delete(id);},5*60*1000).unref();

/* =========================================================
   HYPERFRAMES RENDER ENDPOINT
========================================================= */

function safeJobId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : null;
}

async function handleHyperframesRender(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const data = await readBody(req);
    const jobId = safeJobId(data.jobId) || `job-${Date.now()}`;
    const files = data.files && typeof data.files === "object" ? data.files : null;

    if (!files || typeof files["index.html"] !== "string") {
      return sendJson(res, 400, {
        ok: false,
        error: "A Hyperframes job requires files.index.html."
      });
    }

    const jobRoot = path.resolve(ROOT, "output", "hyperframes", jobId);
    const compositionDir = path.join(jobRoot, "composition");
    const outputFile = path.join(jobRoot, "brag.mp4");

    fs.rmSync(jobRoot, { recursive: true, force: true });
    fs.mkdirSync(compositionDir, { recursive: true });

    for (const [relativePath, value] of Object.entries(files)) {
      if (typeof value !== "string") continue;
      const normalized = String(relativePath).replace(/\\/g, "/").replace(/^\/+/, "");
      if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) {
        return sendJson(res, 400, { ok: false, error: `Invalid composition path: ${relativePath}` });
      }
      const target = path.resolve(compositionDir, normalized);
      if (!target.startsWith(compositionDir + path.sep) && target !== compositionDir) {
        return sendJson(res, 400, { ok: false, error: `Invalid composition path: ${relativePath}` });
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, value, "utf8");
    }

    console.log("[BRAG] HYPERFRAMES RENDER START:", jobId);

    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["hyperframes", "check"],
      { cwd: compositionDir, env: process.env }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });

    const checkCode = await new Promise(resolve => child.on("close", resolve));
    if (checkCode !== 0) {
      return sendJson(res, 422, {
        ok: false, jobId, stage: "check",
        error: "Hyperframes composition check failed.",
        log: (stdout + "\\n" + stderr).slice(-12000)
      });
    }

    const render = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["hyperframes", "render", "--output", outputFile],
      { cwd: compositionDir, env: process.env }
    );
    stdout = "";
    stderr = "";
    render.stdout.on("data", chunk => { stdout += chunk.toString(); console.log("[HYPERFRAMES]", chunk.toString().trim()); });
    render.stderr.on("data", chunk => { stderr += chunk.toString(); console.error("[HYPERFRAMES]", chunk.toString().trim()); });

    const renderCode = await new Promise(resolve => render.on("close", resolve));
    const exists = fs.existsSync(outputFile);

    return sendJson(res, renderCode === 0 && exists ? 200 : 500, {
      ok: renderCode === 0 && exists,
      jobId,
      stage: renderCode === 0 && exists ? "complete" : "render",
      output: exists ? `output/hyperframes/${jobId}/brag.mp4` : null,
      error: renderCode === 0 && exists ? null : "Hyperframes render failed.",
      log: (stdout + "\\n" + stderr).slice(-12000)
    });
  } catch (error) {
    console.error("[BRAG] HYPERFRAMES ERROR:", error);
    return sendJson(res, 500, {
      ok: false,
      stage: "hyperframes",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/* =========================================================
   MEDIA DELIVERY
========================================================= */

const MEDIA_TYPES = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska"
};

function resolveMediaFile(
  requestedFile
) {
  if (
    typeof requestedFile !== "string" ||
    !requestedFile
  ) {
    return null;
  }

  const normalized =
    requestedFile
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

  /*
   * Only files inside /output are allowed.
   */
  if (
    !normalized.startsWith(
      "output/"
    )
  ) {
    return null;
  }

  /*
   * Only video formats are allowed.
   */
  const extension =
    path.extname(
      normalized
    ).toLowerCase();

  if (
    !MEDIA_TYPES[extension]
  ) {
    return null;
  }

  const outputRoot =
    path.resolve(
      ROOT,
      "output"
    );

  const absolute =
    path.resolve(
      ROOT,
      normalized
    );

  /*
   * Prevent directory traversal.
   */
  if (
    absolute !== outputRoot &&
    !absolute.startsWith(
      outputRoot + path.sep
    )
  ) {
    return null;
  }

  return {
    absolute,
    type:
      MEDIA_TYPES[extension]
  };
}

function handleMedia(
  req,
  res
) {
  if (!requireAuth(req, res)) {
    return;
  }

  const parsed =
    new URL(
      req.url,
      `http://localhost:${PORT}`
    );

  const media =
    resolveMediaFile(
      parsed.searchParams.get(
        "file"
      )
    );

  if (!media) {
    return sendJson(
      res,
      400,
      {
        ok: false,
        error:
          "Invalid media file."
      }
    );
  }

  if (
    !fs.existsSync(
      media.absolute
    )
  ) {
    return sendJson(
      res,
      404,
      {
        ok: false,
        error:
          "Media file not found."
      }
    );
  }

  const stat =
    fs.statSync(
      media.absolute
    );

  const range =
    req.headers.range;

  const headers = {
    ...corsHeaders(),
    "Content-Type":
      media.type,
    "Accept-Ranges":
      "bytes",
    "Cache-Control":
      "no-store",
    "Content-Length":
      stat.size
  };

  /*
   * Browser video players use
   * HTTP range requests for seeking.
   */
  if (range) {
    const match =
      /^bytes=(\d*)-(\d*)$/.exec(
        range
      );

    if (!match) {
      res.writeHead(
        416,
        {
          ...headers,
          "Content-Range":
            `bytes */${stat.size}`
        }
      );

      return res.end();
    }

    let start = match[1]
      ? Number(match[1])
      : Math.max(
          0,
          stat.size -
            Number(
              match[2] || 0
            )
        );

    let end = match[2]
      ? Number(match[2])
      : stat.size - 1;

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      start >= stat.size
    ) {
      res.writeHead(
        416,
        {
          ...headers,
          "Content-Range":
            `bytes */${stat.size}`
        }
      );

      return res.end();
    }

    end =
      Math.min(
        end,
        stat.size - 1
      );

    headers[
      "Content-Range"
    ] =
      `bytes ${start}-${end}/${stat.size}`;

    headers[
      "Content-Length"
    ] =
      end - start + 1;

    res.writeHead(
      206,
      headers
    );

    if (
      req.method ===
      "HEAD"
    ) {
      return res.end();
    }

    return fs
      .createReadStream(
        media.absolute,
        {
          start,
          end
        }
      )
      .pipe(res);
  }

  /*
   * Full-file response.
   */
  res.writeHead(
    200,
    headers
  );

  if (
    req.method ===
    "HEAD"
  ) {
    return res.end();
  }

  return fs
    .createReadStream(
      media.absolute
    )
    .pipe(res);
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
        (
          req.method ===
            "GET" ||
          req.method ===
            "HEAD"
        ) &&
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
            version: ENGINE_VERSION,
            capabilities: [
              "inspect",
              "record",
              "produce",
              "media"
            ],
            timestamp:
              new Date().toISOString()
          }
        );
      }

      /*
       * MEDIA
       */

      if (
        (
          req.method ===
            "GET" ||
          req.method ===
            "HEAD"
        ) &&
        req.url.startsWith(
          "/api/media?"
        )
      ) {
        return handleMedia(
          req,
          res
        );
      }

      /*
       * INSPECT
       */

      if (
        req.method ===
          "POST" &&
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
        req.method ===
          "POST" &&
        req.url ===
          "/api/record"
      ) {
        return handleRecord(
          req,
          res
        );
      }

      /*
       * PRODUCTION STATUS
       */

      if (
        (
          req.method ===
            "GET" ||
          req.method ===
            "HEAD"
        ) &&
        req.url.startsWith(
          "/api/produce/status"
        )
      ) {
        return handleProductionStatus(
          req,
          res
        );
      }

      /*
       * PRODUCE
       */

      if (
        req.method ===
          "POST" &&
        req.url ===
          "/api/produce"
      ) {
        return handleProduce(
          req,
          res
        );
      }

      /*
       * HYPERFRAMES RENDER
       */

      if (
        req.method ===
          "POST" &&
        req.url ===
          "/api/hyperframes/render"
      ) {
        return handleHyperframesRender(
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
      `BRAG ENGINE ${ENGINE_VERSION}`
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
