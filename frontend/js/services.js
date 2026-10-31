// SPDX-License-Identifier: MIT
// Services layer - contract interactions and business logic

(function() {
    'use strict';

    // In-memory arrays for plots and audit trail
    window.P = [];      // Plot objects
    window.AUD = [];    // Audit trail from event logs

    window.svc = {
        // State
        parcels: [],
        loading: false,
        error: null,

        // Load all parcels and build P/AUD arrays
        async load() {
            if (!chain.deploymentLoaded) {
                await chain.init();
            }

            if (!chain.readProvider) {
                this.error = 'No provider available';
                return;
            }

            try {
                this.loading = true;
                this.error = null;

                // Get contracts from chain
                const { registry, escrow } = chain.contracts;

                const countBig = await registry.parcelCount();
                const count = Number(countBig);

                // Load metadata
                let metadata = {};
                try {
                    const metaRes = await fetch('data/parcel-metadata.json');
                    if (metaRes.ok) {
                        const metaArr = await metaRes.json();
                        metadata = Object.fromEntries(metaArr.map(m => [m.parcelId, m]));
                    }
                } catch (e) {
                    console.warn('Could not load parcel metadata:', e);
                }

                const items = [];
                for (let id = 1; id <= count; id++) {
                    try {
                        const statusBig = await registry.getStatus(id);
                        const statusCode = Number(statusBig);

                        const [owners, sharesBig] = await registry.getOwners(id);
                        const shares = sharesBig.map((s) => Number(s));

                        const vCountBig = await registry.versionCount(id);
                        const versionsCount = Number(vCountBig);

                        let latestDocHash = null;
                        let latestCid = null;
                        if (versionsCount > 0) {
                            try {
                                const latestVer = await registry.getVersion(id, versionsCount - 1);
                                latestDocHash = latestVer.docHash;
                                latestCid = latestVer.cid;
                            } catch (e) {
                                // Non-blocking
                            }
                        }

                        let deal = null;
                        if (statusCode === 4) {
                            try {
                                const d = await escrow.getDeal(id);
                                deal = {
                                    seller: d.seller,
                                    buyer: d.buyer,
                                    price: ethers.formatEther(d.price),
                                    rawPrice: d.price,
                                    deadline: Number(d.deadline) > 0 ? new Date(Number(d.deadline) * 1000) : null,
                                    sellerApproved: d.sellerApproved,
                                    registrarApproved: d.registrarApproved,
                                    status: Number(d.status)
                                };
                            } catch (e) {
                                console.warn(`Could not read deal for parcel ${id}:`, e);
                            }
                        }

                        // Load metadata for this parcel
                        const meta = metadata[id] || {};
                        const area = meta.area || 'Northfield';
                        const addr = meta.addr || `Parcel #${id}`;
                        const size = meta.size || 'unknown';
                        const cell = meta.cell || this.nextFreeCell(area);
                        const pts = this.cellPts(cell) || [];

                        // Build owner display strings
                        const ownerLabels = owners.map((o, i) => {
                            return { addr: o, share: shares[i] };
                        });

                        // Build owner display string
                        const ownerDisplay = ownerLabels.map(o => {
                            const label = CONFIG.ADDRESS_LABELS[o.addr.toLowerCase()];
                            return label ? `${label} (${o.share}%)` : `${CONFIG.formatAddress(o.addr)} (${o.share}%)`;
                        }).join(', ');

                        // Verify docHash
                        const metaForHash = { area, addr, size };
                        const expectedDocHash = ethers.id(JSON.stringify([metaForHash.area, metaForHash.addr, metaForHash.size]));
                        const metaOk = latestDocHash && latestDocHash.toLowerCase() === expectedDocHash.toLowerCase();

                        // Build plot object
                        const areaCode = area.slice(0, 3).toUpperCase();
                        const plotId = `TR-${areaCode}-${String(id).padStart(3,'0')}`;

                        const statusKeyMap = { 1: 'pending', 2: 'pending', 3: 'approved', 4: 'sale' };
                        const statusKey = statusKeyMap[statusCode] || 'unknown';
                        const subKeyMap = { 1: 'survey', 2: 'registrar' };
                        const sub = subKeyMap[statusCode] || null;

                        // Build sale object if UnderSale
                        let sale = null;
                        if (statusCode === 4 && deal) {
                            sale = {
                                buyer: deal.buyer,
                                price: deal.price + ' ETH',
                                funded: deal.status === 2,
                                sellerOk: deal.sellerApproved,
                                regOk: deal.registrarApproved,
                                deadline: deal.deadline ? deal.deadline.toISOString() : null
                            };
                        }

                        const plot = {
                            id: `TR-${area.slice(0,3).toUpperCase()}-${String(id).padStart(3,'0')}`,
                            pid: id,
                            st: statusKey,
                            sub: sub,
                            area: area,
                            addr: addr,
                            size: size,
                            cell: cell,
                            pts: pts,
                            owners: ownerLabels,
                            owner: ownerDisplay,
                            docHash: latestDocHash,
                            sale: sale,
                            metaOk: metaOk
                        };

                        window.P.push(plot);

                        const svcParcel = {
                            id,
                            status: statusCode,
                            statusLabel: CONFIG.getStatusLabel(statusCode),
                            owners,
                            shares,
                            versionsCount,
                            latestDocHash,
                            latestCid,
                            deal
                        };
                        items.push(svcParcel);
                    } catch (parcelErr) {
                        console.warn(`Error reading parcel ${id}:`, parcelErr);
                    }
                }

                this.parcels = items;
                this.render();

                // Build AUD from event logs
                await this.buildAUD();

            } catch (err) {
                console.error('General error loading parcels:', err);
                this.error = 'Cannot reach the network. Is the Hardhat node running?';
            } finally {
                this.loading = false;
                this.render();
            }
        },

        // Helper to get next free cell
        nextFreeCell(area) {
            const used = new Set(window.P.map(p => p.cell).filter(Boolean));
            let n = 1;
            while (used.has(`${area}-${n}`)) n++;
            return `${area}-${n}`;
        },

        // Generate simple pts for a cell (placeholder)
        cellPts(cell) {
            if (!cell) return [];
            const hash = ethers.id(cell);
            const x = Number('0x' + hash.slice(2, 10)) % 1000;
            const y = Number('0x' + hash.slice(10, 18)) % 1000;
            return [[x, y], [x+10, y], [x+10, y+10], [x, y+10]];
        },

        async refreshParcel(id) {
            if (!chain.deploymentLoaded) return;

            try {
                const { registry, escrow } = chain.contracts;
                const id = Number(id);

                const statusBig = await registry.getStatus(id);
                const statusCode = Number(statusBig);

                const [owners, sharesBig] = await registry.getOwners(id);
                const shares = sharesBig.map((s) => Number(s));

                const vCountBig = await registry.versionCount(id);
                const versionsCount = Number(vCountBig);

                let latestDocHash = null;
                let latestCid = null;
                if (versionsCount > 0) {
                    try {
                        const latestVer = await registry.getVersion(id, versionsCount - 1);
                        latestDocHash = latestVer.docHash;
                        latestCid = latestVer.cid;
                    } catch (e) { }
                }

                let deal = null;
                if (statusCode === 4) {
                    try {
                        const d = await escrow.getDeal(id);
                        deal = {
                            seller: d.seller,
                            buyer: d.buyer,
                            price: ethers.formatEther(d.price),
                            rawPrice: d.price,
                            deadline: Number(d.deadline) > 0 ? new Date(Number(d.deadline) * 1000) : null,
                            sellerApproved: d.sellerApproved,
                            registrarApproved: d.registrarApproved,
                            status: Number(d.status)
                        };
                    } catch (e) { }
                }

                const idx = window.svc.parcels.findIndex(p => p.id === id);
                if (idx >= 0) {
                    window.svc.parcels[idx] = {
                        id,
                        status: statusCode,
                        statusLabel: CONFIG.getStatusLabel(statusCode),
                        owners,
                        shares: shares.map(s => Number(s)),
                        versionsCount,
                        latestDocHash,
                        latestCid,
                        deal
                    };
                }
            } catch (err) {
                console.warn(`Error refreshing parcel ${id}:`, err);
            }
        },

        // Build AUD from event logs
        async buildAUD() {
            if (!chain.deployment || !chain.deployment.deployBlock) return;

            try {
                const { registry, escrow } = chain.contracts;
                const fromBlock = chain.deployment.deployBlock;

                // Get all events from registry and escrow
                const registryEvents = [
                    'ParcelSubmitted', 'SurveyVerified', 'ParcelRegistered',
                    'SaleConsentGiven', 'ParcelLocked', 'ParcelUnlocked',
                    'OwnershipTransferred'
                ];

                const escrowEvents = [
                    'Listed', 'Deposited', 'Approved', 'SaleCompleted',
                    'Refunded', 'ListingCancelled', 'Withdrawn'
                ];

                const audEntries = [];

                // Query registry events
                for (const evtName of registryEvents) {
                    try {
                        const filter = chain.contracts.registry.filters[evtName]();
                        const events = await chain.contracts.registry.queryFilter(filter, chain.deployment.deployBlock);
                        for (const evt of events) {
                            const block = await ethers.provider.getBlock(evt.blockNumber);
                            const time = new Date(block.timestamp * 1000).toISOString();
                            const actor = evt.args.submitter || evt.args.surveyor || evt.args.registrar || evt.args.owner || evt.args.lister || evt.args.from || 'unknown';
                            const actorLabel = CONFIG.ADDRESS_LABELS[actor.toLowerCase()] || CONFIG.formatAddress(actor);
                            let text = '';
                            switch (evtName) {
                                case 'ParcelSubmitted': text = `Parcel ${evt.args.parcelId} submitted by ${actorLabel}`; break;
                                case 'SurveyVerified': text = `Parcel ${evt.args.parcelId} surveyed by ${actorLabel}`; break;
                                case 'ParcelRegistered': text = `Parcel ${evt.args.parcelId} registered by ${actorLabel}`; break;
                                case 'SaleConsentGiven': text = `Owner ${actorLabel} consented to sale of parcel ${evt.args.parcelId}`; break;
                                case 'ParcelLocked': text = `Parcel ${evt.args.parcelId} listed for sale by ${actorLabel}`; break;
                                case 'ParcelUnlocked': text = `Parcel ${evt.args.parcelId} unlocked by ${actorLabel}`; break;
                                case 'OwnershipTransferred': text = `Parcel ${evt.args.parcelId} transferred to ${CONFIG.formatAddress(evt.args.newOwner)}`; break;
                            }
                            audEntries.push([block.timestamp, actorLabel, text, 'registry']);
                        }
                    } catch (e) { }
                }

                // Query escrow events
                for (const evtName of escrowEvents) {
                    try {
                        const filter = chain.contracts.escrow.filters[evtName]();
                        const events = await chain.contracts.escrow.queryFilter(filter, chain.deployment.deployBlock);
                        for (const evt of events) {
                            const block = await ethers.provider.getBlock(evt.blockNumber);
                            const time = new Date(block.timestamp * 1000).toISOString();
                            const actor = evt.args.approver || evt.args.buyer || evt.args.seller || evt.args.lister || 'unknown';
                            const actorLabel = CONFIG.ADDRESS_LABELS[actor.toLowerCase()] || CONFIG.formatAddress(actor);
                            let text = '';
                            switch (evtName) {
                                case 'Listed': text = `Parcel ${evt.args.parcelId} listed for ${ethers.formatEther(evt.args.price)} ETH by ${actorLabel}`; break;
                                case 'Deposited': text = `Buyer ${actorLabel} deposited ${ethers.formatEther(evt.args.amount)} ETH for parcel ${evt.args.parcelId}`; break;
                                case 'Approved': text = `${evt.args.isSeller ? 'Seller' : 'Registrar'} ${actorLabel} approved parcel ${evt.args.parcelId}`; break;
                                case 'SaleCompleted': text = `Parcel ${evt.args.parcelId} sold to ${CONFIG.formatAddress(evt.args.buyer)} for ${ethers.formatEther(evt.args.price)} ETH`; break;
                                case 'Refunded': text = `Buyer ${actorLabel} refunded ${ethers.formatEther(evt.args.amount)} ETH for parcel ${evt.args.parcelId}`; break;
                                case 'ListingCancelled': text = `Listing for parcel ${evt.args.parcelId} cancelled by ${actorLabel}`; break;
                                case 'Withdrawn': text = `${actorLabel} withdrew ${ethers.formatEther(evt.args.amount)} ETH`; break;
                            }
                            audEntries.push([block.timestamp, actorLabel, text, 'escrow']);
                        }
                    } catch (e) { }
                }

                // Sort by time descending (newest first)
                audEntries.sort((a, b) => b[0] - a[0]);

                // Convert to [time, actorLabel, text, flag] format
                window.AUD = audEntries.map(e => [new Date(e[0]).toLocaleString(), e[1], e[2], e[3]]);

            } catch (err) {
                console.warn('Could not build AUD:', err);
            }
        },

        // Initialize dashboard form (grant role)
        initDashboardForm() {
            const form = document.getElementById('grantRoleForm');
            if (!form) return;

            const grantBtn = document.getElementById('grantBtn');
            const btnText = document.getElementById('grantBtnText');
            const grantError = document.getElementById('grantError');
            const grantSuccess = document.getElementById('grantSuccess');
            const grantAddress = document.getElementById('grantAddress');
            const grantRole = document.getElementById('grantRole');

            function validateForm() {
                const addr = grantAddress.value.trim();
                const role = grantRole.value;
                let valid = true;
                let errorMsg = '';

                if (!addr) { valid = false; errorMsg = 'Address is required'; }
                else if (!ethers.isAddress(addr)) { valid = false; errorMsg = 'Invalid address'; }
                else if (!role) { valid = false; errorMsg = 'Role is required'; }

                grantError.textContent = errorMsg;
                grantSuccess.textContent = '';
                grantBtn.disabled = !valid || !chain.signer;
                return valid;
            }

            function setSubmitting(submitting) {
                grantBtn.disabled = submitting;
                grantBtn.querySelector('#grantBtnText').textContent = submitting ? 'Granting...' : 'Grant Role';
            }

            [grantAddress, grantRole].forEach(el => el.addEventListener('input', validateForm));

            document.getElementById('grantRoleForm').onsubmit = async (e) => {
                e.preventDefault();
                if (!validateForm()) return;

                setSubmitting(true);
                grantError.textContent = '';
                grantSuccess.textContent = '';

                try {
                    const addr = grantAddress.value.trim();
                    const role = grantRole.value;

                    const { roleManager } = chain.getWriteContracts();
                    const roleId = await roleManager[role.toUpperCase() + '_ROLE']();
                    const tx = await roleManager.grantRole(roleId, addr);
                    
                    // Waiting for wallet confirmation
                    document.getElementById('grantBtnText').textContent = 'Waiting for confirmation...';
                    const receipt = await tx.wait();
                    
                    // Mining
                    document.getElementById('grantBtnText').textContent = 'Mining...';
                    
                    // Success
                    document.getElementById('grantBtnText').textContent = 'Success!';
                    grantSuccess.textContent = `Role ${role} granted to ${CONFIG.formatAddress(addr)}`;
                    
                    // Reload roles
                    await chain.loadRoles();
                    
                    // Reset form
                    grantAddress.value = '';
                    grantRole.value = '';
                    validateForm();
                    
                    setTimeout(() => document.getElementById('grantBtnText').textContent = 'Grant Role', 2000);
                } catch (err) {
                    console.error('Grant role error:', err);
                    grantError.textContent = friendlyError(err);
                    setSubmitting(false);
                }
            };

            validateForm();
        },

        // Grant a role to an address
        async grantRole(roleName, address) {
            if (!chain.signer) throw new Error('No signer connected');
            const { roleManager } = chain.getWriteContracts();
            const roleId = await roleManager[roleName.toUpperCase() + '_ROLE']();
            const tx = await roleManager.grantRole(roleId, address);
            const receipt = await tx.wait();
            return receipt;
        },

        // Render
        render() {
            window.dispatchEvent(new CustomEvent('svc:updated', {
                detail: { parcels: this.parcels, loading: this.loading, error: this.error }
            }));
        }
    };
})();