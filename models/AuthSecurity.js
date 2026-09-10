import mongoose from 'mongoose';

const AuthSecuritySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // email or uid
    keyType: { type: String, enum: ['email', 'uid', 'ip', 'phone'], default: 'email' },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastFailedAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    mfaSecret: { type: String, default: '' }, // reserved / hashed seed
    emailVerifiedAt: { type: Date, default: null },
    phoneVerifiedAt: { type: Date, default: null },
    phoneE164: { type: String, default: '' },
  },
  { timestamps: true },
);

const cached = mongoose.models.AuthSecurity;
if (cached && !cached.schema.path('keyType')?.enumValues?.includes('phone')) {
  delete mongoose.models.AuthSecurity;
}

export default mongoose.models.AuthSecurity
  || mongoose.model('AuthSecurity', AuthSecuritySchema);
