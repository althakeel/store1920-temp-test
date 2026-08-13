import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  price: Number,
  quantity: Number,
  variantOptions: { type: Object, default: null },
  // Add more fields as needed
}, { _id: false });

const RazorpaySettlementSchema = new mongoose.Schema({
  paymentId: String,                    // Razorpay payment ID
  status: String,                       // TRANSFERRED, PENDING, FAILED
  captured_at: Date,                    // When payment was captured
  amount: Number,                       // Amount paid
  fee: { type: Number, default: 0 },   // Razorpay processing fee
  is_transferred: { type: Boolean, default: false }, // Is amount transferred to bank?
  transferred_at: Date,                 // When transferred to bank account
  transfer_id: String,                  // Razorpay transfer ID
  amount_transferred: Number,           // Amount that reached bank
  recipient_id: String                  // Bank account identifier
}, { _id: false, timestamps: false });

const OrderSchema = new mongoose.Schema({
  storeId: { type: String, required: true },
  legacySourceId: { type: String, default: null, index: true },
  userId: String,
  addressId: String,
  total: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  status: { type: String, default: "ORDER_PLACED", index: true },
  paymentMethod: String,
  paymentStatus: String,
  isPaid: { type: Boolean, default: false },
  // Set only by the current checkout flow. It distinguishes new orders whose
  // inventory lifecycle is transaction-backed from legacy orders that predate
  // the fulfillment reservation marker.
  fulfillmentStockReservationRequired: { type: Boolean, default: false },
  fulfillmentStockReservationId: { type: String, default: null },
  fulfillmentStockReservedAt: { type: Date, default: null },
  paymentVerification: {
    status: { type: String, default: 'UNVERIFIED' },
    provider: { type: String, default: null },
    providerReference: { type: String, default: null },
    providerEventId: { type: String, default: null },
    source: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    verifiedAmount: { type: Number, default: null },
    currency: { type: String, default: null },
    orderTotalAtVerification: { type: Number, default: null },
    reversedAt: { type: Date, default: null },
    reversalReason: { type: String, default: null },
  },
  isCouponUsed: { type: Boolean, default: false },
  coupon: Object,
  isGuest: { type: Boolean, default: false },
  guestName: String,
  guestEmail: String,
  guestPhone: String,
  alternatePhone: String,
  alternatePhoneCode: String,
  shippingAddress: Object,
  trackingId: { type: String, index: true },
  courier: String,
  trackingUrl: String,
  waslah: {
    orderId: { type: String, default: null, index: true },
    cartId: { type: String, default: null },
    serviceId: { type: String, default: null },
    reference: { type: String, default: null },
    trackingNumber: { type: String, default: null },
    labelUrl: { type: String, default: null },
    labelPrintedAt: { type: Date, default: null },
    labelDownloadCount: { type: Number, default: 0 },
    processed: { type: Boolean, default: false },
    processedAt: { type: Date, default: null },
    pickupRequestedAt: { type: Date, default: null },
    pickupDate: { type: String, default: null },
    pickupTime: { type: String, default: null },
    pickupVehicle: { type: String, default: null },
    unlinkedInWaslah: { type: Boolean, default: false },
    carrierStatus: { type: String, default: null },
    appStatus: { type: String, default: null },
    currentStatus: { type: String, default: null },
    currentSubtag: { type: String, default: null },
    lastSubtag: { type: String, default: null },
    lastSubtagMessage: { type: String, default: null },
    lastLocation: { type: String, default: null },
    lastEventAt: { type: Date, default: null },
    lastEventId: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelCount: { type: Number, default: 0 },
    cancelledOrderId: { type: String, default: null },
    cancelledTrackingNumber: { type: String, default: null },
    events: [{
      _id: false,
      time: { type: String, default: '' },
      status: { type: String, default: '' },
      subtag: { type: String, default: '' },
      location: { type: String, default: '' },
      remarks: { type: String, default: '' },
    }],
    // Explicit opt-in written only by the new-order creation flow. Existing
    // orders intentionally remain outside automatic EMX fulfillment.
    autoShipEnrolled: { type: Boolean, default: false },
    autoShipEnrolledAt: { type: Date, default: null },
    autoShipReadyAt: { type: Date, default: null },
    autoShipStatus: { type: String, default: null, index: true },
    autoShipAttemptId: { type: String, default: null },
    autoShipAttemptCount: { type: Number, default: 0 },
    autoShipTrigger: { type: String, default: null },
    autoShipRequestedAt: { type: Date, default: null },
    autoShipStartedAt: { type: Date, default: null },
    autoShipCompletedAt: { type: Date, default: null },
    autoShipFailedAt: { type: Date, default: null },
    autoShipNextRetryAt: { type: Date, default: null },
    autoShipLeaseExpiresAt: { type: Date, default: null },
    autoShipLastError: { type: String, default: null },
    autoShipLastErrorCode: { type: String, default: null },
    // Shared by manual and automatic fulfillment. This short lease serializes
    // the external create/cart/checkout workflow so the two entry points
    // cannot create separate EMX shipments for the same store order.
    shipmentOperationClaimId: { type: String, default: null },
    shipmentOperationStartedAt: { type: Date, default: null },
    shipmentOperationLeaseExpiresAt: { type: Date, default: null },
  },
  zohoCrm: {
    contactId: { type: String, default: null },
    dealId: { type: String, default: null },
    syncedAt: { type: Date, default: null },
    syncStatus: { type: String, default: null },
    lastError: { type: String, default: null },
  },
  zohoInventory: {
    customerId: { type: String, default: null },
    salesOrderId: { type: String, default: null, index: true },
    salesOrderNumber: { type: String, default: null },
    referenceNumber: { type: String, default: null },
    zohoStatus: { type: String, default: null },
    syncedAt: { type: Date, default: null },
    syncStatus: { type: String, default: null },
    lastError: { type: String, default: null },
  },
  shortOrderNumber: { type: Number, index: true },
  orderItems: [OrderItemSchema],
  items: Array,
  cancelReason: String,
  paymentRecoveryNotifiedAt: { type: Date, default: null },
  orderPlacedEmailSentAt: { type: Date, default: null },
  metaPurchaseSentAt: { type: Date, default: null },
  whatsappSentAt: {
    orderPlaced: { type: Date, default: null },
    orderPaid: { type: Date, default: null },
    orderShipped: { type: Date, default: null },
    orderDelivered: { type: Date, default: null },
  },
  orderConfirmedEmailSentAt: { type: Date, default: null },
  adminOrderEmailSentAt: { type: Date, default: null },
  statusEmailSentAt: { type: mongoose.Schema.Types.Mixed, default: {} },
  returnReason: String,
  notes: String,
  coinsRedeemed: { type: Number, default: 0 },
  walletDiscount: { type: Number, default: 0 },
  coinsEarned: { type: Number, default: 0 },
  rewardsCredited: { type: Boolean, default: false },
  
  // Razorpay Payment Fields
  razorpayPaymentId: { type: String, index: true },        // Razorpay payment ID (if card payment)
  razorpayOrderId: String,                                  // Razorpay order ID
  razorpaySignature: String,                                // Webhook signature for verification
  razorpaySettlement: RazorpaySettlementSchema,            // Settlement details
  stripeCheckoutSessionId: { type: String, index: true },
  stripePaymentStatus: { type: String, default: null },

  // Tamara BNPL
  tamaraOrderId: { type: String, index: true },             // Tamara order ID (if BNPL payment)
  tabbyPaymentId: { type: String, index: true },            // Tabby payment ID (if BNPL payment)
  
  // Return & Replacement
  returns: [{
    itemIndex: Number,
    reason: String,
    type: { type: String, enum: ['RETURN', 'REPLACEMENT'], default: 'RETURN' },
    status: { type: String, enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED'], default: 'REQUESTED' },
    description: String,
    images: [String],
    requestedAt: { type: Date, default: Date.now },
    approvedAt: Date,
    rejectionReason: String,
    sellerNotes: String,
  }],

  // Delivery Reviews
  deliveryReviews: [{
    userId: String,
    rating: { type: Number, min: 1, max: 5 },
    reviewText: String,
    images: [String],
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
  }],
  averageDeliveryRating: { type: Number, default: 0 },

  trackingContext: {
    anonymousId: { type: String, default: null },
    sessionId: { type: String, default: null },
    fbp: { type: String, default: null },
    fbc: { type: String, default: null },
    eventSourceUrl: { type: String, default: null },
  },
  attribution: {
    utmSource: { type: String, default: null },
    utmMedium: { type: String, default: null },
    utmCampaign: { type: String, default: null },
    utmContent: { type: String, default: null },
    utmTerm: { type: String, default: null },
    utmId: { type: String, default: null },
    utmReferrer: { type: String, default: null },
  },

  manualStoreOrder: { type: Boolean, default: false },
  storeCreatedByUid: { type: String, default: null },
  storeCreatedByName: { type: String, default: null },
  paymentReferenceId: { type: String, default: null },

  // Manual discount applied by store staff when creating an order
  manualDiscount: {
    type: { type: String, default: null },        // 'fixed' | 'percentage'
    value: { type: Number, default: null },        // entered value (AED or %)
    amount: { type: Number, default: null },        // resolved discount amount in currency
    originalTotal: { type: Number, default: null }, // total before the manual discount
  },

  communicationLog: [{
    channel: { type: String, default: 'system' },
    template: { type: String, default: '' },
    label: { type: String, default: '' },
    status: { type: String, default: 'sent' },
    recipient: { type: String, default: '' },
    sentByUid: { type: String, default: null },
    sentByName: { type: String, default: 'System' },
    details: { type: String, default: '' },
    sentAt: { type: Date, default: Date.now },
  }],

  paymentFailedFollowUp: {
    reason: { type: String, default: null },
    discountAmount: { type: Number, default: null },
    discountType: { type: String, default: null },
    discountValue: { type: Number, default: null },
    originalTotal: { type: Number, default: null },
    adjustedTotal: { type: Number, default: null },
    savedAt: { type: Date, default: null },
    savedByUid: { type: String, default: null },
    savedByName: { type: String, default: null },
    savedByEmail: { type: String, default: null },
    paymentMethod: { type: String, default: null },
    previousPaymentMethod: { type: String, default: null },
  },

  // Warehouse packing (Android / store Packed button)
  warehousePacking: {
    packed: { type: Boolean, default: false, index: true },
    packedAt: { type: Date, default: null },
    packedByUid: { type: String, default: null },
    packedByName: { type: String, default: null },
    packedByEmail: { type: String, default: null },
    previousStatus: { type: String, default: null },
    notes: { type: String, default: null },
    emailSentAt: { type: Date, default: null },
  },

  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: String, default: null },
  deletedByName: { type: String, default: null },

  // Add more fields as needed
}, { timestamps: true });

// Indexes for query performance
OrderSchema.index({ userId: 1, createdAt: -1 });              // Fetch user orders sorted by date
OrderSchema.index({ userId: 1, status: 1 });                  // Filter user orders by status
OrderSchema.index({ userId: 1, isCouponUsed: 1 });            // Coupon eligibility checks
OrderSchema.index({ storeId: 1, createdAt: -1 });             // Store order history
OrderSchema.index({ storeId: 1, status: 1, createdAt: -1 }); // Store dashboard filtered by status
OrderSchema.index({ status: 1, createdAt: -1 });              // Global status queries / admin
OrderSchema.index({ userId: 1, 'coupon.code': 1 });           // Per-user coupon usage checks
OrderSchema.index({ isGuest: 1, guestEmail: 1 });             // Link guest orders by email
OrderSchema.index({ storeId: 1, deletedAt: 1, createdAt: -1 });
OrderSchema.index({ isGuest: 1, guestPhone: 1 });             // Link guest orders by phone
OrderSchema.index({ storeId: 1, 'warehousePacking.packed': 1, 'warehousePacking.packedAt': -1 });
OrderSchema.index({ 'waslah.autoShipStatus': 1, 'waslah.autoShipNextRetryAt': 1 });

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);
