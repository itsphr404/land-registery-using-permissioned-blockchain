import React, { useEffect, useRef, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useVault } from "../context/VaultContext";
import { friendlyError } from "../lib/errors";
import { getReadProvider, getContracts } from "../lib/contracts";
import { config, demoVaults } from "../config";
import { getWriteContracts } from "../lib/parcelActions";
import { sendAndWait } from "../lib/transactions";

export default function KeyVault() {
  const { account, signer } = useWallet();
  const { vault, privateKey, create, unlock, lock, importVault, publicKeyHex, message, setMessage, passphrase, setPassphrase } = useVault();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [onChainKey, setOnChainKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (!account) return undefined;
    const contracts = getContracts(getReadProvider(null));
    contracts?.documentAccess.encryptionKeyOf(account).then(key => {
      if (active) setOnChainKey(key);
    }).catch(() => {
      if (active) setOnChainKey(null);
    });
    return () => { active = false; };
  }, [account, vault, privateKey]);

  async function handleCreate() {
    if (password.length < 10 || password !== confirm) {
      setMessage("Use a password of at least 10 characters and confirm it.");
      return;
    }
    setBusy(true);
    try {
      await create(password);
      setPassword("");
      setConfirm("");
      setMessage("Vault created. Register its public key from a connected wallet.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function registerKey() {
    if (!signer || !publicKeyHex) return;
    const contracts = getWriteContracts(signer);
    setBusy(true);
    try {
      await sendAndWait(contracts.documentAccess.registerEncryptionKey(publicKeyHex));
      setOnChainKey(publicKeyHex);
      setMessage("Encryption key registered on-chain.");
    } catch (error) {
      setMessage(friendlyError(error, [contracts.documentAccess.interface]));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      importVault(JSON.parse(await file.text()));
      setMessage("Vault imported. Unlock it with its password.");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  function exportVault() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(vault, null, 2)], { type: "application/json" }));
    link.download = "terra-vault.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const matches = Boolean(publicKeyHex && onChainKey && publicKeyHex.toLowerCase() === onChainKey.toLowerCase());
  const demoVault = config.chainId === 31337 && account ? demoVaults[account.toLowerCase()] : null;
  function loadDemoVault() {
    try {
      importVault(demoVault);
      setMessage("Demo vault loaded. Unlock it with password: demo");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }
  return (
    <section>
      <h1 className="page-title">Key <i>vault</i></h1>
      {!account && <p className="note">Connect a wallet to create or unlock a vault.</p>}
      {account && !vault && <div className="f">
        <div className="k">NO VAULT</div>
        <input type="password" placeholder="Password (10+ characters)" value={password} onChange={event => setPassword(event.target.value)} />
        <input type="password" placeholder="Confirm password" value={confirm} onChange={event => setConfirm(event.target.value)} />
        <button className="btn" disabled={busy} onClick={handleCreate}>CREATE VAULT</button>
        <button className="btn alt" onClick={() => fileRef.current?.click()}>IMPORT VAULT</button>
        {demoVault && <button className="btn alt" onClick={loadDemoVault}>LOAD DEMO VAULT (PASSWORD: DEMO)</button>}
      </div>}
      {account && vault && <div className="f">
        <div className="k">{privateKey ? "UNLOCKED" : "LOCKED"}</div>
        {!privateKey && <><input type="password" placeholder="Vault password" value={password} onChange={event => setPassword(event.target.value)} /><button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await unlock(password); setPassword(""); setMessage("Vault unlocked in memory."); } catch { setMessage("Wrong password."); } finally { setBusy(false); } }}>UNLOCK</button></>}
        {privateKey && <button className="btn alt" onClick={lock}>LOCK</button>}
        <button className="btn alt" onClick={exportVault}>EXPORT VAULT</button>
        <button className="btn alt" onClick={() => fileRef.current?.click()}>IMPORT VAULT</button>
        <button className="btn" disabled={busy || matches} onClick={registerKey}>{matches ? "KEY REGISTERED" : "REGISTER ON-CHAIN KEY"}</button>
        {onChainKey && !matches && <div className="err">Warning: the on-chain key does not match this vault.</div>}
      </div>}
      <div className="f">
        <div className="k">PILOT STORAGE</div>
        <input
          type="password"
          placeholder="Pilot access code"
          aria-label="Pilot access code"
          value={passphrase}
          onChange={event => setPassphrase(event.target.value)}
        />
        <p className="note">Stored only for this browser session.</p>
      </div>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={handleImport} />
      <p className="note">If you lose the password and the backup, access to your documents cannot be recovered.</p>
      {message && <div className="note">{message}</div>}
    </section>
  );
}
