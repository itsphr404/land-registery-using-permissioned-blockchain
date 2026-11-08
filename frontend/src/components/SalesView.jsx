import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import {
  approveAsRegistrar,
  approveAsSeller,
  cancelListing,
  consentToSale,
  deposit,
  getWriteContracts,
  listParcel,
  refundAfterDeadline,
} from "../lib/parcelActions";
import { friendlyError } from "../lib/errors";
import OwedBox from "./OwedBox";
import { getReadProvider, getContracts } from "../lib/contracts";

function countdown(deadline, now) {
  if (!deadline) return "No deadline";
  const seconds = Math.max(0, Math.floor((deadline.getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export default function SalesView({ plots, onFocusPlot, onConfirmed, owed, onOwedConfirmed }) {
  const { roles, signer, account } = useWallet();
  const [busy, setBusy] = useState({});
  const [feedback, setFeedback] = useState({});
  const [prices, setPrices] = useState({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const visiblePlots = useMemo(() => plots.filter((plot) => plot.st === "approved" || plot.st === "sale"), [plots]);
  const run = async (key, action, success) => {
    if (!signer) {
      setFeedback((current) => ({ ...current, [key]: "Connect a wallet on the configured network first." }));
      return;
    }
    setBusy((current) => ({ ...current, [key]: true }));
    setFeedback((current) => ({ ...current, [key]: "" }));
    try {
      await action();
      await onConfirmed();
      setFeedback((current) => ({ ...current, [key]: success }));
    } catch (error) {
      const contracts = getWriteContracts(signer);
      setFeedback((current) => ({ ...current, [key]: friendlyError(error, [contracts.escrow.interface, contracts.registry.interface]) }));
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  };

  function isOwner(plot) {
    return Boolean(account && plot.owners.some((owner) => owner.addr.toLowerCase() === account.toLowerCase()));
  }

  return (
    <div>
      <h1 className="page-title">Sales and <i>escrow</i></h1>
      <OwedBox amount={owed} onConfirmed={onOwedConfirmed} />
      <p className="note">Sales progress through consent, listing, deposit, dual approval, and completion.</p>

      {visiblePlots.map((plot) => {
        const owner = isOwner(plot);
        const sale = plot.sale;
        const listed = sale?.status === 1;
        const funded = sale?.status === 2;
        const allConsented = plot.owners.every((item) => item.consented);
        const keyBase = `parcel-${plot.pid}`;
        const deadlinePassed = funded && sale.deadline && sale.deadline.getTime() <= now;
        return (
          <div key={plot.id} style={{ marginBottom: 32 }}>
            <div className="k">{plot.id} · {plot.addr}</div>
            <div className="lead"><span>1. Owner consent</span><i></i><span>{plot.owners.map((item) => <span key={item.addr} style={{ display: "block" }}>{item.label} ({item.share}%) — {item.consented ? "consented" : "pending"} {owner && !item.consented && item.addr.toLowerCase() === account?.toLowerCase() && <button className="btn alt" disabled={busy[`${keyBase}-consent`]} onClick={() => run(`${keyBase}-consent`, () => consentToSale(signer, plot.pid), "Consent confirmed.")}>{busy[`${keyBase}-consent`] ? "SIGNING…" : "CONSENT"}</button>}</span>)}</span></div>
            <div className="lead"><span>2. Listing</span><i></i><span>{plot.st === "approved" ? (
              owner && allConsented ? <span><input type="number" min="0.000000000000000001" step="0.01" placeholder="ETH price" value={prices[plot.pid] || ""} onChange={(event) => setPrices((current) => ({ ...current, [plot.pid]: event.target.value }))} /><button className="btn" disabled={busy[`${keyBase}-list`]} onClick={() => run(`${keyBase}-list`, () => listParcel(signer, plot.pid, ethers.parseEther(prices[plot.pid] || "0")), "Listing confirmed.")}>{busy[`${keyBase}-list`] ? "LISTING…" : "LIST"}</button></span> : allConsented ? "Waiting for owner to list." : "Waiting for all owner consents."
            ) : listed ? `Listed for ${sale.price} ETH` : "Funded"}</span></div>

            {listed && <div className="lead"><span>3. Buyer deposit</span><i></i><span>{owner ? <button className="btn alt" disabled={busy[`${keyBase}-cancel`]} onClick={() => run(`${keyBase}-cancel`, () => cancelListing(signer, plot.pid), "Listing cancelled.")}>{busy[`${keyBase}-cancel`] ? "CANCELLING…" : "CANCEL LISTING"}</button> : <button className="btn" disabled={busy[`${keyBase}-deposit`]} onClick={() => run(`${keyBase}-deposit`, () => deposit(signer, plot.pid, sale.rawPrice), "Deposit confirmed.")}>{busy[`${keyBase}-deposit`] ? "DEPOSITING…" : `DEPOSIT ${sale.price} ETH`}</button>}</span></div>}
            {funded && <div className="lead"><span>3. Funded sale</span><i></i><span>Deadline: {countdown(sale.deadline, now)}</span></div>}
            {funded && owner && <BuyerAccessHint buyer={sale.buyer} />}
            {funded && <div className="lead"><span>4. Approvals</span><i></i><span>
              {owner && !sale.sellerOk && !deadlinePassed && <button className="btn alt" disabled={busy[`${keyBase}-seller`]} onClick={() => run(`${keyBase}-seller`, () => approveAsSeller(signer, plot.pid), "Seller approval confirmed.")}>{busy[`${keyBase}-seller`] ? "APPROVING…" : "APPROVE AS SELLER"}</button>}
              {(roles.registrar || roles.admin) && !sale.regOk && !deadlinePassed && <button className="btn" disabled={busy[`${keyBase}-registrar`]} onClick={() => run(`${keyBase}-registrar`, () => approveAsRegistrar(signer, plot.pid), sale.sellerOk ? "Sale completed" : "Registrar approval confirmed.")}>{busy[`${keyBase}-registrar`] ? "APPROVING…" : "APPROVE AS REGISTRAR"}</button>}
              {deadlinePassed && <button className="btn alt" disabled={busy[`${keyBase}-refund`]} onClick={() => run(`${keyBase}-refund`, () => refundAfterDeadline(signer, plot.pid), "Buyer refund confirmed.")}>{busy[`${keyBase}-refund`] ? "REFUNDING…" : "REFUND BUYER"}</button>}
              {sale.sellerOk && sale.regOk && <span>Sale completed</span>}
            </span></div>}
            {feedback[`${keyBase}-consent`] && <div className="note">{feedback[`${keyBase}-consent`]}</div>}
            {Object.keys(feedback).filter((key) => key.startsWith(keyBase) && feedback[key] && !key.endsWith("consent")).map((key) => <div key={key} className="note">{feedback[key]}</div>)}
            <button className="btn alt" onClick={() => onFocusPlot(plot.id)}>SHOW ON MAP</button>
          </div>
        );
      })}
      {visiblePlots.length === 0 && <p className="sub">No registered parcels are ready for a sale.</p>}
    </div>
  );
}

function BuyerAccessHint({ buyer }) {
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => {
    let active = true;
    getContracts(getReadProvider(null))?.documentAccess.encryptionKeyOf(buyer).then(key => {
      if (active) setHasKey(Boolean(key && key !== "0x"));
    }).catch(() => {});
    return () => { active = false; };
  }, [buyer]);
  return hasKey ? <div className="note">Grant the buyer document access before completing the sale.</div> : null;
}
