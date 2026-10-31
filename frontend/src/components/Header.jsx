import React from "react";
import { useWallet } from "../context/WalletContext";
import { config, ADDRESS_LABELS } from "../config";
import RoleBadges from "./RoleBadges";

export default function Header() {
  const { account, status, roles, connect, error } = useWallet();

  const formattedAddress = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : null;

  const accountLabel = account ? ADDRESS_LABELS[account.toLowerCase()] : null;

  return (
    <header className="border-b border-[#2e2c26] bg-[#1a1916] sticky top-0 z-20 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#2b271d] border border-[#52452b] flex items-center justify-center font-serif text-[#d8a85c] font-bold text-lg">
            ⚑
          </div>
          <div>
            <div className="text-xl font-serif font-semibold text-[#f4efe6] tracking-tight leading-none">
              LandChain <i className="italic text-[#d8a85c] font-normal">Registry</i>
            </div>
            <div className="text-[11px] font-mono text-[#8a8475] mt-0.5">
              fraud-resilient title registry
            </div>
          </div>
        </div>

        {/* Network & Wallet Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Network Tag */}
          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#21201c] border border-[#33312b] text-xs font-mono text-[#a8a194]">
            <span className="w-2 h-2 rounded-full bg-[#4ec990]"></span>
            <span>{config.networkName}</span>
            <span className="text-[#696356]">({config.chainId})</span>
          </div>

          {/* Wallet State */}
          {status === "ready" && account ? (
            <div className="flex items-center gap-2.5 bg-[#21201c] border border-[#33312b] rounded px-3 py-1.5">
              <div className="flex flex-col items-start text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  {accountLabel ? (
                    <span className="font-bold text-[#e6dfd1]">{accountLabel}</span>
                  ) : null}
                  <span className="text-[#a8a194]">{formattedAddress}</span>
                </div>
              </div>
              <div className="h-4 w-px bg-[#38352e]"></div>
              <RoleBadges roles={roles} />
            </div>
          ) : status === "disconnected" ? (
            <button
              onClick={connect}
              className="bg-[#d8a85c] hover:bg-[#c9974c] text-[#161513] font-bold font-mono px-4 py-1.5 rounded text-xs transition uppercase tracking-wider flex items-center gap-2"
            >
              <span>Connect Wallet</span>
            </button>
          ) : status === "wrong-network" ? (
            <div className="bg-[#3b1d1d] border border-[#5c2a2a] text-[#e06c75] px-3 py-1 rounded text-xs font-mono">
              Wrong Chain
            </div>
          ) : (
            <div className="text-xs font-mono text-[#8a8475]">
              Read-Only RPC Mode
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="bg-[#2e1719] border-t border-[#4f2427] text-[#e26d75] text-xs font-mono px-4 py-1 text-center">
          {error}
        </div>
      )}
    </header>
  );
}
