# Land Registry - Code Explanations

## RoleManager.sol — Line-by-Line Beginner Explanation

### License & Version
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
```
**License & version.** `^0.8.24` means "0.8.24 or any compatible newer version."

### Import
```solidity
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
```
**Imports OpenZeppelin's battle-tested AccessControl.** This gives us:
- `DEFAULT_ADMIN_ROLE` (built-in super-admin role)
- `hasRole(role, account)` — check if an address has a role
- `grantRole(role, account)` — give a role (only admin can call)
- `revokeRole(role, account)` — remove a role
- `renounceRole(role, account)` — give up your own role
- Events: `RoleGranted`, `RoleRevoked`
- Internal `_grantRole` — the low-level function we'll override

### Contract Declaration
```solidity
contract RoleManager is AccessControl {
```
**Inheritance.** `RoleManager` *is an* `AccessControl` — it gets all the above for free.

### Custom Errors
```solidity
    error ZeroAddress();
    error ConflictingRole(address account, bytes32 heldRole, bytes32 newRole);
```
**Custom errors** (not strings). Cheaper gas, structured data.
- `ZeroAddress()` — constructor got `address(0)`
- `ConflictingRole(account, heldRole, newRole)` — account already has a *different* duty-separated role

---

### Role ID Constants — What `keccak256` Does

```solidity
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant SURVEYOR_ROLE  = keccak256("SURVEYOR_ROLE");
    bytes32 public constant COURT_ROLE     = keccak256("COURT_ROLE");
    bytes32 public constant ESCROW_ROLE    = keccak256("ESCROW_ROLE");
    bytes32 public constant ISSUER_ROLE    = keccak256("ISSUER_ROLE");
```

**What is `keccak256("STRING")`?**
- Takes the text `"REGISTRAR_ROLE"` and hashes it to a fixed 32-byte (256-bit) value
- Example: `keccak256("REGISTRAR_ROLE")` → `0x1234...abcd` (always the same)
- **Why not just `0x01`?** Because:
  1. **Deterministic** — same string = same hash, every deployment, every chain
  2. **Collision-resistant** — astronomically unlikely two different strings produce same hash
  3. **Self-documenting** — the name *is* the ID; no separate registry needed
  4. **OpenZeppelin standard** — `AccessControl` expects `bytes32` role identifiers

**`public constant`** means:
- `constant` = baked into bytecode at compile time (no storage slot, cheaper)
- `public` = auto-generates a getter: `roleManager.REGISTRAR_ROLE()` returns the hash

---

### Constructor
```solidity
    constructor(address admin) {
        if (admin == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }
```
- Checks `admin != address(0)` — prevents "bricking" the contract (no admin = no one can ever grant roles)
- Calls `_grantRole` (internal, from `AccessControl`) to give `DEFAULT_ADMIN_ROLE` to the deployer
- **Note:** We call `_grantRole` directly here (not `grantRole`) because during construction there's no admin yet to authorize it

---

### The Critical Override: `_grantRole`

```solidity
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role == REGISTRAR_ROLE || role == SURVEYOR_ROLE || role == COURT_ROLE) {
            if (hasRole(REGISTRAR_ROLE, account) && role != REGISTRAR_ROLE) {
                revert ConflictingRole(account, REGISTRAR_ROLE, role);
            }
            if (hasRole(SURVEYOR_ROLE, account) && role != SURVEYOR_ROLE) {
                revert ConflictingRole(account, SURVEYOR_ROLE, role);
            }
            if (hasRole(COURT_ROLE, account) && role != COURT_ROLE) {
                revert ConflictingRole(account, COURT_ROLE, role);
            }
        }
        return super._grantRole(role, account);
    }
```

#### What is `_grantRole`?
- **Internal** function in `AccessControl` that *actually* writes the role to storage
- Called by: `grantRole()`, `renounceRole()`, and any batch-grant functions
- **We override it** to intercept *every* role grant before it hits storage

#### Why override here instead of in `grantRole`?
| Approach | Problem |
|----------|---------|
| Override `grantRole` only | Misses `renounceRole`, batch operations, internal calls |
| Override `_grantRole` | **Catches everything** — single choke point |

#### What the `ConflictingRole` Check Prevents

**Rule:** One account ≤ **one** of `{REGISTRAR, SURVEYOR, COURT}`

```solidity
if (hasRole(REGISTRAR_ROLE, account) && role != REGISTRAR_ROLE)
```
Translates to: *"If account is already a Registrar, and we're trying to make them a Surveyor or Court → REVERT"*

**Why this matters (fraud prevention):**
- **Registrar** creates parcels
- **Surveyor** verifies boundaries  
- **Court** overturns ownership legally
- If one person is **Registrar + Court**: they can create fake land *and* legally seize it
- If one person is **Surveyor + Registrar**: they can "verify" their own fake parcels

**The `role != REGISTRAR_ROLE` part** allows re-granting the *same* role (idempotent — harmless, no double-event).

---

### View Helpers — What `hasRole` Does

```solidity
    function isRegistrar(address account) public view returns (bool) {
        return hasRole(REGISTRAR_ROLE, account);
    }
    // ... same pattern for isSurveyor, isCourt, isEscrow, isIssuer
```

**`hasRole(role, account)`** (from `AccessControl`):
- Reads a mapping: `mapping(bytes32 => mapping(address => bool)) _roles`
- Returns `true` if `account` has been granted `role`, else `false`
- **`view`** = reads only, no gas cost when called off-chain (eth_call)

**Why wrappers?**
```solidity
// Without helper (caller must know role constants)
roleManager.hasRole(keccak256("REGISTRAR_ROLE"), addr)

