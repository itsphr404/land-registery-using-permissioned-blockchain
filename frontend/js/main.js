// SPDX-License-Identifier: MIT
// Main entry point - boots the application

(function() {
    'use strict';

    // Global state
    window.S = { role: 'citizen' }; // legacy support

    // Route handling
    function route() {
        const hash = window.location.hash.slice(1) || 'parcels';
        const validViews = ['parcels', 'register', 'sales', 'roles', 'dashboard', 'settings'];
        const view = validViews.includes(hash) ? hash : 'parcels';
        window.views.currentExtraView = view !== 'parcels' ? view : null;

        // Update nav tabs
        document.querySelectorAll('nav a, nav button.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Render appropriate view
        if (view === 'parcels') {
            document.getElementById('viewRoot').style.display = '';
            // Parcels view is rendered by svc.render()
            svc.load();
        } else {
            document.getElementById('viewRoot').style.display = 'none';
            const html = viewsExtra.render(view);
            document.getElementById('viewRoot').innerHTML = viewsExtra.render(view);
            
            // Initialize view-specific functionality
            if (view === 'register') {
                viewsExtra.initRegisterForm();
            } else if (view === 'dashboard') {
                viewsExtra.initDashboardForm();
            }
        }

        // Update URL without reload
        window.location.hash = view;
    }

    // Build role selector text from chain.roles
    function updateRoleDisplay() {
        const roles = chain.roles || {};
        const roleOrder = ['admin', 'registrar', 'surveyor', 'court', 'issuer'];
        let displayRole = 'citizen';
        for (const role of roleOrder) {
            if (roles[role]) {
                displayRole = role;
                break;
            }
        }
        window.S.role = displayRole; // legacy

        // Update wallet widget
        const walletEl = document.getElementById('wallet');
        if (walletEl) {
            if (chain.account) {
                const label = window.CONFIG?.ADDRESS_LABELS?.[chain.account.toLowerCase()];
                const short = chain.account.slice(0, 6) + '...' + chain.account.slice(-4);
                const roleLabel = displayRole.charAt(0).toUpperCase() + displayRole.slice(1);
                walletEl.innerHTML = `
                    <button id="walletBtn" class="px-3 py-1.5 rounded text-xs font-mono bg-[#1f1e1a] text-[#c2bcaf] border border-[#38352e] hover:border-[#4d493f] transition flex items-center gap-2">
                        <span>${window.CONFIG?.formatAddress(chain.account) || chain.account.slice(0,6)+'...'+chain.account.slice(-4)}</span>
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#d8a85c] text-[#161513]">${roleLabel}</span>
                    </button>
                    <button id="disconnectBtn" class="px-2 py-1 rounded text-[10px] font-mono bg-transparent text-[#8a8475] border border-[#38352e] hover:border-[#4d493f] transition">Disconnect</button>
                `;
                document.getElementById('walletBtn').onclick = () => chain.connect();
                document.getElementById('disconnectBtn').onclick = () => {
                    chain.account = null;
                    chain.signer = null;
                    chain.state = 'disconnected';
                    chain.resetRoles();
                    chain.updateNetBanner();
                    renderWallet();
                };
            } else {
                walletEl.innerHTML = `
                    <button id="connectBtn" class="btn" style="padding:6px 12px;">Connect Wallet</button>
                `;
                document.getElementById('connectBtn').onclick = () => chain.connect();
            }
        }
    }

    function renderWallet() {
        const walletEl = document.getElementById('wallet');
        if (!walletEl) return;

        if (chain.account) {
            const displayRole = chain.roles?.admin ? 'Admin' :
                chain.roles?.registrar ? 'Registrar' :
                chain.roles?.surveyor ? 'Surveyor' :
                chain.roles?.court ? 'Court' :
                chain.roles?.issuer ? 'Issuer' : 'Citizen';

            const shortAddr = chain.account.slice(0,6) + '...' + chain.account.slice(-4);
            walletEl.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-[#c2bcaf]">${shortAddr}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#d8a85c] text-[#161513]">${displayRole}</span>
                    <button id="disconnectBtn" class="px-2 py-1 rounded text-[10px] font-mono bg-transparent text-[#8a8475] border border-[#38352e] hover:border-[#4d493f] transition">Disconnect</button>
                </div>
            `;
            document.getElementById('disconnectBtn').onclick = () => {
                chain.account = null;
                chain.signer = null;
                chain.state = 'disconnected';
                chain.resetRoles();
                chain.updateNetBanner();
                renderWallet();
            };
        } else {
            walletEl.innerHTML = `
                <button id="connectBtn" class="btn" style="padding:6px 12px;">Connect Wallet</button>
            `;
            document.getElementById('connectBtn').onclick = () => chain.connect();
        }
    }

    function updateNetBanner() {
        chain.updateNetBanner();
    }

    // Initialize tabs
    function initTabs() {
        const nav = document.getElementById('navTabs');
        if (!nav) return;

        const tabs = [
            { id: 'parcels', label: 'Parcels', icon: '📋' },
            { id: 'register', label: 'Register', icon: '➕' },
            { id: 'sales', label: 'Sales', icon: '💰' },
            { id: 'roles', label: 'Roles', icon: '👤' },
            { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            { id: 'settings', label: 'Settings', icon: '⚙️' }
        ];

        nav.innerHTML = tabs.map(t => `
            <button class="tab-btn" data-view="${t.id}" style="${t.id === 'parcels' ? 'border-color:#d8a85c;color:#d8a85c' : ''}">
                <span>${t.icon}</span> ${t.label}
            </button>
        `).join('');

        nav.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                window.location.hash = btn.dataset.view;
            };
        });
    }

    // Boot sequence
    async function boot() {
        // Initialize UI
        ui.init();
        initTabs();

        // Initial wallet render
        renderWallet();

        // Initialize chain
        await chain.init();

        // Update UI after init
        renderWallet();
        updateNetBanner();

        // Listen for wallet events
        window.addEventListener('wallet:connected', () => {
            renderWallet();
            updateNetBanner();
            svc.load();
        });

        window.addEventListener('wallet:accountsChanged', (e) => {
            renderWallet();
            updateNetBanner();
        });

        window.addEventListener('roles:updated', () => {
            renderWallet();
        });

        window.addEventListener('chain:error', (e) => {
            ui.toast(e.detail.message, 'error');
        });

        // Sync deployments on each load
        try {
            const res = await fetch(APP_ENV.deploymentFile);
            if (res.ok) {
                chain.deployment = await res.json();
                chain.deploymentLoaded = true;
                await chain.buildContracts();
                svc.load();
            }
        } catch (e) {
            console.warn('Could not reload deployment:', e);
        }

        // Initial load
        svc.load();

        // Hash change routing
        window.addEventListener('hashchange', route);
        route();
    }

    // Start boot
    boot();
})();