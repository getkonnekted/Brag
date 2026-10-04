"use client";

import { useMemo, useState } from "react";

type Scene = { label: string; title: string; duration: string; status: string };

const initialScenes: Scene[] = [
  { label: "01", title: "Hook", duration: "04s", status: "Ready" },
  { label: "02", title: "Product", duration: "05s", status: "Ready" },
  { label: "03", title: "Core workflow", duration: "09s", status: "Waiting" },
  { label: "04", title: "Proof", duration: "07s", status: "Waiting" },
  { label: "05", title: "Close", duration: "04s", status: "Waiting" }
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<"idle" | "inspecting" | "ready" | "capturing">("idle");
  const [scenes, setScenes] = useState(initialScenes);
  const [selected, setSelected] = useState(2);

  const productName = useMemo(() => {
    try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0]; }
    catch { return "your product"; }
  }, [url]);

  function buildStory() {
    setStage("inspecting");
    window.setTimeout(() => {
      setScenes([
        { label: "01", title: "The problem", duration: "04s", status: "Observed" },
        { label: "02", title: productName + " enters", duration: "05s", status: "Observed" },
        { label: "03", title: "Core workflow", duration: "09s", status: "Director pick" },
        { label: "04", title: "Useful result", duration: "07s", status: "Proof target" },
        { label: "05", title: "Close", duration: "04s", status: "Ready" }
      ]);
      setStage("ready");
      setSelected(2);
    }, 900);
  }

  function capture() {
    setStage("capturing");
    window.setTimeout(() => setStage("ready"), 1800);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">B</span><span>BRAG</span></a>
        <nav><span>DIRECTOR</span><span>STUDIO</span><span className="engine-dot">● ENGINE LOCAL</span></nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="kicker">PRODUCT → STORY → VIDEO</div>
          <h1>Turn what you built into a demo people understand.</h1>
          <p>BRAG studies the real product, chooses the strongest workflow, captures real browser footage, and turns it into a story worth watching.</p>
        </div>
        <div className="hero-meta">
          <span>PERSONAL PRODUCTION TOOL</span>
          <span>v2.3</span>
        </div>
      </section>

      <section className="workspace">
        <aside className="input-panel">
          <div className="section-head"><span>01</span><h2>Give BRAG the product</h2></div>
          <label>Product URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yourproduct.com" /></label>
          <label>What does it do?<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the product, problem, and user." rows={5}/></label>
          <div className="dropzone"><strong>+ Add screenshots</strong><span>PNG, JPG · optional</span></div>
          <button className="primary" onClick={buildStory} disabled={!url || stage === "inspecting"}>
            {stage === "inspecting" ? "Inspecting product..." : "Build demo story"}
          </button>
          <div className="engine-note"><span className="live-dot"/> Browser capture runs through your local BRAG engine. Vercel hosts the control surface.</div>
        </aside>

        <section className="director-panel">
          <div className="section-head"><span>02</span><h2>BRAG Director</h2><em className={stage === "ready" ? "ok" : ""}>{stage === "idle" ? "WAITING" : stage.toUpperCase()}</em></div>
          <div className="director-grid">
            <div className="intelligence">
              <div className="mini-label">PRODUCT INTELLIGENCE</div>
              <h3>{stage === "idle" ? "No product inspected" : productName}</h3>
              <p>{description || "The Director will ground the story in observed product evidence."}</p>
              <div className="signals"><span>ARCHETYPE <b>{stage === "ready" ? "PRODUCT" : "—"}</b></span><span>PROOF <b>{stage === "ready" ? "RESULT" : "—"}</b></span></div>
            </div>
            <div className="director-quote">
              <div className="mini-label">DIRECTOR DECISION</div>
              <strong>{stage === "ready" ? "Show the moment where the product becomes useful." : "AI should be the director, not the camera."}</strong>
              <p>{stage === "ready" ? "Capture the shortest safe path to visible evidence. Preserve the real product as footage." : "No fake UI. No invented workflow. Real product, real interaction, real proof."}</p>
            </div>
          </div>

          <div className="storyboard">
            <div className="mini-label">SHOT PLAN</div>
            {scenes.map((scene, i) => (
              <button key={scene.label} className={"scene-row " + (selected === i ? "selected" : "")} onClick={() => setSelected(i)}>
                <span className="scene-num">{scene.label}</span>
                <span className="scene-name"><b>{scene.title}</b><small>{i === 2 ? "Director-selected core interaction" : "Evidence-backed scene"}</small></span>
                <span className="scene-status">{scene.status}</span><span className="duration">{scene.duration}</span>
              </button>
            ))}
          </div>
        </section>
      </section>

      <section className="studio">
        <div className="studio-head">
          <div><div className="kicker">03 · DEMO STUDIO</div><h2>Real footage. Directed edit.</h2></div>
          <div className="actions"><button onClick={capture} disabled={stage !== "ready"}>{stage === "capturing" ? "Capturing..." : "Capture real product"}</button><button className="primary" disabled={stage !== "ready"}>Render demo</button></div>
        </div>
        <div className="stage">
          <div className="stage-top"><span>BRAG / {productName.toUpperCase()}</span><span>1280 × 720</span></div>
          <div className="stage-content">
            <div className="stage-copy"><span>SCENE {String(selected + 1).padStart(2, "0")}</span><h3>{scenes[selected]?.title}</h3><p>{selected === 2 ? "Show the shortest path from the user's action to the useful result." : "A clean, evidence-backed moment from the product story."}</p></div>
            <div className="fake-browser"><div className="browser-bar"><i/><i/><i/><span>{url || "yourproduct.com"}</span></div><div className="browser-body"><div/><div/><div className="wide"/></div></div>
          </div>
        </div>
      </section>

      <footer><span>BRAG</span><span>Build → Demo → Post → Repeat</span><span>Personal tool · No accounts · No billing</span></footer>
    </main>
  );
}
