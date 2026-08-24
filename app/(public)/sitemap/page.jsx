'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { isStorefrontWalletEnabled } from '@/lib/storefrontWallet';

export default function SitemapPage() {
  const storefrontWalletEnabled = isStorefrontWalletEnabled();
  const [sitemapCategories, setSitemapCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const defaultCategories = [
    { id: 'fast-delivery', text: 'Fast Delivery', path: '/category/fast-delivery' },
    { id: 'trending-featured', text: 'Trending & Featured', path: '/category/trending-featured' },
    { id: 'men-s-fashion', text: "Men's Fashion", path: '/category/men-s-fashion' },
    { id: 'women-s-fashion', text: "Women's Fashion", path: '/category/womens-fashion' },
    { id: 'kids', text: 'Kids', path: '/category/kids' },
    { id: 'electronics', text: 'Electronics', path: '/category/electronics' },
    { id: 'mobile-accessories', text: 'Mobile Accessories', path: '/category/mobile-accessories' },
    { id: 'home-kitchen', text: 'Home & Kitchen', path: '/category/home-kitchen' },
    { id: 'beauty', text: 'Beauty', path: '/category/beauty' },
    { id: 'car-essentials', text: 'Car Essentials', path: '/category/car-essentials' },
    { id: 'sports-fitness', text: 'Sports & Fitness', path: '/category/sports-fitness' },
    { id: 'groceries', text: 'Groceries', path: '/category/groceries' },
  ];

  useEffect(() => {
    fetchSitemapCategories();
  }, []);

  const fetchSitemapCategories = async () => {
    try {
      const response = await axios.get('/api/store/sitemap-settings/public');
      if (response.data.categories && response.data.categories.length > 0) {
        setSitemapCategories(response.data.categories);
      } else {
        setSitemapCategories(defaultCategories);
      }
    } catch (error) {
      console.log('Using default categories (API unavailable):', error.message);
      // Always fallback to default categories if API fails
      setSitemapCategories(defaultCategories);
    } finally {
      setLoading(false);
    }
  };

  const sitemapSections = [
    {
      title: '🛍️ Shop & Browse',
      links: [
        { text: 'Home', path: '/', description: 'Main homepage' },
        { text: 'All Products', path: '/products', description: 'Browse all products' },
        { text: 'Shop', path: '/shop', description: 'Shop with filters' },
        { text: 'Categories', path: '/categories', description: 'All categories' },
        { text: 'Fast Delivery', path: '/fast-delivery', description: 'Quick shipping items' },
        { text: 'Top Selling', path: '/top-selling', description: 'Best selling products' },
        { text: 'New Arrivals', path: '/new', description: 'Latest products' },
        { text: 'Trending Now', path: '/trending-now', description: 'Trending items' },
        { text: 'Best Sellers', path: '/best-sellers', description: 'Customer favorites' },
        { text: '5-Star Rated', path: '/5-star-rated', description: 'Highly rated products' },
        { text: 'Deals', path: '/deals', description: 'Special deals' },
        { text: 'Special Offers', path: '/offers', description: 'Products with 60%+ off' },
        { text: 'Clearance Sale', path: '/clearance-sale', description: 'Clearance items' },
      ]
    },
    {
      title: '💰 Budget Shopping',
      links: [
        { text: 'Under AED149', path: '/under-149', description: 'Products under 149' },
        { text: 'Under AED499', path: '/under-499', description: 'Products under 499' },
      ]
    },
    {
      title: '👤 Account & Orders',
      links: [
        { text: 'My Profile', path: '/dashboard/profile', description: 'User profile settings' },
        { text: 'My Orders', path: '/orders', description: 'View all orders' },
        { text: 'Track Order', path: '/track-order', description: 'Track shipment' },
        { text: 'My Wishlist', path: '/wishlist', description: 'Saved items' },
        { text: 'Shopping Cart', path: '/cart', description: 'Shopping cart' },
        { text: 'Sign In', path: '/sign-in', description: 'Login to account' },
        { text: 'Sign Up', path: '/sign-up', description: 'Create new account' },
        { text: 'Dashboard', path: '/dashboard', description: 'User dashboard' },
        { text: 'My Wallet', path: '/wallet', description: 'Wallet & balance' },
        { text: 'Recently Viewed', path: '/recently-viewed', description: 'Browsing history' },
        { text: 'Recommended', path: '/recommended', description: 'Personalized recommendations' },
      ]
    },
    {
      title: '📦 Checkout & Orders',
      links: [
        { text: 'Checkout', path: '/checkout', description: 'Complete purchase' },
        { text: 'Order Success', path: '/order-success', description: 'Order confirmation' },
        { text: 'Order Failed', path: '/order-failed', description: 'Order help' },
        { text: 'Return Request', path: '/return-request', description: 'Request return' },
      ]
    },
    {
      title: '🔍 Search & Discovery',
      links: [
        { text: 'Search Results', path: '/search-results', description: 'Product search' },
      ]
    },
    {
      title: '❓ Help & Support',
      links: [
        { text: 'FAQ', path: '/faq', description: 'Frequently asked questions' },
        { text: 'Support', path: '/support', description: 'Customer support' },
        { text: 'Help Center', path: '/help', description: 'Help & guides' },
        { text: 'Contact Us', path: '/contact-us', description: 'Get in touch' },
      ]
    },
    {
      title: '📋 Policies & Legal',
      links: [
        { text: 'Terms & Conditions', path: '/terms-and-conditions', description: 'Terms of use' },
        { text: 'Terms of Sale', path: '/terms-of-sale', description: 'Purchase terms & conditions' },
        { text: 'Privacy Policy', path: '/privacy-policy', description: 'Privacy & data' },
        { text: 'Shipping Policy', path: '/shipping-policy', description: 'Shipping details' },
        { text: 'Return & Refund Policy', path: '/return-policy', description: 'Returns & refunds' },
        { text: 'Cancellation Policy', path: '/cancellation-and-refunds', description: 'Cancel orders' },
        { text: 'Cookie Policy', path: '/cookie-policy', description: 'Cookie information' },
        { text: 'Warranty Policy', path: '/warranty-policy', description: 'Product warranty' },
        { text: 'Refund Policy', path: '/refund-policy', description: 'Refund terms' },
      ]
    },
    {
      title: 'ℹ️ About & Partnership',
      links: [
        { text: 'About Us', path: '/about-us', description: 'Company information' },
        { text: 'Business Information', path: '/business-information', description: 'Trade license & company details' },
        { text: 'Create Your Store', path: '/create-store', description: 'Start selling' },
        { text: 'Careers', path: '/careers', description: 'Join our team' },
        { text: 'Pricing', path: '/pricing', description: 'Seller pricing' },
        { text: 'Payment & Pricing', path: '/payment-and-pricing', description: 'Payment options' },
      ]
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-16 px-4">
        <div className="max-w-[1280px] mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">📋</span>
            <h1 className="text-4xl md:text-5xl font-bold">Sitemap</h1>
          </div>
          <p className="text-blue-100 text-lg max-w-2xl">
            Find all pages and sections of Store1920 in one place. Navigate easily to any part of our platform.
          </p>
          <p className="mt-3 text-sm text-blue-100/90">
            For Google Search Console, submit the XML sitemap index at{' '}
            <a href="/sitemap.xml" className="underline font-medium text-white">
              /sitemap.xml
            </a>
            {' '}(not this HTML page).
          </p>
        </div>
      </div>

      {/* Sitemap Content */}
      <div className="max-w-[1280px] mx-auto px-4 py-12">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-500">Loading sitemap...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {sitemapSections.map((section, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
                {/* Section Header with Title Only */}
                <h2 className="text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-200">{section.title}</h2>

                {/* Links */}
                <ul className="space-y-2">
                  {section.links.filter((link) => link && link.path && (storefrontWalletEnabled || link.path !== '/wallet')).map((link, i) => (
                    <li key={i} className="group">
                      <Link 
                        href={link.path || '#'}
                        className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
                        title={link.description}
                      >
                        {link.text}
                      </Link>
                      {link.description && (
                        <p className="text-slate-500 text-sm ml-1 group-hover:text-slate-600 transition-colors">{link.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Additional Info Section */}
        <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100">
          <h3 className="text-2xl font-bold text-slate-800 mb-4">Need Help Finding Something?</h3>
          <p className="text-slate-600 mb-6">
            Can't find what you're looking for? Our support team is here to help you navigate Store1920.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link 
              href="/support"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Contact Support
            </Link>
            <Link 
              href="/help"
              className="px-6 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition font-medium"
            >
              Help Center
            </Link>
          </div>
        </div>

        {/* Browse History Link */}
        <div className="mt-8 text-center">
          <Link 
            href="/"
            className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-2 group"
          >
            <span>← Back to Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