// With helper (clean, typo-proof)
roleManager.isRegistrar(addr)
```

---

## Five Examiner Questions & Model Answers

| # | Question | Model Answer |
|---|----------|--------------|
| **1** | "Why use `keccak256('REGISTRAR_ROLE')` instead of `bytes32 constant REGISTRAR_ROLE = 0x01`?" | Deterministic across deployments, collision-resistant, self-documenting, and matches OpenZeppelin conventions. Numeric IDs require manual coordination and risk collisions across contracts. |
| **2** | "What happens if the admin calls `grantRole(REGISTRAR_ROLE, alice)` when Alice already has `SURVEYOR_ROLE`?" | The overridden `_grantRole` intercepts the call, detects Alice holds `SURVEYOR_ROLE` (a different duty-separated role), and reverts with `ConflictingRole(alice, SURVEYOR_ROLE, REGISTRAR_ROLE)`. The role is never written to storage. |
| **3** | "Could a malicious admin bypass separation of duties by upgrading the contract via a proxy?" | **Not through this contract's code** — the override intercepts every internal `_grantRole` call. However, a proxy upgrade *could* replace the implementation entirely. This is why the `DEFAULT_ADMIN_ROLE` should be held by a multisig/timelock in production, not a single EOA. |
| **4** | "Why override `_grantRole` (internal) instead of `grantRole` (public)?" | `_grantRole` is the **single execution point** for all role assignments — including `grantRole`, `renounceRole`, and any future batch/batch-revoke functions. Overriding only `grantRole` would leave gaps. |
| **5** | "What does `hasRole` actually read from storage, and why is it `view`?" | `AccessControl` stores `mapping(bytes32 role => mapping(address account => bool)) _roles`. `hasRole(role, account)` returns `_roles[role][account]`. It's `view` because it only reads — no state change, so off-chain calls (RPC `eth_call`) cost zero gas. |

---

## Test Results Summary (RoleManager.js)

| Metric | Result |
|--------|--------|
| **Tests Passing** | 28 / 28 |
| **Statement Coverage** | 100% |
| **Branch Coverage** | 100% |
| **Function Coverage** | 100% |
| **Line Coverage** | 100% |

**Test Categories Covered:**
- Constants verification (5 tests)
- Deployment & zero-address guard (2 tests)
- Role granting with events (8 tests)
- Role revocation with events (2 tests)
- Role renouncement (1 test)
- Separation of duties enforcement (5 tests)
- View helper correctness (5 tests)

**Key Attack Vectors Tested:**
- **A3 Impersonation**: Non-admin cannot grant roles ✓
- **A4 Rogue registrar**: Registrar separation is enforced ✓
- **Privilege Escalation**: ConflictingRole enforced for all 3 duty-separated roles ✓

---

# LandRegistry.sol — Function-by-Function Beginner Explanation

## High-Level Purpose

`LandRegistry` is the **core contract** that manages land parcels from submission to registration, through fractional sales, and legal corrections. It **does not store roles itself** — it reads them from an external `IRoleManager` (the contract we just built). This keeps responsibilities separated: RoleManager = "who can do what", LandRegistry = "what happens to land".

## State Overview (What the Contract Remembers)

```solidity
enum ParcelStatus { None, Submitted, SurveyVerified, Registered, UnderSale }
enum VersionReason { Initial, Sale, Correction }
uint256 public constant MAX_OWNERS = 10;
```

| State Variable | Purpose |
|----------------|---------|
| `parcelCount` | Auto-incrementing ID for each new parcel (1, 2, 3...) |
| `status[parcelId]` | Current stage of each parcel |
| `versions[parcelId][]` | **Append-only history** of ownership changes |
| `consentRound[parcelId]` | Which "voting round" we're in for sale consent |
| `consentCount[parcelId]` | How many owners have consented this round |
| `consented[parcelId][round][owner]` | Has this owner voted in this round? |
| `surveyedBy[parcelId]` | Which surveyor verified this parcel |

---

## The Status Flow (Parcel Lifecycle)

```
┌─────────────┐     verifySurvey      ┌──────────────────┐     approveRegistration      ┌─────────────┐
│  Submitted  │ ────────────────────► │  SurveyVerified  │ ──────────────────────────► │ Registered  │
│    (1)      │     (Surveyor only)   │      (2)         │      (Registrar only)       │    (3)      │
└─────────────┘                       └──────────────────┘                             └──────┬──────┘
                                                                                            │
                    ┌─────────────────────────────────────────────────────────────────────┘
                    │                              ▲
                    ▼                              │
            ┌───────────────┐            unlockParcel (Escrow)
            │  UnderSale    │ ◄─────────────────────────────┘
            │    (4)        │     (consents reset, round++)
            └───────┬───────┘
                    │
                    ▼ transferParcel (Escrow)
            ┌───────────────┐
            │  Registered   │ ◄── NEW version appended (Sale reason)
            │    (3)        │     (single new owner at 100%)
            └───────────────┘
