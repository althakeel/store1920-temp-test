import mongoose from "mongoose";

const StoreSchema = new mongoose.Schema({
  name: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  description: String,
  email: String,
  contact: String,
  address: String,
  city: String,
  state: String,
  zip: String,
  businessType: String,
  currencyPreference: { type: String, default: 'AED' },
  logo: String,
  banner: String,
  website: String,
  facebook: String,
  instagram: String,
  twitter: String,
  businessHours: String,
  returnPolicy: String,
  shippingPolicy: String,
  smtpSettings: {
    transactional: {
      host: { type: String, default: '' },
      port: { type: Number, default: 465 },
      user: { type: String, default: '' },
      pass: { type: String, default: '' },
      secure: { type: Boolean, default: true },
      fromEmail: { type: String, default: '' },
      fromName: { type: String, default: '' },
    },
    promotional: {
      host: { type: String, default: '' },
      port: { type: Number, default: 465 },
      user: { type: String, default: '' },
      pass: { type: String, default: '' },
      secure: { type: Boolean, default: true },
      fromEmail: { type: String, default: '' },
      fromName: { type: String, default: '' },
    },
    updatedAt: { type: Date, default: null },
  },
  isActive: { type: Boolean, default: false },
  status: { type: String, default: "pending", enum: ["pending", "approved", "rejected"] },
  featuredProductIds: { type: [String], default: [] }, // Array of featured product IDs
  featuredProductsSource: { type: String, default: 'manual' },
  featuredProductsCategoryIds: { type: [String], default: [] },
  featuredProductsTags: { type: [String], default: [] },
  featuredSectionTitle: { type: String, default: 'Craziest sale of the year!' },
  featuredSectionDescription: { type: String, default: "Grab the best deals before they're gone!" },
  featuredSectionTitleAr: { type: String, default: '' },
  featuredSectionDescriptionAr: { type: String, default: '' },
  exploreInterestsEnabled: { type: Boolean, default: true },
  exploreInterestsProductIds: { type: [String], default: [] },
  carouselProductIds: { type: [String], default: [] }, // Array of product IDs for carousel slider
  homeMenuCategories: {
    count: { type: Number, default: 6 },
    items: [
      {
        name: String,
        image: String,
        url: String,
        categoryId: mongoose.Schema.Types.ObjectId,
      },
    ],
  },
}, { timestamps: true });

// username already has unique index via schema field definition
StoreSchema.index({ userId: 1 });

export default mongoose.models.Store || mongoose.model("Store", StoreSchema);
