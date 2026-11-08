function asBytes(bytes) {
    if (!(bytes instanceof Uint8Array)) {
        throw new TypeError("storage expects Uint8Array");
    }
    return bytes;
}

async function readableError(response, operation) {
    let detail = "";
    try {
        detail = (await response.text()).trim();
    } catch {
        detail = "";
    }
    return new Error(`${operation} failed (${response.status}${detail ? `: ${detail}` : ""})`);
}

function normalizeGateway(gateway) {
    const value = String(gateway || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (!value) throw new Error("Pinata gateway domain is required");
    return value;
}

export function createStorage({
    mode,
    devUrl = "http://127.0.0.1:5055",
    kuboApi = "",
    signUrl = "/api/upload-url",
    gateway = "",
    passphrase = "",
    uploader
}) {
    if (mode !== "dev" && mode !== "kubo" && mode !== "pinata") {
        throw new Error(`unsupported storage mode: ${mode}`);
    }
    const pinataGateway = mode === "pinata" ? normalizeGateway(gateway) : "";
    const base = (mode === "dev" ? devUrl : kuboApi).replace(/\/+$/, "");
    if (!base) {
        if (mode !== "pinata") throw new Error(`${mode} storage URL is required`);
    }

    return {
        mode,
        async upload(bytes, { kind = "ciphertext" } = {}) {
            const input = asBytes(bytes);
            let response;
            if (mode === "dev") {
                response = await fetch(`${base}/add`, {
                    method: "POST",
                    headers: { "Content-Type": "application/octet-stream" },
                    body: input
                });
            } else if (mode === "kubo") {
                const form = new FormData();
                form.append("file", new Blob([input]), "document.bin");
                response = await fetch(`${base}/api/v0/add?cid-version=1&pin=true`, {
                    method: "POST",
                    body: form
                });
            } else {
                const headers = { "Content-Type": "application/json" };
                if (passphrase) headers["x-pilot-passphrase"] = passphrase;
                const signResponse = await fetch(signUrl, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ kind, size: input.length })
                });
                if (signResponse.status === 401) throw new Error("The pilot access code is wrong or missing.");
                if (signResponse.status === 429) throw new Error("Too many uploads. Please wait a few minutes.");
                if (!signResponse.ok) throw new Error(`Could not get an upload URL (${signResponse.status}).`);
                const signed = await signResponse.json();
                if (!signed || typeof signed.url !== "string" || !signed.url) {
                    throw new Error("Could not get an upload URL (invalid response).");
                }
                const isManifest = kind === "manifest";
                const file = new File(
                    [input],
                    isManifest ? "manifest.json" : "doc.bin",
                    { type: isManifest ? "application/json" : "application/octet-stream" }
                );
                const upload = uploader || (async (uploadFile, signedUrl) => {
                    const module = await import("pinata");
                    const pinata = new module.PinataSDK({ pinataGateway });
                    return pinata.upload.public.file(uploadFile).url(signedUrl);
                });
                const result = await upload(file, signed.url);
                if (!result || typeof result.cid !== "string" || !result.cid) {
                    throw new Error("Pinata upload returned no content identifier");
                }
                return result.cid;
            }
            if (!response.ok) {
                throw await readableError(response, "storage upload");
            }
            const result = await response.json();
            const id = mode === "dev" ? result.cid : result.Hash;
            if (typeof id !== "string" || !id) {
                throw new Error("storage upload returned no content identifier");
            }
            return id;
        },
        async download(id) {
            const response = mode === "dev"
                ? await fetch(`${base}/cat/${encodeURIComponent(id)}`)
                : mode === "kubo"
                    ? await fetch(`${base}/api/v0/cat?arg=${encodeURIComponent(id)}`, { method: "POST" })
                    : await fetch(`https://${pinataGateway}/ipfs/${encodeURIComponent(id)}`);
            if (!response.ok) {
                throw await readableError(response, "storage download");
            }
            return new Uint8Array(await response.arrayBuffer());
        }
    };
}
