import React from "react";
import StatusBadge from "./StatusBadge";
import ParcelActions from "./ParcelActions";
import { ADDRESS_LABELS } from "../config";
import { useWallet } from "../context/WalletContext";

export default function ParcelCard({ parcel, onRefresh }) {
  const { account } = useWallet();

  const isMine =
    Boolean(account) &&
    parcel.owners.some((o) => o.toLowerCase() === account.toLowerCase());

  const formatOwner = (ownerAddress) => {
    const lower = ownerAddress.toLowerCase();
    const label = ADDRESS_LABELS[lower];
    const shortened = `${ownerAddress.slice(0, 6)}...${ownerAddress.slice(-4)}`;
    const isCurrent = account && lower === account.toLowerCase();

    return (
      <span key={ownerAddress} className="inline-flex items-center gap-1.5 font-mono text-xs">
        <span className={isCurrent ? "font-bold text-[#e5b567]" : "text-[#e2dbce]"}>
          {label || shortened}
        </span>
        {isCurrent && (
          <span className="bg-[#382d16] text-[#e5b567] border border-[#59441c] text-[10px] px-1 rounded uppercase font-bold tracking-tight">
            you
          </span>
        )}
      </span>
    );
  };

  const deal = parcel.deal;

  return (
    <div
      className={`rounded-lg border p-5 flex flex-col justify-between transition ${
        isMine
          ? "border-[#d8a85c] bg-[#1e1c17] shadow-lg shadow-[#d8a85c]/5"
          : "border-[#2c2a24] bg-[#1a1916] hover:border-[#3d3a33]"
      }`}
    >
      <div>
        {/* Top bar: ID and Status */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#292722]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#8a8475] uppercase tracking-wider">ID</span>
            <span className="font-mono font-bold text-lg text-[#f4efe6]">#{parcel.id}</span>
          </div>
          <StatusBadge status={parcel.status} />
        </div>

        {/* Owners & Shares */}
        <div className="py-3 space-y-2">
          <div className="text-xs font-mono text-[#8a8475] uppercase tracking-wider">
            Owners & Allocation ({parcel.owners.length})
          </div>
          <div className="space-y-1.5">
            {parcel.owners.map((ownerAddr, idx) => (
              <div
                key={ownerAddr + idx}
                className="flex items-center justify-between text-xs bg-[#21201c] px-2.5 py-1.5 rounded border border-[#2b2923]"
              >
                <div>{formatOwner(ownerAddr)}</div>
                <div className="font-mono font-semibold text-[#8a8475]">
                  {parcel.shares[idx]}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Metadata info: Versions */}
        <div className="flex items-center justify-between text-xs font-mono text-[#8a8475] pt-1">
          <span>Audit History</span>
          <span className="text-[#a8a194] bg-[#21201c] px-2 py-0.5 rounded border border-[#2b2923]">
            {parcel.versionsCount} {parcel.versionsCount === 1 ? "version" : "versions"}
          </span>
        </div>
      </div>

      {/* Sale & Escrow Panel (for UnderSale parcels) */}
      {parcel.status === 4 && parcel.deal && (
        <div className="mt-4 pt-3 border-t border-[#3b3420] bg-[#232018] -mx-5 -mb-5 p-4 rounded-b-lg space-y-2.5 border-dashed">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#d8a85c] font-semibold uppercase tracking-wider">
              Escrow Deal
            </span>
            <span className="font-mono text-sm font-bold text-[#f4efe6]">
              {parcel.deal.price} ETH
            </span>
          </div>

          {/* Deal Status & Buyer */}
          <div className="text-xs font-mono bg-[#1a1813] p-2 rounded border border-[#3b3420] space-y-1">
            <div className="flex justify-between">
              <span className="text-[#8a8475]">Buyer:</span>
              <span>
                {parcel.deal.status === 2 ? (
                  <span className="text-[#f4efe6] font-semibold">
                    {ADDRESS_LABELS[parcel.deal.buyer.toLowerCase()] || `${parcel.deal.buyer.slice(0, 6)}...`}
                  </span>
                ) : (
                  <span className="text-[#d8a85c] italic">Waiting for buyer deposit</span>
                )}
              </span>
            </div>

            {parcel.deal.deadline && (
              <div className="flex justify-between">
                <span className="text-[#8a8475]">Deadline:</span>
                <span className="text-[#a8a194]">
                  {parcel.deal.deadline.toLocaleDateString()} {parcel.deal.deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>

          {/* Approvals Checklist */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div
              className={`p-1.5 rounded border flex items-center justify-between ${
                parcel.deal.sellerApproved
                  ? "bg-[#16261f] border-[#204533] text-[#58b988]"
                  : "bg-[#1c1b18] border-[#302d26] text-[#736d61]"
              }`}
            >
              <span>Seller:</span>
              <span className="font-bold">{parcel.deal.sellerApproved ? "✓ Signed" : "… Pending"}</span>
            </div>
            <div
              className={`p-1.5 rounded border flex items-center justify-between ${
                parcel.deal.registrarApproved
                  ? "bg-[#16261f] border-[#204533] text-[#58b988]"
                  : "bg-[#1c1b18] border-[#302d26] text-[#736d61]"
              }`}
            >
              <span>Registrar:</span>
              <span className="font-bold">{parcel.deal.registrarApproved ? "✓ Signed" : "… Pending"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions Panel - integrated write actions */}
      <ParcelActions parcel={parcel} onRefresh={() => {}} />
    </div>
  );
}
