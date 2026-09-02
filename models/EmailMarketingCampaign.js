import mongoose from 'mongoose';

const EmailBlockSchema = new mongoose.Schema({
  id: String,
  type: { type: String, required: true },
  emoji: String,
  title: String,
  subtitle: String,
  color: String,
  colorEnd: String,
  text: String,
  html: String,
  align: String,
  label: String,
  url: String,
  src: String,
  alt: String,
  heading: String,
  tagline: String,
  height: Number,
  imageUrl: String,
  overlay: Boolean,
  logoUrl: String,
  logoWidth: Number,
  backgroundColor: String,
  showTagline: Boolean,
  selectionMode: String,
  productSource: String,
  category: String,
  productIds: [String],
  limit: Number,
  gridColumns: Number,
  cardStyle: String,
  showPrice: Boolean,
  showCta: Boolean,
  showBadge: Boolean,
  showDescription: Boolean,
  leftTitle: String,
  leftHtml: String,
  leftImage: String,
  rightTitle: String,
  rightHtml: String,
  rightImage: String,
}, { _id: false });

const RunLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  slotKey: String,
  emailsSent: { type: Number, default: 0 },
  emailsFailed: { type: Number, default: 0 },
  error: String,
}, { _id: false });

const EmailMarketingCampaignSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  name: { type: String, required: true },
  status: {
    type: String,
    enum: ['active', 'paused', 'stopped', 'completed'],
    default: 'active',
    index: true,
  },
  /** once = specific date/times; daily = every day at dailyTimes until stopped */
  scheduleMode: {
    type: String,
    enum: ['once', 'daily'],
    required: true,
  },
  /** One or more future datetimes for one-time campaigns (ISO / Date) */
  onceAtList: [{ type: Date }],
  /** One or more HH:mm times (24h, Asia/Dubai) for daily campaigns */
  dailyTimes: [{ type: String }],
  timezone: { type: String, default: 'Asia/Dubai' },
  audience: { type: String, default: 'all' },
  customerEmails: [{ type: String }],
  templateId: { type: String, default: '' },
  customTemplateId: { type: String, default: '' },
  subject: { type: String, required: true },
  preheader: { type: String, default: '' },
  blocks: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sentSlots: [{ type: String }],
  totalSent: { type: Number, default: 0 },
  totalFailed: { type: Number, default: 0 },
  lastRunAt: { type: Date, default: null },
  runLog: { type: [RunLogSchema], default: [] },
  stoppedAt: { type: Date, default: null },
  createdBy: { type: String, default: '' },
}, { timestamps: true });

EmailMarketingCampaignSchema.index({ storeId: 1, status: 1, updatedAt: -1 });
EmailMarketingCampaignSchema.index({ status: 1, scheduleMode: 1 });

export default mongoose.models.EmailMarketingCampaign
  || mongoose.model('EmailMarketingCampaign', EmailMarketingCampaignSchema);
