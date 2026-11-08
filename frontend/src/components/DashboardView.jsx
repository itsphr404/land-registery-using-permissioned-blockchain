import React, { useMemo, useState } from "react";
import { ethers } from "ethers";
import { ST } from "../lib/mapData";
import { useWallet } from "../context/WalletContext";
import { approveRegistration, getWriteContracts, grantRole, verifySurvey } from "../lib/parcelActions";
import { friendlyError } from "../lib/errors";
import OwedBox from "./OwedBox";
import KeyVault from "./KeyVault";
import NetworkContractsPanel from "./NetworkContractsPanel";

const ROLE_NAMES = {
  Registrar: "REGISTRAR_ROLE",
  Surveyor: "SURVEYOR_ROLE",
  Court: "COURT_ROLE",
  Issuer: "ISSUER_ROLE",
};

export default function DashboardView({ plots, auditEvents, onSelectView, onConfirmed, owed, onOwedConfirmed }) {
  const { roles, signer } = useWallet();
  const [busy, setBusy] = useState({});
  const [feedback, setFeedback] = useState("");
  const [grantAddress, setGrantAddress] = useState("");
  const [grantRoleName, setGrantRoleName] = useState("Registrar");

  const activeRoleName = roles.registrar ? "Registrar" : roles.surveyor ? "Surveyor" : roles.court ? "Court officer" : roles.admin ? "Administrator" : "Citizen";
  const counts = useMemo(() => ({
    approved: plots.filter((p) => p.st === "approved").length,
    sale: plots.filter((p) => p.st === "sale").length,
    disputed: plots.filter((p) => p.st === "disputed").length,
    court: plots.filter((p) => p.st === "court").length,
    pending: plots.filter((p) => p.st === "pending").length,
  }), [plots]);

  async function runAction(key, action) {
    setBusy((current) => ({ ...current, [key]: true }));
    setFeedback("");
    try {
      await action();
      onConfirmed();
      setFeedback("Action confirmed.");
    } catch (error) {
      const contracts = signer ? getWriteContracts(signer) : null;
      setFeedback(friendlyError(error, contracts ? [contracts.registry.interface, contracts.roleManager.interface] : []));
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  }

  async function handleGrant(event) {
    event.preventDefault();
    if (!signer || !ethers.isAddress(grantAddress)) {
      setFeedback("Enter a valid address and connect an administrator wallet.");
      return;
    }
    await runAction("grant", async () => {
      const { roleManager } = getWriteContracts(signer);
      const role = await roleManager[ROLE_NAMES[grantRoleName]]();
      await grantRole(signer, role, grantAddress);
    });
    setGrantAddress("");
  }

  const queueItems = [];
  if (roles.surveyor) plots.filter((plot) => plot.sub === "survey").slice(0, 4).forEach((plot) => {
    const key = `survey-${plot.pid}`;
    queueItems.push({
      title: `${plot.id} awaiting boundary survey`,
      action: <button className="btn alt" disabled={busy[key]} onClick={() => runAction(key, () => verifySurvey(signer, plot.pid))}>{busy[key] ? "VERIFYING…" : "VERIFY SURVEY"}</button>,
    });
  });
  if (roles.registrar) plots.filter((plot) => plot.sub === "registrar").slice(0, 4).forEach((plot) => {
    const key = `registration-${plot.pid}`;
    queueItems.push({
      title: `${plot.id} awaiting registrar sign-off`,
      action: <button className="btn" disabled={busy[key]} onClick={() => runAction(key, () => approveRegistration(signer, plot.pid))}>{busy[key] ? "APPROVING…" : "APPROVE REGISTRATION"}</button>,
    });
  });
  plots.filter((plot) => plot.sale && (!plot.sale.sellerOk || !plot.sale.regOk)).slice(0, 2).forEach((plot) => {
    queueItems.push({ title: `${plot.id} escrow sale requires dual approval`, action: <button className="btn alt" onClick={() => onSelectView("sales")}>OPEN SALES</button> });
  });

  return (
    <div>
      <h1 className="page-title">The registry at <i>a glance</i></h1>
      <NetworkContractsPanel />
      <OwedBox amount={owed} onConfirmed={onOwedConfirmed} />
      <KeyVault />
      <div className="ledger">{Object.keys(ST).map((stKey) => <div key={stKey}><b>{counts[stKey] || 0}</b><span>{ST[stKey][0]}</span></div>)}</div>
      <button className="btn alt" style={{ margin: "10px 0 20px" }} onClick={() => onSelectView("map")}>OPEN THE MAP</button>

      <div className="k">Your queue · {activeRoleName}</div>
      {queueItems.length ? queueItems.map((item, index) => <div key={index} className="ev" style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}><span>{item.title}</span><span>{item.action}</span></div>) : <p className="sub">Nothing waiting for this role.</p>}
      {feedback && <div className="note">{feedback}</div>}

      {roles.admin && (
        <form className="f" onSubmit={handleGrant}>
          <div className="k">Grant role</div>
          <input value={grantAddress} onChange={(event) => setGrantAddress(event.target.value)} placeholder="0x wallet address" aria-label="Role recipient address" />
          <select value={grantRoleName} onChange={(event) => setGrantRoleName(event.target.value)}>
            {Object.keys(ROLE_NAMES).map((role) => <option key={role}>{role}</option>)}
          </select>
          <button className="btn" disabled={busy.grant}>{busy.grant ? "GRANTING…" : "GRANT ROLE"}</button>
        </form>
      )}

      <div className="k">Recent activity</div>
      {auditEvents.slice(0, 6).map((event, index) => <div key={index} className="ev"><time>{event.time}</time><span>{event.actor} · {event.text}</span></div>)}
    </div>
  );
}
