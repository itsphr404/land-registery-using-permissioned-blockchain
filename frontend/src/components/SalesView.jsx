import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { approveAsRegistrar, approveAsSeller } from "../lib/parcelActions";

// Resolve the role label for the current wallet
function getRoleLabel(roles) {
  if (roles.registrar) return "Registrar";
  if (roles.surveyor)  return "Surveyor";
  if (roles.court)     return "Court Officer";
  if (roles.admin)     return "Admin";
  if (roles.issuer)    return "Issuer";
  return "Citizen";
}

export default function SalesView({ plots, onFocusPlot }) {
  const { roles, signer, account } = useWallet();
  const salesPlots = plots.filter((p) => p.sale);

  // Per-parcel busy + feedback state
  const [busyMap,     setBusyMap]     = useState({});
  const [feedbackMap, setFeedbackMap] = useState({});

  function setBusy(id, val) {
    setBusyMap((prev) => ({ ...prev, [id]: val }));
  }

  function setFeedback(id, msg, isError) {
    setFeedbackMap((prev) => ({ ...prev, [id]: { msg, isError } }));
    setTimeout(() => {
      setFeedbackMap((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }, 6000);
  }

  function friendlyErr(err) {
    const raw = err?.reason || err?.shortMessage || err?.message || "Transaction failed";
    if (raw.includes("too many errors") || raw.includes("coalesce") || raw.includes("UNKNOWN_ERROR"))
      return "Cannot reach the Hardhat node — run: npx hardhat node";
    if (raw.includes("AccessControl") || raw.includes("Unauthorized"))
      return "Your wallet does not hold this role on-chain.";
    if (raw.includes("user rejected") || raw.includes("4001"))
      return "Transaction rejected in wallet.";
    return raw;
  }

  async function handleApproveRegistrar(parcelId) {
    if (!signer) { alert("Wallet not connected."); return; }
    setBusy(parcelId, "registrar");
    try {
      const numId = Number(parcelId.replace(/^.*?(\d+)$/, "$1"));
      await approveAsRegistrar(signer, numId);
      setFeedback(parcelId, "✓ Registrar approval recorded on-chain!", false);
    } catch (err) {
      console.error("approveAsRegistrar:", err);
      setFeedback(parcelId, "✗ " + friendlyErr(err), true);
    } finally {
      setBusy(parcelId, null);
    }
  }

  async function handleApproveSeller(parcelId) {
    if (!signer) { alert("Wallet not connected."); return; }
    setBusy(parcelId, "seller");
    try {
      const numId = Number(parcelId.replace(/^.*?(\d+)$/, "$1"));
      await approveAsSeller(signer, numId);
      setFeedback(parcelId, "✓ Seller approval recorded on-chain!", false);
    } catch (err) {
      console.error("approveAsSeller:", err);
      setFeedback(parcelId, "✗ " + friendlyErr(err), true);
    } finally {
      setBusy(parcelId, null);
    }
  }

  const roleLabel = getRoleLabel(roles);

  // What this wallet can do on the sales page
  const canActAsRegistrar = roles.registrar || roles.admin;
  // Citizen / owner can act as seller (they are the lister of the parcel)
  const canActAsSeller    = roles.citizen || roles.issuer;
  // Registrar cannot double-act as seller — strict separation
  const isPrivilegedRole  = roles.registrar || roles.surveyor || roles.court || roles.admin;

  return (
    <div>
      <h1 className="page-title">
        Sales and <i>escrow</i>
      </h1>

      <p className="note">
        Ethereum TitleEscrow: A sale completes atomically on-chain only when the
        buyer deposit, seller approval <em>and</em> registrar approval all exist.
      </p>

      {/* Role banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          padding: "8px 12px",
          background: "var(--sheet)",
          border: "1px solid var(--line)",
          font: "12px var(--mono)",
        }}
      >
        <span style={{ color: "var(--mute)" }}>Connected as</span>
        <strong
          style={{
            color: canActAsRegistrar
              ? "var(--blue)"
              : canActAsSeller
              ? "var(--forest)"
              : "var(--mute)",
          }}
        >
          {roleLabel}
        </strong>
        <span style={{ color: "var(--mute)", marginLeft: "auto" }}>
          {canActAsRegistrar
            ? "You can approve sales as Registrar."
            : canActAsSeller
            ? "You can approve as the property owner / seller."
            : "Read-only view."}
        </span>
      </div>

      {salesPlots.length > 0 ? (
        salesPlots.map((p) => {
          const sale  = p.sale;
          const busy  = busyMap[p.id];
          const fb    = feedbackMap[p.id];

          return (
            <div key={p.id} style={{ marginBottom: 32 }}>
              {/* Parcel header */}
              <div className="k">{p.id} · {p.addr}</div>

              <p style={{ margin: "6px 0 12px" }}>
                Seller <strong>{p.owner}</strong> → buyer <strong>{sale.buyer}</strong>
                {" · "}
                <span className="mono" style={{ fontWeight: "bold" }}>{sale.price}</span>
              </p>

              {/* ── Buyer deposit row (info only) ── */}
              <div className="lead">
                <span>{sale.funded ? "✓" : "…"} Buyer deposit</span>
                <i></i>
                <span>{sale.funded ? "held in escrow contract" : "missing — awaiting buyer"}</span>
              </div>

              {/* ── Seller approval row ── */}
              <div className="lead">
                <span>{sale.sellerOk ? "✓" : "…"} Seller approval</span>
                <i></i>
                <span>
                  {sale.sellerOk ? (
                    // Already signed — show tick for everyone
                    <span style={{ color: "var(--forest)" }}>signed</span>
                  ) : canActAsRegistrar ? (
                    // Registrar sees this row as read-only info (not their action)
                    <span style={{ color: "var(--mute)", font: "11px var(--mono)" }}>
                      awaiting owner signature
                    </span>
                  ) : (
                    // Citizen / seller sees the action button
                    <button
                      className="btn alt"
                      disabled={busy === "seller"}
                      onClick={() => handleApproveSeller(p.id)}
                    >
                      {busy === "seller" ? "SIGNING…" : "APPROVE AS SELLER"}
                    </button>
                  )}
                </span>
              </div>

              {/* ── Registrar approval row ── */}
              <div className="lead">
                <span>{sale.regOk ? "✓" : "…"} Registrar approval</span>
                <i></i>
                <span>
                  {sale.regOk ? (
                    <span style={{ color: "var(--forest)" }}>signed</span>
                  ) : canActAsRegistrar ? (
                    // Registrar sees the action button
                    <button
                      className="btn"
                      disabled={busy === "registrar"}
                      onClick={() => handleApproveRegistrar(p.id)}
                    >
                      {busy === "registrar" ? "SIGNING…" : "APPROVE AS REGISTRAR"}
                    </button>
                  ) : (
                    // Citizen sees this as read-only info
                    <span style={{ color: "var(--mute)", font: "11px var(--mono)" }}>
                      awaiting registrar signature
                      {!account && " — wallet not connected"}
                    </span>
                  )}
                </span>
              </div>

              {/* ── Inline feedback ── */}
              {fb && (
                <div
                  className="note"
                  style={{
                    marginTop: 10,
                    borderColor: fb.isError ? "var(--red)" : "var(--forest)",
                    color:       fb.isError ? "var(--red)" : "var(--forest)",
                  }}
                >
                  {fb.msg}
                </div>
              )}

              {/* ── Sale completion status ── */}
              {sale.funded && sale.sellerOk && sale.regOk && (
                <div
                  className="note"
                  style={{ marginTop: 10, borderColor: "var(--forest)", color: "var(--forest)" }}
                >
                  ✓ All three conditions met — sale will complete on next contract interaction.
                </div>
              )}

              <button
                className="btn alt"
                style={{ marginTop: 12 }}
                onClick={() => onFocusPlot(p.id)}
              >
                SHOW ON MAP
              </button>
            </div>
          );
        })
      ) : (
        <p className="sub" style={{ padding: "16px 0" }}>
          No active sales in escrow.
        </p>
      )}
    </div>
  );
}
