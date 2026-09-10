import mongoose from "mongoose";

const ShippingOptionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, trim: true, required: true },
  enabled: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  estimatedDays: { type: String, default: "3-5" },
  shippingType: {
    type: String,
    enum: ["FLAT_RATE", "PER_ITEM", "WEIGHT_BASED", "FREE"],
    default: "FLAT_RATE",
  },
  flatRate: { type: Number, default: 0 },
  perItemFee: { type: Number, default: 0 },
  maxItemFee: Number,
  weightUnit: { type: String, default: "kg" },
  baseWeight: { type: Number, default: 1 },
  baseWeightFee: { type: Number, default: 0 },
  additionalWeightFee: { type: Number, default: 0 },
  availableStates: [{ type: String, trim: true }],
  sortOrder: { type: Number, default: 0 },
}, { _id: false });

const ShippingSettingSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, unique: true },
  enabled: { type: Boolean, default: true },
  shippingType: { type: String, default: "FLAT_RATE" },
  flatRate: { type: Number, default: 5 },
  perItemFee: { type: Number, default: 2 },
  maxItemFee: Number,
  weightUnit: { type: String, default: "kg" },
  baseWeight: { type: Number, default: 1 },
  baseWeightFee: { type: Number, default: 5 },
  additionalWeightFee: { type: Number, default: 2 },
  freeShippingMin: { type: Number, default: 100 },
  enableProductSpecificFreeShipping: { type: Boolean, default: false },
  productSpecificFreeShippingMode: {
    type: String,
    enum: ["ORDER_LEVEL", "MARKED_ITEMS_ONLY"],
    default: "ORDER_LEVEL"
  },
  localDeliveryFee: Number,
  regionalDeliveryFee: Number,
  estimatedDays: { type: String, default: "2-5" },
  enableCOD: { type: Boolean, default: true },
  enableCard: { type: Boolean, default: true },
  enableTabby: { type: Boolean, default: true },
  enableTamara: { type: Boolean, default: true },
  codFee: { type: Number, default: 0 },
  maxCODAmount: { type: Number, default: 0 },
  maxCardAmount: { type: Number, default: 0 },
  maxTabbyAmount: { type: Number, default: 0 },
  maxTamaraAmount: { type: Number, default: 0 },
  enableExpressShipping: { type: Boolean, default: false },
  expressShippingFee: { type: Number, default: 20 },
  expressEstimatedDays: { type: String, default: "1-2" },
  stateCharges: [
    {
      state: { type: String, trim: true },
      fee: { type: Number, default: 0 }
    }
  ],
  shippingOptions: [ShippingOptionSchema],
}, { timestamps: true });

export default mongoose.models.ShippingSetting || mongoose.model("ShippingSetting", ShippingSettingSchema);
