import mongoose from 'mongoose';

const emailHistorySchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['product_notification', 'order_status', 'promotional', 'other'],
    default: 'product_notification'
  },
  recipientEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  recipientName: {
    type: String
  },
  subject: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['sent', 'failed', 'pending'],
    default: 'sent'
  },
  errorMessage: {
    type: String
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  productName: {
    type: String
  },
  customMessage: {
    type: String
  },
  /** Opaque token embedded in open-pixel / click redirects */
  trackingToken: {
    type: String,
    sparse: true,
  },
  openCount: {
    type: Number,
    default: 0,
  },
  firstOpenedAt: {
    type: Date,
    default: null,
  },
  lastOpenedAt: {
    type: Date,
    default: null,
  },
  clickCount: {
    type: Number,
    default: 0,
  },
  firstClickedAt: {
    type: Date,
    default: null,
  },
  lastClickedAt: {
    type: Date,
    default: null,
  },
  lastClickedUrl: {
    type: String,
    default: '',
  },
  recentClicks: {
    type: [{
      url: String,
      at: { type: Date, default: Date.now },
    }],
    default: [],
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient querying
emailHistorySchema.index({ storeId: 1, createdAt: -1 });
emailHistorySchema.index({ storeId: 1, status: 1 });
emailHistorySchema.index({ storeId: 1, type: 1 });
emailHistorySchema.index({ trackingToken: 1 }, { unique: true, sparse: true });
// TTL: auto-delete email logs older than 180 days to control collection size
emailHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

// Auto-update updatedAt using promise middleware (no next callback required)
emailHistorySchema.pre('save', function() {
  this.updatedAt = Date.now();
});

export default mongoose.models.EmailHistory || mongoose.model('EmailHistory', emailHistorySchema);
