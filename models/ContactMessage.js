import mongoose from 'mongoose';

const ContactMessageSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true },
);

ContactMessageSchema.index({ createdAt: -1 });

export default mongoose.models.ContactMessage || mongoose.model('ContactMessage', ContactMessageSchema);
