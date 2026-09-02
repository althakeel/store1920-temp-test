import { createBlockId, createDefaultBlock, cloneBlocks } from '@/lib/emailCampaignBuilder';
import { EMAIL_STOCK_IMAGES } from '@/lib/emailTemplateStockImages';
import { getCustomerSiteUrl } from '@/lib/appUrl';
import { resolveGalleryUiStyle } from '@/lib/emailGalleryCardStyles';

function blocks(list) {
  return list.map((partial) => {
    const base = createDefaultBlock(partial.type);
    return { ...base, ...partial, id: createBlockId(), type: partial.type };
  });
}

/** Product card look should match the template name / category — not the same classic slider everywhere. */
function resolveProductTheme({ id = '', name = '', category = '', color = '#0f766e', cta = 'Shop now' } = {}) {
  const key = `${id} ${name} ${category}`.toLowerCase();
  const accent = color || '#0f766e';

  if (key.includes('flash') || key.includes('clearance') || key.includes('weekend') || key.includes('sale')) {
    return {
      cardStyle: 'bold',
      ctaLabel: cta || 'Shop the sale',
      ctaStyle: 'filled',
      buttonColor: accent,
      showBadge: true,
      badgeText: 'SALE',
      showDiscountPercent: true,
      showOriginalPrice: true,
      showDescription: false,
    };
  }
  if (key.includes('lookbook') || key.includes('pairing') || key.includes('editorial') || key.includes('newsletter') || key.includes('monthly') || key.includes('weekly')) {
    return {
      cardStyle: 'magazine',
      ctaLabel: cta || 'Explore',
      ctaStyle: 'text',
      buttonColor: accent,
      showBadge: false,
      showDescription: true,
      showDiscountPercent: false,
    };
  }
  if (key.includes('invite') || key.includes('party') || key.includes('workshop') || key.includes('open house')) {
    return {
      cardStyle: 'soft',
      ctaLabel: cta || 'Preview',
      ctaStyle: 'outline',
      buttonColor: accent,
      showBadge: true,
      badgeText: 'EVENT',
      showDescription: false,
    };
  }
  if (key.includes('welcome') || key.includes('brand story')) {
    return {
      cardStyle: 'soft',
      ctaLabel: cta || 'Start shopping',
      ctaStyle: 'filled',
      buttonColor: accent,
      showBadge: true,
      badgeText: 'WELCOME',
      showDescription: false,
    };
  }
  if (key.includes('vip') || key.includes('sms')) {
    return {
      cardStyle: 'ticket',
      ctaLabel: cta || 'View pick',
      ctaStyle: 'filled',
      buttonColor: accent,
      showBadge: true,
      badgeText: 'VIP',
      showDiscountPercent: true,
    };
  }
  if (key.includes('thank') || key.includes('review') || key.includes('social proof')) {
    return {
      cardStyle: 'outline',
      ctaLabel: cta || 'Shop favourites',
      ctaStyle: 'outline',
      buttonColor: accent,
      showBadge: true,
      badgeText: 'TOP RATED',
      showDescription: true,
    };
  }
  if (key.includes('order again') || key.includes('miss you') || key.includes('post-purchase') || key.includes('transactional')) {
    return {
      cardStyle: 'compact',
      ctaLabel: cta || 'Order again',
      ctaStyle: 'filled',
      buttonColor: accent,
      showBadge: false,
      showDescription: false,
    };
  }
  if (key.includes('restock') || key.includes('back in stock')) {
    return {
      cardStyle: 'bold',
      ctaLabel: cta || 'Grab it',
      ctaStyle: 'filled',
      buttonColor: accent,
      showBadge: true,
      badgeText: 'BACK',
      showDiscountPercent: false,
    };
  }
  if (key.includes('bundle') || key.includes('subscription')) {
    return {
      cardStyle: 'ticket',
      ctaLabel: cta || 'Bundle & save',
      ctaStyle: 'filled',
      buttonColor: accent,
      showBadge: true,
      badgeText: 'BUNDLE',
      showDiscountPercent: true,
      showOriginalPrice: true,
    };
  }
  if (key.includes('drop') || key.includes('launch') || key.includes('spotlight') || key.includes('seasonal')) {
    return {
      cardStyle: 'overlay',
      ctaLabel: cta || 'Shop now',
      ctaStyle: 'filled',
      buttonColor: accent,
      showBadge: true,
      badgeText: 'NEW',
      showDescription: false,
    };
  }
  if (key.includes('styling') || key.includes('concierge') || key.includes('before') || key.includes('service')) {
    return {
      cardStyle: 'split',
      ctaLabel: cta || 'Book / shop',
      ctaStyle: 'outline',
      buttonColor: accent,
      showBadge: false,
      showDescription: true,
    };
  }
  if (key.includes('uae') || key.includes('cross-category') || key.includes('merchandising')) {
    return {
      cardStyle: 'classic',
      ctaLabel: cta || 'Shop now',
      ctaStyle: 'filled',
      buttonColor: accent,
      showBadge: true,
      badgeText: key.includes('uae') ? 'UAE' : 'PICK',
    };
  }
  if (key.includes('announce')) {
    return {
      cardStyle: 'bold',
      ctaLabel: cta || 'Shop now',
      ctaStyle: 'filled',
      buttonColor: accent,
      showBadge: true,
      badgeText: 'HOT',
      showDiscountPercent: true,
    };
  }

  return {
    cardStyle: 'classic',
    ctaLabel: cta || 'Shop now',
    ctaStyle: 'filled',
    buttonColor: accent,
    showBadge: false,
  };
}

