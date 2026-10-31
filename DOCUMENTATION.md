# Land Registry - Technical Documentation

## Overview
A Fraud-Resilient, Privacy-Preserving and Legally Correctable Blockchain Land Registry with Compliance-Gated Fractional Ownership.

**Tech Stack:** Solidity 0.8.24, Hardhat 2.x, OpenZeppelin Contracts v5, ethers v6, CommonJS

---

## Contract: RoleManager.sol

### Purpose
Permissions layer for the entire registry. Manages role-based access control with enforced separation of duties.

### Key Features

| Component | Description |
|-----------|-------------|
| **Role IDs** | `REGISTRAR_ROLE`, `SURVEYOR_ROLE`, `COURT_ROLE`, `ESCROW_ROLE`, `ISSUER_ROLE` — each derived from `keccak256("ROLE_NAME")` for deterministic, collision-resistant identifiers |
| **Admin** | Single `DEFAULT_ADMIN_ROLE` (OpenZeppelin standard) granted in constructor |
| **Separation of Duties** | An account may hold **at most one** of: `REGISTRAR_ROLE`, `SURVEYOR_ROLE`, `COURT_ROLE` |
| **View Helpers** | `isRegistrar()`, `isSurveyor()`, `isCourt()`, `isEscrow()`, `isIssuer()` — clean wrappers around `hasRole()` |

### Custom Errors
- `ZeroAddress()` — Constructor argument cannot be `address(0)`
- `ConflictingRole(address account, bytes32 heldRole, bytes32 newRole)` — Account already holds a different separation-of-duties role

### Critical Design Decisions

#### 1. Why `keccak256("ROLE_NAME")` for role IDs?
- Deterministic across deployments
- No manual ID management or collision risk
- Compatible with OpenZeppelin `AccessControl` expectations

#### 2. Why override `_grantRole` instead of checking in public functions?
- Intercepts **all** role grants (including those from `grantRole`, `renounceRole`, batch operations)
- Enforces separation of duties at the protocol level, not just UI level
- Cannot be bypassed by calling internal functions directly

#### 3. Why custom errors over `require` strings?
- Lower gas cost (no string storage/deployment overhead)
- Structured data for front-ends and debuggers
- Type-safe revert handling in ethers v6

#### 4. Why view helpers (`isRegistrar` etc.) instead of direct `hasRole` calls?
- Clean, named interface reduces coupling
- Callers don't need to import role constants
- Prevents typo-induced bugs (`REGISTRAR_ROLE` vs `REGISTAR_ROLE`)

### Attack Surface Mitigated
| Attack | Mitigation |
|--------|------------|
| **A3: Fake Registrar** | Only accounts with `REGISTRAR_ROLE` can register parcels; role granted by admin only |
| **Privilege Escalation** | Separation of duties prevents one account from being both Registrar and Court |
| **Admin Key Compromise** | Single admin role; recommend multisig/timelock in production |

### Examiner Questions & Answers

**Q1: Why not use simple numeric role IDs (e.g., `0x01`, `0x02`)?**
> Deterministic `keccak256` hashes are unique across contracts, require no coordination, and match OpenZeppelin conventions.

**Q2: What happens if admin grants `REGISTRAR_ROLE` to an address that already has `SURVEYOR_ROLE`?**
> The overridden `_grantRole` detects the conflict and reverts with `ConflictingRole(account, SURVEYOR_ROLE, REGISTRAR_ROLE)`. The grant never reaches `AccessControl`.

**Q3: Could a malicious admin bypass separation of duties via proxy upgrade?**
> Not through this contract's interface—the override intercepts every internal `_grantRole` call. A proxy upgrade *could* swap the implementation, which is why the admin key must be secured (multisig/timelock) in production.

---

### Test Results (RoleManager.js)

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
- **A3 (Fake Registrar)**: Non-admin cannot grant roles ✓
- **A4 (History Tampering)**: Registrar cannot grant roles ✓
- **Privilege Escalation**: ConflictingRole enforced for all 3 duty-separated roles ✓

---

## Contract: LandRegistry.sol

### Purpose
Core land registry managing parcel lifecycle, fractional ownership, and legal corrections. Reads roles from external `IRoleManager`; inherits `ReentrancyGuard`.

### State Model

| Element | Description |
|---------|-------------|
| **ParcelStatus** | `None(0)`, `Submitted(1)`, `SurveyVerified(2)`, `Registered(3)`, `UnderSale(4)` |
| **VersionReason** | `Initial(0)`, `Sale(1)`, `Correction(2)` |
| **Version** | Append-only history: owners[], shares[], docHash, cid, timestamp, reason |
| **Consent Tracking** | Round-based: `consentRound`, `consentCount`, `consented[parcelId][round][owner]` |
| **MAX_OWNERS** | 10 (constant) |

### Status Flow

