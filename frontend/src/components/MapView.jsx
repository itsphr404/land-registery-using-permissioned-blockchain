import React, { useState, useRef, useCallback, useMemo } from "react";
import { ST, AREAS, rnd } from "../lib/mapData";
import { useWallet } from "../context/WalletContext";
import { approveRegistration, getWriteContracts, verifySurvey } from "../lib/parcelActions";
import { friendlyError } from "../lib/errors";
import DocumentPanel from "./DocumentPanel";

const W = 2000;
const H = 1250;

// Generate satellite terrain SVG once
const terrainSVG = (() => {
  let s = `<rect width="${W}" height="${H}" fill="#38482a"/>`;
  const gr = ["#43562f", "#2f3f23", "#4d5e35", "#566339", "#3a4c2b", "#6b6b45"];
  for (let i = 0; i < 190; i++) {
    const x = rnd(i) * W;
    const y = rnd(i + 300) * H;
    const w = 60 + rnd(i + 9) * 190;
    const h = 40 + rnd(i + 19) * 120;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${gr[i % 6]}" opacity=".55" transform="rotate(${Math.round(
      rnd(i + 5) * 40 - 20
    )} ${x} ${y})"/>`;
  }
  for (let i = 0; i < 260; i++) {
    s += `<circle cx="${rnd(i + 700) * W}" cy="${rnd(i + 900) * H}" r="${3 + rnd(i) * 7}" fill="#26361c" opacity=".6"/>`;
  }
  s += `<path d="M-20 560C300 520 520 640 800 600S1300 450 1500 520 1850 420 2040 470" fill="none" stroke="#3d6b8a" stroke-width="34" opacity=".85"/><path d="M-20 560C300 520 520 640 800 600S1300 450 1500 520 1850 420 2040 470" fill="none" stroke="#6aa3c4" stroke-width="10" opacity=".5"/>`;
  [[0, 460, 2000, 0], [0, 720, 2000, 40], [740, 0, 0, 1250], [1250, 0, 60, 1250]].forEach((r) => {
    s += `<path d="M${r[0]} ${r[1]}L${(r[0] + r[2]) || W} ${r[1] + r[3]}" stroke="#b9b29c" stroke-width="9" opacity=".8"/>`;
  });
  s += `<path d="M0 460H2000M0 730H2000M740 0V1250M1280 0V1250M0 1000H2000M1000 0V1250" stroke="#cfc8b2" stroke-width="7" opacity=".7" fill="none"/>`;
  return s;
})();

