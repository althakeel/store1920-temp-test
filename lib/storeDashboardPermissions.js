import {
    countEnabledPermissions as countEnabledDefaults,
    getDefaultPermissions,
    buildDeniedPermissions,
} from '@/lib/storePermissionDefaults';

export { getDefaultPermissions, buildDeniedPermissions };

export const SIDEBAR_ACCESS_COMPONENTS = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠', href: '/store' },
    { id: 'categories', label: 'Categories', icon: '📂', href: '/store/categories' },
    { id: 'addProduct', label: 'Add Product', icon: '➕', href: '/store/add-product' },
    { id: 'manageProduct', label: 'Manage Product', icon: '🧾', href: '/store/manage-product' },
    { id: 'inventory', label: 'Inventory', icon: '🏬', href: '/store/inventory' },
    { id: 'databaseImport', label: 'Database Import', icon: '🗄️', href: '/store/settings/database-import' },
    { id: 'customize', label: 'Customize', icon: '🎨', href: '/store/customize' },
    { id: 'mobileFeatures', label: 'Mobile Features', icon: '📱', href: '/store/mobile-features' },
    { id: 'blogs', label: 'Blogs', icon: '📝', href: '/store/blogs' },
    { id: 'menuManagement', label: 'Menu Management', icon: '📋', href: '/store/menu-management' },
    { id: 'media', label: 'Media', icon: '🖼️', href: '/store/media' },
    { id: 'orders', label: 'Orders', icon: '📦', href: '/store/orders' },
    { id: 'todaysPickup', label: 'Pickup list', icon: '📅', href: '/store/todays-pickup' },
    { id: 'ordersByProduct', label: 'Orders by Product', icon: '📦', href: '/store/orders-by-product' },
    { id: 'trash', label: 'Trash', icon: '🗑️', href: '/store/trash' },
    { id: 'customers', label: 'Customers', icon: '👥', href: '/store/customers' },
    { id: 'customerTracking', label: 'Customer Tracking', icon: '📍', href: '/store/customer-tracking' },
    { id: 'marketingAnalytics', label: 'Marketing Analytics', icon: '📈', href: '/store/marketing-analytics' },
    { id: 'heatmap', label: 'Heatmap', icon: '🔥', href: '/store/heatmap' },
    { id: 'cohortTracking', label: 'Cohort Tracking', icon: '📊', href: '/store/cohorts' },
    { id: 'churnScores', label: 'Churn Scores', icon: '⚠️', href: '/store/churn-scores' },
    { id: 'rfmScores', label: 'RFM Scores', icon: '📐', href: '/store/rfm-scores' },
    { id: 'behavioralTriggers', label: 'Behavioral Triggers', icon: '⚡', href: '/store/behavioral-triggers' },
    { id: 'marketingStack', label: 'Marketing Stack', icon: '🧩', href: '/store/marketing-stack' },
    { id: 'abandonedCheckout', label: 'Abandoned Checkout', icon: '🛒', href: '/store/abandoned-checkout' },
    { id: 'shipping', label: 'Shipping', icon: '🚚', href: '/store/shipping' },
    { id: 'alerts', label: 'Alerts', icon: '⚠️', href: '/store/alerts' },
    { id: 'paymentSecurity', label: 'Payment Security', icon: '🔐', href: '/store/payment-security' },
    { id: 'returnRequests', label: 'Returns & Replacements', icon: '↩️', href: '/store/return-requests' },
    { id: 'balance', label: 'Balance', icon: '💰', href: '/store/balance' },
    { id: 'salesReport', label: 'Sales Report', icon: '📊', href: '/store/sales-report' },
    { id: 'promotionalOffers', label: 'Promotional Offers', icon: '🎁', href: '/store/personalized-offers' },
    { id: 'coupons', label: 'Coupons', icon: '🏷️', href: '/store/coupons' },
    { id: 'giveaways', label: 'Giveaways', icon: '🎁', href: '/store/giveaways' },
    { id: 'spinWheel', label: 'Spin Wheel', icon: '🎡', href: '/store/spin-wheel' },
    { id: 'promotionalEmails', label: 'Promotional Emails', icon: '📧', href: '/store/promotional-emails' },
    { id: 'adsTracking', label: 'Ad Tracking', icon: '📈', href: '/store/ads-tracking' },
    { id: 'marketingExpenses', label: 'Marketing Expenses', icon: '📉', href: '/store/marketing-expenses' },
    { id: 'reviews', label: 'Reviews', icon: '⭐', href: '/store/reviews' },
    { id: 'supportTickets', label: 'Support Tickets', icon: '🎫', href: '/store/tickets' },
    { id: 'contactMessages', label: 'Contact Messages', icon: '✉️', href: '/store#contact-messages' },
    { id: 'productNotifications', label: 'Product Notifications', icon: '🔔', href: '/store/product-notifications' },
    { id: 'manageUsers', label: 'Staff & permissions', icon: '👤', href: '/store/settings?tab=team' },
    { id: 'settings', label: 'Settings', icon: '⚙️', href: '/store/settings' },
];

