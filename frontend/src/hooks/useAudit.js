import { useCallback, useEffect, useState } from "react";
import { ADDRESS_LABELS, deployment } from "../config";
import { getReadProvider, getContracts } from "../lib/contracts";
import { queryFilterChunked } from "../lib/logs";

function actorFromArgs(args) {
  const keys = ["submitter", "surveyor", "registrar", "owner", "lister", "approver", "buyer", "account", "newOwner"];
  for (const key of keys) {
    if (args?.[key]) return args[key];
  }
  return null;
}

function labelFor(address) {
  if (!address) return "System";
  return ADDRESS_LABELS[address.toLowerCase()] || `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function useAudit() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  const fetchEvents = useCallback(async () => {
    if (!deployment?.contracts) return;
    try {
      const provider = getReadProvider(null);
      const contracts = getContracts(provider);
      const sources = [
        ["LandRegistry", contracts.registry],
        ["TitleEscrow", contracts.escrow],
      ];
      const rows = [];
      for (const [source, contract] of sources) {
        const logs = await queryFilterChunked(contract, {}, deployment.deployBlock, "latest");
        rows.push(...logs.map((log) => ({ source, log })));
      }
      const blockNumbers = [...new Set(rows.map(({ log }) => log.blockNumber))];
      const blocks = await Promise.all(blockNumbers.map((number) => provider.getBlock(number)));
      const timestamps = new Map(blocks.map((block) => [block.number, block.timestamp]));
      rows.sort((a, b) => b.log.blockNumber - a.log.blockNumber || b.log.index - a.log.index);
      setEvents(rows.map(({ source, log }) => {
        const actor = actorFromArgs(log.args);
        const eventName = log.fragment?.name || "Event";
        const parcelId = log.args?.parcelId ? `Parcel #${log.args.parcelId}` : "";
        return {
          time: new Date(Number(timestamps.get(log.blockNumber)) * 1000).toLocaleString(),
          actor: labelFor(actor),
          text: `${eventName}${parcelId ? ` · ${parcelId}` : ""} (${source})`,
          security: eventName === "SaleCompleted" || eventName === "OwnershipTransferred",
        };
      }));
      setError(null);
    } catch (err) {
      console.error("Could not load audit events:", err);
      setError("Audit events are unavailable while the node is offline.");
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const timer = setInterval(fetchEvents, 1000);
    return () => clearInterval(timer);
  }, [fetchEvents]);

  return { events, error, refresh: fetchEvents };
}
