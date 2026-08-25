import mongoose from 'mongoose'

const TopBarItemSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    title: { type: String, trim: true, default: '' },
    subtitle: { type: String, trim: true, default: '' },
    icon: { type: String, trim: true, default: '' },
    href: { type: String, trim: true, default: '' },
    action: { type: String, trim: true, default: '' }
  },
  { _id: false }
)

const BannerSliderItemSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true, default: '' },
    image: { type: String, trim: true, default: '' },
    mobileImage: { type: String, trim: true, default: '' },
    link: { type: String, trim: true, default: '/shop' },
    alt: { type: String, trim: true, default: '' }
  },
  { _id: false }
)

const ProductBannerSchema = new mongoose.Schema(
  {
    image: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: 'Product Title' },
    subtitle: { type: String, trim: true, default: 'Order now' },
    buttonText: { type: String, trim: true, default: 'Order now' },
    link: { type: String, trim: true, default: '/shop' }
  },
  { _id: false }
)

const defaultBannerSliderItems = [
  { id: 'banner-slider-1', image: '', link: '/category/sofas', alt: 'Banner 1' },
  { id: 'banner-slider-2', image: '', link: '/category/beds', alt: 'Banner 2' }
]

const defaultSecondaryBannerSliderItems = [
  { id: 'secondary-banner-slider-1', image: '', link: '/shop', alt: 'Lower Banner 1' },
  { id: 'secondary-banner-slider-2', image: '', link: '/shop', alt: 'Lower Banner 2' }
]

const defaultProductBanners = [
  { image: '', title: 'Product Title', subtitle: 'Order now', buttonText: 'Order now', link: '/shop' },
  { image: '', title: 'Product Title', subtitle: 'Order now', buttonText: 'Order now', link: '/shop' },
  { image: '', title: 'Product Title', subtitle: 'Order now', buttonText: 'Order now', link: '/shop' },
  { image: '', title: 'Product Title', subtitle: 'Order now', buttonText: 'Order now', link: '/shop' }
]

const StorePreferenceSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, unique: true },
    topBar: {
      enabled: { type: Boolean, default: true },
      countdownLabel: { type: String, trim: true, default: 'HURRY UP !' },
      countdownEnd: { type: Date, default: null },
      items: {
        type: [TopBarItemSchema],
        default: [
          { id: 'shipping', title: 'Fast Delivery', subtitle: 'Across the UAE', icon: 'truck' },
          { id: 'policy', title: 'Up to 90 days*', subtitle: 'Price adjustment', icon: 'bell' },
          { id: 'rewards', title: 'Signup Rewards', subtitle: '100 Coins + Free Coupons', icon: 'gift', action: 'signup' }
        ]
      }
    },
    shopShowcase: {
      enabled: { type: Boolean, default: true },
      featuredSectionTitle: { type: String, trim: true, default: 'Craziest sale of the year!' },
      featuredSectionDescription: { type: String, trim: true, default: "Grab the best deals before they're gone!" },
      mainBannerEnabled: { type: Boolean, default: true },
      mainBannerImage: { type: String, trim: true, default: '' },
      mainBannerTitle: { type: String, trim: true, default: 'Power up instantly no battery needed' },
      mainBannerTitleEnabled: { type: Boolean, default: true },
      mainBannerSubtitle: { type: String, trim: true, default: 'Never stress over a dead battery again' },
      mainBannerSubtitleEnabled: { type: Boolean, default: true },
      mainBannerCtaText: { type: String, trim: true, default: 'Order Now' },
      mainBannerCtaEnabled: { type: Boolean, default: true },
      mainBannerLink: { type: String, trim: true, default: '/shop' },
      mainBannerLeftColor: { type: String, trim: true, default: '#00112b' },
      mainBannerRightColor: { type: String, trim: true, default: '#00112b' },
      mainBannerTitleColor: { type: String, trim: true, default: '#ffffff' },
      mainBannerSubtitleColor: { type: String, trim: true, default: '#e5e7eb' },
      mainBannerCtaBgColor: { type: String, trim: true, default: '#ef2d2d' },
      mainBannerCtaTextColor: { type: String, trim: true, default: '#ffffff' },
      mainBannerDesktopHeight: { type: Number, default: 320 },
      mainBannerMobileHeight: { type: Number, default: 100 },
      sectionTitle: { type: String, trim: true, default: 'More Reasons to Shop' },
      leftBlockBadgeText: { type: String, trim: true, default: '' },
      leftBlockSource: { type: String, enum: ['category', 'product'], default: 'category' },
      dealsTitle: { type: String, trim: true, default: 'MEGA DEALS' },
      countdownEnd: { type: Date, default: null },
      categoryIds: { type: [String], default: [] },
      sectionProductIds: { type: [String], default: [] },
      productIds: { type: [String], default: [] },
      topBannerImage: { type: String, trim: true, default: '' },
      topBannerTitle: { type: String, trim: true, default: 'SUPER SAVES FOR SUMMER' },
      topBannerTitleEnabled: { type: Boolean, default: true },
      topBannerSubtitle: { type: String, trim: true, default: '' },
      topBannerSubtitleEnabled: { type: Boolean, default: true },
      topBannerCtaText: { type: String, trim: true, default: 'Order now' },
      topBannerCtaEnabled: { type: Boolean, default: true },
      topBannerCtaBgColor: { type: String, trim: true, default: '#ef2d2d' },
      topBannerCtaTextColor: { type: String, trim: true, default: '#ffffff' },
      topBannerLink: { type: String, trim: true, default: '/shop' },
      topBannerSliderEnabled: { type: Boolean, default: true },
      topBannerSliderInterval: { type: Number, default: 4000 },
      topBannerSliderItems: {
        type: [BannerSliderItemSchema],
        default: [],
      },
      bottomBannerImage: { type: String, trim: true, default: '' },
      bottomBannerTitle: { type: String, trim: true, default: 'Shop Now. Pay Later. Ready for Summer.' },
      bottomBannerTitleEnabled: { type: Boolean, default: true },
      bottomBannerSubtitle: { type: String, trim: true, default: '' },
      bottomBannerSubtitleEnabled: { type: Boolean, default: true },
      bottomBannerCtaText: { type: String, trim: true, default: 'Shop Now' },
      bottomBannerCtaEnabled: { type: Boolean, default: true },
      bottomBannerCtaBgColor: { type: String, trim: true, default: '#ef2d2d' },
      bottomBannerCtaTextColor: { type: String, trim: true, default: '#ffffff' },
      bottomBannerLink: { type: String, trim: true, default: '/shop' },
      bottomBannerSliderEnabled: { type: Boolean, default: true },
      bottomBannerSliderInterval: { type: Number, default: 4000 },
      bottomBannerSliderItems: {
        type: [BannerSliderItemSchema],
        default: [],
      },
      productBanners: {
        type: [ProductBannerSchema],
        default: defaultProductBanners
      },
      bannerSliderEnabled: { type: Boolean, default: true },
      bannerSliderDesktopInterval: { type: Number, default: 4000 },
      bannerSliderMobileInterval: { type: Number, default: 3000 },
      bannerSliderDesktopHeight: { type: Number, default: 220 },
      bannerSliderMobileHeight: { type: Number, default: 120 },
      bannerSliderItems: {
        type: [BannerSliderItemSchema],
        default: defaultBannerSliderItems
      },
      secondaryBannerSliderEnabled: { type: Boolean, default: true },
      secondaryBannerSliderDesktopInterval: { type: Number, default: 4000 },
      secondaryBannerSliderMobileInterval: { type: Number, default: 3000 },
      secondaryBannerSliderDesktopHeight: { type: Number, default: 220 },
      secondaryBannerSliderMobileHeight: { type: Number, default: 120 },
      secondaryBannerSliderPlacement: { type: String, enum: ['above_top_deals', 'below_top_deals', 'below_small_banners'], default: 'above_top_deals' },
      secondaryBannerSliderItems: {
        type: [BannerSliderItemSchema],
        default: defaultSecondaryBannerSliderItems
      },
      referralRewardCoins: { type: Number, default: 25 }
    },
    signinModal: {
      sideImage: { type: String, trim: true, default: '' },
      sideImageLink: { type: String, trim: true, default: '' },
      sideImageClickable: { type: Boolean, default: false },
      showCtaButton: { type: Boolean, default: false },
      ctaButtonText: { type: String, trim: true, default: 'Shop Now' },
      ctaButtonLink: { type: String, trim: true, default: '/shop' },
    },
    /** Mobile app design only (four home banner sections) — not shown on the website */
    mobileFeatures: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    appearanceSections: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
)

StorePreferenceSchema.index({ updatedAt: -1 })

const StorePreferenceModel = mongoose.models.StorePreference || mongoose.model('StorePreference', StorePreferenceSchema)

const missingShopShowcasePaths = {}

