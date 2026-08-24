import mongoose from 'mongoose';

const ReturnHistorySchema = new mongoose.Schema({
  status: { type: String, default: '' },
  label: { type: String, default: '' },
  note: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  actorUid: { type: String, default: null },
  actorName: { type: String, default: '' },
}, { _id: false });

const ReturnItemSchema = new mongoose.Schema({
  itemIndex: { type: Number, default: 0 },
  productId: { type: String, default: '' },
  productName: { type: String, default: '' },
  sku: { type: String, default: '' },
  price: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  orderedQuantity: { type: Number, default: 1 },
  variantLabel: { type: String, default: '' },
  variantOptions: { type: Object, default: null },
  allowReturn: { type: Boolean, default: true },
  allowReplacement: { type: Boolean, default: true },
}, { _id: false });

const ReturnRequestSchema = new mongoose.Schema({
  storeId: { type: String, required: true, index: true },
  returnNumber: { type: String, required: true, unique: true, index: true },
  seq: { type: Number, default: 0 },
  orderId: { type: String, required: true, index: true },
  userId: { type: String, default: '', index: true },
  type: { type: String, default: 'RETURN' },
  status: { type: String, default: 'SUBMITTED', index: true },
  eligibilityReason: { type: String, default: '' },
  reason: { type: String, default: '' },
  description: { type: String, default: '' },
  images: { type: [String], default: [] },
  videos: { type: [String], default: [] },
  additionalImages: { type: [String], default: [] },
  additionalVideos: { type: [String], default: [] },
  infoRequestedMessage: { type: String, default: '' },
  fastProcess: { type: Boolean, default: false },
  productRating: Number,
  deliveryRating: Number,
  reviewText: String,
  items: { type: [ReturnItemSchema], default: [] },
  pickupAddress: { type: Object, default: {} },
  refundMethod: { type: String, default: 'ORIGINAL' },
  paymentMethod: { type: String, default: '' },
  customerName: { type: String, default: '' },
  customerEmail: { type: String, default: '' },
  customerPhone: { type: String, default: '' },
  deliveredAt: { type: Date, default: null },
  returnDeadline: { type: Date, default: null },
  replacementDeadline: { type: Date, default: null },
  orderReturnIndex: { type: Number, default: null },
  history: { type: [ReturnHistorySchema], default: [] },
  pickup: {
    scheduledAt: { type: Date, default: null },
    scheduledFor: { type: String, default: '' },
    riderName: { type: String, default: '' },
    riderPhone: { type: String, default: '' },
    scannedCode: { type: String, default: '' },
    instructions: { type: String, default: '' },
    packageSize: { type: String, default: '' },
  },
  warehouse: {
    receivedAt: { type: Date, default: null },
    warehouseName: { type: String, default: '' },
    staffUid: { type: String, default: '' },
    staffName: { type: String, default: '' },
    quantityReceived: { type: Number, default: 0 },
    packageCondition: { type: String, default: '' },
    notes: { type: String, default: '' },
    photos: { type: [String], default: [] },
  },
  qc: {
    skuMatch: { type: Boolean, default: null },
    serialMatch: { type: Boolean, default: null },
    quantityMatch: { type: Boolean, default: null },
    sameItem: { type: Boolean, default: null },
    condition: { type: String, default: '' },
    originalBox: { type: Boolean, default: null },
    accessories: { type: Boolean, default: null },
    manual: { type: Boolean, default: null },
    warrantyCard: { type: Boolean, default: null },
    promotionalItems: { type: Boolean, default: null },
    notes: { type: String, default: '' },
    photos: { type: [String], default: [] },
    checkedAt: { type: Date, default: null },
    checkedByUid: { type: String, default: '' },
    checkedByName: { type: String, default: '' },
  },
  refund: {
    productAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    nonRefundableAmount: { type: Number, default: 0 },
    adjustmentAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'AED' },
    method: { type: String, default: 'ORIGINAL' },
    initiatedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    provider: { type: String, default: '' },
    refundAuthId: { type: String, default: '' },
    providerRefundId: { type: String, default: '' },
    customerMessage: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  followUpOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  followUpOrderNumber: { type: String, default: '' },
  returnPickupOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  returnPickupOrderNumber: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  sellerNotes: { type: String, default: '' },
}, { timestamps: true });

ReturnRequestSchema.index({ storeId: 1, createdAt: -1 });
ReturnRequestSchema.index({ storeId: 1, status: 1, createdAt: -1 });
ReturnRequestSchema.index({ userId: 1, createdAt: -1 });
ReturnRequestSchema.index({ returnPickupOrderId: 1 });
ReturnRequestSchema.index({ followUpOrderId: 1 });

if (mongoose.models.ReturnRequest) {
  delete mongoose.models.ReturnRequest;
}

export default mongoose.model('ReturnRequest', ReturnRequestSchema);