/** Overall email structure — not just colors. Each template family gets a different block order. */
function resolveStructureStyle({ id = '', name = '', category = '' } = {}) {
  const key = `${id} ${name} ${category}`.toLowerCase();
  if (key.includes('sms') || key.includes('grow sms')) return 'sms';
  if (key.includes('invite') || key.includes('party') || key.includes('workshop') || key.includes('open house')) return 'invite';
  if (key.includes('welcome') || key.includes('brand story')) return 'welcome';
  if (key.includes('lookbook') || key.includes('pairing') || key.includes('newsletter') || key.includes('monthly') || key.includes('weekly')) {
    return 'editorial';
  }
  if (key.includes('flash') || key.includes('clearance') || key.includes('weekend') || key.includes('sale') || key.includes('announce')) {
    return 'sale';
  }
  if (key.includes('thank') || key.includes('review') || key.includes('social proof')) return 'thanks';
  if (key.includes('order again') || key.includes('miss you') || key.includes('post-purchase') || key.includes('transactional')) {
    return 'txn';
  }
  if (key.includes('drop') || key.includes('launch') || key.includes('spotlight') || key.includes('bundle') || key.includes('subscription') || key.includes('sell products')) {
    return 'product';
  }
  if (key.includes('styling') || key.includes('concierge') || key.includes('before') || key.includes('service')) return 'service';
  return 'default';
}

function mapProductType(productLayout) {
  if (productLayout === 'grid') return 'products';
  if (productLayout === 'latest') return 'product_latest';
  if (productLayout === 'related') return 'product_related';
  return 'product_carousel';
}

function mapSecondaryType(secondaryLayout) {
  if (secondaryLayout === 'grid') return 'products';
  if (secondaryLayout === 'latest') return 'product_latest';
  if (secondaryLayout === 'related') return 'product_related';
  if (secondaryLayout === 'carousel') return 'product_carousel';
  return null;
}

