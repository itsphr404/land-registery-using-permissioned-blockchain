import React, { useState } from "react";
import { ST } from "../lib/mapData";
import { useWallet } from "../context/WalletContext";
import { approveRegistration, getWriteContracts, verifySurvey } from "../lib/parcelActions";
import { friendlyError } from "../lib/errors";
import { formatCoords } from "../lib/geo";
import DocumentPanel from "./DocumentPanel";

// The floating parcel card used by the globe view. It mirrors the card inside MapView
// (same details, same Verify survey / Approve registration actions) and adds a Location row.
// MapView is intentionally left untouched; a later cleanup can make MapView use this component too.
export default function PlotCard({ plot, onClose, onSelectView }) {
  const { roles, signer } = useWallet();
  const [busy, setBusy] = useState({});
  const [actionMessage, setActionMessage] = useState("");

  const runPlotAction = async (action, key) => {
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

  const goTo = (view) => {
    onClose();
    onSelectView(view);
  };

  const locationText = !plot.loc
    ? "not recorded"
    : plot.locKind === "recorded"
    ? `${formatCoords(plot.loc)} · recorded pin`
    : "demo placement · no location recorded";

  return (
    <div className="card" role="dialog" aria-label={`Plot ${plot.id}`}>
      <button className="x" onClick={onClose}>CLOSE</button>
      <span className="mono">{plot.id}</span>
      <h3>{plot.addr}</h3>
      <span className={`stamp st-${plot.st}`}>
        {ST[plot.st][0]}{plot.sub ? ` · ${plot.sub}` : ""}
      </span>

      <div className="lead">
        <span>Owners</span><i></i><span>{plot.owners.map((owner) => `${owner.label} (${owner.share}%)`).join(", ")}</span>
      </div>
      <div className="lead">
        <span>Size</span><i></i><span>{plot.size}</span>
      </div>
      <div className="lead">
        <span>Location</span><i></i><span>{locationText}</span>
      </div>
      <div className="lead">
        <span>Record integrity</span><i></i><span>{plot.metaOk ? "verified" : "unverified"}</span>
      </div>
      <DocumentPanel plot={plot} />
      {actionMessage && <div className="note">{actionMessage}</div>}

      {plot.sale && (
        <>
          <div className="lead">
            <span>Asking price</span><i></i><span>{plot.sale.price}</span>
          </div>
          <div className="lead">
            <span>Buyer deposit</span><i></i>
            <span>{plot.sale.funded ? "✓ held in escrow" : "… waiting for buyer"}</span>
          </div>
          <div className="lead">
            <span>Seller approval</span><i></i>
            <span>{plot.sale.sellerOk ? "✓ signed" : "… pending"}</span>
          </div>
          <div className="lead">
            <span>Registrar approval</span><i></i>
            <span>{plot.sale.regOk ? "✓ signed" : "… pending"}</span>
          </div>
          {!plot.sale.regOk && (
            <div className="note" style={{ marginTop: 8 }}>
              {roles.registrar
                ? "⚡ You can approve this sale as Registrar."
                : "Waiting for Registrar approval to complete transfer."}
            </div>
          )}
          {onSelectView && (
            <button className="btn" style={{ marginTop: 10, width: "100%" }} onClick={() => goTo("sales")}>
              {roles.registrar ? "APPROVE IN SALES & ESCROW →" : "OPEN SALES & ESCROW →"}
            </button>
          )}
        </>
      )}

      {plot.st === "pending" && (
        <>
          <div className="lead">
            <span>Verification</span><i></i>
            <span>awaiting {plot.sub}</span>
          </div>
          <div className="note" style={{ marginTop: 8 }}>
            {plot.sub === "survey" && roles.surveyor
              ? "⚡ You can verify this survey."
              : plot.sub === "registrar" && roles.registrar
              ? "⚡ You can approve this registration."
              : `Pending ${plot.sub} approval.`}
          </div>
          {plot.sub === "survey" && roles.surveyor && (
            <button className="btn alt" disabled={busy[`survey-${plot.pid}`]} onClick={() => runPlotAction(verifySurvey, `survey-${plot.pid}`)}>
              {busy[`survey-${plot.pid}`] ? "VERIFYING…" : "VERIFY SURVEY"}
            </button>
          )}
          {plot.sub === "registrar" && roles.registrar && (
            <button className="btn" disabled={busy[`registration-${plot.pid}`]} onClick={() => runPlotAction(approveRegistration, `registration-${plot.pid}`)}>
              {busy[`registration-${plot.pid}`] ? "APPROVING…" : "APPROVE REGISTRATION"}
            </button>
          )}
          {onSelectView && (
            <button className="btn" style={{ marginTop: 10, width: "100%" }} onClick={() => goTo("dashboard")}>
              VIEW IN DASHBOARD →
            </button>
          )}
        </>
      )}

      {plot.court && (
        <>
          <div className="lead">
            <span>Case</span><i></i><span>{plot.court.no}</span>
          </div>
          <div className="lead">
            <span>Court</span><i></i><span>{plot.court.court}</span>
          </div>
          <div className="lead">
            <span>Next hearing</span><i></i><span>{plot.court.hearing}</span>
          </div>
          <div className="note">Transfers are frozen while the case is open.</div>
          {onSelectView && (
            <button className="btn alt" style={{ marginTop: 10, width: "100%" }} onClick={() => goTo("registry")}>
              VIEW FULL RECORD →
            </button>
          )}
        </>
      )}

      {plot.dispute && (
        <>
          <div className="note">
            {plot.dispute}. Sale and fractionalisation blocked until resolved.
          </div>
          {onSelectView && (
            <button className="btn alt" style={{ marginTop: 10, width: "100%" }} onClick={() => goTo("registry")}>
              VIEW IN REGISTRY →
            </button>
          )}
        </>
      )}

      {plot.st === "approved" && !plot.sale && (
        <>
          <div className="lead">
            <span>Verification</span><i></i>
            <span>✓ approved by registrar on-chain</span>
          </div>
          {onSelectView && (
            <button className="btn alt" style={{ marginTop: 10, width: "100%" }} onClick={() => goTo("registry")}>
              VIEW IN REGISTRY →
            </button>
          )}
        </>
      )}
    </div>
  );
}
