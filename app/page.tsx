"use client";

import { useEffect, useMemo, useState } from "react";

type Stage = "idle" | "inspecting" | "producing" | "ready" | "error";
type ProductionStatus = { status:string; stage:string; progress:number; message:string; elapsedMs?:number; error?:string|null; result?:any };

const DEFAULT_ENGINE = (process.env.NEXT_PUBLIC_DEMO_ENGINE_URL || "http://localhost:4173").replace(/\/$/, "");

export default function Home() {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [engineUrl, setEngineUrl] = useState(DEFAULT_ENGINE);
  const [engineToken, setEngineToken] = useState("");
  const [product, setProduct] = useState("your product");
  const [videoUrls, setVideoUrls] = useState<Record<"16x9" | "1x1" | "9x16", string>>({ "16x9": "", "1x1": "", "9x16": "" });
  const [formats, setFormats] = useState<Array<"16x9" | "1x1" | "9x16">>(["16x9", "1x1", "9x16"]);
  const [production, setProduction] = useState<ProductionStatus | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("demo_engine_url") || "";
    const isDeployed = typeof window !== "undefined" && window.location.protocol === "https:";
    const isStaleLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(saved);

    // Never let an old localhost setting break the deployed demo.
    setEngineUrl(isDeployed && isStaleLocal ? DEFAULT_ENGINE : (saved || DEFAULT_ENGINE));
    setEngineToken(localStorage.getItem("demo_engine_token") || "");
  }, []);

  const ENGINE = engineUrl.replace(/\/$/, "");
  const hostname = useMemo(() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return "yourproduct.com"; }
  }, [url]);
  const busy = stage === "inspecting" || stage === "producing";

  function normalizeUrl(value: string) {
    const input = value.trim().replace(/^https?:\/\//i, "");
    return input ? `https://${input}` : "";
  }


  async function makeDemo() {
    setError("");
    setVideoUrls({ "16x9": "", "1x1": "", "9x16": "" });
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      setError("Enter a product URL.");
      setStage("error");
      return;
    }
    setUrl(normalizedUrl);
    setStage("inspecting");

    try {
      if (!ENGINE || ENGINE.startsWith("http://localhost") || ENGINE.startsWith("http://127.0.0.1")) {
        throw new Error("Demo engine is set to a local address. Open Engine settings and use the remote engine URL.");
      }

      const health = await fetch(ENGINE + "/api/health", { cache: "no-store" }).catch(() => {
        throw new Error("Could not reach the demo engine. Check the remote engine URL in Engine settings.");
      });
      if (!health.ok) throw new Error("Demo engine is not reachable.");

      const inspectResponse = await fetch(ENGINE + "/api/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(engineToken ? { Authorization: `Bearer ${engineToken}` } : {}) },
        body: JSON.stringify({ url: normalizedUrl })
      });
      const inspectData = await inspectResponse.json().catch(() => ({}));
      if (!inspectResponse.ok) throw new Error(inspectData.error || "Could not inspect the product.");

      setProduct(inspectData.inspection?.title || hostname.split(".")[0]);
      setStage("producing");
      setProduction({status:"starting",stage:"preflight",progress:2,message:"Starting the director…",elapsedMs:0});

      const produceResponse = await fetch(ENGINE + "/api/produce", {
        method:"POST",
        headers:{"Content-Type":"application/json",...(engineToken?{Authorization:`Bearer ${engineToken}`}:{})},
        body:JSON.stringify({url:normalizedUrl,maxSteps:4,description,formats})
      });
      const produceData=await produceResponse.json().catch(()=>({}));
      if(!produceResponse.ok||!produceData.jobId)throw new Error(produceData.error||"Could not start demo production.");
      const jobId=produceData.jobId;
      setProduction({status:"running",stage:produceData.stage||"preflight",progress:produceData.progress||2,message:produceData.message||"Starting production…"});
      let finished:any=null;
      for(;;){
        await new Promise(resolve=>setTimeout(resolve,1000));
        const sr=await fetch(`${ENGINE}/api/produce/status?jobId=${encodeURIComponent(jobId)}`,{cache:"no-store",headers:engineToken?{Authorization:`Bearer ${engineToken}`}:{}});
        const sd=await sr.json().catch(()=>({}));
        if(!sr.ok)throw new Error(sd.error||"Lost contact with the production engine.");
        setProduction(sd);
        if(sd.status==="complete"||sd.status==="error"){finished=sd;break;}
      }
      const produceResult=finished?.result;
      if(finished?.status!=="complete"||!produceResult?.ok)throw new Error(finished?.error||produceResult?.error||"Could not produce the demo.");
      const nextVideos:Record<"16x9"|"1x1"|"9x16",string>={"16x9":"","1x1":"","9x16":""};
      const returnedFiles = Array.isArray(produceResult.final) ? produceResult.final : [];
      for(const file of returnedFiles){
        if(typeof file !== "string") continue;
        if(file.includes("product-demo-16x9.mp4"))nextVideos["16x9"]=`${ENGINE}/api/media?file=${encodeURIComponent(file)}${engineToken?`&token=${encodeURIComponent(engineToken)}`:""}`;
        if(file.includes("product-demo-9x16.mp4"))nextVideos["9x16"]=`${ENGINE}/api/media?file=${encodeURIComponent(file)}${engineToken?`&token=${encodeURIComponent(engineToken)}`:""}`;
      }
      // The engine writes these two delivery artifacts to stable paths. If an
      // older worker response omitted the final[] array, recover from those
      // known paths instead of throwing away a successful production.
      if(!nextVideos["16x9"]) nextVideos["16x9"]=`${ENGINE}/api/media?file=${encodeURIComponent("output/final/product-demo-16x9.mp4")}${engineToken?`&token=${encodeURIComponent(engineToken)}`:""}`;
      if(!nextVideos["9x16"]) nextVideos["9x16"]=`${ENGINE}/api/media?file=${encodeURIComponent("output/final/product-demo-9x16.mp4")}${engineToken?`&token=${encodeURIComponent(engineToken)}`:""}`;

      // Artifact paths returned by the engine are authoritative. Do not use
      // browser-side HEAD requests as the success test for video delivery.
      setVideoUrls(nextVideos);
      if (!nextVideos["16x9"] && !nextVideos["9x16"]) {
        throw new Error("The engine finished, but no delivery video was reported. Check the Railway production log for the artifact handoff.");
      }

      setStage("ready");
      setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo production failed.");
      setStage("error");
    }
  }

  function saveEngine(next: string) {
    setEngineUrl(next);
    localStorage.setItem("demo_engine_url", next.replace(/\/$/, ""));
  }

  return (
    <main className="site">
      <header className="nav">
        <a className="logo" href="#top"><span className="logo-dot" />demo.</a>
        <nav className="nav-links"><a href="#how">How it works</a><a href="#studio">Studio</a><a href="#about">About</a></nav>
        <a className="nav-cta" href="#create">Make a demo <span>↗</span></a>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> PRODUCT → STORY → VIDEO</div>
        <h1>You built it.<br /><em>Now demo it.</em></h1>
        <p className="hero-copy">demo. turns a real product into a short, cinematic demo people can understand — without you recording a thing.</p>

        <div className="create-card" id="create">
          <div className="create-top"><div><span className="step">{busy ? "02" : "01"}</span><strong>{busy ? "Making your demo" : "Paste your product"}</strong></div><span className="hint">{busy ? "Live production" : "No account required"}</span></div>
          <div className="url-row">
            <div className="url-input"><span>https://</span><input value={url.replace(/^https?:\/\//i, "")} onChange={e => setUrl(normalizeUrl(e.target.value))} placeholder="yourproduct.com" /></div>
            <button className="make-button" disabled={!url || busy} onClick={makeDemo}>
              {stage === "inspecting" ? "Understanding..." : stage === "producing" ? "Making your demo..." : "Make my demo"}<span>{busy ? "●" : "→"}</span>
            </button>
          </div>
          <div className="format-selector">
            <span className="format-label">OUTPUT</span>
            {([["16x9","16:9"],["1x1","1:1"],["9x16","9:16"]] as const).map(([value,label]) => (
              <button key={value} type="button" className={formats.includes(value) ? "format-chip selected" : "format-chip"} onClick={() => setFormats(current => current.includes(value) ? (current.length > 1 ? current.filter(item => item !== value) : current) : [...current, value])}>{label}<span>{formats.includes(value) ? "✓" : ""}</span></button>
            ))}
          </div>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional: tell the director what matters most…" rows={2} />

          {(stage === "producing" || stage === "error") && production && (
            <div className={`production-progress ${production.status === "error" ? "production-progress-error" : ""}`} aria-live="polite">
              <div className="production-status-top">
                <div className="production-live"><span className="production-pulse" /> {production.status === "error" ? "PRODUCTION ERROR" : "LIVE PRODUCTION"}</div>
                <span className="production-percent">{Math.round(production.progress)}%</span>
              </div>
              <div className="production-message">{production.status === "error" ? (production.error || production.message || "Production failed.") : production.message}</div>
              <div className="production-stage">{production.stage.toUpperCase()} · {Math.floor((production.elapsedMs || 0) / 1000)}s elapsed</div>
              <div className="production-track"><div className="production-fill" style={{width:Math.max(2,Math.min(100,production.progress))+"%"}} /></div>
              <div className="production-steps">
                <span className={production.progress>=12?"done":""}><b>01</b> Understand</span>
                <span className={production.progress>=28?"done":""}><b>02</b> Direct</span>
                <span className={production.progress>=42?"done":""}><b>03</b> Capture</span>
                <span className={production.progress>=68?"done":""}><b>04</b> Compose</span>
                <span className={production.progress>=74?"active":""}><b>05</b> Render</span>
                <span className={production.progress>=100?"done":""}><b>06</b> Deliver</span>
              </div>
            </div>
          )}
          {error && <div className="error">{error}</div>}
          {stage === "ready" && <div className="success"><span>●</span> Demo ready — real product footage captured and rendered.</div>}
        </div>
        <div className="hero-note"><span>REAL PRODUCT</span><i>·</i><span>REAL INTERACTION</span><i>·</i><span>REAL PROOF</span></div>
      </section>

      <section className="showcase" id="studio">
        <div className="showcase-intro">
          <span className="section-tag">02 / THE RESULT</span>
          <h2>Not a screen recording.<br /><em>A product story.</em></h2>
          <p>demo. studies the product, finds the strongest workflow, captures the evidence, then directs it into a tight story.</p>
        </div>
        <div className="demo-frame">
          <div className="frame-bar"><span className="traffic"><i/><i/><i/></span><span className="frame-url">{hostname}</span><span className="frame-time">00:20</span></div>
          <div className="frame-body">
            <div className="frame-copy"><span>PRODUCT / {product.toUpperCase()}</span><h3>{stage === "ready" ? "The useful moment, captured." : "Show what matters."}</h3><p>The shortest path from an action to an outcome — captured from the real product.</p><button onClick={() => document.getElementById("create")?.scrollIntoView({behavior:"smooth"})}>Start with a URL <span>→</span></button></div>
            <div className="mini-product"><div className="mini-nav"><b>{product}</b><span>Dashboard</span><span>Projects</span><span>Settings</span></div><div className="mini-main"><div className="mini-title"/><div className="mini-grid"><i/><i/><i/></div><div className="mini-result"><span>RESULT</span><strong>Your product, understood.</strong></div></div></div>
          </div>
        </div>
      </section>

      {stage === "ready" && (videoUrls["16x9"] || videoUrls["9x16"]) && (
        <section className="showcase result-section" id="result">
          <div className="showcase-intro">
            <span className="section-tag">04 / YOUR DEMO</span>
            <h2>Real product.<br /><em>Ready to share.</em></h2>
            <p>Choose the outputs you need before production: landscape, square, portrait — or all three.</p>
          </div>
          <div className="video-options">
            {videoUrls["16x9"] && <article className="video-option"><div className="video-option-head"><span>16:9</span><a className="small-button" href={videoUrls["16x9"]} target="_blank" rel="noreferrer">Open ↗</a></div><video src={videoUrls["16x9"]} controls playsInline preload="metadata" /></article>}
            {videoUrls["1x1"] && <article className="video-option square"><div className="video-option-head"><span>1:1</span><a className="small-button" href={videoUrls["1x1"]} target="_blank" rel="noreferrer">Open ↗</a></div><video src={videoUrls["1x1"]} controls playsInline preload="metadata" /></article>}
            {videoUrls["9x16"] && <article className="video-option portrait"><div className="video-option-head"><span>9:16</span><a className="small-button" href={videoUrls["9x16"]} target="_blank" rel="noreferrer">Open ↗</a></div><video src={videoUrls["9x16"]} controls playsInline preload="metadata" /></article>}
          </div>
        </section>
      )}

      <section className="how" id="how">
        <div className="section-tag">05 / HOW IT WORKS</div>
        <div className="how-grid">
          <article><span>01</span><h3>Understand</h3><p>We inspect the real product and identify what it actually does.</p></article>
          <article><span>02</span><h3>Direct</h3><p>The director chooses the strongest workflow and shapes a story around it.</p></article>
          <article><span>03</span><h3>Capture</h3><p>Real browser footage. Real interactions. No invented interface.</p></article>
          <article><span>04</span><h3>Deliver</h3><p>A concise demo designed to make the product click in seconds.</p></article>
        </div>
      </section>

      <section className="principle" id="about"><div className="principle-mark">“</div><p>AI should be the director,<br /><em>not the camera.</em></p><span>No fake UI. No invented workflow. Real product, real interaction, real proof.</span></section>

      <section className="engine-drawer"><details><summary>Engine settings <span>LOCAL / REMOTE</span></summary><div className="engine-fields"><label>Engine URL<input value={engineUrl} onChange={e => saveEngine(e.target.value)} /></label><label>Worker token<input type="password" value={engineToken} onChange={e => { setEngineToken(e.target.value); localStorage.setItem("demo_engine_token", e.target.value); }} placeholder="Optional" /></label></div></details></section>

      <footer><a className="logo" href="#top"><span className="logo-dot" />demo.</a><span>Build → Demo → Post → Repeat</span><span>Personal production tool</span></footer>
    </main>
  );
}
