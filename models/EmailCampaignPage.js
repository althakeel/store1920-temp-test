import mongoose from 'mongoose';

const EmailCampaignPageSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    title: { type: String, trim: true, required: true, default: '' },
    titleAr: { type: String, trim: true, default: '' },
    slug: { type: String, trim: true, required: true, index: true },
    subtitle: { type: String, trim: true, default: '' },
    subtitleAr: { type: String, trim: true, default: '' },
    heroImage: { type: String, trim: true, default: '' },
    productIds: [{ type: String, trim: true }],
    ctaLabel: { type: String, trim: true, default: '' },
    ctaUrl: { type: String, trim: true, default: '' },
    backgroundColor: { type: String, trim: true, default: '#f8fafc' },
    accentColor: { type: String, trim: true, default: '#0f766e' },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    publishedAt: { type: Date, default: null },
    seoTitle: { type: String, trim: true, default: '' },
    seoDescription: { type: String, trim: true, default: '' },
    createdBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

EmailCampaignPageSchema.index({ storeId: 1, slug: 1 }, { unique: true });
EmailCampaignPageSchema.index({ status: 1, slug: 1 });

const EmailCampaignPage =
  mongoose.models.EmailCampaignPage
  || mongoose.model('EmailCampaignPage', EmailCampaignPageSchema);

export default EmailCampaignPage;
