import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema({
  name: String,
  nameAr: { type: String, default: '' },
  legacySourceId: { type: String, default: null, index: true },
  slug: { type: String, unique: true },
  brand: { type: String, default: '' },
  brandAr: { type: String, default: '' },
  description: String,
  descriptionAr: { type: String, default: '' },
  shortDescription: String,
  shortDescriptionAr: { type: String, default: '' },
  shortDescription2: { type: String, default: '' },
  // Amazon-style A+ modules — separate images/HTML for desktop website vs mobile/app.
  aPlusDesktop: { type: String, default: '' },
  aPlusMobile: { type: String, default: '' },
  aPlusDesktopAr: { type: String, default: '' },
  aPlusMobileAr: { type: String, default: '' },
  aPlusDesktopImages: { type: [String], default: [] },
  aPlusMobileImages: { type: [String], default: [] },
  specTableEnabled: { type: Boolean, default: false },
  specTableColumns: { type: [String], default: ['Property', 'Value'] },
  specTableRows: { type: Array, default: [] },
  AED: Number,
  price: Number,
  costPrice: { type: Number, default: 0 }, // Actual cost/purchase price for profit calculation
  images: [String],
  externalImages: { type: [String], default: [] },
  imageImportStatus: { type: Object, default: {} },
  category: { type: String, ref: 'Category' },
  categories: { type: [String], default: [] }, // Multiple categories support
  needsReview: { type: Boolean, default: false },
  sku: String,
  published: { type: Boolean, default: true },
  inStock: { type: Boolean, default: true },
  stockQuantity: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
  stockUpdatedAt: { type: Date, default: null },
  hasVariants: { type: Boolean, default: false },
  variants: { type: Array, default: [] },
  attributes: { type: Object, default: {} },
  hasBulkPricing: { type: Boolean, default: false },
  bulkPricing: { type: Array, default: [] },
  fastDelivery: { type: Boolean, default: false },
  freeShippingEligible: { type: Boolean, default: false },
  hsCode: { type: String, default: '' },
  originCountry: { type: String, default: '' },
  shippingWeightKg: { type: Number, default: 0 },
  useProductsPath: { type: Boolean, default: false },
  allowReturn: { type: Boolean, default: true },
  allowReplacement: { type: Boolean, default: true },
  imageAspectRatio: { type: String, default: '1:1' },
  cardVideoPreviewEnabled: { type: Boolean, default: true },
  cardVideoPreviewDelaySec: { type: Number, default: 24 },
  storeId: String,
  tags: { type: [String], default: [] },
  seoTitle: { type: String, default: '' },
  seoDescription: { type: String, default: '' },
  seoKeywords: { type: [String], default: [] },
  // Frequently Bought Together fields
  enableFBT: { type: Boolean, default: false },
  fbtProductIds: { type: [String], default: [] },
  fbtBundlePrice: { type: Number, default: null },
  fbtBundleDiscount: { type: Number, default: null },
  wooImport: { type: Object, default: {} },
  zoho: {
    itemId: { type: String, default: null, index: true },
    sku: { type: String, default: null },
    synced: { type: Boolean, default: false },
    syncedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    locationId: { type: String, default: null },
    locationName: { type: String, default: null },
  },
}, { timestamps: true });

// Add indexes for better query performance
ProductSchema.index({ published: 1, createdAt: -1 });
ProductSchema.index({ inStock: 1, createdAt: -1 });
ProductSchema.index({ storeId: 1, stockUpdatedAt: -1 });
ProductSchema.index({ category: 1, inStock: 1 }); // For category filtering
ProductSchema.index({ price: 1, AED: 1 }); // For discount calculations and price sorting
ProductSchema.index({ tags: 1, inStock: 1 }); // For tag-based filtering
ProductSchema.index({ fastDelivery: 1, inStock: 1 }); // For fast delivery filter
ProductSchema.index({ brand: 1, inStock: 1 });                    // Brand page filtering
ProductSchema.index({ storeId: 1, category: 1, inStock: 1 });    // Store + category listings
ProductSchema.index({ storeId: 1, createdAt: -1 });              // Store product picker (newest)
ProductSchema.index({ storeId: 1, name: 1 });                      // Store product picker (name sort)
ProductSchema.index({ storeId: 1, price: 1 });                   // Store product picker (price sort)
ProductSchema.index({ storeId: 1, sku: 1 });                     // Store SKU lookup
ProductSchema.index({ name: 'text', brand: 'text', shortDescription: 'text', sku: 'text', seoTitle: 'text' }); // Full-text search

export default mongoose.models.Product || mongoose.model("Product", ProductSchema);