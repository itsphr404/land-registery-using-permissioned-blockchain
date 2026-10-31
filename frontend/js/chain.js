// SPDX-License-Identifier: MIT
// Land Registry - Chain Service
// Handles wallet connection, network, contracts, roles, and events

(function() {
    'use strict';

    // ============================================
    // GLOBAL CHAIN OBJECT
    // ============================================
    window.chain = {
        // State
        state: 'no-wallet', // no-wallet | disconnected | wrong-network | ready
        account: null,
        chainId: null,
        walletProvider: null,
        signer: null,
        readProvider: null,
        contracts: {
            roleManager: null,
            registry: null,
            escrow: null
        },
        roles: {
            admin: false,
            registrar: false,
            surveyor: false,
            court: false,
            issuer: false,
            citizen: true
        },
        deployment: null,
        deploymentLoaded: false,
        listeners: {},

        // ============================================
        // INITIALIZATION
        // ============================================
        async init() {
            try {
                // Load deployment file
                const response = await fetch(APP_ENV.deploymentFile);
                if (!response.ok) {
                    throw new Error(`Failed to load deployment file: ${response.status}`);
                }
                this.deployment = await response.json();
                this.deploymentLoaded = true;

                // Set up read provider
                this.readProvider = new ethers.JsonRpcProvider(APP_ENV.rpcUrl);

                // Build contracts from deployment ABIs
                await this.buildContracts();

                // Try to restore wallet on load
                await this.restoreWallet();

                // Update network banner
                this.updateNetBanner();

                return true;
            } catch (err) {
                console.error('Chain init failed:', err);
                this.setError('Failed to initialize: ' + err.message);
                return false;
            }
        },

        async buildContracts() {
            const { RoleManager, LandRegistry, TitleEscrow } = this.deployment.contracts;

            // Read-only contracts (for views)
            this.contracts.roleManager = new ethers.Contract(
                RoleManager.address,
                RoleManager.abi,
                this.readProvider
            );
            this.contracts.registry = new ethers.Contract(
                LandRegistry.address,
                LandRegistry.abi,
                this.readProvider
            );
            this.contracts.escrow = new ethers.Contract(
                TitleEscrow.address,
                TitleEscrow.abi,
                this.readProvider
            );
        },

        // ============================================
        // WALLET MANAGEMENT
        // ============================================
        getInjectedProvider() {
            if (typeof window === 'undefined') return null;
            if (window.ethereum) return window.ethereum;
            if (window.phantom?.ethereum) return window.phantom.ethereum;
            return null;
        },

        async restoreWallet() {
            const eth = this.getInjectedProvider();
            if (!eth) {
                this.state = 'no-wallet';
                return false;
            }

            try {
                const provider = new ethers.BrowserProvider(eth);
                this.walletProvider = provider;

                // Check accounts without popup
                const accounts = await eth.request({ method: 'eth_accounts' });
                if (accounts && accounts.length > 0) {
                    const acc = accounts[0];
                    this.account = acc;
                    this.signer = await provider.getSigner();

                    const net = await provider.getNetwork();
                    this.chainId = Number(net.chainId);

                    if (this.chainId !== APP_ENV.chainId) {
                        this.state = 'wrong-network';
                    } else {
                        this.state = 'ready';
                    }
                } else {
                    this.state = 'disconnected';
                }
            } catch (err) {
                console.warn('Restore wallet error:', err);
                this.state = 'disconnected';
            }

            // Set up event listeners
            this.setupWalletListeners(eth);
            return this.state === 'ready';
        },

        setupWalletListeners(eth) {
            if (!eth) return;

            const handleAccountsChanged = async (accounts) => {
                if (accounts && accounts.length > 0) {
                    this.account = accounts[0];
                    this.signer = await this.walletProvider.getSigner();
                    await this.loadRoles();
                    window.dispatchEvent(new CustomEvent('wallet:accountsChanged', { detail: { account: this.account } }));
                } else {
                    this.account = null;
                    this.signer = null;
                    this.resetRoles();
                    this.state = 'disconnected';
                    this.updateNetBanner();
                }
            };

            const handleChainChanged = () => {
                window.location.reload();
            };

            eth.on?.('accountsChanged', handleAccountsChanged);
            eth.on?.('chainChanged', handleChainChanged);
        },

        async connect() {
            const eth = this.getInjectedProvider();
            if (!eth) {
                this.setError('No Ethereum wallet detected (MetaMask or Phantom). Please install MetaMask or enable Ethereum in Phantom.');
                return false;
            }

            try {
                const provider = new ethers.BrowserProvider(eth);
                this.walletProvider = provider;

                const accounts = await eth.request({ method: 'eth_requestAccounts' });
                if (accounts && accounts.length > 0) {
                    this.account = accounts[0];
                    this.signer = await provider.getSigner();

                    const net = await provider.getNetwork();
                    this.chainId = Number(net.chainId);

                    if (this.chainId !== APP_ENV.chainId) {
                        this.state = 'wrong-network';
                        await this.switchNetwork();
                    } else {
                        this.state = 'ready';
                    }

                    await this.loadRoles();
                    window.dispatchEvent(new CustomEvent('wallet:connected', { detail: { account: this.account } }));
                    return true;
                }
            } catch (err) {
                console.error('Connect error:', err);
                if (err.code === 4001) {
                    this.setError('Connection request was rejected in your wallet.');
                } else if (err.code === -32002) {
                    this.setError('A connection request is already waiting in your wallet extension. Click your wallet icon in the browser toolbar to approve.');
                } else {
                    this.setError('Failed to connect wallet: ' + (err.message || 'Unknown error'));
                }
                return false;
            }
        },

        async switchNetwork() {
            const eth = this.getInjectedProvider();
            if (!eth) return false;

            try {
                const hexChainId = '0x' + APP_ENV.chainId.toString(16);
                await eth.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: hexChainId }]
                });
                this.state = 'ready';
                return true;
            } catch (switchError) {
                if (switchError.code === 4902 || switchError.data?.originalError?.code === 4902 ||
                    (switchError.message && switchError.message.includes('4902'))) {
                    try {
                        await eth.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: '0x' + APP_ENV.chainId.toString(16),
                                chainName: APP_ENV.networkName,
                                rpcUrls: [APP_ENV.rpcUrl],
                                nativeCurrency: {
                                    name: APP_ENV.currency,
                                    symbol: APP_ENV.currency,
                                    decimals: 18
                                }
                            }]
                        });
                        this.state = 'ready';
                        return true;
                    } catch (addError) {
                        if (addError.code === 4001) {
                            this.setError('Network addition was rejected in your wallet.');
                        } else {
                            this.setError('Failed to add network: ' + (addError.message || ''));
                        }
                        return false;
                    }
                } else if (switchError.code === 4001) {
                    this.setError('Network switch was rejected in your wallet.');
                    return false;
                } else {
                    this.setError('Failed to switch network: ' + (switchError.message || ''));
                    return false;
                }
            }
        },

        // ============================================
        // ROLES MANAGEMENT
        // ============================================
        async loadRoles() {
            if (!this.account || !this.walletProvider || !this.contracts.roleManager) {
                this.resetRoles();
                return;
            }

            try {
                const defaultAdminRole = await this.contracts.roleManager.DEFAULT_ADMIN_ROLE();

                const [admin, registrar, surveyor, court, issuer] = await Promise.all([
                    this.contracts.roleManager.hasRole(defaultAdminRole, this.account).catch(() => false),
                    this.contracts.roleManager.isRegistrar(this.account).catch(() => false),
                    this.contracts.roleManager.isSurveyor(this.account).catch(() => false),
                    this.contracts.roleManager.isCourt(this.account).catch(() => false),
                    this.contracts.roleManager.isIssuer(this.account).catch(() => false)
                ]);

                const hasAnyPrivilege = admin || registrar || surveyor || court || issuer;

                this.roles = {
                    admin,
                    registrar,
                    surveyor,
                    court,
                    issuer,
                    citizen: !hasAnyPrivilege
                };

                window.dispatchEvent(new CustomEvent('roles:updated', { detail: { roles: this.roles } }));
            } catch (err) {
                console.error('Error fetching roles:', err);
                this.resetRoles();
            }
        },

        resetRoles() {
            this.roles = {
                admin: false,
                registrar: false,
                surveyor: false,
                court: false,
                issuer: false,
                citizen: true
            };
        },

        // Grant a role to an address
        async grantRole(roleName, address) {
            if (!this.signer) throw new Error('No signer connected');
            const { roleManager } = this.getWriteContracts();
            const roleId = await roleManager[roleName.toUpperCase() + '_ROLE']();
            const tx = await roleManager.grantRole(roleId, address);
            const receipt = await tx.wait();
            return receipt;
        },

        // ============================================
        // ERROR HANDLING
        // ============================================
        setError(msg) {
            this.error = msg;
            window.dispatchEvent(new CustomEvent('chain:error', { detail: { message: msg } }));
        },

        clearError() {
            this.error = null;
        },

        // ============================================
        // NETWORK BANNER
        // ============================================
        updateNetBanner() {
            const netEl = document.getElementById('net');
            if (!netEl) return;

            const stateLabels = {
                'no-wallet': { text: 'No Wallet Detected', class: 'bg-red-600' },
                'disconnected': { text: 'Wallet Disconnected', class: 'bg-yellow-600' },
                'wrong-network': { text: `Wrong Network (need ${APP_ENV.networkName})`, class: 'bg-yellow-600' },
                'ready': { text: `${APP_ENV.networkName} Connected`, class: 'bg-green-600' }
            };

            const s = stateLabels[this.state] || { text: 'Unknown', class: 'bg-gray-600' };

            netEl.textContent = s.text;
            netEl.className = 'banner ' + s.class;
            netEl.style.display = 'block';
        },

        // ============================================
        // CONTRACT HELPERS
        // ============================================
        getWriteContracts() {
            if (!this.signer) return null;
            return {
                roleManager: this.contracts.roleManager.connect(this.signer),
                registry: this.contracts.registry.connect(this.signer),
                escrow: this.contracts.escrow.connect(this.signer)
            };
        },

        // Grant a role to an address
        async grantRole(roleName, address) {
            if (!this.signer) throw new Error('No signer connected');
            const { roleManager } = this.getWriteContracts();
            const roleId = await roleManager[roleName.toUpperCase() + '_ROLE']();
            const tx = await roleManager.grantRole(roleId, address);
            const receipt = await tx.wait();
            return receipt;
        },

        // ============================================
        // EVENT EMITTER HELPERS
        // ============================================
        on(event, handler) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(handler);
        },

        off(event, handler) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(h => h !== handler);
        },

        emit(event, detail) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(h => h(detail));
            }
        }
    };

    // Expose friendlyError globally
    window.friendlyError = function(e) {
        // User rejection
        if (e.code === 4001 || e.code === 'ACTION_REJECTED' ||
            (e.message && e.message.includes('rejected')) ||
            (e.code && e.code.toString() === '4001')) {
            return 'You cancelled the request.';
        }

        // Try to decode custom error from contract
        if (e.data) {
            try {
                // Try to decode using ethers interface
                const iface = new ethers.Interface([
                    'error NotRegistrar()',
                    'error NotSurveyor()',
                    'error ConflictOfInterest()',
                    'error ConflictingRole()',
                    'error ConsentsMissing()',
                    'error InvalidStatus(uint8,uint8)',
                    'error WrongAmount(uint256,uint256)',
                    'error DealExpired()',
                    'error DeadlineNotReached()',
                    'error BuyerIsOwner()',
                    'error NotSeller()',
                    'error AlreadyApproved()',
                    'error NothingToWithdraw()',
                    'error TransferFailed()',
                    'error ZeroAddress()',
                    'error InvalidPrice()',
                    'error NotParcelOwner()',
                    'error DealExists(uint256)',
                    'error NoActiveDeal(uint256)',
                    'error WrongDealStatus(uint8,uint8)',
                    'error ParcelNotFound(uint256)',
                    'error VersionNotFound(uint256,uint256)',
                    'error ZeroAddress()',
                    'error InvalidPrice()',
                    'error NotParcelOwner()',
                    'error DealExists(uint256)',
                    'error NoActiveDeal(uint256)',
                    'error WrongDealStatus(uint8,uint8)',
                    'error NotAuthority()',
                    'error ZeroAddress()',
                    'error LengthMismatch()',
                    'error NoOwners()',
                    'error TooManyOwners()',
                    'error DuplicateOwner()',
                    'error ZeroShare()',
                    'error SharesMustSumTo100()',
                    'error SubmitterNotAnOwner()',
                    'error EmptyDocHash()',
                    'error EmptyCid()',
                    'error NotEscrow()',
                    'error DealExpired()',
                    'error DealExists(uint256)',
                    'error WrongAmount(uint256,uint256)',
                    'error BuyerIsOwner()',
                    'error NotSeller()',
                    'error AlreadyApproved()',
                    'error NothingToWithdraw()',
                    'error TransferFailed()'
                ]);

                const decoded = iface.parseError(e.data);
                if (decoded) {
                    const errorMessages = {
                        NotRegistrar: 'Only a registrar can perform this action.',
                        NotSurveyor: 'Only a surveyor can perform this action.',
                        ConflictOfInterest: 'You cannot approve your own transaction.',
                        ConflictingRole: 'This account already holds a conflicting role.',
                        ConsentsMissing: 'Not all owners have consented to the sale.',
                        InvalidStatus: 'The parcel is not in the correct state for this action.',
                        WrongAmount: 'The deposited amount must exactly match the price.',
                        DealExpired: 'The 7-day deadline has passed.',
                        DeadlineNotReached: 'The 7-day deadline has not yet passed.',
                        BuyerIsOwner: 'An owner cannot buy their own parcel.',
                        NotSeller: 'Only the listing seller can perform this action.',
                        AlreadyApproved: 'You have already approved this.',
                        NothingToWithdraw: 'No funds available to withdraw.',
                        TransferFailed: 'The transfer failed. Please try again.',
                        ZeroAddress: 'Address cannot be zero.',
                        InvalidPrice: 'Price must be greater than zero.',
                        NotParcelOwner: 'You are not an owner of this parcel.',
                        DealExists: 'A deal already exists for this parcel.',
                        NoActiveDeal: 'No active deal found for this parcel.',
                        WrongDealStatus: 'The deal is not in the correct state.',
                        NotAuthority: 'Only the authority can perform this action.',
                        LengthMismatch: 'Owners and shares arrays must have the same length.',
                        NoOwners: 'At least one owner is required.',
                        TooManyOwners: 'Maximum 10 owners allowed.',
                        DuplicateOwner: 'Duplicate owner address found.',
                        ZeroShare: 'Each share must be greater than zero.',
                        SharesMustSumTo100: 'Shares must sum to exactly 100.',
                        SubmitterNotAnOwner: 'The submitter must be one of the owners.',
                        EmptyDocHash: 'Document hash cannot be empty.',
                        EmptyCid: 'CID cannot be empty.',
                        NotEscrow: 'Only the escrow contract can perform this action.',
                        DealExpired: 'The deal deadline has expired.',
                        NotAuthority: 'Only the authority can perform this action.',
                        WrongDealStatus: 'The deal status is incorrect for this operation.',
                        NotSeller: 'Only the seller can perform this action.',
                        AlreadyApproved: 'Already approved.',
                        NothingToWithdraw: 'Nothing to withdraw.',
                        NotRegistrar: 'Not a registrar.',
                        NotSurveyor: 'Not a surveyor.',
                        NotSeller: 'Not the seller.',
                        ConflictOfInterest: 'Conflict of interest detected.',
                        ConsentsMissing: 'Consents are missing.',
                        InvalidStatus: 'Invalid status for this operation.',
                        WrongAmount: 'Wrong amount sent.',
                        DealExpired: 'Deal has expired.',
                        DeadlineNotReached: 'Deadline not reached yet.',
                        BuyerIsOwner: 'Buyer cannot be an owner.',
                        NotSeller: 'Not the seller.',
                        AlreadyApproved: 'Already approved.',
                        NothingToWithdraw: 'Nothing to withdraw.',
                        TransferFailed: 'Transfer failed.'
                    };

                    if (errorMessages[decoded.name]) {
                        return errorMessages[decoded.name];
                    }
                    return decoded.name;
                }
            } catch (err) {
                // Fall through to generic
            }
        }

        // Generic fallback
        return 'Transaction failed. Please try again.';
    };
})();