// SPDX-License-Identifier: MIT
// Extra views (Register, Sales, Roles, etc.)

(function() {
    'use strict';

    window.viewsExtra = {
        currentExtraView: null,

        // Initialize mock data for extra views (Corrections, Shares tabs)
        initExtraMock() {
            // Only run if P is empty or not initialized
            if (!window.P || window.P.length === 0) return;

            // Mock CORR data for Corrections tab
            if (!window.CORR) window.CORR = [];
            window.CORR = window.P.slice(0, 3).map(p => ({
                id: p.id,
                parcelId: p.pid,
                reason: ['Court order', 'Survey error', 'Owner request'][Math.floor(Math.random()*3)],
                status: ['pending', 'approved', 'rejected'][Math.floor(Math.random()*3)],
                createdAt: new Date(Date.now() - Math.random()*86400000*30).toISOString()
            }));

            // Mock SH data for Shares tab
            if (!window.SH) window.SH = [];
            window.SH = window.P.slice(0, 2).map(p => ({
                id: p.id,
                parcelId: p.pid,
                from: p.owners[0]?.addr || '0x0',
                to: '0x' + Math.floor(Math.random()*1e40).toString(16).padStart(40,'0'),
                shares: Math.floor(Math.random()*50) + 1,
                createdAt: new Date(Date.now() - Math.random()*86400000*30).toISOString()
            }));

            // Ensure P[0].size exists
            if (window.P[0] && !window.P[0].size) {
                window.P[0].size = '1000 m²';
            }
        },

        // Render extra view based on tab
        render(viewName, state) {
            const { account, roles } = chain;
            const isRegistrar = roles?.registrar;
            const isSurveyor = roles?.surveyor;
            const isAdmin = roles?.admin;
            const isIssuer = roles?.issuer;

            switch (viewName) {
                case 'register':
                    return this.renderRegisterView(state);
                case 'sales':
                    return this.renderSalesView(state);
                case 'roles':
                    return this.renderRolesView(state);
                case 'corrections':
                    return this.renderCorrectionsView(state);
                case 'shares':
                    return this.renderSharesView(state);
                case 'dashboard':
                    return this.renderDashboardView(state);
                case 'settings':
                    return this.renderSettingsView(state);
                default:
                    return this.renderNotFound();
            }
        },

        renderRegisterView(state) {
            const { account, roles } = chain;
            const connectedAccount = chain.account;
            return `
                <div class="max-w-2xl mx-auto space-y-6">
                    <h2 class="text-lg font-serif font-medium text-[#f4efe6] mb-4">Register New Parcel</h2>
                    <form id="registerForm" class="space-y-4" novalidate>
                        <div class="space-y-3">
                            <div class="flex items-center justify-between mb-2">
                                <label class="block text-xs font-mono text-[#8a8475] mb-1">Owners (up to 10)</label>
                                <span id="ownerCount" class="text-xs font-mono text-[#8a8475]">1 / 10</span>
                            </div>
                            <div id="ownerRows" class="space-y-2"></div>
                            <button type="button" id="addOwnerBtn" class="btn alt text-xs" disabled>Add Owner</button>
                        </div>
                        <div>
                            <label class="block text-xs font-mono text-[#8a8475] mb-1">Area</label>
                            <input type="text" id="regArea" placeholder="Northfield" class="w-full bg-[#1a1916] border border-[#2b2923] px-3 py-2 rounded text-sm font-mono" required />
                        </div>
                        <div>
                            <label class="block text-xs font-mono text-[#8a8475] mb-1">Address</label>
                            <input type="text" id="regAddr" placeholder="123 Main Street, Northfield" class="w-full bg-[#1a1916] border border-[#2b2923] px-3 py-2 rounded text-sm font-mono" required />
                        </div>
                        <div>
                            <label class="block text-xs font-mono text-[#8a8475] mb-1">Size (m²)</label>
                            <input type="text" id="regSize" placeholder="1000 m2" class="w-full bg-[#1a1916] border border-[#2b2923] px-3 py-2 rounded text-sm font-mono" required />
                        </div>
                        <div id="regError" class="text-xs text-[#e88c7b] h-4 min-h-[1.25rem]"></div>
                        <button type="submit" id="submitBtn" class="btn w-full" disabled>
                            <span id="btnText">Connect Wallet</span>
                        </button>
                    </form>
                    <p class="text-xs text-[#8a8475] mt-4 text-center">Simulated until Step 7</p>
                </div>
            `;
        },

        // Initialize register form after it's rendered
        initRegisterForm() {
            const form = document.getElementById('registerForm');
            if (!form) return;

            const connectedAccount = chain.account;
            const ownerRows = document.getElementById('ownerRows');
            const addOwnerBtn = document.getElementById('addOwnerBtn');
            const ownerCountEl = document.getElementById('ownerCount');
            const submitBtn = document.getElementById('submitBtn');
            const btnText = document.getElementById('btnText');
            const regError = document.getElementById('regError');
            const regArea = document.getElementById('regArea');
            const regAddr = document.getElementById('regAddr');
            const regSize = document.getElementById('regSize');

            let ownerCount = 1;

            // Create an owner row
            function createOwnerRow(address = '', share = '', removable = false) {
                const row = document.createElement('div');
                row.className = 'flex items-center gap-2';
                row.innerHTML = `
                    <input type="text" class="owner-addr flex-1 bg-[#1a1916] border border-[#2b2923] px-3 py-2 rounded text-sm font-mono" placeholder="0x..." value="${address}" ${!removable ? 'readonly' : ''} />
                    <input type="number" class="owner-share w-20 bg-[#1a1916] border border-[#2b2923] px-3 py-2 rounded text-sm font-mono text-right" placeholder="%" min="1" max="100" value="${share}" ${!removable ? 'readonly' : ''} />
                    ${removable ? '<button type="button" class="remove-owner btn alt text-xs text-[#e88c7b]" aria-label="Remove owner">✕</button>' : ''}
                `;
                if (removable) {
                    row.querySelector('.remove-owner').onclick = () => {
                        row.remove();
                        updateOwnerCount();
                    };
                }
                ownerRows.appendChild(row);
            }

            function updateOwnerCount() {
                const rows = ownerRows.querySelectorAll('.owner-addr').length;
                ownerCount = rows;
                document.getElementById('ownerCount').textContent = `${ownerCount} / 10`;
                const addBtn = document.getElementById('addOwnerBtn');
                addBtn.disabled = ownerCount >= 10;
            }

            function validateForm() {
                const area = document.getElementById('regArea').value.trim();
                const addr = document.getElementById('regAddr').value.trim();
                const size = document.getElementById('regSize').value.trim();
                const rows = ownerRows.querySelectorAll('div.flex.items-center.gap-2');
                
                let valid = true;
                let errorMsg = '';

                if (!area) { valid = false; errorMsg = 'Area is required'; }
                else if (!addr) { valid = false; errorMsg = 'Address is required'; }
                else if (!size) { valid = false; errorMsg = 'Size is required'; }
                else {
                    const addresses = [];
                    let totalShares = 0;
                    for (const row of document.querySelectorAll('#ownerRows > div')) {
                        const addrInput = row.querySelector('.owner-addr');
                        const shareInput = row.querySelector('.owner-share');
                        const addr = addrInput.value.trim();
                        const share = parseInt(shareInput.value) || 0;
                        if (!addr) { valid = false; errorMsg = 'All owner addresses required'; break; }
                        if (!ethers.isAddress(addr)) { valid = false; errorMsg = `Invalid address: ${addr}`; break; }
                        if (addresses.includes(addr.toLowerCase())) { valid = false; errorMsg = 'Duplicate owner address'; break; }
                        addresses.push(addr.toLowerCase());
                        if (share < 1 || share > 100) { valid = false; errorMsg = 'Shares must be 1-100'; break; }
                        totalShares += share;
                    }
                    if (valid && totalShares !== 100) { valid = false; errorMsg = 'Shares must sum to 100'; }
                }

                document.getElementById('regError').textContent = errorMsg;
                document.getElementById('submitBtn').disabled = !valid || !chain.account || chain.state !== 'ready';
                document.getElementById('btnText').textContent = chain.account 
                    ? (chain.state === 'ready' ? 'Submit Parcel' : 'Wrong Network') 
                    : 'Connect Wallet';
                return valid;
            }

            function setSubmitting(submitting) {
                const btn = document.getElementById('submitBtn');
                const btnText = document.getElementById('btnText');
                btn.disabled = submitting || !validateForm();
                btnText.textContent = submitting ? 'Submitting...' : 'Submit Parcel';
            }

            // Initial owner row (connected account)
            createOwnerRow(chain.account || '', '100');
            updateOwnerCount();

            // Add owner button
            document.getElementById('addOwnerBtn').onclick = () => {
                if (ownerCount < 10) {
                    createOwnerRow('', '');
                    updateOwnerCount();
                    validateForm();
                }
            });

            // Validate on input
            const regArea = document.getElementById('regArea');
            const regAddr = document.getElementById('regAddr');
            const regSize = document.getElementById('regSize');
            [regArea, regAddr, regSize].forEach(el => el.addEventListener('input', validateForm));
            ownerRows.addEventListener('input', validateForm);

            // Form submit
            document.getElementById('registerForm').onsubmit = async (e) => {
                e.preventDefault();
                if (!validateForm()) return;

                setSubmitting(true);
                document.getElementById('regError').textContent = '';

                try {
                    const area = document.getElementById('regArea').value.trim();
                    const addr = document.getElementById('regAddr').value.trim();
                    const size = document.getElementById('regSize').value.trim();

                    const owners = [];
                    const shares = [];
                    document.querySelectorAll('#ownerRows > div').forEach(row => {
                        owners.push(row.querySelector('.owner-addr').value.trim());
                        shares.push(parseInt(row.querySelector('.owner-share').value) || 0);
                    });

                    const docHash = ethers.id(JSON.stringify([area, addr, size]));
                    const cid = 'local-metadata';

                    const { registry } = chain.getWriteContracts();
                    const tx = await registry.submitParcel(owners, shares, docHash, 'local-metadata');
                    
                    // Waiting for wallet confirmation
                    document.getElementById('btnText').textContent = 'Waiting for confirmation...';
                    const receipt = await tx.wait();
                    
                    // Mining
                    document.getElementById('btnText').textContent = 'Mining...';
                    
                    const event = receipt.logs.find(l => l.fragment?.name === 'ParcelSubmitted');
                    const parcelId = event.args?.parcelId;
                    
                    // Success
                    document.getElementById('btnText').textContent = 'Success!';
                    
                    // Save metadata to localStorage
                    const meta = { area: document.getElementById('regArea').value.trim(), 
                                  addr: document.getElementById('regAddr').value.trim(),
                                  size: document.getElementById('regSize').value.trim() };
                    const metaKey = 'terra-meta';
                    let metaStore = JSON.parse(localStorage.getItem('terra-meta') || '{}');
                    metaStore[parcelId] = { area: document.getElementById('regArea').value.trim(),
                                            addr: document.getElementById('regAddr').value.trim(),
                                            size: document.getElementById('regSize').value.trim() };
                    localStorage.setItem('terra-meta', JSON.stringify(metaStore));

                    // Reload parcels
                    await svc.load();
                    
                    // Reset form
                    document.getElementById('registerForm').reset();
                    // Re-add initial owner row
                    document.getElementById('ownerRows').innerHTML = '';
                    createOwnerRow(chain.account || '', '100');
                    updateOwnerCount();
                    validateForm();
                    
                    setTimeout(() => document.getElementById('btnText').textContent = 'Submit Parcel', 2000);
                } catch (err) {
                    console.error('Registration error:', err);
                    document.getElementById('regError').textContent = friendlyError(err);
                    setSubmitting(false);
                }
            };

            // Initial validation
            validateForm();
        },

        // Render extra view based on tab
        render(viewName, state) {
            const { account, roles } = chain;
            const isRegistrar = roles?.registrar;
            const isSurveyor = roles?.surveyor;
            const isAdmin = roles?.admin;
            const isIssuer = roles?.issuer;

            switch (viewName) {
                case 'register':
                    return this.renderRegisterView(state);
                case 'sales':
                    return this.renderSalesView(state);
                case 'roles':
                    return this.renderRolesView(state);
                case 'corrections':
                    return this.renderCorrectionsView(state);
                case 'shares':
                    return this.renderSharesView(state);
                case 'dashboard':
                    return this.renderDashboardView(state);
                case 'settings':
                    return this.renderSettingsView(state);
                default:
                    return this.renderNotFound();
            }
        },

        renderSalesView(state) {
            const { account, roles } = chain;
            
            const sales = svc.parcels.filter(p => p.status === 4);
            
            if (sales.length === 0) {
                return `
                    <div class="max-w-3xl mx-auto space-y-4">
                        <h2 class="text-lg font-serif font-medium text-[#f4efe6] mb-4">Active Sales <span class="text-xs font-mono text-[#8a8475]">(Live on ${APP_ENV.networkName})</span></h2>
                        <p class="text-center text-[#8a8475] py-8">No active sales</p>
                    </div>
                `;
            }

            return `
                <div class="max-w-3xl mx-auto space-y-4">
                    <h2 class="text-lg font-serif font-medium text-[#f4efe6] mb-4">Active Sales <span class="text-xs font-mono text-[#8a8475]">(Live on ${APP_ENV.networkName})</span></h2>
                    <div class="space-y-3">
                        ${sales.map(p => this.renderSaleCard(p, account, roles)).join('')}
                    </div>
                </div>
            `;
        },

        // Helper to determine parcel sale state
        getSaleState(p) {
            if (!p.deal) return 'consent';
            if (!p.deal.buyer) return 'listed';
            if (p.deal.sellerApproved && p.deal.registrarApproved) return 'completed';
            if (p.deal.sellerApproved && p.deal.registrarApproved && p.deal.saleCompleted) return 'completed';
            if (p.deal.sellerApproved || p.deal.registrarApproved) return 'funded';
            if (p.deal.buyer) return 'funded';
            return 'listed';
        },

        // Format deadline with live countdown
        formatDeadline(deadline) {
            if (!deadline) return 'N/A';
            const now = Date.now();
            const diff = deadline - now;
            if (diff <= 0) return '<span class="text-[#e88c7b]">Expired</span>';
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            return `<span class="text-[#e5b567]">${days}d ${hours}h ${mins}m</span>`;
        },

        // Render individual sale card with stepper
        renderSaleCard(p, account, roles) {
            const isOwner = (p) => window.chain.account && p.owners?.some(o => o.toLowerCase() === window.chain.account.toLowerCase());
            const isSeller = (deal) => window.chain.account && deal?.seller?.toLowerCase() === window.chain.account.toLowerCase();
            const isBuyer = (deal) => window.chain.account && deal?.buyer?.toLowerCase() === window.chain.account.toLowerCase();
            const isRegistrar = window.chain.roles?.registrar;
            const isAdmin = window.chain.roles?.admin;
            const isConnected = !!window.chain.account;

            const deal = p.deal;
            const saleState = deal ? this.getSaleState(p) : 'consent';
            const statusLabel = CONFIG.getSaleStateLabel ? CONFIG.getSaleStateLabel(saleState) : saleState;
            
            // Stepper steps
            const steps = [
                { key: 'consent', label: 'Consent' },
                { key: 'listed', label: 'Listed' },
                { key: 'funded', label: 'Funded' },
                { key: 'approval', label: 'Approval' },
                { key: 'completed', label: 'Completed' }
            ];

            const currentStepIndex = steps.findIndex(s => s.key === saleState);
            
            // Build stepper HTML
            const stepsHtml = steps.map((step, idx) => {
                const stepIdx = steps.findIndex(s => s.key === step.key);
                const currentIdx = steps.findIndex(s => s.key === saleState);
                const isPastStep = stepIdx < currentIdx;
                const isCurrentStep = stepIdx === currentIdx;
                const isFutureStep = stepIdx > currentIdx;
                
                const dotColor = stepIdx < currentIdx ? 'bg-[#58b988]' : stepIdx === currentIdx ? 'bg-[#e5b567]' : 'bg-[#38352e]';
                const textColor = stepIdx < currentIdx ? 'text-[#58b988]' : stepIdx === currentIdx ? 'text-[#e5b567]' : 'text-[#736d61]';
                const lineColor = stepIdx < steps.length - 1 ? (stepIdx < currentIdx ? 'bg-[#58b988]' : 'bg-[#38352e]') : '';
                
                return `
                    <div class="flex items-center flex-1">
                        <div class="flex flex-col items-center">
                            <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${idx < currentStepIndex ? 'bg-[#58b988]' : idx === currentIdx ? 'bg-[#e5b567]' : 'bg-[#38352e]'} border-[#38352e]" style="width:24px;height:24px;">
                                ${idx < currentIdx ? '<svg class="w-4 h-4 text-[#161513] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586 14.293 6.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
                            </div>
                            <span class="text-[10px] font-mono mt-1 ${idx < currentIdx ? 'text-[#58b988]' : idx === currentIdx ? 'text-[#e5b567]' : 'text-[#736d61]'}">${step.label}</span>
                        </div>
                        ${idx < steps.length - 1 ? `<div class="flex-1 h-px ${idx < currentIdx ? 'bg-[#58b988]' : 'bg-[#38352e]'}"></div>` : ''}
                    </div>
                `;
            }).join('');

            const deal = p.deal;
            const saleState = deal ? this.getSaleState(p) : 'consent';
            const statusLabel = CONFIG.getSaleStateLabel ? CONFIG.getSaleStateLabel(saleState) : saleState;
            
            const deal = p.deal;
            const saleState = deal ? this.getSaleState(p) : 'consent';
            const statusLabel = CONFIG.getSaleStateLabel ? CONFIG.getSaleStateLabel(saleState) : saleState;
            
            // Owner consent status
            const owners = p.owners || [];
            const consentHtml = p.deal ? `
                <div class="text-xs font-mono text-[#8a8475] mb-2">Consents:</div>
                <div class="space-y-1">
                    ${p.owners.map((o, idx) => `
                        <div class="flex items-center gap-2 text-xs">
                            <span class="w-4 h-4 rounded border border-[#38352e] ${deal.consents?.[p.owners[idx]?.toLowerCase()] ? 'bg-[#58b988] border-[#58b988] flex items-center justify-center' : ''}">
                                ${deal.consents?.[p.owners[idx]?.toLowerCase()] ? '<svg class="w-3 h-3 text-[#161513] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586 14.293 6.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
                            </div>
                            <span class="font-mono text-[#c2bcaf]">${CONFIG.formatAddress(o)}</span>
                            <span class="text-xs ${deal.consents?.[p.owners[idx]?.toLowerCase()] ? 'text-[#58b988]' : 'text-[#736d61]'}">${deal.consents?.[p.owners[idx]?.toLowerCase()] ? 'Consented' : 'Pending'}</span>
                        </div>
                    `).join('')}
                </div>
            ` : '<div class="text-xs text-[#8a8475]">No owners</div>';

            // Build action buttons based on state and role
            let actionsHtml = '';
            const deal = p.deal;
            const saleState = deal ? this.getSaleState(p) : 'consent';
            const isOwnerAccount = p.owners?.some(o => o.toLowerCase() === window.chain.account?.toLowerCase());
            const isSellerAccount = deal && deal.seller?.toLowerCase() === window.chain.account?.toLowerCase();
            const isBuyerAccount = deal && deal.buyer?.toLowerCase() === window.chain.account?.toLowerCase();
            const isRegistrar = window.chain.roles?.registrar;
            const isAdmin = window.chain.roles?.admin;

            if (saleState === 'consent' && isOwner(p)) {
                actionsHtml += `
                    <button class="btn w-full" onclick="svc.consentToSale(${p.id})" ${!window.chain.account || window.chain.state !== 'ready' ? 'disabled' : ''}>
                        Consent to Sale
                    </button>`;
            }
            if (saleState === 'consent' && p.owners.every(o => p.deal?.consents?.[o.toLowerCase()]) && isOwner(p)) {
                actionsHtml += `
                    <div class="space-y-2">
                        <input type="number" id="listPrice-${p.id}" placeholder="Price in ETH (e.g. 1.0)" class="w-full bg-[#1a1916] border border-[#2b2923] px-3 py-2 rounded text-sm font-mono" step="0.01" min="0.01" />
                        <button class="btn w-full" onclick="svc.listParcel(${p.id}, document.getElementById('listPrice-${p.id}').value)" ${!window.chain.account || window.chain.state !== 'ready' ? 'disabled' : ''}>
                            List for Sale
                        </button>
                    </div>`;
            }
            if (saleState === 'listed') {
                if (isSellerAccount) {
                    actionsHtml += `
                        <button class="btn" style="background:var(--red);border-color:var(--red)" onclick="svc.cancelListing(${p.id})">Cancel Listing</button>`;
                }
                if (!isOwner(p)) {
                    actionsHtml += `
                        <div class="space-y-2">
                            <button class="btn w-full" onclick="svc.deposit(${p.id}, '${p.deal.price}')" ${!window.chain.account || window.chain.state !== 'ready' ? 'disabled' : ''}>
                                Deposit ${p.deal.price} Ξ
                            </button>
                        </div>`;
                }
            }
            if (saleState === 'funded') {
                if (isSellerAccount && !deal.sellerApproved) {
                    actionsHtml += `
                        <button class="btn w-full" onclick="svc.approveAsSeller(${p.id})" ${!window.chain.account || window.chain.state !== 'ready' ? 'disabled' : ''}>
                            Approve as Seller
                        </button>`;
                }
                if (isRegistrar && !deal.registrarApproved) {
                    actionsHtml += `
                        <button class="btn w-full" onclick="svc.approveAsRegistrar(${p.id})" ${!window.chain.account || window.chain.state !== 'ready' ? 'disabled' : ''}>
                            Approve as Registrar
                        </button>`;
                }
                // Check if deadline passed for refund
                if (deal.deadline && Date.now() > new Date(deal.deadline).getTime()) {
                    actionsHtml += `
                        <button class="btn w-full" style="background:var(--red);border-color:var(--red)" onclick="svc.refundAfterDeadline(${p.id})" ${!window.chain.account || window.chain.state !== 'ready' ? 'disabled' : ''}>
                            Refund Buyer
                        </button>`;
                }
            }
            if (saleState === 'completed') {
                actionsHtml += `
                    <button class="btn w-full" style="background:var(--forest);border-color:var(--forest)" onclick="svc.withdraw()">Withdraw Funds</button>`;
            }

            // Withdraw balance display
            const pendingWithdrawal = window.chain.account ? (svc.parcels.reduce((sum, p) => sum + (p.deal && p.deal.sellerApproved && p.deal.registrarApproved && p.deal.seller?.toLowerCase() === window.chain.account.toLowerCase() ? parseFloat(p.deal.price || 0) : 0), 0)) : 0;

            return `
                <div class="bg-[#1e1c17] border border-[#2c2a24] p-4 rounded-lg space-y-3">
                    <!-- Header with stepper -->
                    <div class="flex items-center gap-2 mb-3">
                        <span class="font-mono font-bold text-[#f4efe6]">Parcel #${p.id}</span>
                        <span class="stamp st-sale">${statusLabel}</span>
                    </div>
                    
                    <!-- Stepper -->
                    <div class="flex items-center mb-3">
                        <div class="flex items-center flex-1">
                            <div class="flex flex-col items-center">
                                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${0 < currentIdx ? 'bg-[#58b988]' : 'bg-[#e5b567]'} border-[#38352e]" style="width:24px;height:24px;">
                                    ${0 < currentIdx ? '<svg class="w-4 h-4 text-[#161513] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586 14.293 6.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
                            </div>
                            <span class="text-[10px] font-mono mt-1 ${0 < currentIdx ? 'text-[#58b988]' : 'text-[#e5b567]'}">Consent</span>
                        </div>
                        <div class="flex-1 h-px ${0 < currentIdx ? 'bg-[#58b988]' : 'bg-[#38352e]'}"></div>
                        <div class="flex items-center flex-1">
                            <div class="flex flex-col items-center">
                                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${1 < currentIdx ? 'bg-[#58b988]' : 1 === currentIdx ? 'bg-[#e5b567]' : 'bg-[#38352e]'} border-[#38352e]" style="width:24px;height:24px;">
                                    ${1 < currentIdx ? '<svg class="w-4 h-4 text-[#161513] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586 14.293 6.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
                            </div>
                            <span class="text-[10px] font-mono mt-1 ${1 < currentIdx ? 'text-[#58b988]' : 1 === currentIdx ? 'text-[#e5b567]' : 'text-[#736d61]'}">Listed</span>
                        </div>
                        <div class="flex-1 h-px ${1 < currentIdx ? 'bg-[#58b988]' : 'bg-[#38352e]'}"></div>
                        <div class="flex items-center flex-1">
                            <div class="flex flex-col items-center">
                                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${2 < currentIdx ? 'bg-[#58b988]' : 2 === currentIdx ? 'bg-[#e5b567]' : 'bg-[#38352e]'} border-[#38352e]" style="width:24px;height:24px;">
                                    ${2 < currentIdx ? '<svg class="w-4 h-4 text-[#161513] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586 14.293 6.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
                            </div>
                            <span class="text-[10px] font-mono mt-1 ${2 < currentIdx ? 'text-[#58b988]' : 2 === currentIdx ? 'text-[#e5b567]' : 'text-[#736d61]'}">Funded</span>
                        </div>
                        <div class="flex-1 h-px ${2 < currentIdx ? 'bg-[#58b988]' : 'bg-[#38352e]'}"></div>
                        <div class="flex items-center flex-1">
                            <div class="flex flex-col items-center">
                                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${3 < currentIdx ? 'bg-[#58b988]' : 3 === currentIdx ? 'bg-[#e5b567]' : 'bg-[#38352e]'} border-[#38352e]" style="width:24px;height:24px;">
                                    ${3 < currentIdx ? '<svg class="w-4 h-4 text-[#161513] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586 14.293 6.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
                            </div>
                            <span class="text-[10px] font-mono mt-1 ${3 < currentIdx ? 'text-[#58b988]' : 3 === currentIdx ? 'text-[#e5b567]' : 'text-[#736d61]'}">Approval</span>
                        </div>
                        <div class="flex-1 h-px ${3 < currentIdx ? 'bg-[#58b988]' : 'bg-[#38352e]'}"></div>
                        <div class="flex items-center flex-1">
                            <div class="flex flex-col items-center">
                                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${4 < currentIdx ? 'bg-[#58b988]' : 4 === currentIdx ? 'bg-[#e5b567]' : 'bg-[#38352e]'} border-[#38352e]" style="width:24px;height:24px;">
                                    ${4 < currentIdx ? '<svg class="w-4 h-4 text-[#161513] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586 14.293 6.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
                            </div>
                            <span class="text-[10px] font-mono mt-1 ${4 < currentIdx ? 'text-[#58b988]' : 4 === currentIdx ? 'text-[#e5b567]' : 'text-[#736d61]'}">Completed</span>
                        </div>
                    </div>

                    ${p.deal ? `
                    <div class="text-xs font-mono text-[#8a8475] mb-2">Deadline: ${deal.deadline ? this.formatDeadline(deal.deadline) : 'N/A'}</div>
                    
                    <div class="space-y-1 text-xs font-mono">
                        <div class="flex justify-between">
                            <span class="text-[#8a8475]">Price:</span>
                            <span class="font-bold text-[#f4efe6]">${deal.price} Ξ</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-[#8a8475]">Seller:</span>
                            <span>${CONFIG.formatAddress(deal.seller)}</span>
                        </div>
                        ${deal.buyer ? `<div class="flex justify-between"><span class="text-[#8a8475]">Buyer:</span><span>${CONFIG.formatAddress(deal.buyer)}</span></div>` : ''}
                    </div>

                    <!-- Consents -->
                    ${p.owners.length > 1 ? `
                    <div class="mt-3 p-2 bg-[#1a1813] rounded border border-[#3b3420] space-y-1">
                        <div class="text-xs font-mono text-[#8a8475]">Consents:</div>
                        ${p.owners.map((o, idx) => `
                            <div class="flex items-center gap-2 text-xs">
                                <span class="w-4 h-4 rounded border border-[#38352e] ${deal.consents?.[p.owners[idx]?.toLowerCase()] ? 'bg-[#58b988] border-[#58b988] flex items-center justify-center' : ''}">
                                    ${deal.consents?.[p.owners[idx]?.toLowerCase()] ? '<svg class="w-3 h-3 text-[#161513] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586 14.293 6.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
                                </div>
                                <span class="font-mono text-[#c2bcaf]">${CONFIG.formatAddress(o)}</span>
                                <span class="text-xs ${deal.consents?.[p.owners[idx]?.toLowerCase()] ? 'text-[#58b988]' : 'text-[#736d61]'}">${deal.consents?.[p.owners[idx]?.toLowerCase()] ? 'Consented' : 'Pending'}</span>
                            </div>
                        `).join('')}
                    </div>` : ''}

                    <!-- Actions -->
                    <div class="mt-3 space-y-2">
                        ${actionsHtml}
                    </div>
                    
                    <!-- Withdraw balance -->
                    <div class="mt-3 pt-2 border-t border-[#2b2923] flex justify-between items-center">
                        <span class="text-xs font-mono text-[#8a8475]">Your balance owed: ${pendingWithdrawal.toFixed(4)} Ξ</span>
                        <button class="btn" style="background:var(--forest);border-color:var(--forest)" onclick="svc.withdraw()" ${!window.chain.account || pendingWithdrawal <= 0 ? 'disabled' : ''}>
                            Withdraw
                        </button>
                    </div>
                    ` : ''}
                </div>
            `;
        },