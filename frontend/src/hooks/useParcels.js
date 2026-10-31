import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { deployment } from "../config";
import { getReadProvider, getContracts } from "../lib/contracts";
import { useWallet } from "../context/WalletContext";

const STATUS_LABELS = {
  0: "None",
  1: "Submitted",
  2: "Survey Verified",
  3: "Registered",
  4: "Under Sale"
};

export function useParcels() {
  const { walletProvider } = useWallet();
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const listenersRef = useRef([]);

  const fetchParcels = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!deployment || !deployment.contracts) {
      setError("Contracts not found for this network. Run the deploy script.");
      setLoading(false);
      return;
    }

    try {
      const provider = getReadProvider(walletProvider);
      const contracts = getContracts(provider);

      if (!contracts) {
        setError("Contracts not found for this network. Run the deploy script.");
        setLoading(false);
        return;
      }

      const { registry, escrow } = contracts;

      let countBig;
      try {
        countBig = await registry.parcelCount();
      } catch (err) {
        console.error("RPC / ParcelCount error:", err);
        setError("Cannot reach the network. Is the Hardhat node running?");
        setLoading(false);
        return;
      }

      const count = Number(countBig);
      const items = [];

      for (let id = 1; id <= count; id++) {
        try {
          const statusBig = await registry.getStatus(id);
          const statusCode = Number(statusBig);

          const [owners, sharesBig] = await registry.getOwners(id);
          const shares = sharesBig.map((s) => Number(s));

          const vCountBig = await registry.versionCount(id);
          const versionsCount = Number(vCountBig);

          let latestDocHash = null;
          let latestCid = null;
          if (versionsCount > 0) {
            try {
              const latestVer = await registry.getVersion(id, versionsCount - 1);
              latestDocHash = latestVer.docHash;
              latestCid = latestVer.cid;
            } catch (e) {
              // Non-blocking if version fetch fails
            }
          }

          let deal = null;
          if (statusCode === 4) {
            // UnderSale
            try {
              const d = await escrow.getDeal(id);
              deal = {
                seller: d.seller,
                buyer: d.buyer,
                price: ethers.formatEther(d.price),
                rawPrice: d.price,
                deadline: Number(d.deadline) > 0 ? new Date(Number(d.deadline) * 1000) : null,
                sellerApproved: d.sellerApproved,
                registrarApproved: d.registrarApproved,
                status: Number(d.status), // 0: None, 1: Listed, 2: Funded
              };
            } catch (e) {
              console.warn(`Could not read deal for parcel ${id}:`, e);
            }
          }

          items.push({
            id,
            status: statusCode,
            statusLabel: STATUS_LABELS[statusCode] || "Unknown",
            owners,
            shares,
            versionsCount,
            latestDocHash,
            latestCid,
            deal,
          });
        } catch (parcelErr) {
          console.warn(`Error reading parcel ${id}:`, parcelErr);
        }
      }

      setParcels(items);
    } catch (err) {
      console.error("General error loading parcels:", err);
      setError("Cannot reach the network. Is the Hardhat node running?");
    } finally {
      setLoading(false);
    }
  }, [walletProvider]);

  // Set up event listeners for real-time updates
  useEffect(() => {
    if (!walletProvider || !deployment?.contracts) return;

    const provider = getReadProvider(walletProvider);
    const contracts = getContracts(provider);
    if (!contracts) return;

    const { registry, escrow } = contracts;

    const cleanup = () => {
      listenersRef.current.forEach(({ contract, event, handler }) => {
        contract.off(event, handler);
      });
      listenersRef.current = [];
    };

    const handleParcelUpdate = (parcelId) => {
      // Refetch just this parcel
      refreshParcel(parcelId);
    };

    // LandRegistry events
    const onParcelSubmitted = (parcelId, submitter, docHash, cid) => {
      console.log("ParcelSubmitted:", parcelId, submitter);
      handleParcelUpdate(parcelId);
    };
    const onParcelRegistered = (parcelId, registrar) => handleParcelUpdate(parcelId);
    const onParcelLocked = (parcelId, lister) => handleParcelUpdate(parcelId);
    const onParcelUnlocked = (parcelId) => handleParcelUpdate(parcelId);
    const onSurveyVerified = (parcelId, surveyor) => handleParcelUpdate(parcelId);
    const onSaleConsentGiven = (parcelId, owner) => handleParcelUpdate(parcelId);
    const onOwnershipTransferred = (parcelId, newOwner, versionIndex) => handleParcelUpdate(parcelId);
    const onParcelUnlocked2 = (parcelId) => handleParcelUpdate(parcelId);

    // TitleEscrow events
    const onApproved = (parcelId, approver, isSeller) => handleParcelUpdate(parcelId);
    const onDeposited = (parcelId, buyer, amount, deadline) => handleParcelUpdate(parcelId);
    const onSaleCompleted = (parcelId, seller, buyer, price) => handleParcelUpdate(parcelId);
    const onWithdrawn = (account, amount) => fetchParcels(); // Refresh all since we don't know which parcel
    const onRefunded = (parcelId, buyer, amount) => handleParcelUpdate(parcelId);
    const onListed = (parcelId, seller, price) => handleParcelUpdate(parcelId);
    const onListingCancelled = (parcelId) => handleParcelUpdate(parcelId);

    try {
      registry.on("ParcelSubmitted", onParcelSubmitted);
      listenersRef.current.push({ contract: registry, event: "ParcelSubmitted", handler: onParcelSubmitted });
      registry.on("ParcelRegistered", onParcelRegistered);
      listenersRef.current.push({ contract: registry, event: "ParcelRegistered", handler: onParcelRegistered });
      registry.on("ParcelLocked", onParcelLocked);
      listenersRef.current.push({ contract: registry, event: "ParcelLocked", handler: onParcelLocked });
      registry.on("ParcelUnlocked", onParcelUnlocked);
      listenersRef.current.push({ contract: registry, event: "ParcelUnlocked", handler: onParcelUnlocked });
      registry.on("SurveyVerified", onSurveyVerified);
      listenersRef.current.push({ contract: registry, event: "SurveyVerified", handler: onSurveyVerified });
      registry.on("SaleConsentGiven", onSaleConsentGiven);
      listenersRef.current.push({ contract: registry, event: "SaleConsentGiven", handler: onSaleConsentGiven });
      registry.on("OwnershipTransferred", onOwnershipTransferred);
      listenersRef.current.push({ contract: registry, event: "OwnershipTransferred", handler: onOwnershipTransferred });

      escrow.on("Approved", onApproved);
      listenersRef.current.push({ contract: escrow, event: "Approved", handler: onApproved });
      escrow.on("Deposited", onDeposited);
      listenersRef.current.push({ contract: escrow, event: "Deposited", handler: onDeposited });
      escrow.on("SaleCompleted", onSaleCompleted);
      listenersRef.current.push({ contract: escrow, event: "SaleCompleted", handler: onSaleCompleted });
      escrow.on("Withdrawn", onWithdrawn);
      listenersRef.current.push({ contract: escrow, event: "Withdrawn", handler: onWithdrawn });
      escrow.on("Refunded", onRefunded);
      listenersRef.current.push({ contract: escrow, event: "Refunded", handler: onRefunded });
      escrow.on("Listed", onListed);
      listenersRef.current.push({ contract: escrow, event: "Listed", handler: onListed });
      escrow.on("ListingCancelled", onListingCancelled);
      listenersRef.current.push({ contract: escrow, event: "ListingCancelled", handler: onListingCancelled });
    } catch (e) {
      console.warn("Could not attach event listeners:", e);
    }

    return cleanup;
  }, [walletProvider, fetchParcels]);

  const refreshParcel = useCallback(async (parcelId) => {
    if (!deployment?.contracts) return;
    try {
      const provider = getReadProvider(walletProvider);
      const contracts = getContracts(provider);
      if (!contracts) return;

      const { registry, escrow } = contracts;
      const id = Number(parcelId);

      const statusBig = await registry.getStatus(id);
      const statusCode = Number(statusBig);

      const [owners, sharesBig] = await registry.getOwners(id);
      const shares = sharesBig.map((s) => Number(s));

      const vCountBig = await registry.versionCount(id);
      const versionsCount = Number(vCountBig);

      let latestDocHash = null;
      let latestCid = null;
      if (versionsCount > 0) {
        try {
          const latestVer = await registry.getVersion(id, versionsCount - 1);
          latestDocHash = latestVer.docHash;
          latestCid = latestVer.cid;
        } catch (e) { }
      }

      let deal = null;
      if (statusCode === 4) {
        try {
          const d = await escrow.getDeal(id);
          deal = {
            seller: d.seller,
            buyer: d.buyer,
            price: ethers.formatEther(d.price),
            rawPrice: d.price,
            deadline: Number(d.deadline) > 0 ? new Date(Number(d.deadline) * 1000) : null,
            sellerApproved: d.sellerApproved,
            registrarApproved: d.registrarApproved,
            status: Number(d.status),
          };
        } catch (e) { }
      }

      setParcels(prev => prev.map(p => p.id === id ? {
        ...p,
        status: statusCode,
        statusLabel: STATUS_LABELS[statusCode] || "Unknown",
        owners,
        shares: shares.map(s => Number(s)),
        versionsCount,
        latestDocHash,
        latestCid,
        deal,
      } : p));
    } catch (err) {
      console.warn(`Error refreshing parcel ${parcelId}:`, err);
    }
  }, [walletProvider]);

  useEffect(() => {
    fetchParcels();
  }, [fetchParcels]);

  return { parcels, loading, error, refresh: fetchParcels };
}