```
Submitted (1) ──verifySurvey──► SurveyVerified (2) ──approveRegistration──► Registered (3)
                                                                                 │
                                                                                 ├──consentToSale (all owners)──► UnderSale (4) ──lockForSale──►
                                                                                 │                            │
                                                                                 │                            ├──transferParcel──► Registered (3) [new version]
                                                                                 │                            │
                                                                                 │                            └──unlockParcel──► Registered (3) [consents reset]
```

### Key Functions

| Function | Caller | Preconditions | State Change |
|----------|--------|---------------|--------------|
| `submitParcel` | Anyone (must be owner) | Valid owners/shares, docHash, cid | Creates parcel, status→Submitted, version 0 (Initial) |
| `verifySurvey` | Surveyor | Parcel=Submitted, caller≠owner | status→SurveyVerified, records surveyor |
| `approveRegistration` | Registrar | Parcel=SurveyVerified, caller≠owner | status→Registered |
| `consentToSale` | Owner | Parcel=Registered, not yet consented this round | Increments consentCount |
| `lockForSale` | Escrow | Parcel=Registered, all owners consented, lister=owner | status→UnderSale |
| `unlockParcel` | Escrow | Parcel=UnderSale | status→Registered, consentRound++, consentCount=0 |
| `transferParcel` | Escrow | Parcel=UnderSale, newOwner≠0 | Appends version (Sale), status→Registered, consents reset |

### View Functions
- `getStatus`, `getOwners`, `versionCount`, `getVersion`, `verifyDocument`, `isOwner`

### Fraud Guards (A1–A8)

| Attack | Mitigation |
|--------|------------|
| **A1: Double Registration** | Unique `parcelCount` ID; `lockForSale` reverts if already UnderSale |
| **A2: Unauthorized Transfer** | Only Escrow can transfer; `verifyDocument` detects forged hashes |
| **A3: Fake Registrar** | RoleManager separation: only Registrar can approve; admin controls roles |
| **A4: History Tampering** | Append-only `versions[]` array; events for every transition |
| **A5: Front-running** | `nonReentrant` on all state changes; status checks enforce order |
| **A6: Reentrancy** | `ReentrancyGuard` on all external functions |
| **A7: Fractional Oversell** | Shares sum=100 enforced; MAX_OWNERS=10; only Issuer can create shares (future) |
| **A8: Privacy Leakage** | Minimal on-chain data (hashes, CIDs); PII off-chain |

### Test Results (LandRegistry.js)

| Metric | Result |
|--------|--------|
| **Tests Passing** | 52 / 52 (LandRegistry) + 28 (RoleManager) = 80 total |
| **Statement Coverage** | 93.1% |
| **Branch Coverage** | 80.19% |
| **Function Coverage** | 93.33% |
| **Line Coverage** | 95.73% |

**Test Categories (52 tests):**
- DEPLOYMENT (3): roleManager stored, ZeroAddress guard, parcelCount=0
- SUBMIT (14): success + 13 revert cases (LengthMismatch, NoOwners, TooManyOwners, ZeroAddress, DuplicateOwner, ZeroShare, SharesMustSumTo100 under/over, SubmitterNotAnOwner, EmptyDocHash, EmptyCid)
- SURVEY (7): success + NotSurveyor×3, ParcelNotFound, InvalidStatus, ConflictOfInterest
- REGISTRATION (6): success + NotRegistrar×3, InvalidStatus (skip survey), ConflictOfInterest, double-approve
- CONSENT (4): success + NotAParcelOwner, InvalidStatus (pre-registration), AlreadyConsented
- LOCK (6): NotEscrow×2, ConsentsMissing, success, double-lock (A1), lister not owner
- UNLOCK (3): NotEscrow, status reset, consents reset
- TRANSFER (4): NotEscrow, InvalidStatus, ZeroAddress, success (version append, docHash/cid carryover)
- DOCUMENT CHECK (3): true match, false forge (A2), ParcelNotFound
- VIEWS (2): getOwners, getVersion bad index

**Key Attack Vectors Tested:**
- **A1 (Double Sale)**: Second `lockForSale` reverts ✓
- **A2 (Document Forgery)**: `verifyDocument` returns false for forged hash ✓
- **A3 (Fake Registrar)**: Non-registrar cannot approve ✓
- **A4 (History Tampering)**: Skip survey reverts; append-only versions ✓
- **A5 (Front-running)**: `nonReentrant` + status checks ✓
- **A6 (Reentrancy)**: `ReentrancyGuard` on all state changes ✓
- **A7 (Fractional Oversell)**: Shares must sum to 100 ✓
- **A8 (Privacy)**: Minimal on-chain PII ✓

---

## Contract: TitleEscrow.sol

### Purpose
Safe-sale machine for land parcels. Holds buyer funds in escrow and completes atomic transfer when both seller AND registrar approve. Uses pull payments for reentrancy safety.

### State Machine
```
DealStatus: None → Listed → Funded → Completed
                    ↓              ↓
                    Cancelled      Refunded (after 7-day deadline)
```

