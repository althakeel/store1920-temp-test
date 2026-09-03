/** @type {import('next').NextConfig} */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const productRedirects = require('./data/productRedirects.json');
const categoryRedirects = require('./data/categoryRedirects.json');

// Keep remotePatterns compact (Next hard-caps at 50). Prefer wildcards over
// listing every CDN host. Unknown hosts still render via SafeNextImage → <img>.
const imageRemotePatterns = [
    { protocol: 'https', hostname: '**.amazonaws.com', pathname: '/**' },
    { protocol: 'https', hostname: 'ik.imagekit.io', pathname: '/**' },
    { protocol: 'https', hostname: 'placehold.co', pathname: '/**' },
    { protocol: 'https', hostname: '**.flixcart.com', pathname: '/**' },
    { protocol: 'https', hostname: '**.nooncdn.com', pathname: '/**' },
    { protocol: 'http', hostname: '**.nooncdn.com', pathname: '/**' },
    { protocol: 'https', hostname: '**.store1920.com', pathname: '/**' },
    { protocol: 'https', hostname: 'store1920.com', pathname: '/**' },
    { protocol: 'https', hostname: '**.media-amazon.com', pathname: '/**' },
    { protocol: 'https', hostname: '**.ssl-images-amazon.com', pathname: '/**' },
    { protocol: 'https', hostname: '**.images-amazon.com', pathname: '/**' },
    { protocol: 'https', hostname: 'images.amazon.com', pathname: '/**' },
    { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
    // Shopify / VIP Home Gallery imports (often http)
    { protocol: 'https', hostname: 'cdn.shopify.com', pathname: '/**' },
    { protocol: 'http', hostname: 'cdn.shopify.com', pathname: '/**' },
    { protocol: 'https', hostname: '**.myshopify.com', pathname: '/**' },
    { protocol: 'http', hostname: '**.myshopify.com', pathname: '/**' },
    { protocol: 'https', hostname: '**.viphomegallery.ae', pathname: '/**' },
    { protocol: 'http', hostname: '**.viphomegallery.ae', pathname: '/**' },
    { protocol: 'https', hostname: 'viphomegallery.ae', pathname: '/**' },
    { protocol: 'http', hostname: 'viphomegallery.ae', pathname: '/**' },
];

try {
    const envImageHosts = [
        process.env.AWS_S3_PUBLIC_URL,
        process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL,
        process.env.IMAGEKIT_URL_ENDPOINT,
        process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT,
    ];
    for (const value of envImageHosts) {
        if (!value) continue;
        const { protocol, hostname } = new URL(value);
        const proto = protocol.replace(':', '');
        if (proto !== 'http' && proto !== 'https') continue;
        const exists = imageRemotePatterns.some(
            (p) => p.protocol === proto && p.hostname === hostname,
        );
        if (!exists && imageRemotePatterns.length < 50) {
            imageRemotePatterns.push({ protocol: proto, hostname, pathname: '/**' });
        }
    }
} catch {}

const nextConfig = {
    images: {
        unoptimized: false,
        remotePatterns: imageRemotePatterns,
        formats: ['image/avif', 'image/webp'],
        deviceSizes: [320, 420, 640, 768, 1024, 1280, 1536, 1920],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
        qualities: [75, 85, 90, 100]
    },
    compress: true,
    experimental: {
        inlineCss: true,
        proxyClientMaxBodySize: '200mb',
        serverActions: {
            bodySizeLimit: '200mb'
        },
        optimizePackageImports: [
            'lucide-react',
            'react-icons',
            'date-fns',
            'recharts',
            '@tiptap/react',
            '@tiptap/starter-kit',
            'firebase/auth',
            'firebase/app',
            'react-redux',
        ],
    },
    serverExternalPackages: ['mongoose', 'firebase-admin', 'sharp'],
    turbopack: {},

    async rewrites() {
        return [
            {
                source: '/sitemap.xml',
                destination: '/sitemap-index.xml',
            },
            // Email marketing open/click trackers (public paths; keep legacy /api URLs working)
            {
                source: '/api/email/track/click',
                destination: '/e/click',
            },
            {
                source: '/api/email/track/open',
                destination: '/e/open',
            },
            // Named sitemap splits — serve full <urlset> via route handlers (not index-only).
            {
                source: '/sitemap-pages.xml',
                destination: '/sitemap-chunk/pages',
            },
            {
                source: '/sitemap-categories.xml',
                destination: '/sitemap-chunk/categories',
            },
            {
                source: '/sitemap-blog.xml',
                destination: '/sitemap-chunk/blog',
            },
            {
                source: '/sitemap-products.xml',
                destination: '/sitemap-chunk/products',
            },
            {
                source: '/sitemap-products-:chunk.xml',
                destination: '/sitemap-chunk/products-:chunk',
            },
        ];
    },

    async redirects() {
        // Specific legacy slug maps MUST come before generic trailing-slash /
        // add-to-cart rules, otherwise SEO URLs only hop to the same broken slug.
        const productSlugRedirects = Object.entries(productRedirects || {}).flatMap(([fromSlug, destination]) => {
            const sourceSlug = String(fromSlug || '').trim().replace(/^\/+/, '');
            const dest = String(destination || '').trim();
            if (!sourceSlug || !dest) return [];
            return [
                {
                    source: `/product/${sourceSlug}`,
                    destination: dest,
                    permanent: true,
                },
                {
                    source: `/product/${sourceSlug}/`,
                    destination: dest,
                    permanent: true,
                },
                {
                    source: `/products/${sourceSlug}`,
                    destination: dest,
                    permanent: true,
                },
                {
                    source: `/products/${sourceSlug}/`,
                    destination: dest,
                    permanent: true,
                },
            ];
        });

        const categoryPathRedirects = Object.entries(categoryRedirects || {}).flatMap(([fromPath, destination]) => {
            const sourcePath = String(fromPath || '').trim().replace(/^\/+/, '').replace(/^category\//i, '');
            const dest = String(destination || '').trim();
            if (!sourcePath || !dest) return [];
            return [
                {
                    source: `/category/${sourcePath}`,
                    destination: dest,
                    permanent: true,
                },
                {
                    source: `/category/${sourcePath}/`,
                    destination: dest,
                    permanent: true,
                },
            ];
        });

        // Fallback for unknown product/category URLs that only differ by trailing slash.
        const trailingSlashRedirects = [
            {
                source: '/product/products',
                destination: '/shop',
                permanent: false,
            },
            {
                source: '/product/products/',
                destination: '/shop',
                permanent: false,
            },
            {
                source: '/product/shop',
                destination: '/shop',
                permanent: false,
            },
            {
                source: '/product/shop/',
                destination: '/shop',
                permanent: false,
            },
            {
                source: '/product/:slug+/',
                destination: '/product/:slug+',
                permanent: true,
            },
            {
                source: '/products/:slug+/',
                destination: '/products/:slug+',
                permanent: true,
            },
            {
                source: '/category/:path+/',
                destination: '/category/:path+',
                permanent: true,
            },
        ];

        // Stub / unfinished aliases → canonical policy pages
        const policyCanonicalRedirects = [
            { source: '/privacy', destination: '/privacy-policy', permanent: true },
            { source: '/privacy/', destination: '/privacy-policy', permanent: true },
            { source: '/shipping', destination: '/shipping-policy', permanent: true },
            { source: '/shipping/', destination: '/shipping-policy', permanent: true },
            { source: '/terms', destination: '/terms-and-conditions', permanent: true },
            { source: '/terms/', destination: '/terms-and-conditions', permanent: true },
            // Master Return / Refund / Exchange / Cancellation policy
            { source: '/refund-policy', destination: '/return-policy', permanent: true },
            { source: '/refund-policy/', destination: '/return-policy', permanent: true },
            { source: '/cancellation-and-refunds', destination: '/return-policy', permanent: true },
            { source: '/cancellation-and-refunds/', destination: '/return-policy', permanent: true },
            { source: '/cancellation-policy', destination: '/return-policy', permanent: true },
            { source: '/cancellation-policy/', destination: '/return-policy', permanent: true },
        ];

        return [
            ...productSlugRedirects,
            ...categoryPathRedirects,
            ...policyCanonicalRedirects,
            ...trailingSlashRedirects,
        ];
    },

    webpack: (config, { dev }) => {
        config.module.rules.push({
            test: /\.mp3$/i,
            type: 'asset/resource',
        });
        if (dev) {
            // Avoid EPERM cache rename failures on Windows when multiple tools touch .next/cache
            config.cache = { type: 'memory' };
        }
        return config;
    },

    // Skip static generation for authenticated routes
    async headers() {
        return [
            {
                // Apply security headers to all routes
                source: '/:path*',
                headers: [
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'on'
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=31536000; includeSubDomains'
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'SAMEORIGIN'
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff'
                    },
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block'
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin'
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=()'
                    }
                ],
            },
            {
                source: '/store/:path*',
                headers: [
                    {
                        key: 'X-Robots-Tag',
                        value: 'noindex',
                    },
                    {
                        key: 'Cache-Control',
                        value: 'private, no-cache, no-store, must-revalidate'
                    }
                ],
            },
            {
                source: '/admin/:path*',
                headers: [
                    {
                        key: 'X-Robots-Tag',
                        value: 'noindex',
                    },
                    {
                        key: 'Cache-Control',
                        value: 'private, no-cache, no-store, must-revalidate'
                    }
                ],
            },
            {
                source: '/',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, s-maxage=60, stale-while-revalidate=300',
                    },
                ],
            },
            {
                source: '/product/:slug*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, s-maxage=120, stale-while-revalidate=600',
                    },
                ],
            },
            {
                source: '/products/:slug*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, s-maxage=120, stale-while-revalidate=600',
                    },
                ],
            },
            {
                source: '/shop',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, s-maxage=120, stale-while-revalidate=600',
                    },
                ],
            },
            {
                source: '/categories',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, s-maxage=300, stale-while-revalidate=900',
                    },
                ],
            },
            {
                source: '/category/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, s-maxage=300, stale-while-revalidate=900',
                    },
                ],
            },
            {
                // API routes security
                source: '/api/:path*',
                headers: [
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff'
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY'
                    }
                ]
            }
        ];
    },
};

export default nextConfig;
