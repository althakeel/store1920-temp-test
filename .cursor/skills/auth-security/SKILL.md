---
name: auth-security
description: Store1920 customer auth security on Firebase — password policy, CAPTCHA, lockout, MFA OTP, email/phone verify, sessions, logout-all. Use when editing SignInModal, /api/auth/*, AuthSessionGuard, or /dashboard/security.
---

# Auth security skill

## Architecture

- **Identity & password hashes**: Firebase Auth only (never store passwords in Mongo).
- **App security layer**: Mongo models `AuthSecurity`, `AuthSession`, `AuthOtp` + routes under `app/api/auth/`.

## Do

- Enforce `validatePasswordStrength` from `lib/passwordPolicy.js` on register and reset.
- Gate email/password login with `/api/auth/pre-login` (CAPTCHA + lockout) and record outcomes via `/api/auth/login-result`.
- WhatsApp OTP login uses `/api/auth/whatsapp-otp` + Firebase custom tokens (still Firebase identity, not a parallel JWT stack). Link guest orders by the verified phone the same way email linking works.
- Password reset is available on Email OTP (6 digits) and WhatsApp OTP (4 digits) via `/api/auth/password-reset`. Send the same transactional OTP email as login — do not skip store SMTP.
- Keep English copy on customer security UI consistent with existing dashboard pages.
- On logout-all, call Firebase `revokeRefreshTokens` (already in `lib/authSessions.js`).

## Don't

- Do not add a parallel bcrypt/JWT auth stack for customers.
- Do not commit secrets or service account JSON.
- Do not weaken lockout (`AUTH_LOCK`) without an explicit product decision.

## Key files

- `lib/passwordPolicy.js`, `lib/authSecurity.js`, `lib/authSessions.js`, `lib/authOtp.js`, `lib/authClient.js`
- `components/SignInModal.jsx`, `components/AuthSessionGuard.jsx`
- `app/dashboard/security/page.jsx`
- `docs/AUTH_SECURITY.md`