```

**Key Rule:** You **cannot skip steps**. The contract enforces this with `InvalidStatus` reverts.

---

## Function by Function

### 1. `constructor(IRoleManager roleManager_)`
```solidity
constructor(IRoleManager roleManager_) {
    if (address(roleManager_) == address(0)) revert ZeroAddress();
    roleManager = roleManager_;
}
```
- **What:** Saves the RoleManager address so we can call `roleManager.isRegistrar(msg.sender)` etc.
- **Why `immutable`:** Set once at deploy, never changes — cheaper gas, can't be tampered with.
- **ZeroAddress check:** Prevents deploying with a broken role manager (would brick all permission checks).

### 2. `submitParcel(owners[], shares[], docHash, cid)` — **Anyone (but must be an owner)**
```solidity
function submitParcel(...) external nonReentrant returns (uint256 parcelId)
```
**Validations (13 checks!):**
| Check | Error | Attack Stopped |
|-------|-------|----------------|
| `owners.length == shares.length` | `LengthMismatch` | Data corruption |
| `owners.length >= 1` | `NoOwners` | Ghost parcels |
| `owners.length <= MAX_OWNERS (10)` | `TooManyOwners` | Bounded ownership input |
| No `address(0)` in owners | `ZeroAddress` | Burned ownership |
| No duplicate owners | `DuplicateOwner` | Duplicate ownership entries |
| Every `share > 0` | `ZeroShare` | Invalid ownership entry |
| `sum(shares) == 100` | `SharesMustSumTo100` | Invalid share total |
| `msg.sender` in owners | `SubmitterNotAnOwner` | Impersonation / A3 |
| `docHash != 0` | `EmptyDocHash` | Missing legal proof |
| `cid != ""` | `EmptyCid` | Missing metadata pointer |

**On success:**
- `parcelCount++` (new unique ID — **supports A1 double-sale protection**)
- `status = Submitted`
- `_appendVersion(..., VersionReason.Initial)` — creates version 0
- Emits `ParcelSubmitted` event

**Why `nonReentrant`?** Prevents a malicious contract from calling back into `submitParcel` mid-execution.

---

### 3. `verifySurvey(parcelId)` — **Surveyor only**
```solidity
function verifySurvey(uint256 parcelId) external nonReentrant
```
**Checks:**
1. `roleManager.isSurveyor(msg.sender)` — **NotSurveyor** if false (**A3 Impersonation / A4 Rogue registrar**)
2. `status == Submitted` — **InvalidStatus** if not (can't verify Registered land)
3. **ConflictOfInterest:** Caller not in `versions[parcelId].owners` — surveyor can't verify their own land

**On success:**
- `status = SurveyVerified`
- `surveyedBy[parcelId] = msg.sender` (audit trail)
- Emits `SurveyVerified`

**Protections:** A3 Impersonation, A4 Rogue registrar, and the self-verification conflict check

---

### 4. `approveRegistration(parcelId)` — **Registrar only**
```solidity
function approveRegistration(uint256 parcelId) external nonReentrant
```
**Checks:**
1. `roleManager.isRegistrar(msg.sender)` — **NotRegistrar** (**A3 Impersonation / A4 Rogue registrar**)
2. `status == SurveyVerified` — **InvalidStatus** (enforces order: survey THEN register)
3. **ConflictOfInterest:** Registrar not an owner — can't approve your own parcel

**On success:**
- `status = Registered`
- Emits `ParcelRegistered`

**Protections:** A3 Impersonation, A4 Rogue registrar, and the self-approval conflict check

---

### 5. `consentToSale(parcelId)` — **Current owner only**
```solidity
function consentToSale(uint256 parcelId) external nonReentrant
```
**Checks:**
1. `status == Registered` — **InvalidStatus** (only registered land can be sold)
2. Caller is in current owners list — **NotAParcelOwner**
3. `!consented[parcelId][round][caller]` — **AlreadyConsented**

**On success:**
- Marks consent for current round
- `consentCount++`
- Emits `SaleConsentGiven`

**Why Round Counter?**
```
Round 0: Alice consents, Bob consents → lockForSale succeeds
         │
         ▼ unlockParcel called
Round 1: consentRound = 1, consentCount = 0
         Alice must consent AGAIN for new sale