export const PERMISSION_GROUPS = [
    {
        id: 'store',
        label: 'Store & catalog',
        componentIds: ['dashboard', 'categories', 'addProduct', 'manageProduct', 'databaseImport', 'customize', 'mobileFeatures', 'blogs', 'menuManagement', 'media', 'settings'],
    },
    {
        id: 'sales',
        label: 'Orders & customers',
        componentIds: ['orders', 'todaysPickup', 'ordersByProduct', 'trash', 'customers', 'customerTracking', 'abandonedCheckout', 'shipping', 'alerts', 'paymentSecurity', 'returnRequests', 'balance', 'salesReport'],
    },
    {
        id: 'marketing',
        label: 'Marketing',
        componentIds: ['promotionalOffers', 'coupons', 'giveaways', 'spinWheel', 'promotionalEmails', 'customerTracking', 'marketingAnalytics', 'heatmap', 'cohortTracking', 'churnScores', 'rfmScores', 'behavioralTriggers', 'marketingStack', 'adsTracking', 'marketingExpenses'],
    },
    {
        id: 'support',
        label: 'Support & reviews',
        componentIds: ['reviews', 'supportTickets', 'contactMessages', 'productNotifications'],
    },
    {
        id: 'warehouse',
        label: 'Warehouse',
        componentIds: ['inventory'],
    },
    {
        id: 'team',
        label: 'Team',
        componentIds: ['manageUsers'],
    },
];

const componentMap = Object.fromEntries(
    SIDEBAR_ACCESS_COMPONENTS.map((component) => [component.id, component])
);

export function countEnabledPermissions(permissions = {}) {
    return countEnabledDefaults(permissions);
}

export function getComponentById(id) {
    return componentMap[id] || null;
}

export function setAllPermissions(current = {}, enabled) {
    const next = { ...current };
    SIDEBAR_ACCESS_COMPONENTS.forEach((component) => {
        next[component.id] = enabled;
    });
    return next;
}

export function setGroupPermissions(current = {}, componentIds = [], enabled) {
    const next = { ...current };
    componentIds.forEach((id) => {
        next[id] = enabled;
    });
    return next;
}

function normalizePathname(pathname = '') {
    const raw = String(pathname || '').split('#')[0].split('?')[0].replace(/\/+$/, '');
    return raw || '/store';
}

/**
 * Customize hub cards link to routes that are not under `/store/customize/*`.
 * Without this map, members with only `customize` access get redirected away.
 */
const PATH_PERMISSION_ALIASES = [
    { permissionId: 'customize', prefixes: [
        '/store/customize',
        '/store/home-preferences',
        '/store/preferences',
        '/store/navbar-menu',
        '/store/home-menu-categories',
        '/store/storefront',
        '/store/explore-interests',
        '/store/category-slider',
        '/store/featured-products',
        '/store/sitemap-settings',
    ]},
    { permissionId: 'mobileFeatures', prefixes: [
        '/store/mobile-features',
    ]},
];

function getAliasedPermissionId(pathname = '') {
    const path = normalizePathname(pathname);
    for (const alias of PATH_PERMISSION_ALIASES) {
        for (const prefix of alias.prefixes) {
            const base = normalizePathname(prefix);
            if (path === base || path.startsWith(`${base}/`)) {
                return alias.permissionId;
            }
        }
    }
    return null;
}

export function getPermissionIdForHref(href = '') {
    const rawHref = String(href || '').trim();
    if (!rawHref) return null;

    const directComponent = SIDEBAR_ACCESS_COMPONENTS.find((component) => component.href === rawHref);
    if (directComponent) return directComponent.id;

    const normalizedPath = normalizePathname(rawHref);
    const aliased = getAliasedPermissionId(normalizedPath);
    if (aliased) return aliased;

    const sortedComponents = [...SIDEBAR_ACCESS_COMPONENTS].sort(
        (a, b) => normalizePathname(b.href).length - normalizePathname(a.href).length
    );

    for (const component of sortedComponents) {
        const basePath = normalizePathname(component.href);
        if (normalizedPath === basePath) return component.id;
        if (basePath !== '/store' && normalizedPath.startsWith(`${basePath}/`)) {
            return component.id;
        }
    }

    return null;
}

export function canAccessDashboardArea(permissions = {}, permissionId, { isOwner = false } = {}) {
    if (isOwner) return true;
    if (!permissionId) return true;
    return permissions?.[permissionId] !== false;
}

export function canAccessPath(pathname, permissions = {}, { isOwner = false } = {}) {
    if (isOwner) return true;
    const path = normalizePathname(pathname);
    if (path === '/store/settings' || path === '/store/settings/users') {
        return canAccessDashboardArea(permissions, 'settings', { isOwner })
            || canAccessDashboardArea(permissions, 'manageUsers', { isOwner });
    }
    const permissionId = getPermissionIdForHref(pathname);
    if (!permissionId) return false;
    return canAccessDashboardArea(permissions, permissionId, { isOwner });
}

export const canAccessStorePath = canAccessPath;

export function getFirstAllowedHref(permissions = {}, { isOwner = false } = {}) {
    if (isOwner) return '/store';

    for (const component of SIDEBAR_ACCESS_COMPONENTS) {
        if (canAccessDashboardArea(permissions, component.id, { isOwner })) {
            return component.href.split('#')[0] || '/store';
        }
    }

    return null;
}

export function getPermissionLabel(permissionId) {
    return componentMap[permissionId]?.label || 'This page';
}
