import mongoose from 'mongoose';

const EmailMarketingLeadSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      index: true,
    },
    name: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    source: {
      type: String,
      default: 'welcome_offer',
      trim: true,
      index: true,
    },
    formStyle: { type: String, default: '', trim: true },
    formType: { type: String, default: '', trim: true },
    heading: { type: String, default: '', trim: true },
    campaignId: { type: String, default: '', trim: true },
    campaignName: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['new', 'contacted', 'converted', 'archived'],
      default: 'new',
      index: true,
    },
    notes: { type: String, default: '', trim: true },
    convertedOrderId: { type: String, default: '', trim: true, index: true },
    convertedOrderTotal: { type: Number, default: null },
    convertedAt: { type: Date, default: null },
    emailHistoryId: { type: String, default: '', trim: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    submittedCount: { type: Number, default: 1 },
    lastSubmittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

EmailMarketingLeadSchema.index({ storeId: 1, createdAt: -1 });
EmailMarketingLeadSchema.index({ storeId: 1, status: 1, createdAt: -1 });
EmailMarketingLeadSchema.index(
  { storeId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string', $gt: '' } },
  },
);

export default mongoose.models.EmailMarketingLead
  || mongoose.model('EmailMarketingLead', EmailMarketingLeadSchema);
