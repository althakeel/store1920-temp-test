// Promotional Email Templates
// Each template has an attractive design with the specified title/theme

import { emailLogoImg } from '@/lib/brandLogo';
import { getProductAbsoluteUrl } from '@/lib/productUrl';
import { STORE1920_SUPPORT_EMAIL } from '@/lib/storeContact';
import { getCustomerSiteUrl } from '@/lib/appUrl';

const SITE_URL = () => getCustomerSiteUrl() || 'https://www.store1920.com';
export const promotionalTemplates = [
  {
    id: 'buy-now-pay-later',
    subject: 'Buy Now, Pay Later – Don\'t Miss Out',
    title: 'Buy Now, Pay Later',
    subtitle: 'Don\'t Miss Out',
    emoji: '💳',
    color: '#8b5cf6',
    content: 'Shop now and pay at your convenience. Flexible payment options available on all your favorite products!',
    cta: 'Start Shopping',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 50px 20px; text-align: center; color: #ffffff; position: relative; overflow: hidden;">
          <div style="position: absolute; top: -20px; right: -20px; width: 120px; height: 120px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
          <div style="position: relative; z-index: 1;">
            <h1 style="font-size: 52px; margin: 0 0 12px 0;">💳</h1>
            <h2 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">Buy Now, Pay Later</h2>
            <p style="margin: 12px 0 0 0; font-size: 20px; opacity: 0.95; font-weight: 500;">Don't Miss Out</p>
            <div style="margin-top: 16px; padding: 8px 16px; background: rgba(255,255,255,0.2); border-radius: 20px; display: inline-block;">
              <span style="font-size: 12px; font-weight: 700; letter-spacing: 1px;">✨ EXCLUSIVE OFFER ✨</span>
            </div>
          </div>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #8b5cf6; margin-bottom: 24px;">
            <p style="font-size: 16px; line-height: 1.7; color: #1f2937; margin: 0; font-weight: 500;">
              🛍️ Shop now and <strong>pay at your convenience</strong>. Flexible payment options available on all your favorite products!
            </p>
          </div>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 32px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: #ffffff; padding: 16px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 8px 20px rgba(139, 92, 246, 0.4); border: 2px solid #8b5cf6; letter-spacing: 0.5px; transition: all 0.3s ease;">
              🚀 START SHOPPING NOW 🚀
            </a>
            <p style="font-size: 12px; color: #6b7280; margin-top: 12px;">Limited time offer • Free shipping on orders over AED500</p>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'price-dropped',
    subject: 'Price Dropped on Popular Picks ⏬',
    title: 'Price Dropped',
    subtitle: 'Popular Picks',
    emoji: '⏬',
    color: '#ef4444',
    content: 'Your favorite products just got more affordable! Check out these amazing price drops.',
    cta: 'View Deals',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 50px 20px; text-align: center; color: #ffffff; position: relative; overflow: hidden;">
          <div style="position: absolute; top: -20px; left: -20px; width: 120px; height: 120px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
          <div style="position: relative; z-index: 1;">
            <h1 style="font-size: 52px; margin: 0 0 12px 0;">⏬</h1>
            <h2 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">Price Dropped!</h2>
            <p style="margin: 12px 0 0 0; font-size: 20px; opacity: 0.95; font-weight: 500;">on Popular Picks</p>
            <div style="margin-top: 16px; padding: 8px 16px; background: rgba(255,255,255,0.2); border-radius: 20px; display: inline-block;">
              <span style="font-size: 12px; font-weight: 700; letter-spacing: 1px;">💰 MEGA SAVINGS 💰</span>
            </div>
          </div>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #ef4444; margin-bottom: 24px;">
            <p style="font-size: 16px; line-height: 1.7; color: #1f2937; margin: 0; font-weight: 500;">
              🎉 Your favorite products just got <strong>more affordable</strong>! Check out these amazing price drops before they're gone!
            </p>
          </div>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 32px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; padding: 16px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 8px 20px rgba(239, 68, 68, 0.4); border: 2px solid #ef4444; letter-spacing: 0.5px; transition: all 0.3s ease;">
              💳 VIEW ALL DEALS 💳
            </a>
            <p style="font-size: 12px; color: #6b7280; margin-top: 12px;">Prices updated hourly • Don't miss out on savings!</p>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'limited-time-deals',
    subject: 'Hurry! Limited-Time Deals Live',
    title: 'Limited-Time Deals',
    subtitle: 'Hurry!',
    emoji: '⚡',
    color: '#f59e0b',
    content: 'These exclusive deals won\'t last long. Shop now before they\'re gone!',
    cta: 'Shop Now',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">⚡</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Hurry! Limited-Time Deals</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Shop Before They're Gone</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #f59e0b; margin-bottom: 24px;">
            <p style="font-size: 16px; line-height: 1.7; color: #1f2937; margin: 0; font-weight: 500;">
              ⏱️ These exclusive deals <strong>won't last long</strong>. Shop now before they're gone!
            </p>
          </div>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 32px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; padding: 16px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 8px 20px rgba(245, 158, 11, 0.4); border: 2px solid #f59e0b; letter-spacing: 0.5px; transition: all 0.3s ease;">
              ⚡ SHOP NOW - LIMITED TIME ⚡
            </a>
            <p style="font-size: 12px; color: #6b7280; margin-top: 12px;">Offer ends in 24 hours • Grab yours before stock runs out!</p>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'trending-now',
    subject: 'Trending Now on Store1920 🔥',
    title: 'Trending Now',
    subtitle: 'on Store1920',
    emoji: '🔥',
    color: '#ec4899',
    content: 'See what everyone\'s buying! These hot products are flying off the shelves.',
    cta: 'See Trending',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">🔥</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Trending Now</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">on Store1920</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            See what everyone's buying! These hot products are flying off the shelves.
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #ec4899; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(236, 72, 153, 0.3);">
              See Trending
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'wishlist-cheaper',
    subject: 'Your Wishlist Just Got Cheaper',
    title: 'Your Wishlist',
    subtitle: 'Just Got Cheaper',
    emoji: '💝',
    color: '#f43f5e',
    content: 'Great news! Products you love are now at better prices. Time to treat yourself!',
    cta: 'Check Wishlist',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">💝</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Your Wishlist Just Got Cheaper</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Time to Treat Yourself!</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Great news! Products you love are now at better prices. Time to treat yourself!
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #f43f5e; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(244, 63, 94, 0.3);">
              Check Wishlist
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'selling-fast',
    subject: 'Selling Fast! Grab It Before It\'s Gone',
    title: 'Selling Fast!',
    subtitle: 'Grab It Before It\'s Gone',
    emoji: '⚠️',
    color: '#dc2626',
    content: 'Limited stock alert! These popular items are selling out quickly.',
    cta: 'Shop Now',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">⚠️</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Selling Fast!</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Grab It Before It's Gone</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Limited stock alert! These popular items are selling out quickly.
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #dc2626; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.3);">
              Shop Now
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'best-finds',
    subject: 'Today\'s Best Finds Are Waiting',
    title: 'Today\'s Best Finds',
    subtitle: 'Are Waiting',
    emoji: '✨',
    color: '#06b6d4',
    content: 'Discover today\'s handpicked selection of amazing products just for you!',
    cta: 'Discover Now',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">✨</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Today's Best Finds</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Are Waiting</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Discover today's handpicked selection of amazing products just for you!
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #06b6d4; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(6, 182, 212, 0.3);">
              Discover Now
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'flash-deals',
    subject: 'Flash Deals Ending Soon ⏰',
    title: 'Flash Deals',
    subtitle: 'Ending Soon',
    emoji: '⏰',
    color: '#ea580c',
    content: 'Time is running out! Grab these incredible flash deals before they expire.',
    cta: 'Grab Deals',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">⏰</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Flash Deals Ending Soon</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Time is Running Out!</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Time is running out! Grab these incredible flash deals before they expire.
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(234, 88, 12, 0.3);">
              Grab Deals
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'smart-buys',
    subject: 'Smart Buys at Better Prices',
    title: 'Smart Buys',
    subtitle: 'at Better Prices',
    emoji: '🧠',
    color: '#3b82f6',
    content: 'Shop smart, save more! Quality products at unbeatable prices.',
    cta: 'Shop Smart',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">🧠</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Smart Buys at Better Prices</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Shop Smart, Save More</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Shop smart, save more! Quality products at unbeatable prices.
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #3b82f6; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
              Shop Smart
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'popular-products',
    subject: 'Popular Products, Better Value',
    title: 'Popular Products',
    subtitle: 'Better Value',
    emoji: '⭐',
    color: '#10b981',
    content: 'Everyone loves these products - and for good reason! Get the best value today.',
    cta: 'View Popular',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">⭐</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Popular Products, Better Value</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Everyone Loves These!</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Everyone loves these products - and for good reason! Get the best value today.
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #10b981; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
              View Popular
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'last-chance',
    subject: 'Last Chance to Save on Top Picks',
    title: 'Last Chance',
    subtitle: 'to Save on Top Picks',
    emoji: '🎯',
    color: '#7c3aed',
    content: 'Final opportunity to snag these bestsellers at amazing prices!',
    cta: 'Save Now',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">🎯</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Last Chance to Save</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">on Top Picks</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Final opportunity to snag these bestsellers at amazing prices!
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #7c3aed; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(124, 58, 237, 0.3);">
              Save Now
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'daily-essentials',
    subject: 'Prices Slashed on Daily Essentials',
    title: 'Prices Slashed',
    subtitle: 'on Daily Essentials',
    emoji: '🛒',
    color: '#0d9488',
    content: 'Stock up on everyday essentials at incredible prices. Your wallet will thank you!',
    cta: 'Shop Essentials',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">🛒</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Prices Slashed</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">on Daily Essentials</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Stock up on everyday essentials at incredible prices. Your wallet will thank you!
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #0d9488; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.3);">
              Shop Essentials
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'dont-wait',
    subject: 'Don\'t Wait – Deals Won\'t Last',
    title: 'Don\'t Wait',
    subtitle: 'Deals Won\'t Last',
    emoji: '⚡',
    color: '#f97316',
    content: 'Act now! These amazing deals are disappearing fast.',
    cta: 'Shop Now',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">⚡</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Don't Wait – Deals Won't Last</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Act Now!</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Act now! These amazing deals are disappearing fast.
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #f97316; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(249, 115, 22, 0.3);">
              Shop Now
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'more-value',
    subject: 'More Value. Less Waiting. Shop Now',
    title: 'More Value. Less Waiting.',
    subtitle: 'Shop Now',
    emoji: '🚀',
    color: '#8b5cf6',
    content: 'Fast delivery, great prices, amazing products. What more could you want?',
    cta: 'Start Shopping',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">🚀</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">More Value. Less Waiting.</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Shop Now</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Fast delivery, great prices, amazing products. What more could you want?
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #8b5cf6; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3);">
              Start Shopping
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'new-deals',
    subject: 'New Deals Just Dropped 🚀',
    title: 'New Deals',
    subtitle: 'Just Dropped',
    emoji: '🚀',
    color: '#14b8a6',
    content: 'Fresh deals just arrived! Be the first to discover them.',
    cta: 'Explore Deals',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">🚀</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">New Deals Just Dropped</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Be the First to Discover</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Fresh deals just arrived! Be the first to discover them.
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #14b8a6; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(20, 184, 166, 0.3);">
              Explore Deals
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'shop-smart',
    subject: 'Why Pay More? Shop Smart Today',
    title: 'Why Pay More?',
    subtitle: 'Shop Smart Today',
    emoji: '💡',
    color: '#eab308',
    content: 'Smart shoppers choose Store1920. Get more for less!',
    cta: 'Shop Smart',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">💡</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Why Pay More?</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Shop Smart Today</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Smart shoppers choose Store1920. Get more for less!
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #eab308; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(234, 179, 8, 0.3);">
              Shop Smart
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'almost-sold-out',
    subject: 'Almost Sold Out – Act Fast',
    title: 'Almost Sold Out',
    subtitle: 'Act Fast',
    emoji: '⏳',
    color: '#dc2626',
    content: 'Stock running low! Don\'t miss out on these popular items.',
    cta: 'Shop Now',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">⏳</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Almost Sold Out</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Act Fast</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Stock running low! Don't miss out on these popular items.
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #dc2626; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.3);">
              Shop Now
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'smart-buy',
    subject: 'Your Next Smart Buy Is Here',
    title: 'Your Next Smart Buy',
    subtitle: 'Is Here',
    emoji: '🎁',
    color: '#6366f1',
    content: 'Discover products picked just for you at unbeatable prices!',
    cta: 'See Products',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">🎁</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Your Next Smart Buy Is Here</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Picked Just for You</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Discover products picked just for you at unbeatable prices!
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #6366f1; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);">
              See Products
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'limited-stock',
    subject: 'Best Deals, Limited Stock',
    title: 'Best Deals',
    subtitle: 'Limited Stock',
    emoji: '📦',
    color: '#f59e0b',
    content: 'These deals won\'t be around for long. Grab them while you can!',
    cta: 'Shop Deals',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">📦</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Best Deals, Limited Stock</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Grab Them While You Can</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            These deals won't be around for long. Grab them while you can!
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #f59e0b; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);">
              Shop Deals
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  },
  {
    id: 'love-Store1920',
    subject: 'Store1920 Finds You\'ll Love ❤️',
    title: 'Store1920 Finds',
    subtitle: 'You\'ll Love',
    emoji: '❤️',
    color: '#f43f5e',
    content: 'Handpicked products we know you\'ll love. Start browsing!',
    cta: 'Browse Now',
    template: (products = [], recipientEmail = '') => `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 620px; width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%); padding: 40px 20px; text-align: center; color: #ffffff;">
          <h1 style="font-size: 42px; margin: 0 0 10px 0;">❤️</h1>
          <h2 style="margin: 0; font-size: 28px; font-weight: 700;">Store1920 Finds You'll Love</h2>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Handpicked Just for You</p>
        </div>
        <div style="padding: 40px 30px; background: #f9fafb;">
          <p style="font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 24px 0;">
            Handpicked products we know you'll love. Start browsing!
          </p>
          ${generateProductGrid(products)}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${SITE_URL()}" style="display: inline-block; background: #f43f5e; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(244, 63, 94, 0.3);">
              Browse Now
            </a>
          </div>
        </div>
        ${getFooter(recipientEmail)}
      </div>
    `
  }
];

