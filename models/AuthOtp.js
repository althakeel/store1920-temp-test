import mongoose from 'mongoose';

const AuthOtpSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, index: true }, // email or uid or phone
    purpose: {
      type: String,
      enum: ['mfa', 'email_verify', 'phone_verify', 'password_reset', 'password_reset_token'],
      required: true,
    },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AuthOtpSchema.index({ key: 1, purpose: 1 });

export default mongoose.models.AuthOtp
  || mongoose.model('AuthOtp', AuthOtpSchema);
