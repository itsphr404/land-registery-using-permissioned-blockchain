import React, { useState, useMemo } from "react";
import ParcelCard from "./ParcelCard";
import { useParcels } from "../hooks/useParcels";
import { useWallet } from "../context/WalletContext";

export default function ParcelList() {
  const { parcels, loading, error, refresh } = useParcels();
  const { account } = useWallet();
  const [mineOnly, setMineOnly] = useState(false);

  // Compute status metrics (ledger summary inspired by terra-registry-map)
  const metrics = useMemo(() => {
    const total = parcels.length;
    const registered = parcels.filter((p) => p.status === 3).length;
    const underSale = parcels.filter((p) => p.status === 4).length;
    const surveyVerified = parcels.filter((p) => p.status === 2).length;
    const submitted = parcels.filter((p) => p.status === 1).length;
    return { total, registered, underSale, surveyVerified, submitted };
  }, [parcels]);

  // Filter parcels
  const displayedParcels = useMemo(() => {
    if (!mineOnly || !account) return parcels;
    return parcels.filter((p) =>
      p.owners.some((o) => o.toLowerCase() === account.toLowerCase())
    );
  }, [parcels, mineOnly, account]);

  return (
    <div className="space-y-6">
      {/* Overview Statistics / Ledger Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-[#1c1b17] border border-[#2d2b24] p-3 rounded-lg text-center">
          <div className="text-2xl font-bold font-mono text-[#f4efe6]">{metrics.total}</div>
          <div className="text-xs font-mono text-[#8a8475] uppercase mt-0.5">Total Parcels</div>
        </div>
        <div className="bg-[#15241c] border border-[#1d3d2c] p-3 rounded-lg text-center">
          <div className="text-2xl font-bold font-mono text-[#58b988]">{metrics.registered}</div>
          <div className="text-xs font-mono text-[#73a88c] uppercase mt-0.5">Registered</div>
        </div>
        <div className="bg-[#241f15] border border-[#42351d] p-3 rounded-lg text-center">
          <div className="text-2xl font-bold font-mono text-[#e5b567]">{metrics.underSale}</div>
          <div className="text-xs font-mono text-[#b39154] uppercase mt-0.5">On Sale</div>
        </div>
        <div className="bg-[#152229] border border-[#1b3642] p-3 rounded-lg text-center">
          <div className="text-2xl font-bold font-mono text-[#58b0d8]">{metrics.surveyVerified}</div>
          <div className="text-xs font-mono text-[#6ba4be] uppercase mt-0.5">Surveyed</div>
        </div>
        <div className="bg-[#201f26] border border-[#353342] p-3 rounded-lg text-center">
          <div className="text-2xl font-bold font-mono text-[#a8a1b8]">{metrics.submitted}</div>
          <div className="text-xs font-mono text-[#827d91] uppercase mt-0.5">Submitted</div>
        </div>
      </div>

      {/* Action and Filter Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-[#2b2923]">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-serif font-medium text-[#f4efe6]">
            Parcel Registry <span className="font-mono text-sm text-[#8a8475]">({displayedParcels.length})</span>
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Mine Only Toggle */}
          <button
            onClick={() => setMineOnly((prev) => !prev)}
            disabled={!account}
            className={`px-3 py-1.5 rounded text-xs font-mono transition border flex items-center gap-2 ${
              !account
                ? "opacity-40 cursor-not-allowed bg-[#1f1e1a] border-[#2c2a24] text-[#8a8475]"
                : mineOnly
                ? "bg-[#d8a85c] text-[#161513] border-[#d8a85c] font-bold"
                : "bg-[#1f1e1a] text-[#c2bcaf] border-[#38352e] hover:border-[#4d493f]"
            }`}
            title={!account ? "Connect wallet to view your parcels" : undefined}
          >
            <span>Mine Only</span>
            {account && mineOnly && <span>✓</span>}
          </button>

          {/* Refresh Button */}
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 rounded text-xs font-mono bg-[#1f1e1a] text-[#c2bcaf] border border-[#38352e] hover:border-[#4d493f] transition flex items-center gap-1.5"
          >
            <span className={loading ? "animate-spin" : ""}>↻</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Network / Contract Error Banner */}
      {error && (
        <div className="p-4 rounded-lg bg-[#2e1719] border border-[#4f2427] text-[#f8b4b4] text-sm font-mono flex items-start gap-3">
          <span className="text-lg">⚠</span>
          <div>
            <div className="font-bold">Registry Connection Issue</div>
            <div className="text-xs mt-1 text-[#e2a8ab]">{error}</div>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-[#292722] bg-[#1a1916] p-5 space-y-4 animate-pulse"
            >
              <div className="flex justify-between items-center">
                <div className="h-5 w-16 bg-[#2b2823] rounded"></div>
                <div className="h-5 w-24 bg-[#2b2823] rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 w-32 bg-[#2b2823] rounded"></div>
                <div className="h-8 w-full bg-[#24221d] rounded"></div>
              </div>
              <div className="h-4 w-20 bg-[#2b2823] rounded"></div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && displayedParcels.length === 0 && (
        <div className="text-center py-16 px-4 border border-dashed border-[#333028] rounded-lg bg-[#191815]">
          <div className="font-serif text-xl text-[#a8a194] italic mb-2">No parcels found</div>
          <p className="text-xs font-mono text-[#696356] max-w-sm mx-auto">
            {mineOnly
              ? "You do not own any registered parcels on this network."
              : "No parcels recorded yet. Deploy contracts and seed demo parcels using `npm run seed`."}
          </p>
        </div>
      )}

      {/* Parcel Cards Grid */}
      {!loading && displayedParcels.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedParcels.map((parcel) => (
            <ParcelCard key={parcel.id} parcel={parcel} />
          ))}
        </div>
      )}
    </div>
  );
}