export default function MapView({ plots, onSelectView }) {
  const { roles, signer } = useWallet();
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: W, h: H });
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState({
    approved: true,
    sale: true,
    disputed: true,
    court: true,
    pending: true,
  });
  const [searchMsg, setSearchMsg] = useState("");
  const [busy, setBusy] = useState({});
  const [actionMessage, setActionMessage] = useState("");

  const mapSvgRef = useRef(null);
  const dragRef = useRef({ isDown: false, startX: 0, startY: 0, initX: 0, initY: 0, moved: false });
  const animRef = useRef(null);

  const runPlotAction = async (plot, action, key) => {
    if (!signer) {
      setActionMessage("Connect a wallet on the configured network first.");
      return;
    }
    setBusy((current) => ({ ...current, [key]: true }));
    setActionMessage("");
    try {
      await action(signer, plot.pid);
      setActionMessage("Action confirmed. The plot will refresh automatically.");
    } catch (error) {
      const contracts = getWriteContracts(signer);
      setActionMessage(friendlyError(error, [contracts.registry.interface, contracts.roleManager.interface]));
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  };

  // Status counts
  const counts = useMemo(() => {
    const c = { approved: 0, sale: 0, disputed: 0, court: 0, pending: 0 };
    plots.forEach((p) => {
      if (c[p.st] !== undefined) c[p.st]++;
    });
    return c;
  }, [plots]);

  // Filtered plots in sidebar
  const visiblePlots = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return plots.filter((p) => {
      if (!statusFilters[p.st]) return false;
      if (!q) return true;
      return (p.id + p.addr + p.owners.map((o) => o.label).join(" ")).toLowerCase().includes(q);
    }).slice(0, 50);
  }, [plots, statusFilters, searchQuery]);

  // Selected plot object
  const selectedPlot = useMemo(() => {
    return plots.find((p) => p.id === selectedId) || null;
  }, [plots, selectedId]);

  // Fly to coordinate animation
  const flyTo = useCallback((cx, cy, targetW) => {
    const svgEl = mapSvgRef.current;
    if (!svgEl) return;
    const rc = svgEl.getBoundingClientRect();
    const ar = rc.height / rc.width || 0.625;
    const w = Math.min(Math.max(targetW, 160), W);
    const targetH = w * ar;
    const targetX = Math.min(Math.max(cx - w / 2, 0), W - w);
    const targetY = Math.min(Math.max(cy - targetH / 2, 0), H - targetH);

    const start = { ...viewBox };
    const t0 = performance.now();
    const duration = 600;

    if (animRef.current) cancelAnimationFrame(animRef.current);

    const step = (now) => {
      const u = Math.min((now - t0) / duration, 1);
      const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const nextX = start.x + (targetX - start.x) * ease;
      const nextY = start.y + (targetY - start.y) * ease;
      const nextW = start.w + (w - start.w) * ease;
      const nextH = start.h + (targetH - start.h) * ease;
      setViewBox({ x: nextX, y: nextY, w: nextW, h: nextH });
      if (u < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };
    animRef.current = requestAnimationFrame(step);
  }, [viewBox]);

  // Zoom action (+ / -)
  const zoom = useCallback((factor) => {
    const svgEl = mapSvgRef.current;
    if (!svgEl) return;
    const rc = svgEl.getBoundingClientRect();
    const ar = rc.height / rc.width || 0.625;
    const cx = viewBox.x + viewBox.w / 2;
    const cy = viewBox.y + viewBox.h / 2;
    const nextW = Math.min(Math.max(viewBox.w * factor, 160), W);
    const nextH = nextW * ar;
    const nextX = Math.min(Math.max(cx - (cx - viewBox.x) * (nextW / viewBox.w), 0), W - nextW);
    const nextY = Math.min(Math.max(cy - (cy - viewBox.y) * (nextH / viewBox.h), 0), H - nextH);
    setViewBox({ x: nextX, y: nextY, w: nextW, h: nextH });
  }, [viewBox]);

  // Focus a specific plot
  const handleSelectPlot = useCallback((plotId) => {
    const p = plots.find((x) => x.id === plotId);
    if (!p) return;
    setSelectedId(plotId);
    setStatusFilters((prev) => ({ ...prev, [p.st]: true }));
    const cx = p.pts.reduce((acc, q) => acc + q[0], 0) / 4;
    const cy = p.pts.reduce((acc, q) => acc + q[1], 0) / 4;
    flyTo(cx, cy, 320);
  }, [plots, flyTo]);

  // Search handler
  const handleSearch = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchMsg("");
      return;
    }
    const matchedArea = Object.keys(AREAS).find((a) => a.toLowerCase().includes(q));
    if (matchedArea) {
      setSearchMsg(`Showing ${matchedArea}`);
      const [ax, ay] = AREAS[matchedArea];
      flyTo(ax + 190, ay + 130, 520);
      return;
    }
    const matchedPlot = plots.find((p) => (p.id + p.addr + p.owners.map((o) => o.label).join(" ")).toLowerCase().includes(q));
    if (matchedPlot) {
      setSearchMsg(`Found ${matchedPlot.id}`);
      handleSelectPlot(matchedPlot.id);
      return;
    }
    setSearchMsg(`No area or plot matches “${searchQuery}”. Try Northfield, Lakeview, Harbour or Orchard.`);
  };

  // Mouse pan & zoom handlers
  const handlePointerDown = (e) => {
    dragRef.current = {
      isDown: true,
      startX: e.clientX,
      startY: e.clientY,
      initX: viewBox.x,
      initY: viewBox.y,
      moved: false,
    };
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.isDown) return;
    const svgEl = mapSvgRef.current;
    if (!svgEl) return;
    const rc = svgEl.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      dragRef.current.moved = true;
    }
    if (!dragRef.current.moved) return;
    const nextX = Math.min(Math.max(dragRef.current.initX - (dx * viewBox.w) / rc.width, 0), W - viewBox.w);
    const nextY = Math.min(Math.max(dragRef.current.initY - (dy * viewBox.h) / rc.height, 0), H - viewBox.h);
    setViewBox((prev) => ({ ...prev, x: nextX, y: nextY }));
  };

  const handlePointerUp = () => {
    dragRef.current.isDown = false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const svgEl = mapSvgRef.current;
    if (!svgEl) return;
    const rc = svgEl.getBoundingClientRect();
    const factor = e.deltaY > 0 ? 1.2 : 0.83;
    const mouseX = viewBox.x + ((e.clientX - rc.left) / rc.width) * viewBox.w;
    const mouseY = viewBox.y + ((e.clientY - rc.top) / rc.height) * viewBox.h;
    const ar = rc.height / rc.width || 0.625;
    const nextW = Math.min(Math.max(viewBox.w * factor, 160), W);
    const nextH = nextW * ar;
    const nextX = Math.min(Math.max(mouseX - (mouseX - viewBox.x) * (nextW / viewBox.w), 0), W - nextW);
    const nextY = Math.min(Math.max(mouseY - (mouseY - viewBox.y) * (nextH / viewBox.h), 0), H - nextH);
    setViewBox({ x: nextX, y: nextY, w: nextW, h: nextH });
  };

  const radius = Math.max(viewBox.w / 95, 5);
  const strokeWidth = viewBox.w / 420;

  return (
    <div className="mapwrap">
      {/* Sidebar */}
      <div className="side">
        <div className="srch">
          <input
            id="q"
            type="search"
            placeholder="Search area, plot ID or owner"
            aria-label="Search map"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button className="btn" onClick={handleSearch}>
            GO
          </button>
        </div>

        {searchMsg && <p className="mono" style={{ color: "var(--mute)", margin: "8px 0 0" }}>{searchMsg}</p>}

        {/* Chips */}
        <div className="chips" role="group" aria-label="Show plots by status">
          {Object.keys(ST).map((stKey) => {
            const isPressed = statusFilters[stKey];
            return (
              <button
                key={stKey}
                className="chip"
                aria-pressed={isPressed}
                onClick={() => setStatusFilters((prev) => ({ ...prev, [stKey]: !prev[stKey] }))}
              >
                <span className={`g ${stKey}`}>{ST[stKey][1]}</span>
                {ST[stKey][0]} {counts[stKey] || 0}
              </button>
            );
          })}
        </div>

        {/* Plot Results List */}
        <div className="res">
          {visiblePlots.map((plot) => (
            <button
              key={plot.id}
              className={selectedId === plot.id ? "selected" : ""}
              onClick={() => handleSelectPlot(plot.id)}
            >
              <span className={`g ${plot.st}`}>{ST[plot.st][1]}</span>
              <span>
                <strong className="mono">{plot.id}</strong>
                <br />
                <span style={{ fontSize: "13px", color: "var(--mute)" }}>
                  {plot.addr} · {ST[plot.st][0]}
                </span>
              </span>
            </button>
          ))}
          {visiblePlots.length === 0 && <p className="sub" style={{ padding: "16px 0" }}>No plots for this filter.</p>}
        </div>
      </div>

      {/* SVG Map Canvas */}
      <div className="mapbox">
        <svg
          id="map"
          ref={mapSvgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        >
          {/* Static terrain */}
          <g dangerouslySetInnerHTML={{ __html: terrainSVG }} />

          {/* Area labels */}
          <g>
            {Object.keys(AREAS).map((a) => (
              <text
                key={a}
                x={AREAS[a][0]}
                y={AREAS[a][1] - 14}
                fontSize={Math.max(viewBox.w / 42, 14)}
                fontFamily="Fraunces,Georgia,serif"
                fontStyle="italic"
                fill="#fff"
                stroke="#000"
                strokeWidth={viewBox.w / 900}
                paintOrder="stroke"
              >
                {a}
              </text>
            ))}
          </g>

          {/* Plots Layer */}
          <g id="mk">
            {plots.map((p) => {
              const polyStr = p.pts.map((pt) => pt.join(",")).join(" ");
              const cx = p.pts.reduce((acc, q) => acc + q[0], 0) / 4;
              const cy = p.pts.reduce((acc, q) => acc + q[1], 0) / 4;
              const isEnabled = statusFilters[p.st];
              const isSelected = selectedId === p.id;
              const colorMap = {
                approved: "#5BC48A",
                sale: "#EBB444",
                disputed: "#EE6A57",
                court: "#69AEE8",
                pending: "#E4E4E4",
              };
              const c = colorMap[p.st] || "#E4E4E4";

              return (
                <g
                  key={p.id}
                  opacity={isEnabled ? 1 : 0.12}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!dragRef.current.moved) {
                      handleSelectPlot(p.id);
                    }
                  }}
                >
                  <polygon
                    points={polyStr}
                    fill={c}
                    fillOpacity=".38"
                    stroke={isSelected ? "#fff" : c}
                    strokeWidth={isSelected ? strokeWidth * 3 : strokeWidth * 1.4}
                    strokeDasharray={p.st === "pending" ? `${strokeWidth * 5} ${strokeWidth * 3}` : undefined}
                  />
                  {viewBox.w < 700 && (
                    <rect x={cx - 14} y={cy - 10} width={28} height={20} fill="#d8d2c4" opacity=".55" />
                  )}
                  <circle cx={cx} cy={cy} r={radius} fill={c} stroke="#fff" strokeWidth={strokeWidth * 1.2} />
                  <text
                    x={cx}
                    y={cy + radius * 0.38}
                    textAnchor="middle"
                    fontSize={radius * 1.15}
                    fontWeight="700"
                    fontFamily="monospace"
                    fill="#111"
                  >
                    {ST[p.st][1]}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom controls */}
        <div className="zoom">
          <button onClick={() => zoom(0.7)} aria-label="Zoom in">+</button>
          <button onClick={() => zoom(1.4)} aria-label="Zoom out">−</button>
          <button onClick={() => setViewBox({ x: 0, y: 0, w: W, h: H })} style={{ fontSize: "11px" }}>
            ALL
          </button>
        </div>

        {/* Bottom Tag */}
        <span className="tag">SIMULATED IMAGERY · drag to pan, scroll to zoom</span>

        {/* Floating Plot Card */}
        {selectedPlot && (
          <div className="card" role="dialog" aria-label={`Plot ${selectedPlot.id}`}>
            <button className="x" onClick={() => setSelectedId(null)}>CLOSE</button>
            <span className="mono">{selectedPlot.id}</span>
            <h3>{selectedPlot.addr}</h3>
            <span className={`stamp st-${selectedPlot.st}`}>
            {ST[selectedPlot.st][0]}{selectedPlot.sub ? ` · ${selectedPlot.sub}` : ""}
            </span>

            <div className="lead">
            <span>Owners</span><i></i><span>{selectedPlot.owners.map((owner) => `${owner.label} (${owner.share}%)`).join(", ")}</span>
            </div>
            <div className="lead">
              <span>Size</span><i></i><span>{selectedPlot.size}</span>
            </div>
            <div className="lead">
            <span>Record integrity</span><i></i><span>{selectedPlot.metaOk ? "verified" : "unverified"}</span>
            </div>
            <DocumentPanel plot={selectedPlot} />
            {actionMessage && <div className="note">{actionMessage}</div>}

            {/* ── SALE: escrow details + navigate to approval page ── */}
            {selectedPlot.sale && (
              <>
                <div className="lead">
                  <span>Asking price</span><i></i><span>{selectedPlot.sale.price}</span>
                </div>
                <div className="lead">
                  <span>Buyer deposit</span><i></i>
                  <span>{selectedPlot.sale.funded ? "✓ held in escrow" : "… waiting for buyer"}</span>
                </div>
                <div className="lead">
                  <span>Seller approval</span><i></i>
                  <span>{selectedPlot.sale.sellerOk ? "✓ signed" : "… pending"}</span>
                </div>
                <div className="lead">
                  <span>Registrar approval</span><i></i>
                  <span>{selectedPlot.sale.regOk ? "✓ signed" : "… pending"}</span>
                </div>

                {/* Action hint based on who is connected */}
                {!selectedPlot.sale.regOk && (
                  <div className="note" style={{ marginTop: 8 }}>
                    {roles.registrar
                      ? "⚡ You can approve this sale as Registrar."
                      : "Waiting for Registrar approval to complete transfer."}
                  </div>
                )}

                {onSelectView && (
                  <button
                    className="btn"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={() => {
                      setSelectedId(null);
                      onSelectView("sales");
                    }}
                  >
                    {roles.registrar ? "APPROVE IN SALES & ESCROW →" : "OPEN SALES & ESCROW →"}
                  </button>
                )}
              </>
            )}

            {/* ── PENDING: awaiting surveyor + registrar sign-off ── */}
            {selectedPlot.st === "pending" && (
              <>
                <div className="lead">
                  <span>Verification</span><i></i>
                  <span>awaiting {selectedPlot.sub}</span>
                </div>

                <div className="note" style={{ marginTop: 8 }}>
                  {selectedPlot.sub === "survey" && roles.surveyor
                    ? "⚡ You can verify this survey."
                    : selectedPlot.sub === "registrar" && roles.registrar
                    ? "⚡ You can approve this registration."
                    : `Pending ${selectedPlot.sub} approval.`}
                </div>

                {selectedPlot.sub === "survey" && roles.surveyor && (
                  <button className="btn alt" disabled={busy[`survey-${selectedPlot.pid}`]} onClick={() => runPlotAction(selectedPlot, verifySurvey, `survey-${selectedPlot.pid}`)}>
                    {busy[`survey-${selectedPlot.pid}`] ? "VERIFYING…" : "VERIFY SURVEY"}
                  </button>
                )}
                {selectedPlot.sub === "registrar" && roles.registrar && (
                  <button className="btn" disabled={busy[`registration-${selectedPlot.pid}`]} onClick={() => runPlotAction(selectedPlot, approveRegistration, `registration-${selectedPlot.pid}`)}>
                    {busy[`registration-${selectedPlot.pid}`] ? "APPROVING…" : "APPROVE REGISTRATION"}
                  </button>
                )}
                {onSelectView && (
                  <button
                    className="btn"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={() => {
                      setSelectedId(null);
                      onSelectView("dashboard");
                    }}
                  >
                    "VIEW IN DASHBOARD →"
                  </button>
                )}
              </>
            )}

            {/* ── COURT: case details + registry link ── */}
            {selectedPlot.court && (
              <>
                <div className="lead">
                  <span>Case</span><i></i><span>{selectedPlot.court.no}</span>
                </div>
                <div className="lead">
                  <span>Court</span><i></i><span>{selectedPlot.court.court}</span>
                </div>
                <div className="lead">
                  <span>Next hearing</span><i></i><span>{selectedPlot.court.hearing}</span>
                </div>
                <div className="note">Transfers are frozen while the case is open.</div>

                {onSelectView && (
                  <button
                    className="btn alt"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={() => {
                      setSelectedId(null);
                      onSelectView("registry");
                    }}
                  >
                    VIEW FULL RECORD →
                  </button>
                )}
              </>
            )}

            {/* ── DISPUTED: dispute note + registry link ── */}
            {selectedPlot.dispute && (
              <>
                <div className="note">
                  {selectedPlot.dispute}. Sale and fractionalisation blocked until resolved.
                </div>
                {onSelectView && (
                  <button
                    className="btn alt"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={() => {
                      setSelectedId(null);
                      onSelectView("registry");
                    }}
                  >
                    VIEW IN REGISTRY →
                  </button>
                )}
              </>
            )}

            {/* ── APPROVED: clean record ── */}
            {selectedPlot.st === "approved" && !selectedPlot.sale && (
              <>
                <div className="lead">
                  <span>Verification</span><i></i>
                  <span>✓ approved by registrar on-chain</span>
                </div>
                {onSelectView && (
                  <button
                    className="btn alt"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={() => {
                      setSelectedId(null);
                      onSelectView("registry");
                    }}
                  >
                    VIEW IN REGISTRY →
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
