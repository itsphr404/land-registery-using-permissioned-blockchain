// SPDX-License-Identifier: MIT
// Main view rendering

(function() {
    'use strict';

    window.views = {
        // Current state
        currentView: 'parcels',
        mineOnly: false,
        selectedParcelId: null,

        // Parcel card template
        parcelCard(parcel) {
            // Handle unknown status gracefully
            const statusCode = parcel.status ?? 0;
            if (![0,1,2,3,4].includes(statusCode)) {
                console.warn('Unknown parcel status:', statusCode, 'for parcel', parcel.id);
            }

            const isMine = chain.account &&
                parcel.owners?.some(o => o.toLowerCase() === chain.account.toLowerCase());

            const statusLabel = CONFIG.getStatusLabel(statusCode);
            const statusClass = this.getStatusClass(statusCode);

            const ownersHtml = parcel.owners?.map((addr, idx) => `
                <div class="flex items-center justify-between text-xs bg-[#21201c] px-2.5 py-1.5 rounded border border-[#2b2923]">
                    <div>${CONFIG.formatAddress(addr)}</div>
                    <div class="font-mono font-semibold text-[#8a8475]">${parcel.shares?.[idx] ?? 0}%</div>
                </div>
            `).join('') || '<div class="text-xs text-[#8a8475]">No owners</div>';

            const dealHtml = (parcel.status === 4 && parcel.deal) ? `
                <div class="mt-4 pt-3 border-t border-[#3b3420] bg-[#232018] -mx-5 -mb-5 p-4 rounded-b-lg space-y-2.5 border-dashed">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-mono text-[#d8a85c] font-semibold uppercase tracking-wider">Escrow Deal</span>
                        <span class="font-mono text-sm font-bold text-[#f4efe6]">${parcel.deal.price} Ξ</span>
                    </div>

                    <div class="text-xs font-mono bg-[#1a1813] p-2 rounded border border-[#3b3420] space-y-1">
                        <div class="flex justify-between">
                            <span class="text-[#8a8475]">Buyer:</span>
                            <span>
                                ${parcel.deal.status === 2 ? `
                                    <span class="text-[#f4efe6] font-semibold">${CONFIG.formatAddress(parcel.deal.buyer)}</span>
                                ` : `<span class="text-[#d8a85c] italic">Waiting for buyer deposit</span>`}
                            </span>
                        </div>

                        ${parcel.deal.deadline ? `
                        <div class="flex justify-between">
                            <span class="text-[#8a8475]">Deadline:</span>
                            <span class="text-[#a8a194]">${CONFIG.formatDate(parcel.deal.deadline)}</span>
                        </div>
                        ` : ''}
                    </div>

                    <div class="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div class="p-1.5 rounded border flex items-center justify-between ${parcel.deal.sellerApproved ? 'bg-[#16261f] border-[#204533] text-[#58b988]' : 'bg-[#1c1b18] border-[#302d26] text-[#736d61]'}">
                            <span>Seller:</span>
                            <span class="font-bold">${parcel.deal.sellerApproved ? '✓ Signed' : '… Pending'}</span>
                        </div>
                        <div class="p-1.5 rounded border flex items-center justify-between ${parcel.deal.registrarApproved ? 'bg-[#16261f] border-[#204533] text-[#58b988]' : 'bg-[#1c1b18] border-[#302d26] text-[#736d61]'}">
                            <span>Registrar:</span>
                            <span class="font-bold">${parcel.deal.registrarApproved ? '✓ Signed' : '… Pending'}</span>
                        </div>
                    </div>
                </div>
            ` : '';

            // Action buttons based on parcel status and sub
            const actionsHtml = this.renderParcelActions(parcel);

            // Tolerate missing pts - don't render map link if no pts
            const mapLink = (parcel.pts && parcel.pts.length >= 3) ? `
                <button class="text-xs font-mono text-[#58b0d8] hover:text-[#7fbce0] mt-2 inline-block" onclick="map.selectParcel(${parcel.id})">
                    View on Map →
                </button>
            ` : '';

            return `
                <div class="rounded-lg border p-5 flex flex-col justify-between transition ${parcel.isMine
                    ? 'border-[#d8a85c] bg-[#1e1c17] shadow-lg shadow-[#d8a85c]/5'
                    : 'border-[#2c2a24] bg-[#1a1916] hover:border-[#3d3a33]'}">
                    <div>
                        <div class="flex items-center justify-between gap-2 pb-3 border-b border-[#292722]">
                            <div class="flex items-center gap-2">
                                <span class="font-mono text-xs text-[#8a8475] uppercase tracking-wider">ID</span>
                                <span class="font-mono font-bold text-lg text-[#f4efe6]">#${parcel.id}</span>
                            </div>
                            <span class="stamp ${this.getStatusClass(parcel.status)}">${CONFIG.getStatusLabel(parcel.status)}</span>
                        </div>
                        <div class="py-3 space-y-2">
                            <div class="text-xs font-mono text-[#8a8475] uppercase tracking-wider">Owners & Allocation (${parcel.owners?.length || 0})</div>
                            <div class="space-y-1.5">${ownersHtml}</div>
                        </div>
                        <div class="flex items-center justify-between text-xs font-mono text-[#8a8475] pt-1">
                            <span>Audit History</span>
                            <span class="text-[#a8a194] bg-[#21201c] px-2 py-0.5 rounded border border-[#2b2923]">${parcel.versionsCount || 0} ${parcel.versionsCount === 1 ? 'version' : 'versions'}</span>
                        </div>
                    </div>
                    ${dealHtml}
                    ${actionsHtml}
                    ${mapLink}
                    <div class="mt-4 pt-3 border-t border-[#292722]" id="actions-${parcel.id}"></div>
                </div>
            `;
        },

        // Render action buttons for parcel based on status and sub
        renderParcelActions(parcel) {
            const { account, roles } = chain;
            const isSurveyor = roles?.surveyor;
            const isRegistrar = roles?.registrar;
            const statusCode = parcel.status ?? 0;
            const sub = parcel.sub || null;

            // Only show actions for relevant roles and statuses
            if (statusCode === 1 && sub === 'survey' && isSurveyor) {
                return `
                    <div class="mt-4 pt-3 border-t border-[#292722] space-y-2">
                        <button class="btn w-full" onclick="svc.verifySurvey(${parcel.id})" data-pid="${parcel.id}">
                            Verify Survey
                        </button>
                    </div>
                `;
            }
            if (statusCode === 2 && sub === 'registrar' && isRegistrar) {
                return `
                    <div class="mt-4 pt-3 border-t border-[#292722] space-y-2">
                        <button class="btn w-full" onclick="svc.approveRegistration(${parcel.id})" data-pid="${parcel.id}">
                            Approve Registration
                        </button>
                    </div>
                `;
            }
            return '';
        },

        getStatusClass(status) {
            const classes = {
                0: 'st-pending',
                1: 'st-pending',
                2: 'st-pending',
                3: 'st-approved',
                4: 'st-sale'
            };
            return classes[status] || 'st-pending';
        },

        statusBadge(status) {
            return `<span class="stamp ${this.getStatusClass(status)}">${CONFIG.getStatusLabel(status)}</span>`;
        },

        // Main parcels view
        renderParcels(parcels, loading, error, onRefresh, mineOnly, account) {
            const metrics = this.computeMetrics(parcels);
            const displayed = mineOnly && account
                ? parcels.filter(p => p.owners?.some(o => o.toLowerCase() === account.toLowerCase()))
                : parcels;

            return `
                <div class="space-y-6">
                    <!-- Metrics bar -->
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                        <div class="bg-[#1c1b17] border border-[#2d2b24] p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold font-mono text-[#f4efe6]">${metrics.total}</div>
                            <div class="text-xs font-mono text-[#8a8475] uppercase mt-0.5">Total</div>
                        </div>
                        <div class="bg-[#15241c] border border-[#1d3d2c] p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold font-mono text-[#58b988]">${metrics.registered}</div>
                            <div class="text-xs font-mono text-[#73a88c] uppercase mt-0.5">Registered</div>
                        </div>
                        <div class="bg-[#241f15] border border-[#42351d] p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold font-mono text-[#e5b567]">${metrics.underSale}</div>
                            <div class="text-xs font-mono text-[#b39154] uppercase mt-0.5">On Sale</div>
                        </div>
                        <div class="bg-[#152229] border border-[#1b3642] p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold font-mono text-[#58b0d8]">${metrics.surveyVerified}</div>
                            <div class="text-xs font-mono text-[#6ba4be"] uppercase mt-0.5">Surveyed</div>
                        </div>
                        <div class="bg-[#201f26] border border-[#353342] p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold font-mono text-[#a8a1b8]">${metrics.submitted}</div>
                            <div class="text-xs font-mono text-[#827d91] uppercase mt-0.5">Submitted</div>
                        </div>
                    </div>

                    <!-- Controls -->
                    <div class="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-[#2b2923] mb-4">
                        <div class="flex items-center gap-2">
                            <h2 class="text-lg font-serif font-medium text-[#f4efe6]">Parcel Registry <span class="font-mono text-sm text-[#8a8475]">(${displayed.length})</span></h2>
                        </div>

                        <div class="flex items-center gap-3">
                            <button id="mineOnlyBtn" class="px-3 py-1.5 rounded text-xs font-mono transition border flex items-center gap-2 ${
                                !window.chain.account
                                    ? 'opacity-40 cursor-not-allowed bg-[#1f1e1a] border-[#2c2a24] text-[#8a8475]'
                                : this.mineOnly
                                    ? 'bg-[#d8a85c] text-[#161513] border-[#d8a85c] font-bold'
                                    : 'bg-[#1f1e1a] text-[#c2bcaf] border-[#38352e] hover:border-[#4d493f]'
                            }" ${!window.chain.account ? 'disabled' : ''}>
                                <span>Mine Only</span>
                                ${this.mineOnly && window.chain.account ? '<span>✓</span>' : ''}
                            </button>

                            <button id="refreshBtn" class="px-3 py-1.5 rounded text-xs font-mono bg-[#1f1e1a] text-[#c2bcaf] border border-[#38352e] hover:border-[#4d493f] transition flex items-center gap-1.5">
                                <span class="${window.svc.loading ? 'animate-spin' : ''}">↻</span>
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>

                    ${this.error ? `
                    <div class="p-4 rounded-lg bg-[#2e1719] border border-[#4f2427] text-[#f8b4b4] text-sm font-mono flex items-start gap-3 mb-4">
                        <span class="text-lg">⚠</span>
                        <div>
                            <div class="font-bold">Registry Connection Issue</div>
                            <div class="text-xs mt-1 text-[#e2a8ab]">${this.error}</div>
                        </div>
                    </div>` : ''}

                    ${loading ? `
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${[1,2,3].map(i => `
                            <div class="rounded-lg border border-[#292722] bg-[#1a1916] p-5 space-y-4 animate-pulse">
                                <div class="flex justify-between items-center">
                                    <div class="h-5 w-16 bg-[#2b2823] rounded"></div>
                                    <div class="h-5 w-24 bg-[#2b2823] rounded"></div>
                                </div>
                                <div class="space-y-2">
                                    <div class="h-4 w-32 bg-[#2b2823] rounded"></div>
                                    <div class="h-8 w-full bg-[#24221d] rounded"></div>
                                </div>
                                <div class="h-4 w-20 bg-[#2b2823] rounded"></div>
                            </div>
                        `).join('')}
                    </div>` : `
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="parcelGrid">
                        ${parcels.length === 0 ? `
                            <div class="col-span-full text-center py-16 px-4 border border-dashed border-[#333028] rounded-lg bg-[#191815]">
                                <div class="font-serif text-xl text-[#a8a194] italic mb-2">No parcels found</div>
                                <p class="text-xs font-mono text-[#696356] max-w-sm mx-auto">No parcels recorded yet. Deploy contracts and seed demo parcels.</p>
                            </div>
                        ` : displayed.map(p => this.parcelCard(p)).join('')}
                    </div>
            `;
        },

        computeMetrics(parcels) {
            return {
                total: parcels.length,
                registered: parcels.filter(p => p.status === 3).length,
                underSale: parcels.filter(p => p.status === 4).length,
                surveyVerified: parcels.filter(p => p.status === 2).length,
                submitted: parcels.filter(p => p.status === 1).length
            };
        },

        // Render to viewRoot
        render(state) {
            const { parcels, loading, error } = state;
            const mineOnly = this.mineOnly;
            const account = chain.account;

            const html = this.renderParcels(parcels, loading, error, () => svc.load(), mineOnly, account);
            document.getElementById('viewRoot').innerHTML = html;

            // Attach event listeners
            this.attachListeners();
        },

        attachListeners() {
            const mineBtn = document.getElementById('mineOnlyBtn');
            if (mineBtn) {
                mineBtn.onclick = () => {
                    this.mineOnly = !this.mineOnly;
                    this.render(window.svc);
                };
            }

            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.onclick = () => svc.load();
            }
        },

        // focusPlot must return quietly for unknown id
        focusPlot(parcelId) {
            const plot = window.P.find(p => p.pid === parcelId);
            if (!plot) {
                console.warn('focusPlot: unknown parcelId', parcelId);
                return; // quietly return
            }
            if (!plot.pts || plot.pts.length < 3) {
                console.warn('focusPlot: parcel', parcelId, 'has insufficient pts');
                return;
            }
            // Map focus logic would go here
            console.log('Focusing plot:', plot.id);
        },

        computeMetrics(parcels) {
            return {
                total: parcels.length,
                registered: parcels.filter(p => p.status === 3).length,
                underSale: parcels.filter(p => p.status === 4).length,
                surveyVerified: parcels.filter(p => p.status === 2).length,
                submitted: parcels.filter(p => p.status === 1).length
            };
        }
    };
})();