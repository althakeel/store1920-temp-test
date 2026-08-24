import mongoose from 'mongoose';

const ReturnCounterSchema = new mongoose.Schema({
  storeId: { type: String, required: true, unique: true, index: true },
  seq: { type: Number, required: true, default: 0 },
}, { timestamps: true });

export default mongoose.models.ReturnCounter || mongoose.model('ReturnCounter', ReturnCounterSchema);
