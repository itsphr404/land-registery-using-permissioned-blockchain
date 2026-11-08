import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { getWriteContracts, withdraw } from "../lib/parcelActions";
import { friendlyError } from "../lib/errors";

export default function OwedBox({ amount, onConfirmed }) {
  const { signer } = useWallet();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleWithdraw() {
    if (!signer) {
      setMessage("Connect a wallet on the configured network first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await withdraw(signer);
      setMessage("Withdrawal confirmed.");
      onConfirmed();
    } catch (error) {
      const contracts = getWriteContracts(signer);
      setMessage(friendlyError(error, [contracts.escrow.interface]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="note" style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
      <span>You are owed <strong>{amount} ETH</strong></span>
      {Number(amount) > 0 && <button className="btn alt" disabled={busy} onClick={handleWithdraw}>{busy ? "WITHDRAWING…" : "WITHDRAW"}</button>}
      {message && <span>{message}</span>}
    </div>
  );
}
