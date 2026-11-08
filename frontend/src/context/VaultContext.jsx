import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { config } from "../config";
import { createVault, unlockVault, vaultPublicKeyBytes, toHex } from "../lib/docCrypto";

const VaultContext = createContext(null);
const storageKey = account => `terra-vault:${config.chainId}:${account.toLowerCase()}`;
const passphraseKey = account => `terra-pilot-passphrase:${config.chainId}:${account.toLowerCase()}`;

export function VaultProvider({ account, children }) {
  const [vault, setVault] = useState(null);
  const [privateKey, setPrivateKey] = useState(null);
  const [message, setMessage] = useState("");
  const [passphrase, setPassphraseState] = useState("");

  useEffect(() => {
    setPrivateKey(null);
    setMessage("");
    setPassphraseState(account ? window.sessionStorage.getItem(passphraseKey(account)) || "" : "");
    if (!account || typeof window === "undefined") {
      setVault(null);
      return;
    }
    try {
      setVault(JSON.parse(window.localStorage.getItem(storageKey(account)) || "null"));
    } catch {
      setVault(null);
      setMessage("Stored vault is invalid. Import a backup.");
    }
  }, [account]);

  const setPassphrase = useCallback(value => {
    setPassphraseState(value);
    if (account) {
      if (value) window.sessionStorage.setItem(passphraseKey(account), value);
      else window.sessionStorage.removeItem(passphraseKey(account));
    }
  }, [account]);

  const create = useCallback(async password => {
    if (!account) throw new Error("Connect a wallet before creating a vault.");
    const next = await createVault(password);
    window.localStorage.setItem(storageKey(account), JSON.stringify(next));
    setVault(next);
    setPrivateKey(null);
    return next;
  }, [account]);

  const unlock = useCallback(async password => {
    if (!vault) throw new Error("No vault is available.");
    const key = await unlockVault(vault, password);
    setPrivateKey(key);
    return key;
  }, [vault]);

  const importVault = useCallback(next => {
    if (!next || next.v !== 1 || typeof next.publicKey !== "string") throw new Error("Invalid vault backup.");
    window.localStorage.setItem(storageKey(account), JSON.stringify(next));
    setVault(next);
    setPrivateKey(null);
  }, [account]);

  const value = useMemo(() => ({
    vault,
    privateKey,
    message,
    setMessage,
    passphrase,
    setPassphrase,
    create,
    unlock,
    lock: () => setPrivateKey(null),
    importVault,
    publicKeyHex: vault ? `0x${toHex(vaultPublicKeyBytes(vault))}` : null
  }), [vault, privateKey, message, passphrase, create, unlock, importVault, setPassphrase]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  return useContext(VaultContext);
}
