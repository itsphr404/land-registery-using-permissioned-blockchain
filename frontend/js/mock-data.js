// SPDX-License-Identifier: MIT
// Mock data for demo purposes

const MOCK_PARCELS = [
    {
        id: 1,
        status: 3, // Registered
        owners: ['0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'],
        shares: [100],
        versionsCount: 1,
        latestDocHash: '0x1234...',
        latestCid: 'demo-cid-1',
        deal: null
    },
    {
        id: 2,
        status: 3,
        owners: ['0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'],
        shares: [60, 40],
        versionsCount: 1,
        latestDocHash: '0x5678...',
        latestCid: 'demo-cid-2',
        deal: null
    },
    {
        id: 3,
        status: 1, // Submitted
        owners: ['0x976EA74026E726554dB657fA54763abd0C3a0aa9'],
        shares: [100],
        versionsCount: 1,
        latestDocHash: '0x9abc...',
        latestCid: 'demo-cid-3',
        deal: null
    },
    {
        id: 4,
        status: 2, // Survey Verified
        owners: ['0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'],
        shares: [100],
        versionsCount: 1,
        latestDocHash: '0xdef0...',
        latestCid: 'demo-cid-4',
        deal: null
    },
    {
        id: 5,
        status: 4, // Under Sale
        owners: ['0x976EA74026E726554dB657fA54763abd0C3a0aa9'],
        shares: [100],
        versionsCount: 1,
        latestDocHash: '0x1357...',
        latestCid: 'demo-cid-5',
        deal: {
            seller: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
            buyer: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
            price: '1.0',
            rawPrice: '1000000000000000000',
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            sellerApproved: false,
            registrarApproved: false,
            status: 2 // Funded
        }
    }
];

// Mock contract calls for demo mode
const mockCalls = {
    async parcelCount() {
        return MOCK_PARCELS.length;
    },

    async getStatus(id) {
        const p = MOCK_PARCELS.find(p => p.id === id);
        return p ? p.status : 0;
    },

    async getOwners(id) {
        const p = MOCK_PARCELS.find(p => p.id === id);
        return p ? [p.owners, p.shares.map(s => BigInt(s))] : [[], []];
    },

    async versionCount(id) {
        const p = MOCK_PARCELS.find(p => p.id === id);
        return p ? p.versionsCount : 0;
    },

    async getVersion(id, index) {
        const p = MOCK_PARCELS.find(p => p.id === id);
        if (!p || index >= p.versionsCount) return null;
        return {
            owners: p.owners,
            shares: p.shares.map(s => BigInt(s)),
            docHash: p.latestDocHash,
            cid: p.latestCid,
            timestamp: BigInt(Date.now()),
            reason: 0
        };
    },

    async getDeal(id) {
        const p = MOCK_PARCELS.find(p => p.id === id);
        if (!p || !p.deal) return null;
        return {
            seller: p.deal.seller,
            buyer: p.deal.buyer,
            price: BigInt(p.deal.rawPrice),
            deadline: BigInt(Math.floor(p.deal.deadline.getTime() / 1000)),
            sellerApproved: p.deal.sellerApproved,
            registrarApproved: p.deal.registrarApproved,
            status: p.deal.status
        };
    }
};

// Export to global
window.MOCK = {
    PARCELS: MOCK_PARCELS,
    calls: mockCalls
};