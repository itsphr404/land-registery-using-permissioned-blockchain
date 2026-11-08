# Document Storage Plan

This project supports two storage modes for encrypted document ciphertext and
manifests.

## Development mode

Development mode uses the local server started with:

```powershell
npm run ipfs:dev
```

It stores content under `.dev-ipfs` (or `DEV_IPFS_DIR` when configured) and
returns IDs in the form `dev-<sha256>`. The store validates IDs, blocks path
traversal, and detects altered files.

Development mode is intended for local development and automated tests. It is
not real IPFS and must not be used as a production storage service.

## Kubo IPFS mode

Kubo mode uses a local or remote IPFS Kubo daemon. Typical local setup:

```powershell
ipfs init
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT","POST"]'
ipfs daemon
```

PowerShell quoting may need adjustment depending on the installed Kubo
version. Kubo uploads use `/api/v0/add?cid-version=1&pin=true` and downloads
use `/api/v0/cat`.

## Frontend configuration

Set these values in `frontend/.env`:

```dotenv
VITE_STORAGE_MODE=dev
VITE_DEV_STORE_URL=http://127.0.0.1:5055
VITE_KUBO_API=
```

Use `VITE_STORAGE_MODE=kubo` and set `VITE_KUBO_API` to the Kubo API base URL
to use Kubo instead.

## Security and behavior

Both modes store encrypted file bytes and the manifest; neither receives or
stores the file encryption key. Confidentiality comes from encryption, while
the blockchain stores document hashes, manifest identifiers, access grants,
and rotation audit data.

The current automated tests and reported benchmark results use **development
mode**, not a live Kubo daemon. Kubo mode is an optional deployment choice and
does not require additional application code.
