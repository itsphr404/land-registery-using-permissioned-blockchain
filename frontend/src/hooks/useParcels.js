import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { ADDRESS_LABELS, config, deployment } from "../config";
import { getReadProvider, getContracts } from "../lib/contracts";
import { cellPts } from "../lib/mapData";
import { queryFilterChunked } from "../lib/logs";

const STATUS = {
  1: { st: "pending", sub: "survey" },
  2: { st: "pending", sub: "registrar" },
  3: { st: "approved", sub: null },
  4: { st: "sale", sub: null },
};

function metadataForNetwork() {
  if (typeof window === "undefined") return {};
  try {
    const local = JSON.parse(window.localStorage.getItem(`terra-meta:${config.chainId}`) || "{}");
    return local && typeof local === "object" ? local : {};
  } catch (error) {
    console.warn("Ignoring invalid local parcel metadata:", error);
    return {};
  }
}

function nextFreeCell(area, metadata, reserved) {
  const used = new Set(
    Object.values(metadata)
      .filter((item) => item?.area === area && Number.isInteger(Number(item.cell)))
      .map((item) => Number(item.cell))
  );
  reserved.forEach((cell) => used.add(cell));
  let cell = 0;
  while (used.has(cell)) cell += 1;
  return cell;
}

function labelFor(address) {
  const lower = address.toLowerCase();
  return ADDRESS_LABELS[lower] || `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function useParcels() {
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const listenersRef = useRef([]);
  const timerRef = useRef(null);

  const fetchParcels = useCallback(async () => {
    if (!deployment?.contracts) {
      setError("Contracts not found for this network. Run the deploy script.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const contracts = getContracts(getReadProvider(null));
      if (!contracts) throw new Error("Contract deployment is unavailable.");
      const { registry, escrow } = contracts;
      const metadata = metadataForNetwork();
      const count = Number(await registry.parcelCount());
      const reservedCells = {};

      const items = await Promise.all(
        Array.from({ length: count }, (_, index) => index + 1).map(async (pid) => {
          const [statusValue, ownerData, versionCount] = await Promise.all([
            registry.getStatus(pid),
            registry.getOwners(pid),
            registry.versionCount(pid),
          ]);
          const status = Number(statusValue);
          const info = STATUS[status] || { st: "pending", sub: null };
          const meta = metadata[String(pid)] || {};
          const area = meta.area || "Unmapped";
          reservedCells[area] ||= new Set();
          const cell = Number.isInteger(Number(meta.cell))
            ? Number(meta.cell)
            : nextFreeCell(area, metadata, reservedCells[area]);
          reservedCells[area].add(cell);
          const addr = meta.addr || `Parcel #${pid}`;
          const size = meta.size || "Unknown";
          const latest = Number(versionCount) > 0
            ? await registry.getVersion(pid, Number(versionCount) - 1)
            : null;
          const docHash = latest?.docHash || null;
          const cid = latest?.cid || "";
          const expectedHash = ethers.id(JSON.stringify([area, addr, size]));
          const currentRound = Number(await registry.consentRound(pid));
          const ownerAddresses = ownerData[0];
          const consented = status === 3
            ? await Promise.all(ownerAddresses.map((owner) => registry.consented(pid, currentRound, owner)))
            : ownerAddresses.map(() => false);
          let sale = null;
          if (status === 4) {
            const deal = await escrow.getDeal(pid);
            sale = {
              buyer: deal.buyer,
              buyerLabel: labelFor(deal.buyer),
              seller: deal.seller,
              price: ethers.formatEther(deal.price),
              rawPrice: deal.price,
              deadline: Number(deal.deadline) > 0 ? new Date(Number(deal.deadline) * 1000) : null,
              funded: Number(deal.status) === 2,
              sellerOk: deal.sellerApproved,
              regOk: deal.registrarApproved,
              status: Number(deal.status),
            };
          }
          return {
            id: `TR-${area.slice(0, 3).toUpperCase()}-${String(pid).padStart(3, "0")}`,
            pid,
            st: info.st,
            sub: info.sub,
            area,
            addr,
            size,
            cell,
            pts: cellPts(area, cell, pid),
            owners: ownerAddresses.map((address, ownerIndex) => ({
              addr: address,
              share: Number(ownerData[1][ownerIndex]),
              label: labelFor(address),
              consented: Boolean(consented[ownerIndex]),
            })),
            docHash,
            cid,
            metaOk: Boolean(docHash && docHash.toLowerCase() === expectedHash.toLowerCase()),
            sale,
            status,
            statusLabel: status === 1 ? "Pending" : status === 2 ? "Pending" : status === 3 ? "Approved" : status === 4 ? "On sale" : "Unknown",
          };
        })
      );
      setParcels(items);
    } catch (err) {
      console.error("General error loading parcels:", err);
      setError(`Cannot reach the ${config.networkName} network.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const provider = getReadProvider(null);
    const contracts = getContracts(provider);
    if (!contracts) {
      fetchParcels();
      return undefined;
    }

    const scheduleFetch = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fetchParcels, 500);
    };
    const subscriptions = [
      [contracts.registry, "ParcelSubmitted"],
      [contracts.registry, "ParcelRegistered"],
      [contracts.registry, "ParcelLocked"],
      [contracts.registry, "ParcelUnlocked"],
      [contracts.registry, "SurveyVerified"],
      [contracts.registry, "SaleConsentGiven"],
      [contracts.registry, "OwnershipTransferred"],
      [contracts.escrow, "Approved"],
      [contracts.escrow, "Deposited"],
      [contracts.escrow, "SaleCompleted"],
      [contracts.escrow, "Withdrawn"],
      [contracts.escrow, "Refunded"],
      [contracts.escrow, "Listed"],
      [contracts.escrow, "ListingCancelled"],
    ];
    const isLocal = config.chainId === 31337;
    let pollTimer;
    let lastBlock;
    const refreshFromEvents = async () => {
      const eventQueries = subscriptions.map(([contract, event]) => queryFilterChunked(
        contract,
        contract.filters[event] ? contract.filters[event]() : {},
        deployment.deployBlock,
        "latest"
      ));
      await Promise.all(eventQueries);
      scheduleFetch();
    };
    if (isLocal) {
      subscriptions.forEach(([contract, event]) => contract.on(event, scheduleFetch));
    } else {
      pollTimer = setInterval(async () => {
        const block = await provider.getBlockNumber();
        if (block !== lastBlock) {
          lastBlock = block;
          await refreshFromEvents();
        }
      }, 15000);
    }
    fetchParcels();

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(pollTimer);
      if (isLocal) subscriptions.forEach(([contract, event]) => contract.off(event, scheduleFetch));
      listenersRef.current = [];
    };
  }, [fetchParcels]);

  return { parcels, loading, error, refresh: fetchParcels };
}