function richLayout(layout = {}, meta = {}) {
  const {
    emoji = '',
    title,
    subtitle,
    color,
    colorEnd,
    badge,
    body,
    cta,
    heroImage = '',
    productLayout = 'carousel',
    productHeading = 'Shop the edit',
    productSource = 'featured',
    secondaryLayout = null,
    secondaryHeading = '',
    secondarySource = 'latest',
    includeProducts = true,
    productTheme = null,
    headerTagline = 'Store1920',
  } = layout;

  const site = getCustomerSiteUrl() || 'https://store1920.com';
  const structure = layout.structureStyle || resolveStructureStyle(meta);
  const theme = productTheme || {
    cardStyle: 'classic',
    ctaLabel: cta || 'Shop now',
    buttonColor: color || '#0f766e',
  };
  const productType = mapProductType(productLayout);
  const secondaryType = mapSecondaryType(secondaryLayout);

  const productExtras = {
    heading: productHeading,
    productSource,
    limit: 4,
    showPrice: true,
    showCta: true,
    cardStyle: theme.cardStyle || 'classic',
    ctaLabel: theme.ctaLabel || cta || 'Shop now',
    ctaStyle: theme.ctaStyle || 'filled',
    buttonColor: theme.buttonColor || color || '#0f766e',
    showBadge: theme.showBadge ?? (productType === 'product_latest'),
    badgeText: theme.badgeText || (productType === 'product_latest' ? 'NEW' : 'SALE'),
    showDiscountPercent: Boolean(theme.showDiscountPercent),
    showOriginalPrice: theme.showOriginalPrice !== false,
    showDescription: Boolean(theme.showDescription),
  };

  const secondaryExtras = {
    ...productExtras,
    heading: secondaryHeading || 'More to explore',
    productSource: secondarySource,
    showBadge: theme.showBadge ?? (secondaryType === 'product_latest'),
  };

  const headerBase = {
    type: 'header',
    tagline: headerTagline,
    showNav: true,
    navActiveColor: color || '#0f766e',
  };

  const hero = {
    type: 'hero',
    emoji,
    title,
    subtitle,
    color,
    colorEnd: colorEnd || color,
    imageUrl: heroImage || '',
    overlay: true,
  };

  const ctaButton = {
    type: 'button',
    label: cta,
    url: site,
    color,
  };

  const productBlocks = includeProducts
    ? [
      { type: productType, ...productExtras },
      ...(secondaryType ? [{ type: secondaryType, ...secondaryExtras }] : []),
    ]
    : [];

  let list = [];

  if (structure === 'sms') {
    // Signup-first: form is the star, products are secondary proof
    list = [
      { ...headerBase, logoPosition: 'left', navLayout: 'beside', navStyle: 'plain', showTagline: false },
      {
        type: 'hero',
        emoji: emoji || '📱',
        title,
        subtitle,
        color: color || '#0f766e',
        colorEnd: colorEnd || '#042f2e',
        imageUrl: '',
        overlay: false,
      },
      {
        type: 'form',
        formStyle: 'sms',
        formType: 'sms',
        heading: title || 'Get deals by text',
        subheading: subtitle || 'Join our SMS / WhatsApp list',
        fields: ['phone', 'name'],
        buttonLabel: cta || 'Join SMS list',
        buttonColor: color || '#0d9488',
        backgroundColor: '#042f2e',
        successUrl: site,
      },
      { type: 'text', html: body, align: 'center' },
      ...(includeProducts ? [{
        type: 'product_carousel',
        ...productExtras,
        heading: productHeading || 'Why shoppers join',
        cardStyle: 'ticket',
        limit: 3,
      }] : []),
      ctaButton,
      { type: 'footer' },
    ];
  } else if (structure === 'sale') {
    // Urgency: badge + products first, story later
    list = [
      { ...headerBase, logoPosition: 'center', navLayout: 'below', navStyle: 'pills', showTagline: true },
      ...(badge ? [{ type: 'badge', text: badge, color }] : []),
      { ...hero, overlay: true },
      { type: 'text', html: body, align: 'center' },
      ...(includeProducts ? [{
        type: productType === 'product_carousel' ? 'product_carousel' : productType,
        ...productExtras,
        cardStyle: 'bold',
        showBadge: true,
        badgeText: 'SALE',
        showDiscountPercent: true,
      }] : []),
      ctaButton,
      ...(includeProducts && secondaryType ? [{ type: secondaryType, ...secondaryExtras, cardStyle: 'compact' }] : []),
      { type: 'divider', color: '#fecaca' },
      { type: 'footer' },
    ];
  } else if (structure === 'editorial') {
    // Magazine newsletter: two-column story, then lookbook grid
    list = [
      { ...headerBase, logoPosition: 'left', navLayout: 'beside', navStyle: 'underline', showTagline: false },
      { ...hero, overlay: true },
      {
        type: 'two_column',
        leftTitle: title || 'This edition',
        leftHtml: body,
        leftImage: '',
        rightTitle: subtitle || 'Editor note',
        rightHtml: 'Scroll for curated picks, pairings, and what’s worth adding to your cart this week.',
        rightImage: heroImage || '',
        backgroundColor: '#f8fafc',
      },
      ...(badge ? [{ type: 'badge', text: badge, color }] : []),
      ...(includeProducts ? [{
        type: 'products',
        ...productExtras,
        heading: productHeading || 'Editor picks',
        cardStyle: 'magazine',
        ctaStyle: 'text',
        gridColumns: 2,
        showDescription: true,
        showBadge: false,
      }] : []),
      ...(includeProducts && secondaryType ? [{
        type: secondaryType,
        ...secondaryExtras,
        cardStyle: 'minimal',
      }] : []),
      {
        type: 'social',
        heading: 'Follow the look',
        align: 'center',
      },
      ctaButton,
      { type: 'footer' },
    ];
  } else if (structure === 'invite') {
    list = [
      { ...headerBase, logoPosition: 'center', showNav: false, showTagline: true, tagline: 'You are invited' },
      { ...hero, imageUrl: heroImage || '', overlay: true },
      { type: 'text', html: body, align: 'center' },
      {
        type: 'form',
        formStyle: 'rsvp',
        formType: 'rsvp',
        heading: 'RSVP',
        subheading: subtitle || 'Reserve your seat',
        fields: ['name', 'email'],
        buttonLabel: cta || 'RSVP now',
        buttonColor: color || '#7c3aed',
        backgroundColor: '#0f172a',
        successUrl: site,
      },
      ...(includeProducts ? [{
        type: 'product_carousel',
        ...productExtras,
        heading: productHeading || 'Preview the collection',
        cardStyle: 'soft',
        limit: 3,
      }] : []),
      { type: 'footer' },
    ];
  } else if (structure === 'welcome') {
    list = [
      { ...headerBase, logoPosition: 'center', navStyle: 'plain', showTagline: true },
      {
        type: 'hero',
        emoji: emoji || '👋',
        title,
        subtitle,
        color: color || '#059669',
        colorEnd: colorEnd || '#0f766e',
        imageUrl: heroImage || '',
        overlay: true,
      },
      ...(badge ? [{ type: 'badge', text: badge, color }] : []),
      {
        type: 'form',
        formStyle: 'discount',
        formType: 'discount',
        heading: 'Unlock your welcome offer',
        subheading: body,
        fields: ['email'],
        buttonLabel: cta || 'Get my code',
        buttonColor: color || '#dc2626',
        backgroundColor: '#ecfdf5',
        successUrl: site,
      },
      ...(includeProducts ? [{
        type: 'products',
        ...productExtras,
        cardStyle: 'soft',
        gridColumns: 2,
        heading: productHeading || 'Start here',
      }] : []),
      ctaButton,
      { type: 'footer' },
    ];
  } else if (structure === 'product') {
    // Merchandising: products dominate immediately after a slim header
    list = [
      { ...headerBase, logoPosition: 'left', navLayout: 'beside', navStyle: 'buttons', showTagline: false },
      ...(badge ? [{ type: 'badge', text: badge, color }] : []),
      { type: 'text', html: `<strong>${title || ''}</strong> — ${body}`, align: 'left' },
      ...(includeProducts ? [{
        type: productType,
        ...productExtras,
        cardStyle: theme.cardStyle || 'overlay',
        heading: productHeading || title,
      }] : []),
      { ...hero, title: subtitle || title, subtitle: '' },
      ...(includeProducts && secondaryType ? [{ type: secondaryType, ...secondaryExtras }] : []),
      ctaButton,
      { type: 'footer' },
    ];
  } else if (structure === 'thanks') {
    list = [
      { ...headerBase, logoPosition: 'center', showNav: false, showTagline: true },
      {
        type: 'hero',
        emoji: emoji || '🙏',
        title,
        subtitle,
        color: color || '#059669',
        colorEnd: colorEnd || '#0f766e',
        imageUrl: '',
        overlay: false,
      },
      { type: 'text', html: body, align: 'center' },
      ...(includeProducts ? [{
        type: 'products',
        ...productExtras,
        cardStyle: 'outline',
        gridColumns: 2,
        showDescription: true,
      }] : []),
      ctaButton,
      { type: 'social', heading: 'Stay connected' },
      { type: 'footer' },
    ];
  } else if (structure === 'txn') {
    list = [
      { ...headerBase, logoPosition: 'left', navLayout: 'top', navStyle: 'plain', showTagline: false },
      { type: 'badge', text: badge || 'FOR YOU', color: color || '#0f766e' },
      { type: 'text', html: `<strong>${title}</strong><br/>${body}`, align: 'left' },
      ...(includeProducts ? [{
        type: productType,
        ...productExtras,
        cardStyle: 'compact',
        heading: productHeading,
      }] : []),
      ctaButton,
      ...(includeProducts && secondaryType ? [{ type: secondaryType, ...secondaryExtras, cardStyle: 'minimal' }] : []),
      { type: 'footer' },
    ];
  } else if (structure === 'service') {
    list = [
      { ...headerBase, logoPosition: 'left', navStyle: 'underline' },
      { ...hero },
      {
        type: 'two_column',
        leftTitle: 'What you get',
        leftHtml: body,
        rightTitle: 'Next step',
        rightHtml: subtitle || 'Book a session and shop recommended pieces.',
        backgroundColor: '#eef2ff',
      },
      {
        type: 'form',
        formStyle: 'outline',
        formType: 'contact',
        heading: 'Book / enquire',
        subheading: 'Tell us how we can help.',
        fields: ['name', 'email', 'phone'],
        buttonLabel: cta || 'Send request',
        buttonColor: color || '#4f46e5',
        backgroundColor: '#ffffff',
        successUrl: site,
      },
      ...(includeProducts ? [{
        type: 'products',
        ...productExtras,
        cardStyle: 'split',
        gridColumns: 1,
      }] : []),
      { type: 'footer' },
    ];
  } else {
    // default — still slightly varied from the old clone
    list = [
      { ...headerBase, navStyle: 'plain' },
      hero,
      ...(badge ? [{ type: 'badge', text: badge, color }] : []),
      { type: 'text', html: body, align: 'left' },
      ...productBlocks,
      ctaButton,
      { type: 'footer' },
    ];
  }

  return blocks(list);
}

