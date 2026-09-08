const PERMISSION_IDS = [
    'dashboard',
    'categories',
    'brands',
    'addProduct',
    'manageProduct',
    'changePricing',
    'inventory',
    'databaseImport',
    'customize',
    'mobileFeatures',
    'blogs',
    'menuManagement',
    'media',
    'orders',
    'todaysPickup',
    'ordersByProduct',
    'trash',
    'customers',
    'customerTracking',
    'marketingAnalytics',
    'heatmap',
    'cohortTracking',
    'churnScores',
    'rfmScores',
    'behavioralTriggers',
    'marketingStack',
    'abandonedCheckout',
    'shipping',
    'paymentSecurity',
    'returnRequests',
    'balance',
    'salesReport',
    'exports',
    'promotionalOffers',
    'coupons',
    'giveaways',
    'spinWheel',
    'promotionalEmails',
    'adsTracking',
    'marketingExpenses',
    'reviews',
    'supportTickets',
    'contactMessages',
    'productNotifications',
    'manageUsers',
    'viewActivityHistory',
    'settings',
];

const OPT_IN_PERMISSIONS = new Set(['changePricing', 'viewActivityHistory']);

export function getDefaultPermissions() {
    return Object.fromEntries(
        PERMISSION_IDS.map((id) => [id, !OPT_IN_PERMISSIONS.has(id)]),
    );
}

export function buildDeniedPermissions() {
    return Object.fromEntries(PERMISSION_IDS.map((id) => [id, false]));
}

export function countEnabledPermissions(permissions = {}) {
    return PERMISSION_IDS.filter((id) => permissions[id] !== false).length;
}

export { PERMISSION_IDS };
