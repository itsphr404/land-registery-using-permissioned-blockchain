# Land Registry

A fraud-resilient blockchain land-registry demonstration built with Solidity,
Hardhat, OpenZeppelin, ethers.js, and React. The system models parcel
submission, independent survey and registration approval, fractional ownership,
append-only ownership history, and escrow-controlled sales.

## Prerequisites

- Node.js 18 or newer
- npm
- A browser wallet such as MetaMask (for the frontend write flows)

The application uses a local Hardhat network with chain ID `31337`. No external
database or blockchain node is required.

## Install

From the repository root:

```shell
npm install
npm install --prefix frontend
```

For Sepolia deployment, create a root `.env` from `.env.example` and fill in
the RPC URL and deployer key. The deployer key must belong to a fresh test-only
wallet; never commit `.env`.

## Run the project

Use separate terminals for the local node and frontend:

```shell
# Terminal 1: start the local Hardhat JSON-RPC node
npm run node

# Terminal 2: deploy contracts and seed demo parcels
npm run deploy:full

# Terminal 3: start the React/Vite frontend
npm run frontend
```

Open the Vite URL shown in the frontend terminal, normally
`http://localhost:5173`. Connect a wallet configured for the local Hardhat
network (`http://127.0.0.1:8545`, chain ID `31337`).

The local deployment writes deployment metadata for both the backend and
frontend. To run only the deployment, use `npm run deploy:local`; to seed
existing contracts, use `npm run seed`.

## Frontend commands

Run these from the repository root:

```shell
# Run frontend unit tests
npm test --prefix frontend

# Build the production frontend
npm run build --prefix frontend

# Run the frontend linter
npm run lint --prefix frontend
```

## Sepolia deployment

Set these root `.env` values before deploying:

```dotenv
SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
ETHERSCAN_API_KEY=
```

Optional pilot role lists are comma-separated Ethereum addresses:
`PILOT_REGISTRARS`, `PILOT_SURVEYORS`, `PILOT_COURTS`, and `PILOT_ISSUERS`.
Deploy with:

```shell
npm run deploy:sepolia
```

To replace an existing `sepolia.json`, use `FORCE=1` in a shell that supports
environment-variable prefixes, or set `FORCE=1` in the environment before
running the command. The deployer must have sufficient Sepolia test ETH.

For Pinata-backed document storage, copy
`frontend/.env.production.example` to the frontend host configuration and set
the public `VITE_*` values there. Set `PINATA_JWT` and `PILOT_PASSPHRASE` only
as server-side host variables; never put secrets in frontend code or `VITE_*`
variables.

## Test and benchmark commands

```shell
# Compile Solidity contracts
npm run compile

# Run the complete Hardhat test suite
npm test

# Generate Solidity coverage reports
npm run coverage

# Run the gas benchmark and write results/gas-results.json and .csv
npm run bench
```

The benchmark prints two tables: gas per proposed-system operation and a
proposed-versus-baseline comparison. The baseline is intentionally a simpler
single-authority registry, so its numbers are a comparison point rather than a
like-for-like implementation.

## Folder structure

```text
contracts/                 Solidity contracts and interfaces
contracts/mocks/            Test-only Solidity helpers
test/                      Hardhat contract and deployment tests
scripts/                   Deployment, seeding, time-travel, and benchmarks
deployments/               Root deployment metadata and ABIs
frontend/src/              Active React application
frontend/deployments/      Frontend deployment metadata and ABIs
terra-registry-map/        Separate static map/demo frontend
artifacts/                 Hardhat compiler artifacts
cache/                     Hardhat cache
coverage/                  HTML and LCOV coverage output
results/                   Gas benchmark JSON and CSV output
```

## Contract responsibilities

- `RoleManager`: role-based access control and separation of registrar,
  surveyor, and court duties.
- `LandRegistry`: parcel lifecycle, owner shares, consent rounds, document
  verification, and append-only ownership versions.
- `TitleEscrow`: sale listings, buyer deposits, seller/registrar approvals,
  refunds, pull-payment withdrawals, and escrow-to-registry transfer.
- `BaselineRegistry`: a deliberately simpler comparison implementation used
  by the benchmark.

See [DOCUMENTATION.md](DOCUMENTATION.md) for the detailed contract behavior and
[explanation.md](explanation.md) for the step-by-step explanation.

## Encrypted document model

Document access is implemented by `DocumentAccess` and the Web Crypto frontend.
`docHash` is the SHA-256 hash of the original file. The registry stores that
fingerprint and a CID for a public JSON manifest. The encrypted file is stored
in the configured dev store or Kubo IPFS, while the file key is wrapped for
each reader in `DocumentAccess`.

The A6 controls are implemented and tested by the named scenarios in
`test/documentFlow.js` and `test/docCrypto.js`: authenticated encryption,
per-reader RSA wrapping, vault password protection, tamper detection, access
requests, and rotation.

Limitations: the development store is not real IPFS; Kubo must be operated
separately for deployment; passwords and private keys are never recoverable
after loss; and the browser requires a secure context (HTTPS in deployment,
with `http://localhost` allowed for local development). A7 KYC and A8 court
override governance remain outside this implementation.
