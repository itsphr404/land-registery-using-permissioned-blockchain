import React from "react";
import { useWallet } from "../context/WalletContext";
import { config } from "../config";

export default function NetworkBanner() {
  const { status, chainId, switchNetwork, connect } = useWallet();

  if (status === "wrong-network") {
    return (
      <div className="bg-[#381c1c] border-b border-[#5e2b2b] text-[#f8b4b4] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#e06c75]">⚠ WRONG NETWORK:</span>
          <span>
            Connected to Chain ID <code>{chainId}</code>. Switch to{" "}
            <strong>{config.networkName}</strong> (Chain ID: <code>{config.chainId}</code>) to interact.
          </span>
        </div>
        <button
          onClick={switchNetwork}
          className="bg-[#e06c75] hover:bg-[#d05963] text-[#161513] font-bold px-3 py-1 rounded text-xs uppercase tracking-wider"
        >
          Switch to Hardhat (31337)
        </button>
      </div>
    );
  }

  return null;
}
