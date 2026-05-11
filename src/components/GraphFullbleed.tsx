"use client";

import { useEffect, useRef, useState } from "react";
import { ClaimGraphCanvas } from "./ClaimGraphCanvas";
import { engineToPRPack } from "@/lib/data/exporter";

type Props = { data: EngineGraphData };

export function GraphFullbleed({ data }: Props) {
  const instanceRef = useRef<AboardGraphInstance | null>(null);
  const [editable, setEditable] = useState(true);
  const [counts, setCounts] = useState({ n: data.nodes.length, e: data.edges.length });
  const [zoom, setZoom] = useState(100);
  const [savedFlash, setSavedFlash] = useState(false);
  const [jsonldOpen, setJsonldOpen] = useState(false);
  const [jsonldText, setJsonldText] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [activeDomain, setActiveDomain] = useState<string | "all">("all");
  const domains = data.domains ?? (data.domain ? [data.domain] : []);
  const showDomainFilter = domains.length > 1;

  const onPersist = (instance: AboardGraphInstance) => {
    setCounts({ n: instance.state.nodes.length, e: instance.state.edges.length });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };
  const onZoom = (s: number) => setZoom(Math.round(s * 100));
  const onReady = (instance: AboardGraphInstance) => {
    instanceRef.current = instance;
    setCounts({ n: instance.state.nodes.length, e: instance.state.edges.length });
    instance.setActiveDomain(activeDomain);
  };

  const chooseDomain = (d: string | "all") => {
    setActiveDomain(d);
    instanceRef.current?.setActiveDomain(d);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      )
        return;
      const g = instanceRef.current;
      if (!g) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        g.undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        g.redo();
      } else if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        g.addNode();
      } else if (e.key === "Escape") {
        setJsonldOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openExport = () => {
    const g = instanceRef.current;
    if (!g) return;
    setJsonldText(g.exportJSONLD());
    setJsonldOpen(true);
  };

  const reset = () => {
    if (!confirm("Reset graph to canonical seed? Local edits will be discarded.")) return;
    instanceRef.current?.reset();
  };

  const copy = () => {
    navigator.clipboard.writeText(jsonldText).then(() => {
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1400);
    });
  };

  const download = () => {
    const blob = new Blob([jsonldText], { type: "application/ld+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const fname = activeDomain !== "all" ? `${activeDomain}.jsonld` : "aboard-graph.jsonld";
    a.download = fname;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadPRPack = async () => {
    const g = instanceRef.current;
    if (!g) return;
    const { default: JSZip } = await import("jszip");
    const pack = engineToPRPack(g.state, {
      defaultDomain:
        activeDomain !== "all" ? activeDomain : domains[0] ?? undefined,
    });
    const zip = new JSZip();
    for (const file of pack.files) zip.file(file.path, file.body);
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aboard-pr-pack.zip";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="meta-strip">
        <div className="l">
          {showDomainFilter ? (
            <span className="domain-chips">
              <span className="k">domain</span>
              <button
                className={`chip${activeDomain === "all" ? " active" : ""}`}
                onClick={() => chooseDomain("all")}
              >
                all
              </button>
              {domains.map((d) => (
                <button
                  key={d}
                  className={`chip${activeDomain === d ? " active" : ""}`}
                  onClick={() => chooseDomain(d)}
                >
                  {d}
                </button>
              ))}
            </span>
          ) : (
            <span>
              <span className="k">domain</span>{" "}
              <span className="v">{domains[0] ?? "(no domain)"}</span>
            </span>
          )}
          <span>
            <span className="k">graph</span>{" "}
            <span className="v">
              {counts.n}n / {counts.e}e
            </span>
          </span>
          <span>
            <span className="k">zoom</span> <span className="v">{zoom}%</span>
          </span>
          <span className="sandbox-pill" title="The editor saves to your browser's localStorage. To file claims into the project graph, export a PR pack and open a pull request. See /about#contributing.">
            ● local sandbox · not filed
          </span>
          {savedFlash && <span className="saved">● saved locally</span>}
        </div>
        <div className="r">
          <button className="btn-mono" onClick={openExport}>
            export JSON-LD
          </button>
          <button className="btn-mono" onClick={reset} title="Reset to canonical seed (clears local edits)">
            reset
          </button>
        </div>
      </div>

      <main className="canvas-host" style={{ paddingTop: 90, height: "calc(100vh - 52px)" }}>
        <div className="ag-toolbar">
          <div className="ag-tool-group">
            <button
              className="ag-tool-btn primary"
              onClick={() => instanceRef.current?.addNode()}
              title="Sandbox claim — drafts a new node locally. To file it for real, export a PR pack and open a pull request."
            >
              + new claim
            </button>
            <button className="ag-tool-btn" onClick={() => setEditable((v) => !v)}>
              edit mode <span>{editable ? "on" : "off"}</span>
            </button>
          </div>
          <div className="ag-tool-group">
            <button className="ag-tool-btn" onClick={() => instanceRef.current?.undo()}>
              undo
            </button>
            <button className="ag-tool-btn" onClick={() => instanceRef.current?.redo()}>
              redo
            </button>
          </div>
          <div className="ag-tool-group zoom">
            <button className="ag-tool-btn" onClick={() => instanceRef.current?.zoomIn()} title="zoom in">
              +
            </button>
            <button className="ag-tool-btn" onClick={() => instanceRef.current?.fitView()} title="fit view">
              ⊡
            </button>
            <button className="ag-tool-btn" onClick={() => instanceRef.current?.zoomOut()} title="zoom out">
              −
            </button>
            <span className="ag-tool-btn ag-zoom-readout-btn">
              <span className="ag-zoom-readout">{zoom}%</span>
            </span>
          </div>
        </div>

        <ClaimGraphCanvas
          data={data}
          mode="fullbleed"
          editable={editable}
          onPersist={onPersist}
          onZoom={onZoom}
          onReady={onReady}
        />

        {editable && (
          <div className="edit-help">
            <span>
              <span className="k">drag</span> node to move
            </span>
            <span>
              <span className="k">→</span> handle on hover to connect
            </span>
            <span>
              <span className="k">click</span> edge or ✎ to edit
            </span>
          </div>
        )}
      </main>

      {jsonldOpen && (
        <div id="jsonldModal" className="open" onClick={(e) => {
          if (e.target === e.currentTarget) setJsonldOpen(false);
        }}>
          <div className="box">
            <div className="head">
              <div>
                <span className="t">JSON-LD export</span> · client-side serialization
              </div>
              <button className="btn-mono" onClick={() => setJsonldOpen(false)}>
                close
              </button>
            </div>
            <pre>{jsonldText}</pre>
            <div className="foot">
              <button className="btn-mono" onClick={copy}>
                {copyState === "copied" ? "copied ✓" : "copy to clipboard"}
              </button>
              <button className="btn-mono" onClick={download}>
                download .jsonld
              </button>
              <button
                className="btn-mono primary"
                onClick={downloadPRPack}
                title="Emits a zip of skeletal Markdown + YAML files matching the data/ structure, ready to drop into a PR."
              >
                download PR pack
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