```
Without rounds, old consents would carry over — Bob could unlock, then Alice relists without Bob's fresh agreement. **Rounds = fresh unanimous consent per sale attempt.**

---

### 6. `lockForSale(parcelId, lister)` — **Escrow only**
```solidity
function lockForSale(uint256 parcelId, address lister) external nonReentrant
```
**Checks:**
1. `roleManager.isEscrow(msg.sender)` — **NotEscrow** (**A3 Impersonation**: only escrow can list)
2. `status == Registered` — **InvalidStatus** (can't list Unregistered or already-listed land)
3. `lister` is current owner — **NotAParcelOwner**
4. `consentCount == owners.length` — **ConsentsMissing** (unanimous required)

**On success:**
- `status = UnderSale`
- Emits `ParcelLocked`

**A1 Double sale:** If already `UnderSale`, `status != Registered` → reverts. **Cannot list the same parcel twice.**

---

### 7. `unlockParcel(parcelId)` — **Escrow only**
```solidity
function unlockParcel(uint256 parcelId) external nonReentrant
```
**Checks:** Only Escrow, status must be `UnderSale`.

**On success:**
- `status = Registered` (back to registered)
- `consentRound++` (new round = old consents invalidated)
- `consentCount = 0`
- Emits `ParcelUnlocked`

**Why reset consents?** If Alice and Bob consented, escrow unlocks, then Alice tries to relist — Bob must consent **again**. Prevents "stale consent" attacks.

---

### 8. `transferParcel(parcelId, newOwner)` — **Escrow only**
```solidity
function transferParcel(uint256 parcelId, address newOwner) external nonReentrant
```
**Checks:**
1. Only Escrow (**NotEscrow** — **A3 Impersonation**)
2. `status == UnderSale` — **InvalidStatus** (can only transfer during active sale)
3. `newOwner != address(0)` — **ZeroAddress**

**On success:**
```solidity
// Creates NEW version with:
owners = [newOwner]
shares = [100]
docHash = SAME as previous version  ← Carries forward legal doc
cid = SAME as previous version      ← Carries forward metadata
reason = VersionReason.Sale
```
- `status = Registered` (sale complete)
- `consentRound++`, `consentCount = 0` (clean slate for new owner)
- Emits `OwnershipTransferred(parcelId, newOwner, newVersionIndex)`

**Append-Only Version History:**
```
versions[parcelId][0] = { owners: [Alice, Bob], shares: [60,40], reason: Initial }
versions[parcelId][1] = { owners: [Carol],      shares: [100],   reason: Sale, docHash/cid SAME }
```
- **Old versions NEVER deleted or modified** — full audit trail
- Anyone can call `getVersion(parcelId, 0)` to see original owners
- **A4 Rogue registrar protection:** Registration follows the required independent approval path; versions are append-only.

---

### 9. `_appendVersion(...)` — Internal Helper
```solidity
function _appendVersion(...) internal returns (uint256) {
    Version storage v = versions[parcelId].push();
    v.owners = owners; v.shares = shares; v.docHash = docHash;
    v.cid = cid; v.timestamp = uint64(block.timestamp); v.reason = reason;
    return versions[parcelId].length - 1;
}
```
- `storage v = versions[parcelId].push()` — appends new slot to array, returns reference
- Fills all fields atomically
- Returns index of new version (for events)

---

## View Functions (Read-Only, Free Off-Chain)

| Function | Returns | Reverts If |
|----------|---------|------------|
| `getStatus(parcelId)` | `ParcelStatus` enum | `ParcelNotFound` |
| `getOwners(parcelId)` | `(address[], uint16[])` — latest version | `ParcelNotFound` |
| `versionCount(parcelId)` | `uint256` | `ParcelNotFound` |
| `getVersion(parcelId, index)` | `Version struct` | `ParcelNotFound` / `VersionNotFound` |
| `verifyDocument(parcelId, hash)` | `bool` (matches latest docHash?) | `ParcelNotFound` |
| `isOwner(parcelId, account)` | `bool` | `ParcelNotFound` |

**`verifyDocument` implements A2:** Off-chain, anyone can verify a presented deed hash matches the on-chain record. Forged documents return `false`.

---

## ConflictOfInterest — Why It Exists

```solidity
// In verifySurvey AND approveRegistration:
for (owner in latest.owners) {
    if (owner == msg.sender) revert ConflictOfInterest();
}
```

**Real-world analogy:** A judge cannot preside over their own lawsuit. A surveyor cannot verify their own land. A registrar cannot register their own parcel.

**Attacks prevented:**
- Surveyor + Owner = impersonation/conflict of interest (**A3/A4**)
- Registrar + Owner = rogue registrar/conflict of interest (**A3/A4**)
- Combined with RoleManager separation of duties: **One person cannot be Surveyor + Registrar + Owner simultaneously**

---

## Encrypted document model

The original file is hashed with SHA-256 into `docHash`. A public manifest CID
describes the document and points to the encrypted ciphertext in storage.
`DocumentAccess` keeps per-reader wrapped file keys and the access/rotation
audit trail; it does not provide confidentiality by itself. The named A6
scenarios in `test/documentFlow.js` and `test/docCrypto.js` cover vaults,
authenticated encryption, reader isolation, tamper detection, and rotation.

The dev store is only a local IPFS substitute, Kubo is an optional separately
operated service, lost passwords/backups are unrecoverable, and deployed
browsers require HTTPS (`http://localhost` is allowed for local development).

## Attack Mapping: Which Code Stops Which Attack

| Attack | Code Defense |
|--------|--------------|
| **A1: Double sale** | `parcelCount` creates unique IDs and `lockForSale` rejects an already listed parcel. Implemented and tested |
| **A2: Forged document** | `verifyDocument` detects a hash that does not match the stored record. Implemented and tested |
| **A3: Impersonation** | `isRegistrar`, `isSurveyor`, `isEscrow`, owner, seller, and buyer checks protect gated actions. Implemented and tested |
| **A4: Rogue registrar** | Separation of duties, required survey/registration order, and conflict checks protect approvals. Implemented and tested |
| **A5: Escrow reentrancy** | `withdraw()` alone uses `nonReentrant`, with pull payments and effects-first clearing. Implemented and tested |
| **A6: Unauthorised file access** | Encrypted storage, per-reader wrapped keys, vaults, authenticated decryption, and rotation are implemented and tested in `test/documentFlow.js` and `test/docCrypto.js` |
| **A7: KYC bypass** | Not implemented in this contract set. Planned, Step 8 |
| **A8: Override abuse** | Not implemented in this contract set. Planned, Step 7 |

---

## Five Examiner Questions & Model Answers

| # | Question | Model Answer |
|---|----------|--------------|
| **1** | "Why does `consentToSale` use a `round` counter instead of just a boolean `hasConsented`?" | Without rounds, if Alice and Bob consent, escrow unlocks (sale cancelled), then Alice relists — Bob's old consent would still count. Rounds force **fresh unanimous consent per sale attempt**: `unlockParcel` increments `consentRound`, zeroes `consentCount`, invalidating all prior votes. |
| **2** | "What prevents a malicious registrar from calling `approveRegistration` on a parcel that was never surveyed?" | The `require(status == SurveyVerified)` check. `approveRegistration` reverts `InvalidStatus(current, SurveyVerified)` if status is `Submitted` (1) instead of `SurveyVerified` (2). The status machine **enforces order**: Submit → Survey → Register. Cannot skip. |
| **3** | "How does `transferParcel` preserve the legal document hash across ownership changes?" | `_appendVersion` copies `latest.docHash` and `latest.cid` into the new version. The new version has `reason = Sale` and new owner at 100%, but **docHash/cid are identical** to version 0. `verifyDocument` checks the *latest* version, so the legal proof travels with the land forever. |
| **4** | "Could an attacker submit a duplicate parcel before `lockForSale`?" | **A1 Double sale is prevented by unique `parcelCount`.** Each `submitParcel` increments `parcelCount` — two parcels with identical owners/shares/docHash get **different IDs**. `lockForSale` operates on `parcelId`, not content. Listing the same ID twice reverts (`status != Registered`). |
| **5** | "Why is `versions` an array of structs instead of a single `Parcel` struct with current owners?" | **Append-only history = tamper-proof audit trail (A4).** A single struct could be overwritten. With `versions[]`, every change (Initial, Sale, Correction) creates a new immutable record. `getVersion(parcelId, 0)` always returns the original owners. Courts/regulators can reconstruct full ownership chain. |