function preset(id, meta, layout) {
  const productTheme = resolveProductTheme({
    id,
    name: meta.name,
    category: meta.category,
    color: layout.color,
    cta: layout.cta,
  });
  const structureStyle = resolveStructureStyle({ id, name: meta.name, category: meta.category });
  return {
    id,
    ...meta,
    uiStyle: meta.uiStyle || resolveGalleryUiStyle({ id, name: meta.name, category: meta.category }),
    structureStyle,
    thumbnailImage: meta.thumbnailImage || layout.heroImage || '',
    blocks: richLayout({
      ...layout,
      productTheme,
      structureStyle,
      headerTagline: meta.name || 'Store1920',
    }, { id, name: meta.name, category: meta.category }),
  };
}

/** Category chips shown in the gallery (Mailchimp-style). */
export const EMAIL_CAMPAIGN_CATEGORIES = [
  'All',
  'Announce',
  'Grow SMS List',
  'Invite to event',
  'Newsletter',
  'Sell products',
  'Sell services',
  'Thank you',
  'Transactional',
  'Welcome',
  'Classic',
  'Blank',
];

export const EMAIL_CAMPAIGN_PRESETS = [
  // —— Announce ——
  preset('announce-flash-sale', {
    name: 'Flash sale',
    category: 'Announce',
    subject: 'Flash sale — up to 50% off ends tonight',
    description: 'Announce a limited-time flash sale',
    thumbnailColor: '#dc2626',
    thumbnailImage: EMAIL_STOCK_IMAGES.flashSale,
  }, {
    emoji: '⚡',
    title: 'Up to 50% Off',
    subtitle: 'FLASH SALE',
    color: '#111827',
    colorEnd: '#0f172a',
    badge: 'LIMITED TIME',
    body: 'For a limited time only, save big on wardrobe and lifestyle must-haves. Stock up before these styles are gone.',
    cta: 'SHOP THE SALE',
    heroImage: EMAIL_STOCK_IMAGES.flashSale,
    productLayout: 'grid',
    productHeading: 'Sale picks',
    secondaryLayout: 'carousel',
    secondaryHeading: 'More on sale',
    secondarySource: 'featured',
  }),
  preset('announce-new-drop', {
    name: 'New seasonal drop',
    category: 'Announce',
    subject: 'New seasonal drop just landed',
    description: 'Announce a new collection drop',
    thumbnailColor: '#e11d48',
    thumbnailImage: EMAIL_STOCK_IMAGES.drop,
  }, {
    emoji: '🆕',
    title: 'New seasonal drop',
    subtitle: 'Just landed',
    color: '#e11d48',
    heroImage: EMAIL_STOCK_IMAGES.drop,
    badge: 'NEW COLLECTION',
    body: 'The new seasonal collection is live. Shop early for the best selection.',
    cta: 'Shop the drop',
    productLayout: 'carousel',
    productHeading: 'Drop carousel',
    secondaryLayout: 'latest',
    secondaryHeading: 'Latest arrivals',
    secondarySource: 'latest',
  }),
  preset('announce-back-in-stock', {
    name: 'Back in stock',
    category: 'Announce',
    subject: 'Back in stock — grab it before it sells out again',
    description: 'Announce restocks',
    thumbnailColor: '#16a34a',
    thumbnailImage: EMAIL_STOCK_IMAGES.restock,
  }, {
    emoji: '🔔',
    title: 'Back in stock',
    subtitle: 'Your favourites returned',
    color: '#16a34a',
    heroImage: EMAIL_STOCK_IMAGES.restock,
    badge: 'RESTOCKED',
    body: 'Popular items are available again. Order soon — these tend not to last.',
    cta: 'Shop restocks',
    productLayout: 'grid',
    productHeading: 'Restocked now',
    secondaryLayout: 'related',
    secondaryHeading: 'Related picks',
    secondarySource: 'related',
  }),
  preset('announce-mega-weekend', {
    name: 'Mega weekend',
    category: 'Announce',
    subject: 'Mega weekend deals are live',
    description: 'Announce a weekend promotion',
    thumbnailColor: '#be123c',
    thumbnailImage: EMAIL_STOCK_IMAGES.weekend,
  }, {
    emoji: '🔥',
    title: 'Mega weekend',
    subtitle: 'Two days. Big savings.',
    color: '#be123c',
    heroImage: EMAIL_STOCK_IMAGES.weekend,
    badge: 'WEEKEND ONLY',
    body: 'Your weekend shopping list is ready — scroll the carousel then explore more finds.',
    cta: 'Shop weekend deals',
    productLayout: 'carousel',
    productHeading: 'Weekend carousel',
    secondaryLayout: 'grid',
    secondaryHeading: 'More weekend finds',
  }),

  // —— Grow SMS List ——
  preset('sms-join-list', {
    name: 'Join SMS list',
    category: 'Grow SMS List',
    subject: 'Get SMS deals — join our text list',
    description: 'Grow your SMS / WhatsApp list',
    thumbnailColor: '#0f766e',
    thumbnailImage: EMAIL_STOCK_IMAGES.club,
  }, {
    emoji: '📱',
    title: 'Get deals by text',
    subtitle: 'Join the Store1920 SMS list',
    color: '#0f766e',
    heroImage: EMAIL_STOCK_IMAGES.club,
    badge: 'EXCLUSIVE SMS OFFERS',
    body: 'Be first to flash sales and restocks. Opt in to SMS / WhatsApp updates and never miss a drop.',
    cta: 'Join SMS list',
    includeProducts: true,
    productLayout: 'carousel',
    productHeading: 'Why shoppers join',
  }),
  preset('sms-vip-alerts', {
    name: 'VIP SMS alerts',
    category: 'Grow SMS List',
    subject: 'VIP text alerts for early access',
    description: 'SMS list for VIP early access',
    thumbnailColor: '#854d0e',
    thumbnailImage: EMAIL_STOCK_IMAGES.vip,
  }, {
    emoji: '👑',
    title: 'VIP text alerts',
    subtitle: 'Early access before everyone else',
    color: '#854d0e',
    heroImage: EMAIL_STOCK_IMAGES.vip,
    badge: 'VIP SMS',
    body: 'Join VIP SMS for early access to launches, private sales, and member-only codes.',
    cta: 'Get VIP alerts',
    productLayout: 'latest',
    productHeading: 'Coming soon style picks',
    productSource: 'latest',
  }),

  // —— Invite to event ——
  preset('invite-launch-party', {
    name: 'Launch party invite',
    category: 'Invite to event',
    subject: 'You are invited — Store1920 launch night',
    description: 'Invite customers to a launch event',
    thumbnailColor: '#7c3aed',
    thumbnailImage: EMAIL_STOCK_IMAGES.brand,
  }, {
    emoji: '🎉',
    title: "Let's celebrate",
    subtitle: 'You are invited to our launch night',
    color: '#7c3aed',
    heroImage: EMAIL_STOCK_IMAGES.brand,
    badge: 'RSVP',
    body: 'Join us for an exclusive launch evening — preview new products, meet the team, and enjoy member perks.',
    cta: 'RSVP now',
    includeProducts: true,
    productLayout: 'carousel',
    productHeading: 'Preview the collection',
  }),
  preset('invite-workshop', {
    name: 'Workshop invite',
    category: 'Invite to event',
    subject: 'Invite: free styling workshop this weekend',
    description: 'Invite to a workshop or class',
    thumbnailColor: '#0369a1',
    thumbnailImage: EMAIL_STOCK_IMAGES.lookbook,
  }, {
    emoji: '✂️',
    title: 'Free styling workshop',
    subtitle: 'This weekend — seats are limited',
    color: '#0369a1',
    heroImage: EMAIL_STOCK_IMAGES.lookbook,
    badge: 'FREE EVENT',
    body: 'Learn how to style bestsellers and shop the looks live. Reserve your spot today.',
    cta: 'Reserve my seat',
    productLayout: 'related',
    productHeading: 'Workshop looks',
    productSource: 'related',
  }),
  preset('invite-open-house', {
    name: 'Open house',
    category: 'Invite to event',
    subject: 'Open house — visit us this weekend',
    description: 'Store open-house invite',
    thumbnailColor: '#0e7490',
    thumbnailImage: EMAIL_STOCK_IMAGES.dubai,
  }, {
    emoji: '🏠',
    title: 'Open house',
    subtitle: 'Visit us this weekend',
    color: '#0e7490',
    heroImage: EMAIL_STOCK_IMAGES.dubai,
    badge: 'THIS WEEKEND',
    body: 'Drop by for exclusive in-person offers, refreshments, and first look at new arrivals.',
    cta: 'Get directions',
    productLayout: 'latest',
    productHeading: 'In-store highlights',
    productSource: 'latest',
  }),

  // —— Newsletter ——
  preset('newsletter-weekly', {
    name: 'Weekly newsletter',
    category: 'Newsletter',
    subject: 'Your weekly Store1920 roundup',
    description: 'Weekly digest with carousel + latest',
    thumbnailColor: '#0369a1',
    thumbnailImage: EMAIL_STOCK_IMAGES.weekly,
  }, {
    emoji: '📰',
    title: 'This week at Store1920',
    subtitle: 'Deals, drops, and tips',
    color: '#0369a1',
    heroImage: EMAIL_STOCK_IMAGES.weekly,
    badge: 'WEEKLY',
    body: 'A short roundup of what is new, what is trending, and what is worth adding to your cart.',
    cta: 'Read & shop',
    productLayout: 'carousel',
    productHeading: 'This week’s carousel',
    secondaryLayout: 'latest',
    secondaryHeading: 'Latest drops',
    secondarySource: 'latest',
  }),
  preset('newsletter-monthly', {
    name: 'Monthly picks',
    category: 'Newsletter',
    subject: 'This month’s picks from Store1920',
    description: 'Monthly editor picks',
    thumbnailColor: '#0d9488',
    thumbnailImage: EMAIL_STOCK_IMAGES.monthly,
  }, {
    emoji: '🗓️',
    title: 'Monthly picks',
    subtitle: 'Hand-picked for this month',
    color: '#0d9488',
    heroImage: EMAIL_STOCK_IMAGES.monthly,
    badge: 'THIS MONTH',
    body: 'Our team shortlisted the best products of the month.',
    cta: 'See monthly picks',
    productLayout: 'latest',
    productHeading: 'This month’s arrivals',
    productSource: 'latest',
    secondaryLayout: 'related',
    secondaryHeading: 'Editor pairings',
    secondarySource: 'related',
  }),
  preset('newsletter-lookbook', {
    name: 'The lookbook',
    category: 'Newsletter',
    subject: 'The lookbook — style inspiration this week',
    description: 'Editorial newsletter',
    thumbnailColor: '#334155',
    thumbnailImage: EMAIL_STOCK_IMAGES.lookbook,
  }, {
    emoji: '📸',
    title: 'The lookbook',
    subtitle: 'Style inspiration this week',
    color: '#334155',
    heroImage: EMAIL_STOCK_IMAGES.lookbook,
    badge: 'EDITORIAL',
    body: 'Browse curated looks and shop the pieces that complete the vibe.',
    cta: 'Explore the lookbook',
    productLayout: 'carousel',
    productHeading: 'Lookbook carousel',
    secondaryLayout: 'related',
    secondaryHeading: 'Shop the look',
    secondarySource: 'related',
  }),
  preset('newsletter-pairing', {
    name: 'Pairing guide',
    category: 'Newsletter',
    subject: 'Pairing guide — what goes with what',
    description: 'Content newsletter with related products',
    thumbnailColor: '#78716c',
    thumbnailImage: EMAIL_STOCK_IMAGES.coffee,
  }, {
    emoji: '☕',
    title: 'Pairing guide',
    subtitle: 'What goes with what',
    color: '#78716c',
    heroImage: EMAIL_STOCK_IMAGES.coffee,
    body: 'Simple pairings to help you shop smarter — related products curated for this week’s theme.',
    cta: 'Shop pairings',
    productLayout: 'related',
    productHeading: 'Perfect pairs',
    productSource: 'related',
    secondaryLayout: 'carousel',
    secondaryHeading: 'Also trending',
  }),

  // —— Sell products ——
  preset('sell-product-spotlight', {
    name: 'Product spotlight',
    category: 'Sell products',
    subject: 'Product spotlight — this week’s must-have',
    description: 'Sell a hero product + related',
    thumbnailColor: '#2563eb',
    thumbnailImage: EMAIL_STOCK_IMAGES.spotlight,
  }, {
    emoji: '✨',
    title: 'Product spotlight',
    subtitle: 'This week’s must-have',
    color: '#2563eb',
    heroImage: EMAIL_STOCK_IMAGES.spotlight,
    badge: 'EDITOR’S PICK',
    body: 'One hero moment, then related products to complete the basket.',
    cta: 'View product',
    productLayout: 'grid',
    productHeading: 'In the spotlight',
    secondaryLayout: 'related',
    secondaryHeading: 'Goes well with',
    secondarySource: 'related',
  }),
  preset('sell-product-launch', {
    name: 'Product launch',
    category: 'Sell products',
    subject: 'Just launched — be first to shop the new drop',
    description: 'Sell a new product launch',
    thumbnailColor: '#db2777',
    thumbnailImage: EMAIL_STOCK_IMAGES.launch,
  }, {
    emoji: '🚀',
    title: 'Just launched',
    subtitle: 'Be first to the new drop',
    color: '#db2777',
    heroImage: EMAIL_STOCK_IMAGES.launch,
    badge: 'NEW ARRIVAL',
    body: 'Fresh stock just landed. Shop latest products before bestsellers sell out.',
    cta: 'Shop new arrivals',
    productLayout: 'latest',
    productHeading: 'New drop',
    productSource: 'latest',
    secondaryLayout: 'carousel',
    secondaryHeading: 'Launch carousel',
    secondarySource: 'latest',
  }),
  preset('sell-product-bundle', {
    name: 'Product bundle',
    category: 'Sell products',
    subject: 'Bundle & save — curated sets for less',
    description: 'Sell bundles with related products',
    thumbnailColor: '#7c3aed',
    thumbnailImage: EMAIL_STOCK_IMAGES.bundle,
  }, {
    emoji: '🎁',
    title: 'Bundle & save',
    subtitle: 'Curated sets for less',
    color: '#7c3aed',
    heroImage: EMAIL_STOCK_IMAGES.bundle,
    badge: 'BUNDLE DEAL',
    body: 'Pair complementary products and save more than buying separately.',
    cta: 'Shop bundles',
    productLayout: 'related',
    productHeading: 'Bundle together',
    productSource: 'related',
    secondaryLayout: 'grid',
    secondaryHeading: 'Add-on ideas',
  }),
  preset('sell-clearance', {
    name: 'Clearance sale',
    category: 'Sell products',
    subject: 'Clearance — last pieces at lowest prices',
    description: 'Sell clearance inventory',
    thumbnailColor: '#7c3aed',
    thumbnailImage: EMAIL_STOCK_IMAGES.clearance,
  }, {
    emoji: '🏷️',
    title: 'Clearance',
    subtitle: 'Last pieces, lowest prices',
    color: '#7c3aed',
    heroImage: EMAIL_STOCK_IMAGES.clearance,
    badge: 'FINAL MARKDOWNS',
    body: 'Clear the racks — limited sizes left. Once they are gone, they are gone.',
    cta: 'Shop clearance',
    productLayout: 'grid',
    productHeading: 'Markdowns',
  }),
  preset('sell-cross-category', {
    name: 'Cross-category merchandising',
    category: 'Sell products',
    subject: 'Complete the room — shop across categories',
    description: 'Cross-sell home & lifestyle',
    thumbnailColor: '#57534e',
    thumbnailImage: EMAIL_STOCK_IMAGES.sofa,
  }, {
    emoji: '🛋️',
    title: 'Complete the room',
    subtitle: 'Cross-category picks',
    color: '#57534e',
    heroImage: EMAIL_STOCK_IMAGES.sofa,
    body: 'Mix bestsellers across categories — furniture vibes, accents, and related add-ons.',
    cta: 'Shop the room',
    productLayout: 'carousel',
    productHeading: 'Featured carousel',
    secondaryLayout: 'related',
    secondaryHeading: 'Related across categories',
    secondarySource: 'related',
  }),
  preset('sell-subscription-box', {
    name: 'Subscription box',
    category: 'Sell products',
    subject: 'Subscribe & save — curated every month',
    description: 'Sell a subscription-style offer',
    thumbnailColor: '#15803d',
    thumbnailImage: EMAIL_STOCK_IMAGES.subscription,
  }, {
    emoji: '📦',
    title: 'Subscribe & save',
    subtitle: 'Curated for you every month',
    color: '#15803d',
    heroImage: EMAIL_STOCK_IMAGES.subscription,
    badge: 'SUBSCRIBE',
    body: 'Get a curated box of favourites delivered regularly — cancel anytime.',
    cta: 'Start subscription',
    productLayout: 'carousel',
    productHeading: 'Inside this month’s box',
  }),
  preset('sell-uae-exclusive', {
    name: 'UAE exclusive',
    category: 'Sell products',
    subject: 'UAE exclusive offers — delivered across the Emirates',
    description: 'Sell to UAE audience',
    thumbnailColor: '#0e7490',
    thumbnailImage: EMAIL_STOCK_IMAGES.uae,
    audienceHint: 'uae',
  }, {
    emoji: '🇦🇪',
    title: 'UAE exclusive',
    subtitle: 'Offers for shoppers across the Emirates',
    color: '#0e7490',
    heroImage: EMAIL_STOCK_IMAGES.uae,
    badge: 'UAE ONLY',
    body: 'Special deals for UAE customers — browse the carousel and latest local favourites.',
    cta: 'Shop UAE deals',
    productLayout: 'carousel',
    productHeading: 'UAE carousel',
    secondaryLayout: 'latest',
    secondaryHeading: 'Trending in UAE',
    secondarySource: 'latest',
  }),

  // —— Sell services ——
  preset('services-styling', {
    name: 'Personal styling',
    category: 'Sell services',
    subject: 'Book a personal styling session',
    description: 'Sell a styling / consult service',
    thumbnailColor: '#4f46e5',
    thumbnailImage: EMAIL_STOCK_IMAGES.mens,
  }, {
    emoji: '👔',
    title: 'Personal styling',
    subtitle: 'Book a 1:1 session',
    color: '#4f46e5',
    heroImage: EMAIL_STOCK_IMAGES.mens,
    badge: 'BOOK NOW',
    body: 'Get outfit recommendations tailored to you — then shop the pieces we recommend.',
    cta: 'Book styling',
    productLayout: 'related',
    productHeading: 'Popular styling picks',
    productSource: 'related',
  }),
  preset('services-gift-wrap', {
    name: 'Gift & concierge',
    category: 'Sell services',
    subject: 'Gift wrapping & concierge — make it effortless',
    description: 'Sell add-on services',
    thumbnailColor: '#be185d',
    thumbnailImage: EMAIL_STOCK_IMAGES.bundle,
  }, {
    emoji: '🎀',
    title: 'Gift & concierge',
    subtitle: 'Make gifting effortless',
    color: '#be185d',
    heroImage: EMAIL_STOCK_IMAGES.bundle,
    body: 'Add gift wrap, handwritten notes, or concierge help on your next order.',
    cta: 'Explore services',
    productLayout: 'carousel',
    productHeading: 'Giftable products',
  }),
  preset('services-before-after', {
    name: 'Before & after results',
    category: 'Sell services',
    subject: 'Real results — before & after',
    description: 'Service results story',
    thumbnailColor: '#db2777',
    thumbnailImage: EMAIL_STOCK_IMAGES.beforeAfter,
  }, {
    emoji: '✨',
    title: 'Before & after',
    subtitle: 'Real results from real customers',
    color: '#db2777',
    heroImage: EMAIL_STOCK_IMAGES.beforeAfter,
    badge: 'RESULTS',
    body: 'See the difference — then shop the products and services behind these results.',
    cta: 'Shop the routine',
    productLayout: 'grid',
    productHeading: 'Routine essentials',
    secondaryLayout: 'related',
    secondaryHeading: 'Complete the routine',
    secondarySource: 'related',
  }),

  // —— Thank you ——
  preset('thanks-order', {
    name: 'Thank you for your order',
    category: 'Thank you',
    subject: 'Thank you — we appreciate your order',
    description: 'Post-purchase thank you',
    thumbnailColor: '#059669',
    thumbnailImage: EMAIL_STOCK_IMAGES.tips,
    audienceHint: 'repeat',
  }, {
    emoji: '🙏',
    title: 'Thank you',
    subtitle: 'We appreciate your order',
    color: '#059669',
    heroImage: EMAIL_STOCK_IMAGES.tips,
    body: 'Thanks for shopping with Store1920. Here are tips and related products customers often add next.',
    cta: 'See recommendations',
    productLayout: 'related',
    productHeading: 'You may also like',
    productSource: 'related',
    secondaryLayout: 'latest',
    secondaryHeading: 'New to explore',
    secondarySource: 'latest',
  }),
  preset('thanks-vip', {
    name: 'VIP thank you',
    category: 'Thank you',
    subject: 'A thank-you for our most valued customers',
    description: 'Thank high-value customers',
    thumbnailColor: '#854d0e',
    thumbnailImage: EMAIL_STOCK_IMAGES.vip,
    audienceHint: 'high_value',
  }, {
    emoji: '👑',
    title: 'VIP appreciation',
    subtitle: 'Exclusive picks for valued customers',
    color: '#854d0e',
    heroImage: EMAIL_STOCK_IMAGES.vip,
    badge: 'VIP ONLY',
    body: 'Thank you for shopping with us. Enjoy elevated picks and related recommendations.',
    cta: 'View VIP picks',
    productLayout: 'grid',
    productHeading: 'VIP edit',
    secondaryLayout: 'related',
    secondaryHeading: 'Paired recommendations',
    secondarySource: 'related',
  }),
  preset('thanks-review', {
    name: 'Social proof & reviews',
    category: 'Thank you',
    subject: 'Loved by shoppers — see what customers say',
    description: 'Thank + social proof',
    thumbnailColor: '#ca8a04',
    thumbnailImage: EMAIL_STOCK_IMAGES.reviews,
  }, {
    emoji: '⭐',
    title: 'Loved by shoppers',
    subtitle: 'Real customers, real favourites',
    color: '#ca8a04',
    heroImage: EMAIL_STOCK_IMAGES.reviews,
    badge: 'TOP RATED',
    body: 'Join thousands of happy customers. These highly rated products keep earning five-star feedback.',
    cta: 'Shop top rated',
    productLayout: 'grid',
    productHeading: 'Top rated',
    secondaryLayout: 'carousel',
    secondaryHeading: 'Trending carousel',
  }),

  // —— Transactional-style marketing ——
  preset('txn-order-again', {
    name: 'Order again',
    category: 'Transactional',
    subject: 'Ready to order again? Your favourites are waiting',
    description: 'Reorder nudge for past buyers',
    thumbnailColor: '#0f766e',
    thumbnailImage: EMAIL_STOCK_IMAGES.reorder,
    audienceHint: 'repeat',
  }, {
    emoji: '🔁',
    title: 'Order again',
    subtitle: 'Pick up where you left off',
    color: '#0f766e',
    heroImage: EMAIL_STOCK_IMAGES.reorder,
    badge: 'FOR RETURNING SHOPPERS',
    body: 'Restock favourites or try related products shoppers often add next.',
    cta: 'Reorder favourites',
    productLayout: 'related',
    productHeading: 'Related to your taste',
    productSource: 'related',
    secondaryLayout: 'latest',
    secondaryHeading: 'New since your last visit',
    secondarySource: 'latest',
  }),
  preset('txn-win-back', {
    name: 'We miss you',
    category: 'Transactional',
    subject: 'It has been a while — here is something special',
    description: 'Win-back for inactive buyers',
    thumbnailColor: '#be123c',
    thumbnailImage: EMAIL_STOCK_IMAGES.missYou,
    audienceHint: 'inactive_90',
  }, {
    emoji: '💌',
    title: 'We miss you',
    subtitle: 'Come back to something special',
    color: '#be123c',
    heroImage: EMAIL_STOCK_IMAGES.missYou,
    badge: 'WIN-BACK OFFER',
    body: 'It has been a while. Here is what is new — and a few related picks worth a look.',
    cta: 'Come back & save',
    productLayout: 'latest',
    productHeading: 'What you missed',
    productSource: 'latest',
    secondaryLayout: 'related',
    secondaryHeading: 'Recommended for you',
    secondarySource: 'related',
  }),
  preset('txn-delivery-tips', {
    name: 'Post-purchase tips',
    category: 'Transactional',
    subject: 'Tips to get more from your recent order',
    description: 'Helpful tips after purchase',
    thumbnailColor: '#4f46e5',
    thumbnailImage: EMAIL_STOCK_IMAGES.tips,
    audienceHint: 'repeat',
  }, {
    emoji: '💡',
    title: 'Get more from your order',
    subtitle: 'Tips, care, and next ideas',
    color: '#4f46e5',
    heroImage: EMAIL_STOCK_IMAGES.tips,
    body: 'Thanks for your purchase. Here are complementary products customers often add next.',
    cta: 'See recommendations',
    productLayout: 'related',
    productHeading: 'Recommended next',
    productSource: 'related',
    secondaryLayout: 'latest',
    secondaryHeading: 'New to explore',
    secondarySource: 'latest',
  }),

  // —— Welcome ——
  preset('welcome-discount', {
    name: 'Welcome discount',
    category: 'Welcome',
    subject: 'Welcome to Store1920 — here is your discount',
    description: 'Welcome offer for new customers',
    thumbnailColor: '#059669',
    thumbnailImage: EMAIL_STOCK_IMAGES.welcome,
    audienceHint: 'new',
  }, {
    emoji: '👋',
    title: 'Welcome aboard',
    subtitle: 'A gift for your first shop',
    color: '#059669',
    heroImage: EMAIL_STOCK_IMAGES.welcome,
    badge: 'NEW CUSTOMER OFFER',
    body: 'Thanks for joining Store1920. Start with our latest arrivals — curated for first-time shoppers.',
    cta: 'Claim welcome offer',
    productLayout: 'latest',
    productHeading: 'Start with these',
    productSource: 'latest',
    secondaryLayout: 'carousel',
    secondaryHeading: 'Customer favourites',
  }),
  preset('welcome-club', {
    name: 'Welcome to the club',
    category: 'Welcome',
    subject: 'You are in — explore member picks',
    description: 'Community welcome',
    thumbnailColor: '#4f46e5',
    thumbnailImage: EMAIL_STOCK_IMAGES.club,
    audienceHint: 'new',
  }, {
    emoji: '🎉',
    title: 'Welcome to the club',
    subtitle: 'Member picks curated for you',
    color: '#4f46e5',
    heroImage: EMAIL_STOCK_IMAGES.club,
    badge: 'MEMBERS ONLY',
    body: 'You are officially part of Store1920. Browse the carousel of member favourites.',
    cta: 'Start shopping',
    productLayout: 'carousel',
    productHeading: 'Member carousel',
  }),
  preset('welcome-brand-story', {
    name: 'Brand story',
    category: 'Welcome',
    subject: 'Our story — why customers choose Store1920',
    description: 'Welcome with brand story',
    thumbnailColor: '#57534e',
    thumbnailImage: EMAIL_STOCK_IMAGES.brand,
  }, {
    emoji: '📖',
    title: 'Our story',
    subtitle: 'Why shoppers choose Store1920',
    color: '#57534e',
    heroImage: EMAIL_STOCK_IMAGES.brand,
    body: 'Quality, value, and delivery you can trust across the UAE. Here is what we stand for — and products that prove it.',
    cta: 'Shop with us',
    productLayout: 'grid',
    productHeading: 'Proof in the products',
  }),

  // —— Blank ——
  {
    id: 'blank-canvas',
    name: 'Start from scratch',
    category: 'Blank',
    subject: 'Your campaign subject',
    description: 'Empty canvas — edit images, add carousel / latest / related',
    thumbnailColor: '#64748b',
    thumbnailImage: EMAIL_STOCK_IMAGES.blank,
    blocks: blocks([
      { type: 'header', tagline: 'Start from scratch', showNav: true },
      {
        type: 'hero',
        emoji: '✉️',
        title: 'Your headline',
        subtitle: 'Edit this image anytime',
        color: '#0f172a',
        colorEnd: '#134e4a',
        imageUrl: EMAIL_STOCK_IMAGES.blank,
      },
      { type: 'text', html: 'Replace this text. Edit hero/product images from third-party URLs or store photos.', align: 'left' },
      {
        type: 'product_carousel',
        heading: 'Product carousel',
        productSource: 'featured',
        limit: 4,
        cardStyle: 'classic',
        ctaLabel: 'Shop now',
      },
      {
        type: 'product_latest',
        heading: 'Latest products',
        productSource: 'latest',
        limit: 4,
        showBadge: true,
        badgeText: 'NEW',
        cardStyle: 'minimal',
      },
      {
        type: 'product_related',
        heading: 'Related products',
        productSource: 'related',
        limit: 4,
        cardStyle: 'outline',
      },
      { type: 'button', label: 'Shop now', color: '#0f766e' },
      { type: 'footer' },
    ]),
  },
];

export function getEmailCampaignPresetById(id) {
  return EMAIL_CAMPAIGN_PRESETS.find((item) => item.id === id) || null;
}

export function listEmailCampaignPresets() {
  return EMAIL_CAMPAIGN_PRESETS.map(({ blocks: _blocks, ...meta }) => meta);
}

export function getPresetBlocks(id) {
  const presetItem = getEmailCampaignPresetById(id);
  if (!presetItem) return null;
  return cloneBlocks(presetItem.blocks);
}

export function applyHeroImageToBlocks(blockList = [], imageUrl = '') {
  if (!imageUrl) return blockList;
  return (blockList || []).map((block) => {
    if (block.type === 'hero') return { ...block, imageUrl };
    if (block.type === 'image' && !block.src) return { ...block, src: imageUrl };
    return block;
  });
}
