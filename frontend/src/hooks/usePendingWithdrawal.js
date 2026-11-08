import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { deployment } from "../config";
import { getReadProvider, getContracts } from "../lib/contracts";

export function usePendingWithdrawal(account) {
  const [amount, setAmount] = useState(0n);
  const refresh = useCallback(async () => {
    if (!account || !deployment?.contracts) {
      setAmount(0n);
      return;
    }
    try {
      const { escrow } = getContracts(getReadProvider(null));
      setAmount(await escrow.pendingWithdrawals(account));
    } catch (error) {
      console.warn("Could not read pending withdrawal:", error);
    }
  }, [account]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { amount, formatted: ethers.formatEther(amount), refresh };
}
