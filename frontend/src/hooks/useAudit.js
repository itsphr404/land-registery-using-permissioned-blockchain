import { useCallback, useEffect, useRef, useState } from "react";
import { ADDRESS_LABELS, deployment } from "../config";
import { getReadProvider, getContracts } from "../lib/contracts";
import { queryFilterChunked } from "../lib/logs";
import { isRateLimitError, withBackoff } from "../lib/rpc";

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

export function useAudit(enabled) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const rowsRef = useRef([]);
  const lastBlockRef = useRef(null);
  const attemptsRef = useRef(0);

  const fetchEvents = useCallback(async () => {
    if (!deployment?.contracts || !enabled || attemptsRef.current >= 3) return;
    setLoading(true);
    try {
      const provider = getReadProvider(null);
      const contracts = getContracts(provider);
      if (!contracts) return;
      const deployBlock = Number(deployment.deployBlock || 0);
      if (!deployBlock && Number(deployment.chainId) !== 31337) {
        setError("Audit trail unavailable right now");
        return;
      }
      const sources = [
        ["LandRegistry", contracts.registry],
        ["TitleEscrow", contracts.escrow],
        ["DocumentAccess", contracts.documentAccess],
        ["RoleManager", contracts.roleManager],
      ];
      const fromBlock = lastBlockRef.current === null ? deployBlock : lastBlockRef.current + 1;
      const currentBlock = await withBackoff(() => provider.getBlockNumber());
      const rows = [];
      for (const [source, contract] of sources) {
        const logs = await queryFilterChunked(contract, "*", fromBlock, currentBlock);
        rows.push(...logs.map((log) => ({ source, log })));
      }
      if (fromBlock > currentBlock) {
        lastBlockRef.current = currentBlock;
        return;
      }
      const blockNumbers = [...new Set(rows.map(({ log }) => log.blockNumber))];
      const blocks = await Promise.all(blockNumbers.map((number) => withBackoff(() => provider.getBlock(number))));
      const timestamps = new Map(blocks.filter(Boolean).map((block) => [block.number, block.timestamp]));
      rowsRef.current.push(...rows.map(({ source, log }) => {
        const actor = actorFromArgs(log.args);
        const eventName = log.fragment?.name || "Event";
        const parcelId = log.args?.parcelId ? `Parcel #${log.args.parcelId}` : "";
        return {
          blockNumber: log.blockNumber,
          index: log.index,
          time: new Date(Number(timestamps.get(log.blockNumber)) * 1000).toLocaleString(),
          actor: labelFor(actor),
          text: `${eventName}${parcelId ? ` · ${parcelId}` : ""} (${source})`,
          security: eventName === "SaleCompleted" || eventName === "OwnershipTransferred",
        };
      }));
      rowsRef.current.sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index);
      setEvents(rowsRef.current);
      lastBlockRef.current = currentBlock;
      attemptsRef.current = 0;
      setError(null);
    } catch (err) {
      attemptsRef.current += 1;
      console.error("Could not load audit events:", err);
      if (attemptsRef.current >= 3) setError("Audit trail unavailable right now");
      else if (isRateLimitError(err)) setError("The network is busy. Retrying shortly.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const retry = useCallback(() => {
    attemptsRef.current = 0;
    setError(null);
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (!enabled || !deployment?.contracts) return undefined;
    fetchEvents();
  }, [enabled, fetchEvents]);

  return { events, error, loading, refresh: retry };
}
