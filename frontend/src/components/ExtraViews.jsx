import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";

export function CorrectionsView() {
  const { roles } = useWallet();
  const [approvals, setApprovals] = useState(["court"]);

  const canApprove = roles.court || roles.registrar || roles.admin;

  const handleApprove = () => {
    const roleKey = roles.court ? "court" : roles.registrar ? "registrar" : "admin";
    if (!approvals.includes(roleKey)) {
      setApprovals([...approvals, roleKey]);
    }
  };

  return (
    <div>
      <div className="note">Simulated demo data. Not on-chain until Step 7.</div>
      <h1 className="page-title">
        Legal <i>corrections</i>
      </h1>
      <p className="sub">
        Demonstration of the proposed corrections workflow. This view does not write to the blockchain.
      </p>

      <div className="k">Proposed</div>
      <div className="ev">
        <time>
          CO-81<br />PARCEL-5
        </time>
        <div>
          <strong>Boundary / Size</strong> <span className="old">412 m²</span>
          <span className="new">435 m²</span>
          <br />
          <span className="mono" style={{ color: "var(--mute)" }}>
            Approvals {approvals.length} of 2 ({approvals.join(", ")}) · timelock until 2026-10-31
          </span>
          <br />
          <button
            className="btn alt"
            style={{ marginTop: "8px" }}
            disabled={!canApprove || approvals.includes(roles.court ? "court" : roles.registrar ? "registrar" : "admin")}
            onClick={handleApprove}
          >
            APPROVE CORRECTION
          </button>
          {!canApprove && (
            <span className="mono" style={{ marginLeft: "8px", color: "var(--mute)" }}>
              Requires Court Officer, Registrar or Admin role.
            </span>
          )}
        </div>
      </div>

      <div className="k">Applied</div>
      <div className="ev">
        <time>
          2026-08-02<br />PARCEL-1
        </time>
        <div>
          <span className="stamp st-court">Applied</span> <strong>Size</strong>{" "}
          <span className="old">408 m²</span>
          <span className="new">412 m²</span>
          <br />
          <span className="mono" style={{ color: "var(--mute)" }}>
            Demonstration only · not an on-chain correction record
          </span>
        </div>
      </div>
    </div>
  );
}

export function SharesView() {
  const [rentClaimed, setRentClaimed] = useState(false);

  const holders = [
    { name: "Alice", tokens: 600, percent: 60, eligible: true },
    { name: "Bob", tokens: 400, percent: 40, eligible: true },
  ];

  return (
    <div>
      <div className="note">Simulated demo data. Not on-chain until Step 8.</div>
      <h1 className="page-title">
        Fractional <i>shares</i>
      </h1>
      <p className="sub">
        Demonstration of fractional ownership and revenue distribution. This view does not write to the blockchain.
      </p>

      {/* SVG Allocation Bar */}
      <div style={{ border: "1.5px solid var(--ink)", background: "var(--sheet)", padding: "8px", margin: "16px 0" }}>
        <svg viewBox="0 0 600 46" style={{ display: "block", width: "100%", color: "var(--ink)" }}>
          <defs>
            <pattern id="pat1" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="var(--forest)" strokeWidth="2" />
            </pattern>
            <pattern id="pat2" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 0H8M0 0V8" stroke="var(--blue)" strokeWidth="1.5" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="360" height="46" fill="url(#pat1)" stroke="currentColor" />
          <text x="12" y="28" fontSize="12" fontFamily="monospace" fontWeight="bold" fill="currentColor">
            Alice 60%
          </text>
          <rect x="360" y="0" width="240" height="46" fill="url(#pat2)" stroke="currentColor" />
          <text x="372" y="28" fontSize="12" fontFamily="monospace" fontWeight="bold" fill="currentColor">
            Bob 40%
          </text>
        </svg>
      </div>

      <div className="k">Holders & Demonstration Compliance</div>
      {holders.map((h, i) => (
        <div key={i} className="lead">
          <span>{h.name}</span>
          <i></i>
          <span>
            {h.tokens} shares ({h.percent}%) · {h.eligible ? "✓ eligible" : "✕ blocked"}
          </span>
        </div>
      ))}
      <p className="mono" style={{ color: "var(--mute)", margin: "8px 0 16px" }}>
        Demonstration allocation of 1,000 shares.
      </p>

      <div className="k">Pro-Rata Revenue Distribution</div>
      <div className="lead">
        <span>2026-10 Proceeds</span>
        <i></i>
        <span>
          1.0 ETH ·{" "}
          {rentClaimed ? (
            <span style={{ color: "var(--forest)", fontWeight: "bold" }}>withdrawn</span>
          ) : (
            <button
              className="btn alt"
              style={{ padding: "2px 8px" }}
              onClick={() => setRentClaimed(true)}
            >
              WITHDRAW (pull payment)
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export function AuditView({ events, error, onRetry }) {
  return (
    <div>
      <h1 className="page-title">
        Audit <i>trail</i>
      </h1>
      <p className="sub">
        Transaction activity and append-only registry history are shown here.
      </p>

      {error ? (
        <div className="sub">
          <p>{error}</p>
          {error === "Audit trail unavailable right now" && <button className="btn" onClick={onRetry}>Retry</button>}
        </div>
      ) : events.map((e, idx) => (
        <div key={idx} className="ev">
          <time>{e.time}</time>
          <span>
            <strong>{e.actor}</strong> · {e.text}
            {e.security && (
              <span className="mono" style={{ color: "var(--bronze)", marginLeft: "8px", fontWeight: "bold" }}>
                ⚑ SECURITY
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
