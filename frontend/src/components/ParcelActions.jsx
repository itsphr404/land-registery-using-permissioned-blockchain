import React, { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import {
  submitParcel,
  verifySurvey,
  approveRegistration,
  consentToSale,
  listParcel,
  deposit,
  approveAsSeller,
  approveAsRegistrar,
  withdraw,
  refundAfterDeadline,
  cancelListing,
  getStatusLabel,
  formatAddress,
} from "../lib/parcelActions";

const STATUS_LABELS = {
  0: "None",
  1: "Submitted",
  2: "Survey Verified",
  3: "Registered",
  4: "Under Sale"
};

const DEAL_STATUS_LABELS = {
  0: "None",
  1: "Listed",
  2: "Funded",
  3: "Completed",
  4: "Refunded",
  5: "Cancelled"
};

export function ParcelActions({ parcel, onRefresh }) {
  const { signer, roles, account } = useWallet();
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [formData, setFormData] = useState({});

  const handleAction = async (actionFn, ...args) => {
    if (!signer) {
      setActionError("Please connect your wallet first");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await actionFn(signer, ...args);
      setActionSuccess("Transaction confirmed!");
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Action error:", err);
      setActionError(err.reason || err.message || "Transaction failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Determine what actions this account can perform
  const isOwner = parcel.owners?.some(o => o.toLowerCase() === account?.toLowerCase());
  const isRegistrarRole = roles?.registrar;
  const isSurveyorRole = roles?.surveyor;
  const isAdminRole = roles?.admin;

  const status = parcel.status;
  const statusLabel = STATUS_LABELS[status] || "Unknown";

  // Render action buttons based on status and role
  const renderActions = () => {
    const actions = [];

    // ============ SUBMIT PARCEL (anyone, but typically owner) ============
    if (status === 0) {
      actions.push(
        <SubmitParcelForm key="submit" onSubmit={handleSubmitParcel} loading={actionLoading === "submit"} />
      );
    }

    // ============ VERIFY SURVEY (Surveyor only) ============
    if (status === 1 && isSurveyorRole) {
      actions.push(
        <button
          key="verify"
          className="btn"
          onClick={() => handleAction(verifySurvey, parcel.id)}
          disabled={actionLoading === "verify"}
        >
          Verify Survey
        </button>
      );
    }

    // ============ APPROVE REGISTRATION (Registrar only) ============
    if (status === 2 && isRegistrarRole) {
      actions.push(
        <button
          key="approve-reg"
          className="btn"
          onClick={() => handleAction(approveRegistration, parcel.id)}
          disabled={actionLoading === "approve-reg"}
        >
          Approve Registration
        </button>
      );
    }

    // ============ CONSENT TO SALE (Owner only) ============
    if (status === 3 && isOwner) {
      actions.push(
        <button
          key="consent"
          className="btn alt"
          onClick={() => handleAction(consentToSale, parcel.id)}
          disabled={actionLoading === "consent"}
        >
          Consent to Sale
        </button>
      );
    }

    // ============ LIST PARCEL (Owner only, needs all consents) ============
    if (status === 3 && isOwner) {
      actions.push(
        <ListParcelForm key="list" onSubmit={handleListParcel} loading={actionLoading === "list"} />
      );
    }

    // ============ ESCROW ACTIONS (UnderSale = 4) ============
    if (status === 4) {
      const deal = parcel.deal;
      const dealStatus = deal?.status;
      const dealStatusLabel = DEAL_STATUS_LABELS[dealStatus] || "Unknown";

      // Deposit (Buyer - not owner)
      if (dealStatus === 1 && account && deal?.buyer?.toLowerCase() === account.toLowerCase()) {
        actions.push(
          <DepositForm key="deposit" price={deal.rawPrice} onSubmit={handleDeposit} loading={actionLoading === "deposit"} />
        );
      }

      // Seller approve
      if (dealStatus === 2 && account && deal?.seller?.toLowerCase() === account.toLowerCase()) {
        actions.push(
          <button
            key="approve-seller"
            className="btn"
            onClick={() => handleAction(approveAsSeller, parcel.id)}
            disabled={actionLoading === "approve-seller"}
          >
            Approve as Seller
          </button>
        );
      }

      // Registrar approve
      if (dealStatus === 2 && isRegistrarRole) {
        actions.push(
          <button
            key="approve-registrar"
            className="btn"
            onClick={() => handleAction(approveAsRegistrar, parcel.id)}
            disabled={actionLoading === "approve-registrar"}
          >
            Approve as Registrar
          </button>
        );
      }

      // Refund after deadline (anyone)
      if (dealStatus === 2) {
        actions.push(
          <button
            key="refund"
            className="btn"
            style={{ background: "var(--red)", borderColor: "var(--red)" }}
            onClick={() => handleAction(refundAfterDeadline, parcel.id)}
            disabled={actionLoading === "refund"}
          >
            Refund After Deadline
          </button>
        );
      }

      // Cancel listing (Seller only, before deposit)
      if (dealStatus === 1 && account && deal?.seller?.toLowerCase() === account.toLowerCase()) {
        actions.push(
          <button
            key="cancel"
            className="btn"
            style={{ background: "var(--red)", borderColor: "var(--red)" }}
            onClick={() => handleAction(cancelListing, parcel.id)}
            disabled={actionLoading === "cancel"}
          >
            Cancel Listing
          </button>
        );
      }

      // Withdraw (anyone with pending balance)
      actions.push(
        <button
          key="withdraw"
          className="btn"
          style={{ background: "var(--forest)", borderColor: "var(--forest)" }}
          onClick={() => handleAction(withdraw)}
          disabled={actionLoading === "withdraw"}
        >
          Withdraw Funds
        </button>
      );
    }

    return (
      <div className="actions-panel" style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
        {actionError && <div className="alert" style={{ color: "var(--red)", font: "12px var(--mono)", marginBottom: "8px", padding: "8px", background: "rgba(154,51,38,0.1)", border: "1px solid var(--red)", borderRadius: "4px" }}>{actionError}</div>}
        {actionSuccess && <div className="alert" style={{ color: "var(--forest)", font: "12px var(--mono)", marginBottom: "8px", padding: "8px", background: "rgba(91,196,138,0.1)", border: "1px solid var(--forest)", borderRadius: "4px" }}>{actionSuccess}</div>}
        <div className="actions-grid" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {actions}
        </div>
      </div>
    );
  }

  // Handler functions
  const handleSubmitParcel = async (data) => {
    const owners = data.owners.split(",").map(o => o.trim());
    const shares = data.shares.split(",").map(s => parseInt(s.trim(), 10));
    const shareSum = shares.reduce((a, b) => a + b, 0);
    if (shareSum !== 100) throw new Error("Shares must sum to 100");
    if (owners.length !== shares.length) throw new Error("Owners and shares count mismatch");
    return handleAction(submitParcel, owners, shares, data.docHash, data.cid);
  };

  const handleListParcel = async (data) => {
    return handleAction(listParcel, parcel.id, ethers.parseEther(data.price));
  };

  const handleDeposit = async (data) => {
    return handleAction(deposit, parcel.id, data.price);
  };
}

// Sub-components for forms
function SubmitParcelForm({ onSubmit, loading }) {
  const [form, setForm] = useState({ owners: "", shares: "", docHash: "", cid: "" });
  return (
    <form className="action-form" style={{ display: "grid", gap: "10px", padding: "12px", background: "var(--sheet)", border: "1px solid var(--line)", borderRadius: "4px" }} onSubmit={e => { e.preventDefault(); onSubmit(form); }}>
      <h4 style={{ margin: "0 0 8px", font: "600 13px var(--serif)" }}>Submit New Parcel</h4>
      <div className="form-group" style={{ display: "grid", gap: "4px" }}>
        <label style={{ font: "600 11px var(--mono)", color: "var(--mute)" }}>Owners (comma-separated addresses)</label>
        <input type="text" value={form.owners} onChange={e => setForm({...form, owners: e.target.value})} placeholder="0x123...,0x456..." required style={{ background: "var(--sheet)", border: "1px solid var(--ink)", padding: "8px 10px" }} />
      </div>
      <div className="form-group" style={{ display: "grid", gap: "4px" }}>
        <label style={{ font: "600 11px var(--mono)", color: "var(--mute)" }}>Shares (comma-separated, sum=100)</label>
        <input type="text" value={form.shares} onChange={e => setForm({...form, shares: e.target.value})} placeholder="60,40" required style={{ background: "var(--sheet)", border: "1px solid var(--ink)", padding: "8px 10px" }} />
      </div>
      <div className="form-group" style={{ display: "grid", gap: "4px" }}>
        <label style={{ font: "600 11px var(--mono)", color: "var(--mute)" }}>Doc Hash</label>
        <input type="text" value={form.docHash} onChange={e => setForm({...form, docHash: e.target.value})} placeholder="0x..." required style={{ background: "var(--sheet)", border: "1px solid var(--ink)", padding: "8px 10px" }} />
      </div>
      <div className="form-group" style={{ display: "grid", gap: "4px" }}>
        <label style={{ font: "600 11px var(--mono)", color: "var(--mute)" }}>CID</label>
        <input type="text" value={form.cid} onChange={e => setForm({...form, cid: e.target.value})} placeholder="Qm..." required style={{ background: "var(--sheet)", border: "1px solid var(--ink)", padding: "8px 10px" }} />
      </div>
      <button type="submit" className="btn" disabled={loading} style={{ marginTop: "4px" }}>Submit Parcel</button>
    </form>
  );
}

function ListParcelForm({ onSubmit, loading }) {
  const [price, setPrice] = useState("");
  return (
    <form className="action-form" style={{ display: "grid", gap: "10px", padding: "12px", background: "var(--sheet)", border: "1px solid var(--line)", borderRadius: "4px" }} onSubmit={e => { e.preventDefault(); onSubmit({ price }); }}>
      <h4 style={{ margin: "0 0 8px", font: "600 13px var(--serif)" }}>List for Sale</h4>
      <div className="form-group" style={{ display: "grid", gap: "4px" }}>
        <label style={{ font: "600 11px var(--mono)", color: "var(--mute)" }}>Price (ETH)</label>
        <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="1.0" required style={{ background: "var(--sheet)", border: "1px solid var(--ink)", padding: "8px 10px" }} />
      </div>
      <button type="submit" className="btn alt" disabled={loading}>List for Sale</button>
    </form>
  );
}

function DepositForm({ price, onSubmit, loading }) {
  return (
    <form className="action-form" style={{ display: "grid", gap: "10px", padding: "12px", background: "var(--sheet)", border: "1px solid var(--line)", borderRadius: "4px" }} onSubmit={e => { e.preventDefault(); onSubmit({ price }); }}>
      <h4 style={{ margin: "0 0 8px", font: "600 13px var(--serif)" }}>Deposit {ethers.formatEther(price)} ETH</h4>
      <p style={{ margin: "0 0 8px", font: "12px var(--mono)", color: "var(--mute)" }}>Send exact amount to fund the deal.</p>
      <button type="submit" className="btn" disabled={loading}>Deposit</button>
    </form>
  );
}