if (!StorePreferenceModel.schema.path('shopShowcase.mainBannerTitleEnabled')) {
  missingShopShowcasePaths.mainBannerTitleEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.mainBannerSubtitleEnabled')) {
  missingShopShowcasePaths.mainBannerSubtitleEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.mainBannerCtaEnabled')) {
  missingShopShowcasePaths.mainBannerCtaEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.mainBannerDesktopHeight')) {
  missingShopShowcasePaths.mainBannerDesktopHeight = { type: Number, default: 320 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.mainBannerMobileHeight')) {
  missingShopShowcasePaths.mainBannerMobileHeight = { type: Number, default: 100 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bannerSliderEnabled')) {
  missingShopShowcasePaths.bannerSliderEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bannerSliderDesktopInterval')) {
  missingShopShowcasePaths.bannerSliderDesktopInterval = { type: Number, default: 4000 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bannerSliderMobileInterval')) {
  missingShopShowcasePaths.bannerSliderMobileInterval = { type: Number, default: 3000 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bannerSliderDesktopHeight')) {
  missingShopShowcasePaths.bannerSliderDesktopHeight = { type: Number, default: 220 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bannerSliderMobileHeight')) {
  missingShopShowcasePaths.bannerSliderMobileHeight = { type: Number, default: 120 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.leftBlockBadgeText')) {
  missingShopShowcasePaths.leftBlockBadgeText = { type: String, trim: true, default: '' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bannerSliderItems')) {
  missingShopShowcasePaths.bannerSliderItems = {
    type: [BannerSliderItemSchema],
    default: defaultBannerSliderItems
  }
}

if (!StorePreferenceModel.schema.path('shopShowcase.productBanners')) {
  missingShopShowcasePaths.productBanners = {
    type: [ProductBannerSchema],
    default: defaultProductBanners
  }
}

if (!StorePreferenceModel.schema.path('shopShowcase.secondaryBannerSliderEnabled')) {
  missingShopShowcasePaths.secondaryBannerSliderEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.secondaryBannerSliderDesktopInterval')) {
  missingShopShowcasePaths.secondaryBannerSliderDesktopInterval = { type: Number, default: 4000 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.secondaryBannerSliderMobileInterval')) {
  missingShopShowcasePaths.secondaryBannerSliderMobileInterval = { type: Number, default: 3000 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.secondaryBannerSliderDesktopHeight')) {
  missingShopShowcasePaths.secondaryBannerSliderDesktopHeight = { type: Number, default: 220 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.secondaryBannerSliderMobileHeight')) {
  missingShopShowcasePaths.secondaryBannerSliderMobileHeight = { type: Number, default: 120 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.secondaryBannerSliderPlacement')) {
  missingShopShowcasePaths.secondaryBannerSliderPlacement = { type: String, enum: ['above_top_deals', 'below_top_deals', 'below_small_banners'], default: 'above_top_deals' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.secondaryBannerSliderItems')) {
  missingShopShowcasePaths.secondaryBannerSliderItems = {
    type: [BannerSliderItemSchema],
    default: defaultSecondaryBannerSliderItems
  }
}

if (!StorePreferenceModel.schema.path('shopShowcase.leftBlockSource')) {
  missingShopShowcasePaths.leftBlockSource = { type: String, enum: ['category', 'product'], default: 'category' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.sectionProductIds')) {
  missingShopShowcasePaths.sectionProductIds = { type: [String], default: [] }
}

if (!StorePreferenceModel.schema.path('shopShowcase.referralRewardCoins')) {
  missingShopShowcasePaths.referralRewardCoins = { type: Number, default: 25 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerSubtitle')) {
  missingShopShowcasePaths.topBannerSubtitle = { type: String, trim: true, default: '' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerCtaText')) {
  missingShopShowcasePaths.topBannerCtaText = { type: String, trim: true, default: 'Order now' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bottomBannerSubtitle')) {
  missingShopShowcasePaths.bottomBannerSubtitle = { type: String, trim: true, default: '' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerTitleEnabled')) {
  missingShopShowcasePaths.topBannerTitleEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerSubtitleEnabled')) {
  missingShopShowcasePaths.topBannerSubtitleEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerCtaEnabled')) {
  missingShopShowcasePaths.topBannerCtaEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerCtaBgColor')) {
  missingShopShowcasePaths.topBannerCtaBgColor = { type: String, trim: true, default: '#ef2d2d' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerCtaTextColor')) {
  missingShopShowcasePaths.topBannerCtaTextColor = { type: String, trim: true, default: '#ffffff' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bottomBannerTitleEnabled')) {
  missingShopShowcasePaths.bottomBannerTitleEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bottomBannerSubtitleEnabled')) {
  missingShopShowcasePaths.bottomBannerSubtitleEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bottomBannerCtaEnabled')) {
  missingShopShowcasePaths.bottomBannerCtaEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bottomBannerCtaBgColor')) {
  missingShopShowcasePaths.bottomBannerCtaBgColor = { type: String, trim: true, default: '#ef2d2d' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bottomBannerCtaTextColor')) {
  missingShopShowcasePaths.bottomBannerCtaTextColor = { type: String, trim: true, default: '#ffffff' }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerSliderEnabled')) {
  missingShopShowcasePaths.topBannerSliderEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerSliderInterval')) {
  missingShopShowcasePaths.topBannerSliderInterval = { type: Number, default: 4000 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.topBannerSliderItems')) {
  missingShopShowcasePaths.topBannerSliderItems = {
    type: [BannerSliderItemSchema],
    default: [],
  }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bottomBannerSliderEnabled')) {
  missingShopShowcasePaths.bottomBannerSliderEnabled = { type: Boolean, default: true }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bottomBannerSliderInterval')) {
  missingShopShowcasePaths.bottomBannerSliderInterval = { type: Number, default: 4000 }
}

if (!StorePreferenceModel.schema.path('shopShowcase.bottomBannerSliderItems')) {
  missingShopShowcasePaths.bottomBannerSliderItems = {
    type: [BannerSliderItemSchema],
    default: [],
  }
}

if (Object.keys(missingShopShowcasePaths).length) {
  StorePreferenceModel.schema.add({
    shopShowcase: missingShopShowcasePaths
  })
}

if (!StorePreferenceModel.schema.path('mobileFeatures')) {
  StorePreferenceModel.schema.add({
    mobileFeatures: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  })
}

export default StorePreferenceModel
