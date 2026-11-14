import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { useVault } from "../context/VaultContext";
import { config, deployment } from "../config";
import { getReadProvider, getContracts } from "../lib/contracts";
import { getWriteContracts } from "../lib/parcelActions";
import { createStorage } from "../lib/ipfs";
import { parseManifest } from "../lib/manifest";
import { decryptFile, encryptFile, generateFileKey, importPublicKey, sha256Bytes32, toHex, unwrapFileKey, wrapFileKey } from "../lib/docCrypto";
import { friendlyError } from "../lib/errors";
import { queryFilterChunked } from "../lib/logs";
import { sendAndWait } from "../lib/transactions";

const requestsCache = new Map();

export default function DocumentPanel({ plot }) {
  const { account, signer } = useWallet();
  const { privateKey, passphrase } = useVault();
  const [manifest, setManifest] = useState(null);
  const [legacy, setLegacy] = useState(false);
  const [access, setAccess] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [grantAddress, setGrantAddress] = useState("");
  const [download, setDownload] = useState(null);
  const [requests, setRequests] = useState([]);

  async function load() {
    try {
      const read = getContracts(getReadProvider(null));
      const storage = createStorage({ mode: config.storageMode, devUrl: config.devStoreUrl, kuboApi: config.kuboApi, signUrl: config.signUrl, gateway: config.pinataGateway, passphrase });
      const parsed = parseManifest(await storage.download(plot.cid));
      setManifest(parsed);
      setLegacy(false);
      setAccess(await read.documentAccess.hasAccess(plot.pid, account || ethers.ZeroAddress));
    } catch {
      setLegacy(true);
      setManifest(null);
      setAccess(false);
    }
  }

  useEffect(() => { load(); }, [plot.pid, plot.cid, account]);

  useEffect(() => {
    let active = true;
    const owner = Boolean(account && plot.owners.some(item => item.addr.toLowerCase() === account.toLowerCase()));
    if (!owner || requestsCache.has(`${config.chainId}:${plot.pid}`)) {
      if (owner) setRequests(requestsCache.get(`${config.chainId}:${plot.pid}`) || []);
      return () => { active = false; };
    }
    async function loadRequests() {
      const read = getContracts(getReadProvider(null));
      if (!read) return;
      const deployBlock = Number(deployment?.deployBlock || 0);
      if (!deployBlock && config.chainId !== 31337) {
        if (active) setMessage("Deploy block missing");
        return;
      }
      const events = await queryFilterChunked(
        read.documentAccess,
        read.documentAccess.filters.AccessRequested(plot.pid),
        deployment.deployBlock
      );
      const addresses = events.map(event => event.args.requester);
      requestsCache.set(`${config.chainId}:${plot.pid}`, addresses);
      if (active) setRequests(addresses);
    }
    loadRequests().catch(() => {
      if (active) setMessage("Unable to load access requests");
    });
    return () => { active = false; };
  }, [account, plot.pid, plot.owners]);

  async function decryptAndVerify() {
    if (!privateKey) {
      setMessage("Unlock your vault first.");
      return;
    }
    setBusy(true);
    try {
      const read = getContracts(getReadProvider(null));
      const wrapped = await read.documentAccess.getWrappedKey(plot.pid, account);
      if (!wrapped || wrapped === "0x") throw new Error("NoAccess");
      const key = await unwrapFileKey(ethers.getBytes(wrapped), privateKey);
      const storage = createStorage({ mode: config.storageMode, devUrl: config.devStoreUrl, kuboApi: config.kuboApi, signUrl: config.signUrl, gateway: config.pinataGateway, passphrase });
      const rotated = await read.documentAccess.rotatedCidOf(plot.pid);
      const ciphertext = await storage.download(rotated || manifest.doc.cid);
      const plaintext = await decryptFile(ciphertext, key);
      const hash = await sha256Bytes32(plaintext);
      if (hash.toLowerCase() !== plot.docHash.toLowerCase()) {
        setMessage("MISMATCH");
        return;
      }
      setMessage("Verified: matches the on-chain fingerprint");
      setDownload(URL.createObjectURL(new Blob([plaintext], { type: manifest.doc.mime })));
    } catch (error) {
      const read = getContracts(getReadProvider(null));
      setMessage(error.message === "NoAccess" ? "No access" : friendlyError(error, [read.documentAccess.interface]));
    } finally {
      setBusy(false);
    }
  }

  async function grant() {
    if (!signer || !ethers.isAddress(grantAddress)) return setMessage("Enter a valid address.");
    setBusy(true);
    try {
      const read = getContracts(getReadProvider(null));
      const key = await read.documentAccess.encryptionKeyOf(grantAddress);
      if (!key || key === "0x") throw new Error("NoEncryptionKey");
      const ownWrapped = await read.documentAccess.getWrappedKey(plot.pid, account);
      const ownKey = await unwrapFileKey(ethers.getBytes(ownWrapped), privateKey);
      const contracts = getWriteContracts(signer);
      await sendAndWait(contracts.documentAccess.grantAccess(plot.pid, grantAddress, toHex(await wrapFileKey(ownKey, await importPublicKey(ethers.getBytes(key))))));
      setMessage("Access granted.");
    } catch (error) {
      const read = getContracts(getReadProvider(null));
      setMessage(friendlyError(error, [read.documentAccess.interface]));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!signer || !ethers.isAddress(grantAddress)) return setMessage("Enter the grantee address to revoke.");
    setBusy(true);
    try {
      const contracts = getWriteContracts(signer);
      await sendAndWait(contracts.documentAccess.revokeAccess(plot.pid, grantAddress));
      setMessage("This removes the stored key. Someone who already opened the document keeps what they saw. Use Rotate to cut access fully.");
    } catch (error) {
      const read = getContracts(getReadProvider(null));
      setMessage(friendlyError(error, [read.documentAccess.interface]));
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (!signer || !privateKey || !manifest) return setMessage("Unlock your vault and verify the document first.");
    setBusy(true);
    try {
      const read = getContracts(getReadProvider(null));
      const wrapped = await read.documentAccess.getWrappedKey(plot.pid, account);
      const oldKey = await unwrapFileKey(ethers.getBytes(wrapped), privateKey);
      const storage = createStorage({ mode: config.storageMode, devUrl: config.devStoreUrl, kuboApi: config.kuboApi, signUrl: config.signUrl, gateway: config.pinataGateway, passphrase });
      const plaintext = await decryptFile(await storage.download((await read.documentAccess.rotatedCidOf(plot.pid)) || manifest.doc.cid), oldKey);
      const nextKey = await generateFileKey();
      const nextCid = await storage.upload(await encryptFile(plaintext, nextKey), { kind: "ciphertext" });
      const readers = [];
      for (const owner of plot.owners) {
        const key = await read.documentAccess.encryptionKeyOf(owner.addr);
        if (key && key !== "0x") readers.push({ address: owner.addr, key });
      }
      const keys = await Promise.all(readers.map(reader => wrapFileKey(nextKey, importPublicKey(ethers.getBytes(reader.key)))));
      const contracts = getWriteContracts(signer);
      await sendAndWait(contracts.documentAccess.rotateDocument(plot.pid, nextCid, readers.map(reader => reader.address), keys.map(toHex)));
      setMessage("Document rotated; previous epoch access is cut off.");
      await load();
    } catch (error) {
      const read = getContracts(getReadProvider(null));
      setMessage(friendlyError(error, [read.documentAccess.interface]));
    } finally {
      setBusy(false);
    }
  }

  if (legacy) return <div className="note">No encrypted document. Record integrity: {plot.metaOk ? "verified" : "unverified"}</div>;
  if (!manifest) return <div className="note">Loading encrypted document…</div>;
  const owner = Boolean(account && plot.owners.some(item => item.addr.toLowerCase() === account.toLowerCase()));
  return (
    <div>
      <div className="lead"><span>Document</span><i></i><span>{manifest.meta.area} · {manifest.meta.addr} · {manifest.meta.size}</span></div>
      <div className="lead"><span>Access</span><i></i><span>{access ? "granted" : privateKey ? "not granted" : "no key registered"}</span></div>
      {access && <button className="btn" disabled={busy} onClick={decryptAndVerify}>DECRYPT AND VERIFY</button>}
      {download && <a className="btn alt" href={download} download="document">DOWNLOAD</a>}
      {!access && privateKey && <button className="btn alt" disabled={busy} onClick={async () => { try { const contracts = getWriteContracts(signer); await sendAndWait(contracts.documentAccess.requestAccess(plot.pid)); setMessage("Access requested."); } catch (error) { setMessage(friendlyError(error)); } }}>REQUEST ACCESS</button>}
      {owner && !access && <div className="note">You own this parcel but hold no key; ask a previous reader to grant you access.</div>}
      {owner && requests.length > 0 && <div className="note">Access requested by: {requests.join(", ")}</div>}
      {owner && access && <div className="f">
        <div className="k">OWNER TOOLS</div>
        <input placeholder="Registered reader address" value={grantAddress} onChange={event => setGrantAddress(event.target.value)} />
        <button className="btn" disabled={busy} onClick={grant}>GRANT ACCESS</button>
        <button className="btn alt" disabled={busy} onClick={revoke}>REVOKE</button>
        <button className="btn" disabled={busy} onClick={rotate}>ROTATE</button>
      </div>}
      {message && <div className="note">{message}</div>}
    </div>
  );
}
