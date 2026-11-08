import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { AREAS } from "../lib/mapData";
import { config } from "../config";
import { useWallet } from "../context/WalletContext";
import { getWriteContracts } from "../lib/parcelActions";
import { getReadProvider, getContracts } from "../lib/contracts";
import { friendlyError } from "../lib/errors";
import { useVault } from "../context/VaultContext";
import { createStorage } from "../lib/ipfs";
import { buildManifest } from "../lib/manifest";
import { encryptFile, generateFileKey, importPublicKey, sha256Bytes32, toHex, wrapFileKey } from "../lib/docCrypto";
import { queryFilterChunked } from "../lib/logs";
import { sendAndWait } from "../lib/transactions";

const emptyOwner = { address: "", share: "" };

export default function RegisterView({ onRegisterPlot }) {
  const { signer, account, status } = useWallet();
  const { privateKey, publicKeyHex, passphrase } = useVault();
  const [area, setArea] = useState("Northfield");
  const [addr, setAddr] = useState("");
  const [size, setSize] = useState("");
  const [owners, setOwners] = useState(() => [{ address: account || "", share: "100" }]);
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [readerOptions, setReaderOptions] = useState([]);
  const [selectedReaders, setSelectedReaders] = useState({});

  useEffect(() => {
    if (account && owners.length === 1 && !owners[0].address) {
      setOwners([{ address: account, share: "100" }]);
    }
  }, [account, owners]);

  useEffect(() => {
    let active = true;
    async function loadReaders() {
      const read = getContracts(getReadProvider(null));
      if (!read) return;
      try {
        const roleReaders = [];
        for (const role of [await read.roleManager.REGISTRAR_ROLE(), await read.roleManager.SURVEYOR_ROLE()]) {
          const granted = await queryFilterChunked(read.roleManager, read.roleManager.filters.RoleGranted(role), config.deployBlock || 0);
          const revoked = await queryFilterChunked(read.roleManager, read.roleManager.filters.RoleRevoked(role), config.deployBlock || 0);
          const revokedSet = new Set(revoked.map(event => event.args.account.toLowerCase()));
          granted.forEach(event => {
            if (!revokedSet.has(event.args.account.toLowerCase())) roleReaders.push(event.args.account);
          });
        }
        const addresses = [...new Set([...owners.map(owner => owner.address.trim()), ...roleReaders].filter(ethers.isAddress))];
        const options = await Promise.all(addresses.map(async address => ({
          address,
          key: await read.documentAccess.encryptionKeyOf(address)
        })));
        if (active) {
          setReaderOptions(options);
          setSelectedReaders(current => Object.keys(current).length ? current : Object.fromEntries(options.filter(option => option.key !== "0x").map(option => [option.address.toLowerCase(), true])));
        }
      } catch {
        if (active) setReaderOptions([]);
      }
    }
    loadReaders();
    return () => { active = false; };
  }, [owners]);

  const contractInterfaces = useMemo(() => {
    const contracts = signer ? getWriteContracts(signer) : null;
    return contracts ? [contracts.registry.interface, contracts.roleManager.interface] : [];
  }, [signer]);

  function updateOwner(index, field, value) {
    setOwners((current) => current.map((owner, ownerIndex) => (
      ownerIndex === index ? { ...owner, [field]: value } : owner
    )));
  }

  function addOwner() {
    if (owners.length < 10) setOwners((current) => [...current, { ...emptyOwner }]);
  }

  function removeOwner(index) {
    setOwners((current) => current.filter((_, ownerIndex) => ownerIndex !== index));
  }

  function validate() {
    const nextErrors = {};
    if (status !== "ready" || !signer || !account) nextErrors.wallet = "Connect a wallet on the configured network first.";
    if (!addr.trim()) nextErrors.addr = "Enter a physical address.";
    if (!Number(size) || Number(size) <= 0) nextErrors.size = "Enter a size above zero.";
    if (!file) nextErrors.file = "Choose a PDF, PNG, JPG, or TXT file.";
    if (file && file.size > 10 * 1024 * 1024) nextErrors.file = "Files must be 10 MB or smaller.";
    if (!privateKey || !publicKeyHex) nextErrors.vault = "Unlock your vault and register its on-chain key first.";
    const addresses = owners.map((owner) => owner.address.trim().toLowerCase());
    if (owners.some((owner) => !ethers.isAddress(owner.address.trim()))) nextErrors.owners = "Every owner must be a valid Ethereum address.";
    if (new Set(addresses).size !== addresses.length) nextErrors.owners = "Owner addresses must be unique.";
    if (owners.some((owner) => !Number.isInteger(Number(owner.share)) || Number(owner.share) <= 0)) {
      nextErrors.shares = "Shares must be positive whole numbers.";
    } else if (owners.reduce((total, owner) => total + Number(owner.share), 0) !== 100) {
      nextErrors.shares = "Owner shares must sum to 100%.";
    }
    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;

    const metadataSize = Number(size);
    setPhase("waiting");
    setMessage("Encrypting…");
    try {
      const storage = createStorage({ mode: config.storageMode, devUrl: config.devStoreUrl, kuboApi: config.kuboApi, signUrl: config.signUrl, gateway: config.pinataGateway, passphrase });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const docHash = await sha256Bytes32(bytes);
      const fileKey = await generateFileKey();
      const ciphertext = await encryptFile(bytes, fileKey);
      setPhase("mining");
      setMessage("Uploading…");
      const docCid = await storage.upload(ciphertext, { kind: "ciphertext" });
      const metadataKey = `terra-meta:${config.chainId}`;
      const current = JSON.parse(window.localStorage.getItem(metadataKey) || "{}");
      const used = Object.values(current).filter(item => item?.area === area).map(item => Number(item.cell)).filter(Number.isInteger);
      let cell = 0;
      while (used.includes(cell)) cell += 1;
      const manifestCid = await storage.upload(buildManifest({
        area, addr: addr.trim(), size: metadataSize, cell, docCid, mime: file.type || "application/octet-stream", bytes: bytes.length
      }), { kind: "manifest" });
      setMessage("Registering parcel…");
      const { registry, documentAccess } = getWriteContracts(signer);
      const tx = await registry.submitParcel(
        owners.map((owner) => owner.address.trim()),
        owners.map((owner) => Number(owner.share)),
        docHash,
        manifestCid
      );
      setPhase("mining");
      setMessage("Transaction submitted. Waiting for confirmation…");
      const receipt = await sendAndWait(tx);
      const event = receipt.logs.find((log) => log.fragment?.name === "ParcelSubmitted");
      const parcelId = event?.args?.parcelId;
      if (!parcelId) throw new Error("The confirmed transaction did not include a parcel ID.");

      current[String(parcelId)] = { area, addr: addr.trim(), size: `${metadataSize} m²`, cell };
      window.localStorage.setItem(metadataKey, JSON.stringify(current));
      setMessage("Granting access…");
      const readers = readerOptions.filter(reader => selectedReaders[reader.address.toLowerCase()] && reader.key !== "0x");
      const wrappedKeys = await Promise.all(readers.map(reader => wrapFileKey(fileKey, importPublicKey(ethers.getBytes(reader.key)))));
      try {
        await sendAndWait(documentAccess.grantAccessBatch(parcelId, readers.map(reader => reader.address), wrappedKeys.map(toHex)));
      } catch (grantError) {
        setPhase("error");
        setMessage("Parcel registered but access not granted; use Grant access on the parcel card");
        throw grantError;
      }
      setPhase("success");
      setMessage(`Parcel ${parcelId} recorded successfully.`);
      onRegisterPlot({ addr: addr.trim() });
      setAddr("");
      setSize("");
      setOwners([{ address: account, share: "100" }]);
      setFile(null);
    } catch (error) {
      setPhase("error");
      setMessage(friendlyError(error, contractInterfaces));
    }
  }

  return (
    <div>
      <h1 className="page-title">Register a <i>plot</i></h1>
      <p className="sub">The parcel will enter the survey and registrar approval pipeline.</p>
      <form className="f" onSubmit={handleSubmit}>
        <label>
          AREA
          <select value={area} onChange={(event) => setArea(event.target.value)}>
            {Object.keys(AREAS).map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label>
          DOCUMENT
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" onChange={event => setFile(event.target.files?.[0] || null)} />
          {errors.file && <span className="err">{errors.file}</span>}
        </label>
        <label>
          ADDRESS
          <input value={addr} onChange={(event) => setAddr(event.target.value)} placeholder="e.g. 14 Market St, Northfield" />
          {errors.addr && <span className="err">{errors.addr}</span>}
        </label>
        <label>
          SIZE (m²)
          <input type="number" value={size} onChange={(event) => setSize(event.target.value)} placeholder="e.g. 450" />
          {errors.size && <span className="err">{errors.size}</span>}
        </label>

        <div className="k">OWNERS AND SHARES</div>
        {owners.map((owner, index) => (
          <div key={index} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              aria-label={`Owner ${index + 1} wallet address`}
              value={owner.address}
              onChange={(event) => updateOwner(index, "address", event.target.value)}
              placeholder="0x wallet address"
              style={{ flex: 1 }}
            />
            <input
              aria-label={`Owner ${index + 1} share`}
              type="number"
              min="1"
              max="100"
              value={owner.share}
              onChange={(event) => updateOwner(index, "share", event.target.value)}
              placeholder="%"
              style={{ width: "90px" }}
            />
            <span>%</span>
            {owners.length > 1 && <button type="button" className="btn alt" onClick={() => removeOwner(index)}>REMOVE</button>}
          </div>
        ))}
        {errors.owners && <span className="err">{errors.owners}</span>}
        {errors.shares && <span className="err">{errors.shares}</span>}
        {owners.length < 10 && <button type="button" className="btn alt" onClick={addOwner}>ADD OWNER</button>}
        <div className="k">INITIAL DOCUMENT READERS</div>
        {readerOptions.map(reader => (
          <label key={reader.address} style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={Boolean(selectedReaders[reader.address.toLowerCase()])}
              disabled={!reader.key || reader.key === "0x"}
              onChange={event => setSelectedReaders(current => ({ ...current, [reader.address.toLowerCase()]: event.target.checked }))}
            />
            {" "}{reader.address} {!reader.key || reader.key === "0x" ? "— can request access later" : ""}
          </label>
        ))}

        {errors.wallet && <span className="err">{errors.wallet}</span>}
        {errors.vault && <span className="err">{errors.vault}</span>}
        {message && <div className={`note ${phase === "error" ? "err" : ""}`}>{message}</div>}
        <button type="submit" className="btn" disabled={phase === "waiting" || phase === "mining"}>
          {phase === "waiting" ? "CONFIRM IN WALLET…" : phase === "mining" ? "RECORDING…" : "SUBMIT PLOT"}
        </button>
      </form>
    </div>
  );
}