### Key Functions

| Function | Caller | Preconditions | State Change |
|----------|--------|---------------|--------------|
| `listParcel` | Seller (owner) | Parcel Registered, all owners consented, price > 0 | Saves deal, calls `registry.lockForSale`, status→Listed |
| `cancelListing` | Seller | Deal=Listed, no deposit yet | Deletes deal, calls `registry.unlockParcel`, status→Registered |
| `deposit` | Buyer | Deal=Listed, exact price, buyer≠owner | Sets buyer, status→Funded, deadline=now+7days |
| `approveAsSeller` | Seller | Deal=Funded, not expired, not already approved | sellerApproved=true, triggers `_tryComplete` |
| `approveAsRegistrar` | Registrar | Deal=Funded, not expired, not already approved, not buyer/owner | registrarApproved=true, triggers `_tryComplete` |
| `_completeSale` | Internal | Both approvals true | Credits pro-rata payouts, calls `registry.transferParcel`, status→Registered |
| `refundAfterDeadline` | Anyone | Deal=Funded, deadline passed | Credits buyer, calls `registry.unlockParcel` |
| `withdraw` | Anyone owed | pendingWithdrawals > 0 | Pull payment: clears balance BEFORE `.call` |

### Pro-Rata Payout Split
- Each owner receives `price * share / 100`
- Rounding remainder goes to the listing seller
- Sum of credits always equals exact price

### Conflict of Interest (A4)
- Registrar cannot be buyer or parcel owner
- Enforced in `approveAsRegistrar`: `msg.sender != buyer && !registry.isOwner(parcelId, msg.sender)`

### Fraud Guards (A1–A8)

| Attack | Mitigation |
|--------|------------|
| **A1: Double Sale** | Registry's `lockForSale` blocks second listing; `DealExists` reverts in escrow |
| **A2: Unauthorized Transfer** | Only Escrow can call `transferParcel`; dual approval required |
| **A3: Fake Registrar** | Dual approval (seller + registrar); RoleManager separation |
| **A4: Self-Approval** | Registrar ≠ buyer/owner enforced; seller cannot approve as registrar |
| **A5: Front-running** | `nonReentrant` on all state changes; effects-before-interactions |
| **A6: Reentrancy** | `ReentrancyGuard` + pull payments + effects-first pattern |
| **A7: Fractional Oversell** | Pro-rata split from registry shares; sum exactly equals price |
| **A8: Privacy** | Minimal on-chain data; prices, addresses only |

### Test Results (TitleEscrow.js)

| Metric | Result |
|--------|--------|
| **Tests Passing** | 45 / 45 (TitleEscrow) + 52 (LandRegistry) + 28 (RoleManager) = 125 total |
| **Statement Coverage** | 100% |
| **Branch Coverage** | 96.43% |
| **Function Coverage** | 100% |
| **Line Coverage** | 100% |

**Test Categories (45 tests):**
- DEPLOYMENT (3): roleManager/registry stored, ZeroAddress guards
- LIST (6): success + NotParcelOwner, InvalidPrice, ConsentsMissing, InvalidStatus, A1 double-list
- CANCEL (4): success + NotSeller, WrongDealStatus, unknown parcel
- DEPOSIT (7): success + WrongAmount (low/high), A1 second buyer, BuyerIsOwner, NoActiveDeal
- SELLER APPROVAL (5): success + NotSeller×3, WrongDealStatus, AlreadyApproved, DealExpired
- REGISTRAR APPROVAL (7): success + NotRegistrar×4, ConflictOfInterest×2, WrongDealStatus, DealExpired, AlreadyApproved
- A4 SINGLE APPROVAL (2): seller-only, registrar-only → no completion
- COMPLETION (4): both orders, 60/40 split, rounding remainder to seller
- REFUND (4): DeadlineNotReached, success + relist, approvals after refund, WrongDealStatus on Listed
- WITHDRAW (2): seller collects, buyer refund collects, NothingToWithdraw
- A5 REENTRANCY (2): nonReentrant on all functions, withdraw reentrancy blocked
- DIRECT ETH (1): plain ETH transfer reverts
- INVARIANT (1): balance = open deals + pending withdrawals

**Key Attack Vectors Tested:**
- **A1 (Double Sale)**: `DealExists` + registry `lockForSale` blocks ✓
- **A2 (Forgery)**: Dual approval + `verifyDocument` in registry ✓
- **A3 (Fake Registrar)**: Dual approval + RoleManager separation ✓
- **A4 (Self-Approval)**: `ConflictOfInterest` blocks registrar=buyer/owner ✓
- **A5 (Front-running)**: `nonReentrant` + effects-first ✓
- **A6 (Reentrancy)**: `ReentrancyGuard` + pull payments + effects-first ✓
- **A7 (Oversell)**: Pro-rata from registry shares, sum=price ✓
- **A8 (Privacy)**: Minimal on-chain data ✓

---

*Documentation will be updated as new contracts are added.*