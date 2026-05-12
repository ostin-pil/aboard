/* aboard / graph.js
   Unified claim-graph component used by Landing (inline) + Claim Graph (fullbleed).
   Features:
     - render NODES rows (symptoms / mechanisms / leverage)
     - render EDGES (causes / moderates / reduces) with labels (fullbleed only)
     - hover popover with explicit "open detail →" link, dim siblings
     - pan + zoom (fullbleed only)
     - edit mode: drag nodes, add/edit/delete nodes, add/edit/delete edges, undo/redo
     - localStorage persistence + reset-to-seed + JSON-LD export
   Public API:
     AboardGraph.mount(rootEl, { mode, editable, data }) → returns instance
*/
(function () {

  // ============================================================
  // SEED DATA — canonical 12 nodes / 17 edges, democratic_backsliding
  // ============================================================
  const SEED = {
    domain: "democratic_backsliding",
    nodes: [
      // SYMPTOMS
      { id: "S1", kind: "symptom",   title: "Liberal Democracy Index in global decline",
        meta: "trend · −0.18 / 8y", conf: 0.71,
        body: "Cross-country index of self-reported trust in national election results, weighted by turnout among 18–35 cohort.",
        author: "claude-opus-4-7", filed: "2026-04-19", row: 1, col: 0 },
      { id: "S2", kind: "symptom",   title: "Rising executive aggrandizement",
        meta: "trend · +14 cases / 12y", conf: 0.68,
        body: "Substantive expansions of executive authority absent corresponding legislative or judicial counter-pressure.",
        author: "claude-opus-4-7", filed: "2026-04-22", row: 1, col: 1 },
      { id: "S3", kind: "symptom",   title: "Press freedom declining",
        meta: "trend · −62% / 10y", conf: 0.74,
        body: "Self-reported and measured press-freedom indices show consistent decline across OECD + frontier democracies.",
        author: "claude-opus-4-7", filed: "2026-05-02", row: 1, col: 2 },

      // MECHANISMS
      { id: "M1", kind: "mechanism", title: "Information environment fragmentation",
        meta: "evidence · 7 studies", conf: 0.62,
        body: "Counties and regions without dominant local information sources show measurably higher partisan voting consistency.",
        author: "claude-opus-4-7", filed: "2026-04-30", row: 2, col: 0 },
      { id: "M2", kind: "mechanism", title: "Affective polarization erodes democratic norms",
        meta: "evidence · 12 studies", conf: 0.55,
        body: "Out-party affective distance is associated with declining tolerance for minority procedural rights.",
        author: "claude-opus-4-7", filed: "2026-05-05", row: 2, col: 1 },
      { id: "M3", kind: "mechanism", title: "Economic insecurity drives authoritarian appeal",
        meta: "evidence · 4 studies", conf: 0.49,
        body: "Cohorts experiencing labor-market displacement show increased support for strongman framing of governance.",
        author: "claude-opus-4-7", filed: "2026-04-28", row: 2, col: 2 },
      { id: "M4", kind: "mechanism", title: "Platform algorithmic amplification of outrage content",
        meta: "evidence · contested", conf: 0.55,
        body: "Engagement-ranked feeds over-weight outrage signals; effect size contested above 95% CI. This is the non-convergent dossier.",
        author: "claude-opus-4-7", filed: "2026-05-07", row: 2, col: 3,
        dossier: true, forecast: 1 },
      { id: "M5", kind: "mechanism", title: "Erosion of intermediary civic institutions",
        meta: "evidence · 3 studies", conf: 0.58,
        body: "Decline of unions, parties, religious congregations as forums for cross-class contact lowers cost of obstruction.",
        author: "claude-opus-4-7", filed: "2026-05-01", row: 2, col: 4 },

      // LEVERAGE
      { id: "L1", kind: "leverage",  title: "Electoral system reform (PR / ranked-choice)",
        meta: "tested · 6 jurisdictions", conf: 0.42,
        body: "Replaces closed-primary median with broader electorate. Empirical effect on candidate moderation: small but positive.",
        author: "claude-opus-4-7", filed: "2026-04-15", row: 3, col: 0 },
      { id: "L2", kind: "leverage",  title: "Public-interest journalism funding",
        meta: "pilot · 3 programs", conf: 0.51,
        body: "Civic-information vouchers and nonprofit conversion subsidies; effect on cross-partisan contact requires 5y horizon.",
        author: "claude-opus-4-7", filed: "2026-04-25", row: 3, col: 1 },
      { id: "L3", kind: "leverage",  title: "Platform antitrust + algorithmic transparency",
        meta: "regulatory · in progress", conf: 0.39,
        body: "Researcher access to feed-ranking signals, enforced under tiered audit. Reduces M4 only if access is genuine.",
        author: "claude-opus-4-7", filed: "2026-05-03", row: 3, col: 2 },
      { id: "L4", kind: "leverage",  title: "Civic education investment",
        meta: "pilot · 9 districts", conf: 0.45,
        body: "Long-horizon investment in civic education; measurable impact on intermediary-institution participation.",
        author: "claude-opus-4-7", filed: "2026-04-18", row: 3, col: 3 },
    ],
    edges: [
      { from: "M1", to: "S3", kind: "causes" },
      { from: "M2", to: "S1", kind: "causes" },
      { from: "M3", to: "S2", kind: "causes" },
      { from: "M4", to: "S1", kind: "causes" },
      { from: "M5", to: "S2", kind: "causes" },
      { from: "M4", to: "M2", kind: "moderates" },
      { from: "M3", to: "M2", kind: "moderates" },
      { from: "M1", to: "M5", kind: "moderates" },
      { from: "L1", to: "M2", kind: "reduces" },
      { from: "L2", to: "M1", kind: "reduces" },
      { from: "L3", to: "M4", kind: "reduces" },
      { from: "L4", to: "M5", kind: "reduces" },
      { from: "M1", to: "S1", kind: "causes" },
      { from: "M2", to: "S3", kind: "causes" },
      { from: "L2", to: "S3", kind: "reduces" },
      { from: "L1", to: "S2", kind: "reduces" },
      { from: "M5", to: "S1", kind: "causes" },
    ],
  };

  // ============================================================
  // PERSISTENCE
  // ============================================================
  const STORE_KEY = "aboard.graph.v0";
  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.nodes && parsed.edges) return parsed;
    } catch (_) {}
    return null;
  }
  function saveState(state) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  function clearState() {
    try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  }

  // ============================================================
  // LAYOUT
  // ============================================================
  function computeLayout(state, opts) {
    const { canvasW, padL, padR, nodeW, rowY } = opts;
    const rows = { 1: [], 2: [], 3: [] };
    state.nodes.forEach(n => { rows[n.row] = rows[n.row] || []; rows[n.row].push(n); });
    Object.keys(rows).forEach(r => rows[r].sort((a,b) => a.col - b.col));
    Object.keys(rows).forEach(r => {
      const items = rows[r];
      const span = canvasW - padL - padR - nodeW;
      const step = items.length <= 1 ? 0 : span / (items.length - 1);
      items.forEach((n, i) => {
        if (n._x == null) n._x = padL + i * step;
        if (n._y == null) n._y = rowY[r];
      });
    });
  }

  // ============================================================
  // GRAPH INSTANCE
  // ============================================================
  function mount(root, opts) {
    opts = opts || {};
    const mode = opts.mode || "fullbleed";   // 'inline' or 'fullbleed'
    const editable = !!opts.editable;
    const onPersist = opts.onPersist || (() => {});

    // load state: localStorage > opts.data > SEED
    let state = loadState() || (opts.data ? JSON.parse(JSON.stringify(opts.data)) : JSON.parse(JSON.stringify(SEED)));
    state.nodes.forEach(n => { delete n._x; delete n._y; });

    // history
    const history = [];
    let hIdx = -1;
    function snapshot() {
      const snap = JSON.stringify({ nodes: state.nodes.map(n => ({...n})), edges: state.edges.map(e => ({...e})) });
      history.splice(hIdx + 1);
      history.push(snap);
      hIdx = history.length - 1;
      if (history.length > 60) { history.shift(); hIdx = history.length - 1; }
    }
    function restore(snap) {
      const parsed = JSON.parse(snap);
      state.nodes = parsed.nodes;
      state.edges = parsed.edges;
    }
    function undo() { if (hIdx > 0) { hIdx--; restore(history[hIdx]); persistAndRender(false); } }
    function redo() { if (hIdx < history.length - 1) { hIdx++; restore(history[hIdx]); persistAndRender(false); } }
    snapshot();

    // sizes
    const isInline = (mode === "inline");
    const nodeW = isInline ? 188 : 240;
    const padL = isInline ? 90 : 60;
    const padR = isInline ? 8 : 60;
    // Canvas width scales with the most-populous row so nodes don't overlap.
    // Minimum widths preserve the design for sparse graphs; max-row count
    // drives the floor for dense ones. Fullbleed has pan; inline relies on
    // the parent filtering to a single domain (see toEngineData(graph, { domain })).
    const minCanvasW = isInline ? 1180 : 1520;
    const minGap = isInline ? 22 : 36;
    const rowCounts = [0, 0, 0, 0];
    state.nodes.forEach(n => { if (n.row >= 1 && n.row <= 3) rowCounts[n.row]++; });
    const maxRow = Math.max(rowCounts[1], rowCounts[2], rowCounts[3], 1);
    const requiredW = padL + padR + nodeW + (maxRow - 1) * (nodeW + minGap);
    const canvasW = Math.max(minCanvasW, requiredW);
    const canvasH = isInline ? 460 : 700;
    const rowY = isInline ? { 1: 60, 2: 192, 3: 324 } : { 1: 110, 2: 320, 3: 530 };

    // build DOM
    root.classList.add("ag-root");
    root.classList.add("ag-" + mode);
    if (editable) {
      root.classList.add("ag-editable");
      // Sandbox marker: editor mode is real, but edits persist only to
      // localStorage. Source of truth is data/<domain>/ in the repo.
      root.dataset.sandbox = "true";
    }

    root.innerHTML = `
      <div class="ag-viewport" data-ag-viewport>
        <div class="ag-stage" data-ag-stage>
          <div class="ag-canvas" data-ag-canvas style="width:${canvasW}px; height:${canvasH}px;">
            <div class="ag-row-label ag-r1">SYMPTOMS<span class="num"></span></div>
            <div class="ag-row-label ag-r2">MECHANISMS<span class="num"></span></div>
            <div class="ag-row-label ag-r3">LEVERAGE<span class="num"></span></div>
            <svg class="ag-edges" data-ag-edges preserveAspectRatio="none" viewBox="0 0 ${canvasW} ${canvasH}" width="${canvasW}" height="${canvasH}">
              <defs>
                <marker id="ag-ah-causes" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" class="ag-ah ag-ah-causes" />
                </marker>
                <marker id="ag-ah-reduces" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" class="ag-ah ag-ah-reduces" />
                </marker>
              </defs>
            </svg>
            <div class="ag-nodes" data-ag-nodes></div>
            <div class="ag-edge-labels" data-ag-edge-labels></div>
            <svg class="ag-drag-edge" data-ag-drag-edge viewBox="0 0 ${canvasW} ${canvasH}" width="${canvasW}" height="${canvasH}"></svg>
          </div>
        </div>
        <div class="ag-popover" data-ag-popover hidden></div>
        <div class="ag-edge-popover" data-ag-edge-popover hidden></div>
      </div>
    `;

    const viewportEl = root.querySelector("[data-ag-viewport]");
    const stageEl    = root.querySelector("[data-ag-stage]");
    const canvasEl   = root.querySelector("[data-ag-canvas]");
    const edgesSvg   = root.querySelector("[data-ag-edges]");
    const nodesHost  = root.querySelector("[data-ag-nodes]");
    const labelsHost = root.querySelector("[data-ag-edge-labels]");
    const dragEdge   = root.querySelector("[data-ag-drag-edge]");
    const popover    = root.querySelector("[data-ag-popover]");
    const edgePopover = root.querySelector("[data-ag-edge-popover]");

    // ============================================================
    // RENDER
    // ============================================================
    function render() {
      computeLayout(state, { canvasW, padL, padR, nodeW, rowY });

      // row label counts
      const counts = { 1: 0, 2: 0, 3: 0 };
      state.nodes.forEach(n => counts[n.row]++);
      root.querySelector(".ag-r1 .num").textContent = " / " + counts[1];
      root.querySelector(".ag-r2 .num").textContent = " / " + counts[2];
      root.querySelector(".ag-r3 .num").textContent = " / " + counts[3];

      // nodes
      nodesHost.innerHTML = "";
      state.nodes.forEach(n => nodesHost.appendChild(makeNodeEl(n)));

      // measure heights (after attach)
      const bounds = {};
      state.nodes.forEach(n => {
        const el = nodesHost.querySelector(`[data-id="${n.id}"]`);
        bounds[n.id] = { x: n._x, y: n._y, w: nodeW, h: el ? el.offsetHeight : (isInline ? 76 : 96) };
      });

      // edges (clears both visible paths and the wide hit-zone paths)
      edgesSvg.querySelectorAll("path.ag-edge, path.ag-edge-hit").forEach((p) => p.remove());
      labelsHost.innerHTML = "";
      const portCounts = {};
      state.edges.forEach(e => {
        const a = nodeById(e.from), b = nodeById(e.to);
        if (!a || !b) return;
        const sides = portSides(a, b);
        portCounts[a.id + ":" + sides.aSide] = (portCounts[a.id + ":" + sides.aSide] || 0) + 1;
        portCounts[b.id + ":" + sides.bSide] = (portCounts[b.id + ":" + sides.bSide] || 0) + 1;
      });
      const portIdx = {};
      state.edges.forEach((e, i) => {
        const a = nodeById(e.from), b = nodeById(e.to);
        if (!a || !b) return;
        const sides = portSides(a, b);
        const aTotal = portCounts[a.id + ":" + sides.aSide];
        const bTotal = portCounts[b.id + ":" + sides.bSide];
        const aIdx = (portIdx[a.id+":"+sides.aSide] = (portIdx[a.id+":"+sides.aSide] || 0)+1) - 1;
        const bIdx = (portIdx[b.id+":"+sides.bSide] = (portIdx[b.id+":"+sides.bSide] || 0)+1) - 1;
        const aJit = (aIdx - (aTotal-1)/2) * (isInline ? 12 : 18);
        const bJit = (bIdx - (bTotal-1)/2) * (isInline ? 12 : 18);
        drawEdge(e, a, b, bounds, aJit, bJit);
      });
    }

    function makeNodeEl(n) {
      const el = document.createElement("a");
      el.className = "ag-node";
      el.dataset.kind = n.kind;
      el.dataset.id = n.id;
      if (n.domain) el.dataset.domain = n.domain;
      el.href = "/claims/" + n.id;
      el.draggable = false;
      el.addEventListener("dragstart", (ev) => ev.preventDefault());
      el.style.left = n._x + "px";
      el.style.top = n._y + "px";
      el.style.width = nodeW + "px";
      if (n.author === "agent:reader/v0") el.classList.add("ag-unsigned");

      const meta = document.createElement("div");
      meta.className = "ag-node-meta";
      meta.innerHTML = `<span class="kind">${n.kind.toUpperCase()}</span><span class="id-part"> · ${n.id}</span><span class="conf">c=${(n.conf||0).toFixed(2)}</span>`;

      const title = document.createElement("div");
      title.className = "ag-node-title";
      title.textContent = n.title;

      el.appendChild(meta);
      el.appendChild(title);

      // badges
      if (n.dossier || n.forecast || n.author === "agent:reader/v0") {
        const badges = document.createElement("div");
        badges.className = "ag-node-badges";
        if (n.forecast) {
          const b = document.createElement("span"); b.className = "ag-badge"; b.innerHTML = `<span class="b-dot"></span>${n.forecast} forecast`; badges.appendChild(b);
        }
        if (n.dossier) {
          const b = document.createElement("span"); b.className = "ag-badge dossier"; b.innerHTML = `<span class="b-dot"></span>dossier`; badges.appendChild(b);
        }
        if (n.author === "agent:reader/v0") {
          const b = document.createElement("span"); b.className = "ag-badge unsigned"; b.innerHTML = `<span class="b-dot"></span>unsigned`; badges.appendChild(b);
        }
        el.appendChild(badges);
      }

      // hover/click
      el.addEventListener("click", (e) => {
        if (editing.dragging || editing.connecting) { e.preventDefault(); return; }
        e.preventDefault();
        openPopover(n);
      });
      el.addEventListener("mouseenter", () => focusNeighborhood(n.id));
      el.addEventListener("mouseleave", clearFocus);

      // editable: drag + connect handle
      if (editable) {
        el.addEventListener("pointerdown", onNodePointerDown);
        const handle = document.createElement("button");
        handle.className = "ag-connect-handle";
        handle.title = "Drag to connect to another node";
        handle.innerHTML = "→";
        handle.addEventListener("pointerdown", (e) => onConnectStart(e, n));
        el.appendChild(handle);

        const editBtn = document.createElement("button");
        editBtn.className = "ag-node-edit-btn";
        editBtn.title = "Edit node";
        editBtn.innerHTML = "✎";
        editBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openNodeEditor(n); });
        el.appendChild(editBtn);
      }

      return el;
    }

    function nodeById(id) { return state.nodes.find(n => n.id === id); }

    function portSides(a, b) {
      if (a.row === b.row) {
        if (a.col < b.col) return { aSide: "right", bSide: "left", sameRow: true };
        return { aSide: "left", bSide: "right", sameRow: true };
      }
      if (a.row < b.row) return { aSide: "bottom", bSide: "top" };
      return { aSide: "top", bSide: "bottom" };
    }

    function drawEdge(e, a, b, bounds, aJit, bJit) {
      const ab = bounds[a.id], bb = bounds[b.id];
      const sides = portSides(a, b);
      let ax, ay, bx, by;
      if (sides.sameRow) {
        if (a.col < b.col) { ax = ab.x + ab.w; bx = bb.x; }
        else               { ax = ab.x;         bx = bb.x + bb.w; }
        ay = ab.y + ab.h*0.5 + aJit*0.5;
        by = bb.y + bb.h*0.5 + bJit*0.5;
      } else {
        if (a.row < b.row) { ay = ab.y + ab.h; by = bb.y; }
        else               { ay = ab.y;         by = bb.y + bb.h; }
        ax = ab.x + ab.w*0.5 + aJit;
        bx = bb.x + bb.w*0.5 + bJit;
      }
      let d;
      if (sides.sameRow) {
        const dx = bx - ax;
        const c1x = ax + dx*0.4, c2x = bx - dx*0.4;
        const c1y = ay - 28, c2y = by - 28;
        d = `M ${ax} ${ay} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bx} ${by}`;
      } else {
        const midY = (ay + by)/2;
        d = `M ${ax} ${ay} C ${ax} ${midY}, ${bx} ${midY}, ${bx} ${by}`;
      }
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      const crossClass = e.crossDomain ? " ag-cross-domain" : "";
      path.setAttribute("class", `ag-edge ag-${e.kind}${crossClass}`);
      path.dataset.from = e.from;
      path.dataset.to = e.to;
      path.dataset.kind = e.kind;
      if (e.crossDomain) path.dataset.crossDomain = "true";
      if (e.kind === "causes")  path.setAttribute("marker-end", "url(#ag-ah-causes)");
      if (e.kind === "reduces") path.setAttribute("marker-end", "url(#ag-ah-reduces)");
      if (editable) {
        path.style.pointerEvents = "stroke";
        path.style.cursor = "pointer";
        path.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); openEdgeEditor(e); });
      }
      edgesSvg.appendChild(path);

      // Hit-zone path: invisible wide stroke for reliable hover detection on
      // thin visible edges. Only attached when the edge carries a rationale
      // or sources — no signal to surface otherwise.
      if (e.rationale || (e.sources && e.sources.length > 0)) {
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hit.setAttribute("d", d);
        hit.setAttribute("class", "ag-edge-hit");
        hit.dataset.from = e.from;
        hit.dataset.to = e.to;
        hit.addEventListener("mouseenter", (ev) => openEdgePopover(e, hit, ev));
        hit.addEventListener("mouseleave", scheduleCloseEdgePopover);
        // In editable mode the hit path sits above the visible path and would
        // otherwise swallow the edit click. Re-attach the editor handler.
        if (editable) {
          hit.style.cursor = "pointer";
          hit.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); openEdgeEditor(e); });
        }
        edgesSvg.appendChild(hit);
      }

      if (!isInline) {
        const mx = (ax + bx)/2;
        const my = sides.sameRow ? (ay + by)/2 - 18 : (ay + by)/2;
        const label = document.createElement("div");
        const crossClass = e.crossDomain ? " ag-cross-domain" : "";
        label.className = `ag-edge-label ag-${e.kind}${crossClass}`;
        label.textContent = e.kind;
        label.dataset.from = e.from;
        label.dataset.to = e.to;
        label.style.left = mx + "px";
        label.style.top = my + "px";
        if (e.rationale || (e.sources && e.sources.length > 0)) {
          label.classList.add("has-rationale");
          label.addEventListener("mouseenter", () => openEdgePopover(e, label));
          label.addEventListener("mouseleave", scheduleCloseEdgePopover);
        }
        labelsHost.appendChild(label);
      }
    }

    // ============================================================
    // FOCUS / DIM
    // ============================================================
    function focusNeighborhood(id) {
      const related = new Set([id]);
      state.edges.forEach(e => { if (e.from === id) related.add(e.to); if (e.to === id) related.add(e.from); });
      canvasEl.classList.add("ag-dimmed");
      nodesHost.querySelectorAll(".ag-node").forEach(n => n.classList.toggle("is-active", related.has(n.dataset.id)));
      edgesSvg.querySelectorAll(".ag-edge").forEach(p => p.classList.toggle("is-active", related.has(p.dataset.from) && related.has(p.dataset.to)));
      labelsHost.querySelectorAll(".ag-edge-label").forEach(l => l.classList.toggle("is-active", related.has(l.dataset.from) && related.has(l.dataset.to)));
    }
    function clearFocus() {
      canvasEl.classList.remove("ag-dimmed");
      root.querySelectorAll(".is-active").forEach(el => el.classList.remove("is-active"));
    }

    // ============================================================
    // POPOVER
    // ============================================================
    function openPopover(n) {
      popover.hidden = false;
      popover.innerHTML = `
        <div class="ag-pop-id">${n.id} · ${n.kind}</div>
        <div class="ag-pop-title">${escapeHTML(n.title)}</div>
        <div class="ag-pop-body">${escapeHTML(n.body || "")}</div>
        <div class="ag-pop-row"><span>conf</span><span class="v">${(n.conf||0).toFixed(2)}</span></div>
        <div class="ag-pop-row"><span>filed by</span><span class="v">${escapeHTML(n.author || "—")}</span></div>
        <div class="ag-pop-row"><span>last_filed</span><span class="v">${escapeHTML(n.filed || "—")}</span></div>
        ${n.dossier ? `<div class="ag-pop-row"><span>dossier</span><span class="v"><a href="/dossiers/${n.id}">open →</a></span></div>` : ""}
        <div class="ag-pop-cta-row">
          <a class="ag-pop-cta" href="/claims/${n.id}">open detail <span class="arrow">→</span></a>
        </div>
      `;
      // position
      const wrapRect = viewportEl.getBoundingClientRect();
      const nodeEl = nodesHost.querySelector(`[data-id="${n.id}"]`);
      const r = nodeEl.getBoundingClientRect();
      let left = r.right - wrapRect.left + 12;
      let top  = r.top - wrapRect.top;
      const popW = 300, popH = 220;
      if (left + popW > wrapRect.width - 8) left = r.left - wrapRect.left - popW - 12;
      if (top + popH > wrapRect.height - 8) top = wrapRect.height - popH - 8;
      if (top < 8) top = 8;
      popover.style.left = Math.max(8, left) + "px";
      popover.style.top  = top + "px";
      focusNeighborhood(n.id);
    }
    function closePopover() {
      popover.hidden = true;
      clearFocus();
    }
    document.addEventListener("click", (e) => {
      if (!popover.hidden && !popover.contains(e.target) && !e.target.closest(".ag-node")) closePopover();
    });

    let edgePopoverCloseTimer = null;
    function openEdgePopover(e, anchorEl, ev) {
      if (edgePopoverCloseTimer) { clearTimeout(edgePopoverCloseTimer); edgePopoverCloseTimer = null; }
      const sourcesHTML = (e.sources || []).map(s => {
        const meta = [s.kind].filter(Boolean).join(" · ");
        return `<li><a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.label)}</a>${meta ? ` <span class="meta">${escapeHTML(meta)}</span>` : ""}${s.finding ? `<div class="finding">${escapeHTML(s.finding)}</div>` : ""}</li>`;
      }).join("");
      edgePopover.innerHTML = `
        <div class="ag-edge-pop-head">${escapeHTML(e.from)} <span class="arrow">→</span> ${escapeHTML(e.to)} <span class="kind ag-${e.kind}">${e.kind}</span></div>
        ${e.rationale ? `<div class="ag-edge-pop-rationale">${escapeHTML(e.rationale)}</div>` : ""}
        ${sourcesHTML ? `<ul class="ag-edge-pop-sources">${sourcesHTML}</ul>` : ""}
      `;
      edgePopover.hidden = false;
      const wrapRect = viewportEl.getBoundingClientRect();
      const popW = 280, popH = edgePopover.offsetHeight || 120;
      // For path triggers, the bounding box of a long diagonal SVG path is far
      // from the actual cursor; anchor to the mouse position instead. For the
      // small edge label, the bounding rect is a fine anchor.
      const useCursor = ev && anchorEl && anchorEl.tagName && anchorEl.tagName.toLowerCase() === "path";
      let anchorX, anchorY, anchorRight;
      if (useCursor) {
        anchorX = ev.clientX;
        anchorY = ev.clientY;
        anchorRight = ev.clientX;
      } else {
        const anchorRect = anchorEl.getBoundingClientRect();
        anchorX = anchorRect.left;
        anchorY = anchorRect.top + anchorRect.height / 2;
        anchorRight = anchorRect.right;
      }
      // Anchor to the right of the trigger; flip left if there's no room.
      let left = (anchorRight - wrapRect.left) + 12;
      let top  = (anchorY - wrapRect.top) - popH / 2;
      if (left + popW > wrapRect.width - 8) {
        left = (anchorX - wrapRect.left) - popW - 12;
      }
      if (top < 8) top = 8;
      if (top + popH > wrapRect.height - 8) top = wrapRect.height - popH - 8;
      edgePopover.style.left = Math.max(8, left) + "px";
      edgePopover.style.top = top + "px";
    }
    function scheduleCloseEdgePopover() {
      if (edgePopoverCloseTimer) clearTimeout(edgePopoverCloseTimer);
      edgePopoverCloseTimer = setTimeout(() => { edgePopover.hidden = true; edgePopoverCloseTimer = null; }, 180);
    }
    edgePopover.addEventListener("mouseenter", () => {
      if (edgePopoverCloseTimer) { clearTimeout(edgePopoverCloseTimer); edgePopoverCloseTimer = null; }
    });
    edgePopover.addEventListener("mouseleave", scheduleCloseEdgePopover);

    function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c])); }

    // ============================================================
    // PAN + ZOOM (fullbleed only)
    // ============================================================
    let scale = 1, tx = 0, ty = 0;
    const MIN_S = 0.4, MAX_S = 2;
    function applyTransform() {
      stageEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      if (opts.onZoom) opts.onZoom(scale);
    }
    function fitView() {
      if (isInline) {
        const vw = viewportEl.clientWidth, vh = viewportEl.clientHeight;
        // scale to fit width, capped at 1 (don't upscale)
        scale = Math.min(1, vw / canvasW);
        tx = (vw - canvasW * scale) / 2;
        ty = Math.max(0, (vh - canvasH * scale) / 2);
        applyTransform();
        return;
      }
      const vw = viewportEl.clientWidth, vh = viewportEl.clientHeight;
      const padding = 60;
      const s = Math.min((vw - padding*2) / canvasW, (vh - padding*2) / canvasH);
      scale = Math.max(MIN_S, Math.min(MAX_S, s));
      tx = (vw - canvasW*scale) / 2;
      ty = (vh - canvasH*scale) / 2;
      applyTransform();
    }
    function zoomAt(factor, cx, cy) {
      const ns = Math.max(MIN_S, Math.min(MAX_S, scale * factor));
      const f = ns / scale;
      tx = cx - (cx - tx) * f;
      ty = cy - (cy - ty) * f;
      scale = ns;
      applyTransform();
    }
    if (!isInline) {
      viewportEl.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = viewportEl.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.08 : 1/1.08, e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      let panning = false, plx = 0, ply = 0;
      viewportEl.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".ag-node") || e.target.closest(".ag-popover") || e.target.closest(".ag-edge")) return;
        panning = true; plx = e.clientX; ply = e.clientY;
        viewportEl.classList.add("ag-panning");
        viewportEl.setPointerCapture(e.pointerId);
        closePopover();
      });
      viewportEl.addEventListener("pointermove", (e) => {
        if (!panning) return;
        tx += e.clientX - plx; ty += e.clientY - ply;
        plx = e.clientX; ply = e.clientY;
        applyTransform();
      });
      viewportEl.addEventListener("pointerup", () => { panning = false; viewportEl.classList.remove("ag-panning"); });
      viewportEl.addEventListener("pointercancel", () => { panning = false; viewportEl.classList.remove("ag-panning"); });
      window.addEventListener("resize", fitView);
    } else {
      window.addEventListener("resize", fitView);
    }

    // ============================================================
    // EDIT MODE
    // ============================================================
    const editing = { dragging: false, connecting: false, dragNode: null, dragStart: null, dragOrigin: null };

    function pointToCanvas(clientX, clientY) {
      const r = canvasEl.getBoundingClientRect();
      return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
    }

    function onNodePointerDown(e) {
      // only with primary button + on the body of the node, not on its buttons/links inside
      if (e.button !== 0) return;
      if (e.target.closest(".ag-connect-handle") || e.target.closest(".ag-node-edit-btn")) return;
      // Capture the node element now: browsers null event.currentTarget once
      // dispatch completes, so the later onMove/onUp closures can't read it.
      const el = e.currentTarget;
      const id = el.dataset.id;
      const n = nodeById(id);
      editing.dragNode = n;
      editing.dragStart = { x: e.clientX, y: e.clientY };
      editing.dragOrigin = { x: n._x, y: n._y };
      editing.dragging = false;
      el.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        const dx = (ev.clientX - editing.dragStart.x) / scale;
        const dy = (ev.clientY - editing.dragStart.y) / scale;
        if (Math.abs(dx) + Math.abs(dy) > 3) editing.dragging = true;
        if (!editing.dragging) return;
        n._x = Math.max(0, editing.dragOrigin.x + dx);
        n._y = Math.max(0, editing.dragOrigin.y + dy);
        el.style.left = n._x + "px";
        el.style.top = n._y + "px";
        // soft re-render edges only
        renderEdgesOnly();
      };
      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        if (editing.dragging) { snapshot(); persistAndRender(true); }
        setTimeout(() => { editing.dragging = false; }, 0);
        editing.dragNode = null;
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
    }

    function renderEdgesOnly() {
      while (edgesSvg.querySelectorAll("path.ag-edge").length) edgesSvg.querySelector("path.ag-edge").remove();
      labelsHost.innerHTML = "";
      const bounds = {};
      state.nodes.forEach(n => {
        const el = nodesHost.querySelector(`[data-id="${n.id}"]`);
        bounds[n.id] = { x: n._x, y: n._y, w: nodeW, h: el ? el.offsetHeight : 96 };
      });
      const portCounts = {};
      state.edges.forEach(e => {
        const a = nodeById(e.from), b = nodeById(e.to);
        if (!a || !b) return;
        const s = portSides(a, b);
        portCounts[a.id+":"+s.aSide] = (portCounts[a.id+":"+s.aSide]||0)+1;
        portCounts[b.id+":"+s.bSide] = (portCounts[b.id+":"+s.bSide]||0)+1;
      });
      const portIdx = {};
      state.edges.forEach(e => {
        const a = nodeById(e.from), b = nodeById(e.to);
        if (!a || !b) return;
        const s = portSides(a, b);
        const aIdx = (portIdx[a.id+":"+s.aSide] = (portIdx[a.id+":"+s.aSide]||0)+1) - 1;
        const bIdx = (portIdx[b.id+":"+s.bSide] = (portIdx[b.id+":"+s.bSide]||0)+1) - 1;
        const aJit = (aIdx - (portCounts[a.id+":"+s.aSide]-1)/2) * (isInline ? 12 : 18);
        const bJit = (bIdx - (portCounts[b.id+":"+s.bSide]-1)/2) * (isInline ? 12 : 18);
        drawEdge(e, a, b, bounds, aJit, bJit);
      });
    }

    // CONNECT (drag-to-link)
    function onConnectStart(e, fromNode) {
      e.preventDefault(); e.stopPropagation();
      editing.connecting = true;
      const start = pointToCanvas(e.clientX, e.clientY);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "ag-edge-temp");
      dragEdge.appendChild(path);
      const onMove = (ev) => {
        const p = pointToCanvas(ev.clientX, ev.clientY);
        path.setAttribute("d", `M ${start.x} ${start.y} L ${p.x} ${p.y}`);
        // hover target highlight
        nodesHost.querySelectorAll(".ag-node").forEach(n => n.classList.remove("ag-connect-target"));
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetEl = el && el.closest && el.closest(".ag-node");
        if (targetEl && targetEl.dataset.id !== fromNode.id) targetEl.classList.add("ag-connect-target");
      };
      const onUp = (ev) => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        nodesHost.querySelectorAll(".ag-node").forEach(n => n.classList.remove("ag-connect-target"));
        path.remove();
        editing.connecting = false;
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetEl = el && el.closest && el.closest(".ag-node");
        if (targetEl && targetEl.dataset.id !== fromNode.id) {
          const toNode = nodeById(targetEl.dataset.id);
          // pick edge kind based on row pairing default
          let kind = "causes";
          if (fromNode.kind === "leverage") kind = "reduces";
          else if (fromNode.row === toNode.row) kind = "moderates";
          openEdgeEditor({ from: fromNode.id, to: toNode.id, kind, _new: true });
        }
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    // ============================================================
    // EDITORS (modal)
    // ============================================================
    function openModal(html, onMount) {
      const back = document.createElement("div");
      back.className = "ag-modal-back";
      back.innerHTML = `<div class="ag-modal" role="dialog">${html}</div>`;
      document.body.appendChild(back);
      back.addEventListener("click", (e) => { if (e.target === back) back.remove(); });
      onMount && onMount(back);
      return back;
    }

    function nextId(kind) {
      const prefix = kind === "symptom" ? "S" : kind === "mechanism" ? "M" : "L";
      let i = 1;
      while (state.nodes.some(n => n.id === prefix + i)) i++;
      return prefix + i;
    }

    function openNodeEditor(n) {
      const isNew = !n;
      const draft = n ? { ...n } : { id: "", kind: "mechanism", title: "", meta: "", body: "", conf: 0.5, row: 2, col: 0, author: "agent:reader/v0", filed: new Date().toISOString().slice(0,10) };
      const html = `
        <div class="ag-modal-head">
          <div class="ag-modal-eyebrow">${isNew ? "new claim" : "edit · " + draft.id}</div>
          <div class="ag-modal-sub">authored by <code>agent:reader/v0</code> · unsigned</div>
        </div>
        <div class="ag-modal-body">
          <label class="ag-field">
            <span>kind</span>
            <select data-f="kind">
              <option value="symptom">symptom</option>
              <option value="mechanism" selected>mechanism</option>
              <option value="leverage">leverage</option>
            </select>
          </label>
          <label class="ag-field">
            <span>title</span>
            <input type="text" data-f="title" />
          </label>
          <label class="ag-field">
            <span>meta</span>
            <input type="text" data-f="meta" placeholder="e.g. evidence · 7 studies" />
          </label>
          <label class="ag-field">
            <span>body</span>
            <textarea data-f="body" rows="3"></textarea>
          </label>
          <label class="ag-field ag-field-row">
            <span>confidence</span>
            <input type="number" min="0" max="1" step="0.01" data-f="conf" />
          </label>
        </div>
        <div class="ag-modal-foot">
          ${isNew ? "" : `<button class="btn-mono danger" data-act="delete">delete</button>`}
          <span style="flex:1"></span>
          <button class="btn-mono" data-act="cancel">cancel</button>
          <button class="btn-mono primary" data-act="save">${isNew ? "file claim" : "save"}</button>
        </div>
      `;
      const back = openModal(html, (back) => {
        const f = (k) => back.querySelector(`[data-f="${k}"]`);
        f("kind").value = draft.kind;
        f("title").value = draft.title;
        f("meta").value = draft.meta || "";
        f("body").value = draft.body || "";
        f("conf").value = (draft.conf == null ? 0.5 : draft.conf);
        back.querySelector("[data-act='cancel']").addEventListener("click", () => back.remove());
        back.querySelector("[data-act='save']").addEventListener("click", () => {
          draft.kind  = f("kind").value;
          draft.title = f("title").value.trim() || "untitled claim";
          draft.meta  = f("meta").value.trim();
          draft.body  = f("body").value.trim();
          draft.conf  = parseFloat(f("conf").value) || 0;
          draft.row   = draft.kind === "symptom" ? 1 : draft.kind === "mechanism" ? 2 : 3;
          draft.author = "agent:reader/v0";
          draft.filed = new Date().toISOString().slice(0,10);
          if (isNew) {
            draft.id = nextId(draft.kind);
            // place at center of viewport in canvas coords
            const r = viewportEl.getBoundingClientRect();
            const p = pointToCanvas(r.left + r.width/2 - 90, r.top + r.height/2 - 40);
            draft._x = Math.max(40, Math.min(canvasW - nodeW - 40, p.x));
            draft._y = Math.max(40, Math.min(canvasH - 100, p.y));
            draft.col = state.nodes.filter(x => x.row === draft.row).length;
            state.nodes.push(draft);
          } else {
            const idx = state.nodes.findIndex(x => x.id === draft.id);
            // if kind changed, also update row + clear coord so re-layout snaps to row
            if (state.nodes[idx].kind !== draft.kind) { delete draft._x; delete draft._y; draft.col = state.nodes.filter(x => x.row === draft.row).length; }
            state.nodes[idx] = draft;
          }
          back.remove();
          snapshot();
          persistAndRender(true);
        });
        if (!isNew) {
          back.querySelector("[data-act='delete']").addEventListener("click", () => {
            if (!confirm("Delete " + draft.id + " and all its edges?")) return;
            state.nodes = state.nodes.filter(x => x.id !== draft.id);
            state.edges = state.edges.filter(e => e.from !== draft.id && e.to !== draft.id);
            back.remove();
            snapshot();
            persistAndRender(true);
          });
        }
      });
    }

    function openEdgeEditor(edgeOrDraft) {
      const isNew = !!edgeOrDraft._new;
      const a = nodeById(edgeOrDraft.from);
      const b = nodeById(edgeOrDraft.to);
      const html = `
        <div class="ag-modal-head">
          <div class="ag-modal-eyebrow">${isNew ? "new edge" : "edit edge"}</div>
          <div class="ag-modal-sub"><code>${a ? a.id : "?"}</code> → <code>${b ? b.id : "?"}</code></div>
        </div>
        <div class="ag-modal-body">
          <label class="ag-field">
            <span>relation</span>
            <select data-f="kind">
              <option value="causes">causes — directional, evidenced</option>
              <option value="moderates">moderates — conditions strength</option>
              <option value="reduces">reduces — leverage edge</option>
            </select>
          </label>
        </div>
        <div class="ag-modal-foot">
          ${isNew ? "" : `<button class="btn-mono danger" data-act="delete">delete</button>`}
          <span style="flex:1"></span>
          <button class="btn-mono" data-act="cancel">cancel</button>
          <button class="btn-mono primary" data-act="save">${isNew ? "add edge" : "save"}</button>
        </div>
      `;
      openModal(html, (back) => {
        back.querySelector("[data-f='kind']").value = edgeOrDraft.kind || "causes";
        back.querySelector("[data-act='cancel']").addEventListener("click", () => back.remove());
        back.querySelector("[data-act='save']").addEventListener("click", () => {
          const kind = back.querySelector("[data-f='kind']").value;
          if (isNew) {
            state.edges.push({ from: edgeOrDraft.from, to: edgeOrDraft.to, kind, author: "agent:reader/v0" });
          } else {
            const idx = state.edges.findIndex(e => e.from === edgeOrDraft.from && e.to === edgeOrDraft.to && e.kind === edgeOrDraft.kind);
            if (idx >= 0) state.edges[idx] = { ...state.edges[idx], kind };
          }
          back.remove();
          snapshot();
          persistAndRender(true);
        });
        if (!isNew) {
          back.querySelector("[data-act='delete']").addEventListener("click", () => {
            state.edges = state.edges.filter(e => !(e.from === edgeOrDraft.from && e.to === edgeOrDraft.to && e.kind === edgeOrDraft.kind));
            back.remove();
            snapshot();
            persistAndRender(true);
          });
        }
      });
    }

    // ============================================================
    // PERSIST + EXPORT
    // ============================================================
    function persistAndRender(persist) {
      if (persist) saveState({ nodes: state.nodes, edges: state.edges });
      render();
      onPersist();
    }

    function exportJSONLD() {
      const out = {
        "@context": "https://aboard.dev/schema/v0",
        "@id": "aboard:domain/democratic_backsliding",
        "@type": "ClaimGraph",
        "domain": "democratic_backsliding",
        "version": "v0",
        "lastUpdated": new Date().toISOString(),
        "claims": state.nodes.map(n => ({
          "@id": "aboard:claim/" + n.id,
          "@type": "Claim",
          "kind": n.kind,
          "id": n.id,
          "title": n.title,
          "body": n.body,
          "meta": n.meta,
          "confidence": n.conf,
          "filedBy": n.author || "agent:unknown",
          "filedAt": n.filed,
          "dossier": n.dossier ? "aboard:dossier/" + n.id : null,
        })),
        "relations": state.edges.map(e => ({
          "@type": "Relation",
          "kind": e.kind,
          "from": "aboard:claim/" + e.from,
          "to":   "aboard:claim/" + e.to,
        })),
      };
      return JSON.stringify(out, null, 2);
    }

    // ============================================================
    // BIND THEME
    // ============================================================
    document.addEventListener("aboard:themechange", () => { /* CSS variables auto-update; nothing to do */ });

    // ============================================================
    // INITIAL RENDER + FIT
    // ============================================================
    render();
    requestAnimationFrame(fitView);

    function setActiveDomain(domain) {
      if (!domain || domain === "all") {
        canvasEl.classList.remove("ag-domain-filter");
        nodesHost.querySelectorAll(".ag-node").forEach((n) => n.classList.remove("ag-out-of-domain"));
        edgesSvg.querySelectorAll(".ag-edge").forEach((p) => p.classList.remove("ag-out-of-domain"));
        labelsHost.querySelectorAll(".ag-edge-label").forEach((l) => l.classList.remove("ag-out-of-domain"));
        return;
      }
      canvasEl.classList.add("ag-domain-filter");
      const inDomainIds = new Set(
        state.nodes.filter((n) => n.domain === domain).map((n) => n.id)
      );
      nodesHost.querySelectorAll(".ag-node").forEach((n) => {
        n.classList.toggle("ag-out-of-domain", !inDomainIds.has(n.dataset.id));
      });
      edgesSvg.querySelectorAll(".ag-edge").forEach((p) => {
        const inDomain = inDomainIds.has(p.dataset.from) && inDomainIds.has(p.dataset.to);
        p.classList.toggle("ag-out-of-domain", !inDomain);
      });
      labelsHost.querySelectorAll(".ag-edge-label").forEach((l) => {
        const inDomain = inDomainIds.has(l.dataset.from) && inDomainIds.has(l.dataset.to);
        l.classList.toggle("ag-out-of-domain", !inDomain);
      });
    }

    return {
      state,
      render: () => persistAndRender(false),
      addNode: () => openNodeEditor(null),
      undo, redo,
      fitView,
      zoomIn:  () => { const r = viewportEl.getBoundingClientRect(); zoomAt(1.2, r.width/2, r.height/2); },
      zoomOut: () => { const r = viewportEl.getBoundingClientRect(); zoomAt(1/1.2, r.width/2, r.height/2); },
      zoom: () => scale,
      reset: () => { clearState(); state.nodes = JSON.parse(JSON.stringify(SEED.nodes)); state.edges = JSON.parse(JSON.stringify(SEED.edges)); state.nodes.forEach(n=>{delete n._x; delete n._y;}); snapshot(); persistAndRender(false); },
      exportJSONLD,
      setActiveDomain,
    };
  }

  window.AboardGraph = { mount, SEED };
})();
