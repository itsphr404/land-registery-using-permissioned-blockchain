// SPDX-License-Identifier: MIT
// Configuration constants and utilities

const STATUS_LABELS = {
    0: 'None',
    1: 'Submitted',
    2: 'Survey Verified',
    3: 'Registered',
    4: 'Under Sale'
};

const DEAL_STATUS_LABELS = {
    0: 'None',
    1: 'Listed',
    2: 'Funded',
    3: 'Completed',
    4: 'Refunded',
    5: 'Cancelled'
};

const ROLE_LABELS = {
    admin: 'Admin',
    registrar: 'Registrar',
    surveyor: 'Surveyor',
    court: 'Court',
    issuer: 'Issuer',
    citizen: 'Citizen'
};

const ROLE_ORDER = ['admin', 'registrar', 'surveyor', 'court', 'issuer'];

const ADDRESS_LABELS = {};
// Will be populated from deployment file

// Export to global
window.CONFIG = {
    STATUS_LABELS,
    DEAL_STATUS_LABELS,
    ROLE_LABELS,
    ROLE_ORDER,
    ADDRESS_LABELS,
    getStatusLabel: (code) => STATUS_LABELS[code] || 'Unknown',
    getDealStatusLabel: (code) => DEAL_STATUS_LABELS[code] || 'Unknown',
    getRoleLabel: (role) => ROLE_LABELS[role] || role,
    formatAddress: (addr) => {
        if (!addr) return '';
        const label = ADDRESS_LABELS[addr.toLowerCase()];
        if (label) return label;
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }
};