---

## Test Results Summary (LandRegistry.js)

| Metric | Result |
|--------|--------|
| **Tests Passing** | 52 / 52 |
| **Statement Coverage** | 93.1% |
| **Branch Coverage** | 80.19% |
| **Function Coverage** | 93.33% |
| **Line Coverage** | 95.73% |

**A1–A6 are implemented and tested. A7–A8 remain planned work.**

---

# TitleEscrow.sol — Function-by-Function Beginner Explanation

## High-Level Purpose

`TitleEscrow` is the **safe-sale machine** that holds buyer funds and completes the atomic transfer when both seller AND registrar approve. It implements A1 Double sale, A3 Impersonation, A4 Rogue registrar, and A5 Escrow reentrancy protections.

**Key Design Decisions:**
- **Pull payments only** — contract never sends ETH automatically; records "you are owed X" and you collect with `withdraw()`
- **Effects before interactions** — state changes (delete deal, credit balances) happen BEFORE external calls
- **Pro-rata split by shares** — 60/40 co-owned parcel pays 60% and 40%; rounding remainder goes to listing seller
- **Conflict of interest** — registrar cannot be buyer or parcel owner
- **Dual approval required** — seller alone cannot complete, registrar alone cannot complete
- **Registry lock prevents double sale** — registry's `lockForSale` blocks a second listing (A1)

---

## State Machine

```
DealStatus: None → Listed → Funded → Completed
                    ↓              ↓
                    Cancelled      Refunded (after 7-day deadline)
```

**Transitions:**
| From | To | Trigger | Who |
|------|-----|---------|-----|
| None | Listed | `listParcel` | Seller (owner) |
| Listed | Cancelled | `cancelListing` | Seller (before deposit) |
| Listed | Funded | `deposit` | Buyer (exact price) |
| Funded | Completed | `approveAsSeller` + `approveAsRegistrar` | Both approvals |
| Funded | Refunded | `refundAfterDeadline` | Anyone (after 7 days) |

---

## Function by Function

### 1. `constructor(IRoleManager, ILandRegistry)`
```solidity
constructor(IRoleManager roleManager_, ILandRegistry registry_) {
    if (address(roleManager_) == address(0) || address(registry_) == address(0)) revert ZeroAddress();
    roleManager = roleManager_; registry = registry_;
}
```
- Stores both contracts as `immutable` — set once, never changes
- Zero address check prevents bricking

