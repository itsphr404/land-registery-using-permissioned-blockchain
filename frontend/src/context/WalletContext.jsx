import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { config, deployment } from "../config";
import { getContracts } from "../lib/contracts";

/**
 * Derive role from the deployment accounts list based on wallet address.
 * This is a fast fallback that works even if the Hardhat node is offline.
 */
function getRoleFromDeployment(account) {
  if (!account || !deployment || !Array.isArray(deployment.accounts)) {
    return null; // unknown
  }
  const addr = account.toLowerCase();
  const match = deployment.accounts.find(
    (a) => a.address && a.address.toLowerCase() === addr
  );
  if (!match) return null;
  const label = (match.label || "").toLowerCase();
  if (label === "admin") return "admin";
  if (label === "registrar") return "registrar";
  if (label === "surveyor") return "surveyor";
  if (label === "court") return "court";
  if (label === "issuer") return "issuer";
  return null; // e.g. Alice, Bob, Carol → citizen
}

const WalletContext = createContext(null);

function getInjectedProvider() {
  if (typeof window === "undefined") return null;
  if (window.ethereum) return window.ethereum;
  if (window.phantom?.ethereum) return window.phantom.ethereum;
  return null;
}

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [status, setStatus] = useState("disconnected");
  const [signer, setSigner] = useState(null);
  const [walletProvider, setWalletProvider] = useState(null);
  const [roles, setRoles] = useState({
    admin: false,
    registrar: false,
    surveyor: false,
    court: false,
    issuer: false,
    citizen: true,
  });
  const [error, setError] = useState(null);

  // Switch network action
  const switchNetwork = useCallback(async () => {
    setError(null);
    const eth = getInjectedProvider();
    if (!eth) return;

    const hexChainId = "0x" + config.chainId.toString(16);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
      setStatus("ready");
    } catch (switchError) {
      console.warn("Switch network error:", switchError);
      // Code 4902 or unrecognized chain
      if (
        switchError.code === 4902 ||
        switchError.data?.originalError?.code === 4902 ||
        (switchError.message && switchError.message.includes("4902"))
      ) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hexChainId,
                chainName: config.networkName,
                rpcUrls: [config.rpcUrl],
                nativeCurrency: {
                  name: config.currencySymbol,
                  symbol: config.currencySymbol,
                  decimals: 18,
                },
              },
            ],
          });
          setStatus("ready");
        } catch (addError) {
          if (addError.code === 4001) {
            setError("Network addition was rejected in your wallet.");
          } else {
            setError("Failed to add network: " + (addError.message || ""));
          }
        }
      } else if (switchError.code === 4001) {
        setError("Network switch was rejected in your wallet.");
      } else {
        setError("Failed to switch network: " + (switchError.message || ""));
      }
    }
  }, []);

  // Connect action
  const connect = useCallback(async () => {
    setError(null);
    let eth = getInjectedProvider();

    if (!eth) {
      // Small wait in case extension is injecting
      await new Promise((r) => setTimeout(r, 200));
      eth = getInjectedProvider();
    }

    if (!eth) {
      setStatus("no-wallet");
      const msg = "No Ethereum wallet detected (MetaMask or Phantom). Please install MetaMask or enable Ethereum in Phantom.";
      setError(msg);
      alert(msg);
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(eth);
      setWalletProvider(provider);

      const accounts = await eth.request({
        method: "eth_requestAccounts",
      });

      if (accounts && accounts.length > 0) {
        const acc = accounts[0];
        setAccount(acc);
        const sig = await provider.getSigner().catch(() => null);
        setSigner(sig);

        const net = await provider.getNetwork();
        const currentChainId = Number(net.chainId);
        setChainId(currentChainId);

        if (currentChainId !== config.chainId) {
          setStatus("wrong-network");
          await switchNetwork();
        } else {
          setStatus("ready");
        }
      }
    } catch (err) {
      console.error("Connect error:", err);
      if (err.code === 4001) {
        setError("Connection request was rejected in your wallet.");
      } else if (err.code === -32002) {
        const msg = "A connection request is already waiting in your wallet extension. Click your wallet icon in the browser toolbar to approve.";
        setError(msg);
        alert(msg);
      } else {
        setError("Failed to connect wallet: " + (err.message || "Unknown error"));
      }
    }
  }, [switchNetwork]);

  // Initial check & listener setup
  useEffect(() => {
    let checkInterval = null;

    function initWallet() {
      const eth = getInjectedProvider();
      if (!eth) {
        return false;
      }

      const provider = new ethers.BrowserProvider(eth);
      setWalletProvider(provider);

      eth.request({ method: "eth_accounts" })
        .then(async (accounts) => {
          if (accounts && accounts.length > 0) {
            const acc = accounts[0];
            setAccount(acc);
            const sig = await provider.getSigner().catch(() => null);
            setSigner(sig);

            const net = await provider.getNetwork();
            const currentChainId = Number(net.chainId);
            setChainId(currentChainId);

            if (currentChainId !== config.chainId) {
              setStatus("wrong-network");
            } else {
              setStatus("ready");
            }
          } else {
            setAccount(null);
            setSigner(null);
            setStatus("disconnected");
          }
        })
        .catch((err) => {
          console.warn("eth_accounts error:", err);
          setStatus("disconnected");
        });

      const handleAccountsChanged = async (accounts) => {
        setError(null);
        if (accounts && accounts.length > 0) {
          const newAcc = accounts[0];
          setAccount(newAcc);
          try {
            const sig = await provider.getSigner();
            setSigner(sig);
            const net = await provider.getNetwork();
            if (Number(net.chainId) === config.chainId) {
              setStatus("ready");
            } else {
              setStatus("wrong-network");
            }
          } catch {
            setSigner(null);
          }
        } else {
          setAccount(null);
          setSigner(null);
          setRoles({
            admin: false,
            registrar: false,
            surveyor: false,
            court: false,
            issuer: false,
            citizen: true,
          });
          setStatus("disconnected");
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      eth.on?.("accountsChanged", handleAccountsChanged);
      eth.on?.("chainChanged", handleChainChanged);

      return true;
    }

    const found = initWallet();
    if (!found) {
      // Check again after 300ms, 800ms, 1500ms in case extension injected after DOMContentLoaded
      const t1 = setTimeout(initWallet, 300);
      const t2 = setTimeout(initWallet, 800);
      const t3 = setTimeout(() => {
        if (!initWallet()) {
          setStatus("no-wallet");
        }
      }, 1500);

      window.addEventListener("ethereum#initialized", initWallet, { once: true });

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, []);

  // Fetch roles whenever status is "ready"
  useEffect(() => {
    if (status !== "ready" || !account || !walletProvider) {
      setRoles({
        admin: false,
        registrar: false,
        surveyor: false,
        court: false,
        issuer: false,
        citizen: true,
      });
      return;
    }

    let isMounted = true;

    async function loadRoles() {
      // --- Step 1: Reset to citizen immediately so stale roles from the
      //             previous account never bleed through while we resolve ---
      if (isMounted) {
        setRoles({
          admin: false,
          registrar: false,
          surveyor: false,
          court: false,
          issuer: false,
          citizen: true,
        });
      }

      // --- Step 2: instant role from deployment accounts list (works offline) ---
      const deploymentRole = getRoleFromDeployment(account);
      if (deploymentRole && isMounted) {
        setRoles({
          admin: deploymentRole === "admin",
          registrar: deploymentRole === "registrar",
          surveyor: deploymentRole === "surveyor",
          court: deploymentRole === "court",
          issuer: deploymentRole === "issuer",
          citizen: false,
        });
      }
      // If deploymentRole is null (unknown wallet / personal MetaMask account)
      // we stay as citizen — the reset above already did that.

      // --- Step 3: verify on-chain (authoritative when node is live) ---
      try {
        const contracts = getContracts(walletProvider);
        if (!contracts) return;

        const { roleManager } = contracts;

        const defaultAdminRole = await roleManager.DEFAULT_ADMIN_ROLE();

        const [admin, registrar, surveyor, court, issuer] = await Promise.all([
          roleManager.hasRole(defaultAdminRole, account).catch(() => false),
          roleManager.isRegistrar(account).catch(() => false),
          roleManager.isSurveyor(account).catch(() => false),
          roleManager.isCourt(account).catch(() => false),
          roleManager.isIssuer(account).catch(() => false),
        ]);

        const hasAnyPrivilege = admin || registrar || surveyor || court || issuer;
        console.log("[Roles] On-chain result →", { admin, registrar, surveyor, court, issuer });

        if (isMounted) {
          setRoles({
            admin,
            registrar,
            surveyor,
            court,
            issuer,
            citizen: !hasAnyPrivilege,
          });
        }
      } catch (err) {
        // Node is offline – Step 2 result (or citizen fallback) is already shown
        console.warn("[Roles] On-chain check skipped (node offline?).", err.message || err);
      }
    }

    loadRoles();
    return () => {
      isMounted = false;
    };
  }, [status, account, walletProvider]);

  return (
    <WalletContext.Provider
      value={{
        account,
        chainId,
        status,
        roles,
        error,
        connect,
        switchNetwork,
        signer,
        walletProvider,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}