// Helper function to generate product grid
function generateProductGrid(products = []) {
  if (!products || products.length === 0) {
    return `
      <div style="text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #ecf8ff 0%, #e0f2fe 100%); border-radius: 16px; margin: 20px 0; border: 2px dashed #0891b2;">
        <p style="color: #0e7490; font-size: 15px; font-weight: 700; margin: 0; letter-spacing: 0.3px;">🏪 VISIT OUR STORE TO DISCOVER AMAZING DEALS!</p>
      </div>
    `;
  }

  const currency = 'AED';
  const baseUrl = SITE_URL();
  
  return `
    <div style="margin: 28px 0;">
      <!-- Carousel Slider Container -->
      <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 24px 16px; border-radius: 18px; border: 2px solid #0ea5e9; overflow: hidden;">
        
        <!-- Carousel Wrapper -->
        <div style="display: flex; gap: 16px; overflow-x: auto; padding-bottom: 12px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch;">
          ${products.slice(0, 4).map((product, index) => {
            const hasImage = product.image && (product.image.startsWith('http') || product.image.includes('/'));
            const imageUrl = hasImage ? product.image : 'https://via.placeholder.com/200?text=Product';
            const salePrice = product.price || 0;
            const originalPrice = product.originalPrice || 0;
            const discountPercent = originalPrice && salePrice < originalPrice 
              ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
              : null;
            const savingAmount = originalPrice && salePrice ? Math.floor(originalPrice - salePrice) : 0;
            
            // Generate product URL using slug or ID
            const productUrl = getProductAbsoluteUrl(product, baseUrl);
            
            return `
              <!-- Carousel Slide Card -->
              <div style="flex: 0 0 calc(50% - 8px); min-width: 200px; background: white; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 28px rgba(8, 145, 178, 0.15); border: 2px solid #cffafe; transition: all 0.3s ease;">
                <!-- Product Image -->
                <div style="position: relative; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); overflow: hidden; height: 180px;">
                  <img src="${imageUrl}" alt="${product.name || 'Product'}" style="width: 100%; height: 100%; object-fit: cover; display: block;"/>
                  
                  <!-- Badge - Slide Style -->
                  ${index === 0 ? `
                    <div style="position: absolute; top: 10px; left: 10px; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #78350f; padding: 6px 12px; border-radius: 20px; font-size: 10px; font-weight: 900; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5); letter-spacing: 0.5px;">⭐ FEATURED</div>
                  ` : ''}
                  
                  <!-- Discount Badge -->
                  ${discountPercent ? `
                    <div style="position: absolute; top: 10px; right: 10px; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: white; padding: 8px 10px; border-radius: 10px; font-size: 11px; font-weight: 800; box-shadow: 0 6px 16px rgba(255, 107, 107, 0.5); text-align: center;">
                      <div style="font-size: 9px; line-height: 1.1;">SAVE</div>
                      <div style="font-size: 14px; font-weight: 900;">${discountPercent}%</div>
                    </div>
                  ` : ''}
                </div>
                
                <!-- Card Content -->
                <div style="padding: 16px;">
                  <!-- Product Name -->
                  <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 800; color: #0c4a6e; line-height: 1.3; min-height: 32px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${product.name || 'Product'}</h3>
                  
                  <!-- Price Box - Teal Style -->
                  <div style="background: linear-gradient(135deg, #ecf8ff 0%, #e0f2fe 100%); padding: 10px; border-radius: 10px; margin-bottom: 12px; border: 1px solid #bae6fd;">
                    <div style="display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px;">
                      <span style="font-size: 22px; font-weight: 900; color: #0e7490; letter-spacing: -0.5px;">${currency}${Math.floor(salePrice)}</span>
                      ${originalPrice && originalPrice > salePrice ? `
                        <span style="font-size: 11px; color: #94a3b8; text-decoration: line-through; font-weight: 700;">
                          ${currency}${Math.floor(originalPrice)}
                        </span>
                      ` : ''}
                    </div>
                    ${savingAmount > 0 ? `
                      <div style="font-size: 11px; color: #0891b2; font-weight: 800;">💰 Save ${currency}${savingAmount}</div>
                    ` : ''}
                  </div>
                  
                  <!-- CTA Button - Teal Gradient -->
                  <a href="${productUrl}" style="display: block; background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%); color: white; padding: 11px 14px; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 800; text-align: center; box-shadow: 0 6px 16px rgba(8, 145, 178, 0.4); border: 2px solid #0891b2; letter-spacing: 0.4px; text-transform: uppercase;">
                    ✓ BUY NOW
                  </a>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        <!-- Carousel Indicator Dots -->
        <div style="text-align: center; padding-top: 8px; display: flex; justify-content: center; gap: 6px;">
          ${products.slice(0, 4).map((_, i) => `
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${i === 0 ? '#0891b2' : '#e0f2fe'}; display: inline-block; transition: all 0.3s ease;"></span>
          `).join('')}
        </div>
      </div>
      
      <!-- Browse All CTA - Teal Theme -->
      <div style="text-align: center; margin-top: 24px; padding: 26px 24px; background: linear-gradient(135deg, #164e63 0%, #0c2d3d 100%); border-radius: 14px; border: 1px solid #155e75; box-shadow: 0 8px 20px rgba(8, 145, 178, 0.2);">
        <p style="color: #e0f2fe; font-size: 14px; margin: 0 0 14px 0; font-weight: 700; letter-spacing: 0.5px;">🎁 EXPLORE MORE DEALS</p>
        <a href="${baseUrl}/products" style="display: inline-block; background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 10px; font-weight: 800; font-size: 13px; box-shadow: 0 8px 20px rgba(8, 145, 178, 0.5); border: 2px solid #0891b2; letter-spacing: 0.5px; text-transform: uppercase; transition: all 0.3s ease;">
          🛒 VIEW ALL PRODUCTS ✨
        </a>
      </div>
    </div>
  `;
}

// Footer component
function getFooter(recipientEmail = '') {
  const baseUrl = SITE_URL();
  const unsubscribeUrl = recipientEmail 
    ? `${baseUrl}/unsubscribe?unsubscribe=promotional&email=${encodeURIComponent(recipientEmail)}`
    : `${baseUrl}/unsubscribe?unsubscribe=promotional`;
  
  return `
    <div style="background: linear-gradient(180deg, #0f172a 0%, #1a202c 100%); padding: 40px 30px; text-align: center; color: #cbd5e1;">
      <div style="margin-bottom: 20px;">
        ${emailLogoImg('max-width:160px;height:auto;display:inline-block;margin-bottom:12px;')}
        <p style="margin: 8px 0 0 0; font-size: 13px; color: #94a3b8; font-weight: 500;">🛍️ Smart Shopping, Smart Savings 🛍️</p>
      </div>
      
      <div style="margin: 20px 0; padding: 16px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border-left: 4px solid #10b981;">
        <p style="margin: 0; font-size: 12px; color: #cbd5e1; line-height: 1.6;">
          💡 <strong>PRO TIP:</strong> Check your <strong>Manage Preferences</strong> to get personalized deals based on your interests!
        </p>
      </div>
      
      <p style="margin: 16px 0 8px 0; font-size: 13px; color: #94a3b8;">© ${new Date().getFullYear()} Store1920. All rights reserved. 🔐</p>
      <p style="margin: 0 0 12px 0; font-size: 13px; color: #94a3b8;">
        Questions? Email <a href="mailto:${STORE1920_SUPPORT_EMAIL}" style="color: #cbd5e1; text-decoration: underline; font-weight: 600;">${STORE1920_SUPPORT_EMAIL}</a>
      </p>
      <p style="margin: 0 0 16px 0; font-size: 12px;">
        <a href="${baseUrl}/help" style="color: #cbd5e1; text-decoration: none; font-weight: 600;">📞 Help Center</a> &nbsp;&nbsp;|&nbsp;&nbsp; 
        <a href="${baseUrl}/about-us" style="color: #cbd5e1; text-decoration: none; font-weight: 600;">ℹ️ About Us</a> &nbsp;&nbsp;|&nbsp;&nbsp; 
        <a href="${baseUrl}/profile/settings" style="color: #cbd5e1; text-decoration: none; font-weight: 600;">⚙️ Preferences</a>
      </p>
      
      <div style="border-top: 1px solid #334155; padding-top: 12px; margin-top: 12px;">
        <p style="margin: 0 0 8px 0; font-size: 11px; color: #64748b;">You received this email because you have an account with Store1920.</p>
        <a href="${unsubscribeUrl}" style="color: #10b981; text-decoration: underline; font-weight: 600; font-size: 11px;">🚫 Unsubscribe from promotional emails</a>
      </div>
    </div>
  `;
}

// Get a random template
export function getRandomTemplate() {
  const randomIndex = Math.floor(Math.random() * promotionalTemplates.length);
  return promotionalTemplates[randomIndex];
}

// Get template by ID
export function getTemplateById(id) {
  return promotionalTemplates.find(template => template.id === id);
}

// Get all template IDs
export function getAllTemplateIds() {
  return promotionalTemplates.map(t => t.id);
}