### 2. `listParcel(parcelId, price)` — **Seller (owner) only**
```solidity
function listParcel(uint256 parcelId, uint256 price) external
```
**Checks:**
1. `price > 0` — `InvalidPrice`
2. `registry.isOwner(parcelId, msg.sender)` — `NotParcelOwner`
3. `deal.status == None` — `DealExists` (A1 Double sale: can't list twice)
4. **Effects first**: saves deal, **then** calls `registry.lockForSale(parcelId, seller)`

**Why effects first?** If `lockForSale` reverts (e.g., missing consents), deal never saved — no partial state.

**A1 Double sale protection:** Registry's `lockForSale` requires `status == Registered` and all consents. A second listing reverts at registry level. Escrow's `DealExists` catches it first.

### 3. `cancelListing(parcelId)` — **Seller only, before deposit**
```solidity
function cancelListing(uint256 parcelId) external
```
**Checks:** Deal=Listed, caller=seller
**Effects first**: `delete deal`, **then** `registry.unlockParcel`
**Result**: Status→Registered, consents reset (fresh round needed)

### 4. `deposit(parcelId)` — **Buyer, payable, exact price**
```solidity
function deposit(uint256 parcelId) external payable
```
**Checks:**
1. Deal=Listed (`NoActiveDeal` if None, `WrongDealStatus` otherwise)
2. `msg.value == price` — `WrongAmount(sent, expected)` (A1 Double sale workflow requires an exact deposit)
3. `!registry.isOwner(parcelId, msg.sender)` — `BuyerIsOwner` (A4 Rogue registrar workflow prevents conflicted ownership actions)

**On success**: Sets buyer, status→Funded, deadline=now+7days
**Event**: `Deposited(parcelId, buyer, amount, deadline)`

### 5. `approveAsSeller(parcelId)` — **Seller only**
```solidity
function approveAsSeller(uint256 parcelId) external
```
**Checks:** Deal=Funded, caller=seller, not expired, not already approved
**On success**: `sellerApproved=true`, emits `Approved(..., true)`, calls `_tryComplete`

### 6. `approveAsRegistrar(parcelId)` — **Registrar only (A3/A4)**
```solidity
function approveAsRegistrar(uint256 parcelId) external
```
**Checks:**
1. `roleManager.isRegistrar(msg.sender)` — `NotRegistrar` (A3 Impersonation: only registrar)
2. Deal=Funded, not expired, not already approved
3. **Conflict of Interest**: `msg.sender != buyer && !registry.isOwner(parcelId, msg.sender)` — `ConflictOfInterest` (A4 Rogue registrar: registrar ≠ buyer/owner)

**On success**: `registrarApproved=true`, emits `Approved(..., false)`, calls `_tryComplete`

### 7. `_tryComplete` / `_completeSale` — **Internal, atomic**
```solidity
function _tryComplete(uint256 parcelId) internal {
    if (deal.sellerApproved && deal.registrarApproved) _completeSale(parcelId);
}

function _completeSale(uint256 parcelId) internal {
    // 1. Read deal into memory (before deletion)
    // 2. Get owners/shares from registry
    // 3. EFFECTS FIRST: delete deal, credit pendingWithdrawals pro-rata
    // 4. Rounding remainder → seller
    // 5. THEN: registry.transferParcel(parcelId, buyer)
}
```

**Pro-rata split:**
```solidity
for each owner: credit += price * share / 100
remainder = price - sum(credits) → seller
```

**Effects-before-interactions (A5 Escrow reentrancy):**
- Deal deleted, balances credited **before** `registry.transferParcel`
- If transfer fails, state already clean (deal deleted)
- `withdraw` also clears balance BEFORE `.call`

### 8. `refundAfterDeadline(parcelId)` — **Anyone, after 7 days**
```solidity
function refundAfterDeadline(uint256 parcelId) external
```
**Checks:** Deal=Funded, `block.timestamp > deadline`
**Effects first**: delete deal, credit buyer, **then** `registry.unlockParcel`
**Result**: Buyer gets money back, parcel→Registered, fresh consents needed

### 9. `withdraw()` — **Pull payment, nonReentrant**
```solidity
function withdraw() external nonReentrant {
    amount = pendingWithdrawals[msg.sender];
    if (amount == 0) revert NothingToWithdraw();
    pendingWithdrawals[msg.sender] = 0;  // EFFECTS FIRST
    (bool success, ) = msg.sender.call{value: amount}("");
    if (!success) revert TransferFailed();
}
```

**Why pull payments (A5 Escrow reentrancy)?**
- Contract never pushes ETH — receiver pulls
- Malicious receiver can't hijack sale by reverting in receive()
- Balance cleared BEFORE external call → reentrancy safe

---

## Key Attack Defences

| Attack | Defence |
|--------|---------|
| **A1: Double sale** | Registry `lockForSale` blocks a second listing; `DealExists` protects the escrow record. Implemented and tested |
| **A2: Forged document** | The registry's document-hash verification detects a forged document. Implemented and tested |
| **A3: Impersonation** | Role and participant checks reject unauthorized actors. Implemented and tested |
| **A4: Rogue registrar** | `ConflictOfInterest` blocks a registrar who is the buyer or an owner. Implemented and tested |
| **A5: Escrow reentrancy** | Only `withdraw()` uses `nonReentrant`; pull payments and effects-first clearing protect funds. Implemented and tested |
| **A6: Unauthorised file access** | Implemented through encrypted storage and `DocumentAccess` reader-key wrapping. Tested in `test/documentFlow.js` and `test/docCrypto.js` |
| **A7: KYC bypass** | Not implemented in this contract set. Planned, Step 8 |
| **A8: Override abuse** | Not implemented in this contract set. Planned, Step 7 |

---

## Five Examiner Questions & Model Answers

| # | Question | Model Answer |
|---|----------|--------------|
| **1** | "Why does `listParcel` call `registry.lockForSale` AFTER saving the deal, not before?" | **Effects-first pattern.** If `lockForSale` reverts (e.g., missing consents), the deal is never saved — no partial state. If we called registry first then saved deal, a revert would leave registry locked but no deal to track it. |
| **2** | "How does the pro-rata payout handle rounding when price doesn't divide evenly by 100?" | Each owner gets `price * share / 100`. The sum of these may be less than `price` (e.g., 101 wei × 60/40 = 60 + 40 = 100, remainder 1). The remainder goes to the **listing seller** as a bonus. Sum of credits always exactly equals price. |
| **3** | "What prevents a registrar from approving their own purchase?" | `ConflictOfInterest` check in `approveAsRegistrar`: `msg.sender != buyer && !registry.isOwner(parcelId, msg.sender)`. If registrar is buyer or owner, reverts. Combined with RoleManager separation: one person cannot be both Registrar and owner. |
| **4** | "Why 7-day deadline for refunds? What if buyer disappears?" | 7 days gives registrar time to review. After deadline, **anyone** can call `refundAfterDeadline` — buyer, seller, or third party. Buyer gets money back, parcel unlocks. Seller can relist with fresh consent. No funds locked forever. |
| **5** | "How does `withdraw` prevent reentrancy without a mutex on the caller side?" | **Pull payments + effects-first:** 1) Read amount, 2) Set `pendingWithdrawals[msg.sender] = 0` (state change), 3) `.call{value: amount}("")`. If receiver re-enters `withdraw`, their balance is already 0 → `NothingToWithdraw`. `nonReentrant` on `withdraw` adds second layer. |

---

## Test Results Summary (TitleEscrow.js)

| Metric | Result |
|--------|--------|
| **Tests Passing** | 165 / 165 full suite |
| **Statement Coverage** | 100% |
| **Branch Coverage** | 89.73% |
| **Function Coverage** | 100% |
| **Line Coverage** | 99.34% |

**Test Categories (TitleEscrow contributes 45 tests to the 150-test full suite):**
- DEPLOYMENT (3), LIST (6), CANCEL (4), DEPOSIT (7), SELLER APPROVAL (5)
- REGISTRAR APPROVAL (7), A4 SINGLE APPROVAL (2), COMPLETION (4)
- REFUND (4), WITHDRAW (2), A5 REENTRANCY (2), DIRECT ETH (1), INVARIANT (1)

**Key Project Protections:** A1✓ A2✓ A3✓ A4✓ A5✓ A6✓; A7 planned (Step 8), A8 planned (Step 7)

---

# Step 5: Deployment, Demo Data, Gas Benchmark — Beginner Explanation

## What We Built in Step 5

### 1. `deployAll()` — The Reusable Deployment Function

