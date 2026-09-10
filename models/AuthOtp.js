import mongoose from 'mongoose';

const AuthOtpSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, index: true }, // email or uid or phone
    purpose: {
      type: String,
      enum: ['mfa', 'email_verify', 'phone_verify', 'password_reset', 'password_reset_token', 'whatsapp_login', 'email_login'],
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

const cached = mongoose.models.AuthOtp;
if (cached && !cached.schema.path('purpose')?.enumValues?.includes('email_login')) {
  delete mongoose.models.AuthOtp;
}

export default mongoose.models.AuthOtp
  || mongoose.model('AuthOtp', AuthOtpSchema);