```javascript
// scripts/lib/deployAll.js
async function deployAll() {
    const signers = await ethers.getSigners();
    const roleManager = await RoleManager.deploy(signers[0].address);
    await roleManager.waitForDeployment();
    const registry = await LandRegistry.deploy(roleManager);
    await registry.waitForDeployment();
    const escrow = await TitleEscrow.deploy(roleManager, registry);
    await escrow.waitForDeployment();
    // ... grant roles to specific signers ...
    return { roleManager, registry, escrow, signers };
}
```

**Why tests reuse it:**
- **DRY (Don't Repeat Yourself):** Every test file (`RoleManager.test.js`, `LandRegistry.test.js`, `deployment.test.js`, `gas-benchmark.js`) needs the same 3 contracts deployed with the same roles granted
- **Isolation:** Each test gets a **fresh deployment** — no state leakage between tests
- **Consistency:** Same accounts get same roles every time (Admin=0, Registrar=1, Surveyor=2, Court=3, Alice=4, Bob=5, Carol=6, Dave=7, Issuer=8, Eve=9)

---

### 2. ABI — The Contract's "User Manual"

```json
// From deployments/localhost.json
"abi": [
  {
    "inputs": [{"name": "admin", "type": "address"}],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [{"name": "parcelId", "type": "uint256"}],
    "name": "verifySurvey",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]
```

**What it is:** Application Binary Interface — a JSON array describing every function, event, and error the contract has: names, parameter types, return types, mutability.

**Why the frontend needs it:**
```javascript
// Frontend (React/Vue/vanilla JS) uses ABI to talk to contract
const contract = new ethers.Contract(address, abi, signer);
await contract.verifySurvey(parcelId);  // ABI tells ethers how to encode this call
```
Without ABI, the frontend wouldn't know:
- What functions exist
- What parameters they take (types, order)
- What they return
- Which are `view` (free) vs `nonpayable` (cost gas) vs `payable` (accept ETH)

The `scripts/deploy.js` writes `deployments/localhost.json` containing each contract's address **and** its ABI, so any frontend can immediately connect.

---

### 3. BaselineRegistry — The Control Group

```solidity
// contracts/BaselineRegistry.sol
contract BaselineRegistry {
    address public immutable authority;
    // Single authority does EVERYTHING
    function registerParcel(address owner, bytes32 docHash, string cid) external { ... }
    function transferParcel(uint256 id, address newOwner) external { ... }
}
```

**What it represents:** A **naive, centralized land registry** — one person (authority) registers parcels and transfers them. No surveyors, no registrars, no escrow, no owner consent.

**Why it's the control group:**
| Aspect | Baseline (Control) | Proposed (Treatment) |
|--------|-------------------|---------------------|
| Authority | 1 person | 4 roles (Admin, Registrar, Surveyor, Escrow) |
| Owner consent | ❌ Never asked | ✅ Required for sale |
| Double-sale prevention | ❌ None | ✅ Escrow lock |
| Self-dealing prevention | ❌ Authority can steal | ✅ ConflictOfInterest checks |
| Audit trail | ❌ Single state | ✅ Append-only versions |

**In experiments:** You compare your system against a baseline to measure **what you gained** (security) vs **what you paid** (gas, complexity).

---

### 4. What Is Gas? (With Reference to Our Project)

**Gas is the unit of computation on Ethereum.** Every operation the EVM (Ethereum Virtual Machine) performs costs gas:

| Operation | Gas Cost (approx) | In Our Project |
|-----------|-------------------|----------------|
| `ADD` / `SUB` | 3 | Simple math in share calculations |
| `SLOAD` (read storage) | 2,100 | Reading `parcels[id]`, `pendingWithdrawals[user]` |
| `SSTORE` (write storage) | 20,000 (new) / 5,000 (update) | Writing `deals[parcelId]`, `versions[parcelId].push()` |
| `LOG` (emit event) | 375 + data | `emit SaleCompleted(...)`, `emit ParcelSubmitted(...)` |
| `CALL` (external call) | 2,600 + | `registry.lockForSale()`, `registry.transferParcel()`, `addr.call{value}("")` |

**In our project, gas comes from:**
1. **Storage writes** — `submitParcel` creates a new parcel (SSTORE for `parcels[parcelId]`, `versions[parcelId]`). More owners = more SSTOREs.
2. **External calls** — `listParcel` calls `registry.lockForSale`; `approveAsRegistrar` calls `registry.transferParcel`; `withdraw` calls `addr.call{value}("")`.
3. **Loops** — Pro-rata payout loops over owners; consent checking loops over owners.
4. **Events** — Every state change emits an event (LOG opcodes).

**How we measure it:**
```javascript
// In gas-benchmark.js
const tx = await contract.someFunction();
const receipt = await tx.wait();           // Wait for mining
const gasUsed = Number(receipt.gasUsed);  // BigInt → Number
```
- **`receipt.gasUsed`** = actual gas consumed (not the gas limit you set)
- **Deterministic on Hardhat:** Same code + same inputs = same gas every run (no mempool, no congestion)
- **We measure from receipts** because that's what you actually pay for
- **Fresh deployment per scenario** ensures no warm/cold storage effects skew results

---

### 5. Why Latency Is Not Reported

```json
// In gas-results.json metadata
"note": "gas is deterministic on this network; latency is not measured because blocks mine instantly"
```

**Reasons:**
1. **Hardhat mines instantly** — `evm_mine` creates a block in <1ms. No network propagation, no consensus delay.
2. **Latency ≠ Gas** — Gas measures **computation cost** (EVM steps). Latency measures **wall-clock time** (network, consensus, mempool).
3. **Real latency depends on:** L1 vs L2, block time (12s Ethereum, 2s Polygon), congestion, tip, RPC provider.
4. **Our benchmark isolates** the *protocol cost* (gas), not the *infrastructure cost* (latency).

---

## Step 5 Artifacts Created

| File | Purpose |
|------|---------|
| `scripts/lib/deployAll.js` | Reusable deployment + `ACCOUNT_LABELS` |
| `scripts/deploy.js` | Deploys to localhost, writes `deployments/localhost.json`, prints table |
| `scripts/seed.js` | Creates 5 demo parcels in specific states |
| `scripts/time-travel.js` | Advances time by `DAYS` env var for deadline testing |
| `scripts/gas-benchmark.js` | Measures gas for all operations + comparison vs Baseline |
| `test/deployment.js` | Integration tests + 1 end-to-end flow test |
| `deployments/localhost.json` | Contract addresses + ABIs + account labels |
| `results/gas-results.json` | Full benchmark data + metadata |
| `results/gas-results.csv` | Tables in CSV format |

---

## Gas Benchmark Results Summary

### TABLE 1: Proposed System - Gas per Operation

| Operation | Gas | TXs | Signers |
|-----------|-----|-----|---------|
| submitParcel(1 owner) | 259,970 | 1 | 1 |
| submitParcel(2 owners) | 267,077 | 1 | 1 |
| submitParcel(5 owners) | 342,867 | 1 | 1 |
| submitParcel(10 owners) | 479,875 | 1 | 1 |
| verifySurvey | 66,038 | 1 | 1 |
| approveRegistration | 43,758 | 1 | 1 |
| consentToSale | 81,922 | 1 | 1 |
| listParcel | 123,006 | 1 | 1 |
| deposit(1 ether) | 66,427 | 1 | 1 |
| approveAsSeller | 31,500 | 1 | 1 |
| **approveAsRegistrar (completes sale)** | **283,626** | 1 | 1 |
| withdraw | 32,398 | 1 | 1 |
| refundAfterDeadline | 91,548 | 1 | 1 |

### TABLE 2: Proposed vs Baseline Comparison

| Operation | Proposed Gas | TXs | Signers | Baseline Gas | TXs | Signers | Ratio |
|-----------|--------------|-----|---------|--------------|-----|---------|-------|
| **Registration** | 369,742 | 3 | 3 | 137,367 | 1 | 1 | **2.69×** |
| **Sale (excl. withdraw)** | 586,481 | 5 | 4 | 31,310 | 1 | 1 | **18.73×** |
| Withdraw (proposed only) | 32,398 | 1 | 1 | N/A | N/A | N/A | N/A |

---

## Five Examiner Questions & Model Answers (Step 5 Focus)

| # | Question | Model Answer |
|---|----------|--------------|
| **1** | **"Why is your system more expensive than the baseline?"** | The baseline does **one thing in one transaction** (authority transfers parcel). Our system enforces **due process**: surveyor verifies, registrar approves, all owners consent, escrow holds funds, dual approval completes. Each check is a transaction with storage writes. The 2.69× registration and 18.73× sale overhead is the **cost of fraud prevention** — no single party can seize land, forge history, or double-sell. |
| **2** | **"Is it a fair comparison?"** | **Yes, functionally fair; economically different.** Both achieve "Alice owns parcel → Bob owns parcel." But baseline has **zero workflow protections**. Our system adds **separation of duties, append-only history, escrow, consent**, and encrypted per-reader document access. The gas premium reflects the implemented A1–A6 protections. A fairer baseline would be a *centralized database* (near-zero gas, but requires trust). |
| **3** | **"Could you reduce the gas cost without losing security?"** | **Marginally, yes:** batch consent transactions, use `calldata` over `memory` where possible, pack bools into bits. But the **fundamental cost** (3 signers for registration, 4 for sale) is inherent to **multi-party authorization**. You can't have "surveyor + registrar + owners consent" in fewer transactions without centralizing trust. Layer 2 (Arbitrum, Optimism) reduces *USD cost* 10–100× while keeping same gas. |
| **4** | **"What does `approveAsRegistrar` do that costs 283k gas?"** | It **completes the sale atomically**: deletes deal, credits 4 owners pro-rata (loop over owners), transfers parcel in registry (creates new version, resets consents), emits event. One transaction does what 5+ would do manually. The loop over owners (`for i in owners`) scales linearly — 10 owners would add ~80k gas. This is the **price of atomic, auditable completion**. |
| **5** | **"Why is latency not in your benchmark?"** | Hardhat mines blocks instantly (`evm_mine` in <1ms). No network propagation, no consensus, no mempool. **Gas measures computation cost** (EVM steps: SLOAD, SSTORE, CALL, LOG). **Latency measures wall-clock time** (network propagation, consensus, block time). Real latency depends on L1/L2, congestion, RPC provider — not protocol logic. We isolate *protocol cost*, not *infrastructure cost*. |

---

## Summary: What You Built in Step 5

| Component | Purpose |
|-----------|---------|
| `deployAll()` | Reusable, isolated deployment — same setup for tests, deploy, seed, bench |
| ABI | Contract's API spec — frontend needs it to encode/decode calls |
| BaselineRegistry | Control group: shows what *no protections* looks like |
| Gas measurement | `receipt.gasUsed` from mined transaction — deterministic on Hardhat |
| No latency | Hardhat mines instantly; we measure protocol cost, not network delay |
| Seed script | Creates 5 demo parcels showing all system states |
| Time-travel | Advances blockchain time to test deadline refunds |
| Benchmark | Quantifies the security-vs-cost tradeoff with real numbers |

**The trade-off is explicit:** You pay additional gas for the implemented A1–A6 protections, while A7–A8 remain planned for later steps. On Layer 2, this gas cost becomes pennies.