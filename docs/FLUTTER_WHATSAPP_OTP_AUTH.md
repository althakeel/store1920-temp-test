# Store1920 WhatsApp OTP authentication — Flutter integration

Last updated: 11 September 2026  
Audience: Flutter / mobile app developers  
Web reference: `app/api/auth/whatsapp-otp`, `lib/whatsappOtpAuth.js`, `lib/authClient.js`

This is the contract for **login and register with a WhatsApp OTP**. Do not invent a second JWT or password store. Identity is always **Firebase Auth**.

---

## 1. How it works

1. App asks Store1920 to send a 4-digit code to a UAE WhatsApp number.
2. Store1920 sends the code on WhatsApp (WABA template `store1920_otp`).
3. User types the code in the app.
4. Store1920 verifies the code and returns a **Firebase custom token**.
5. Flutter signs in with Firebase: `signInWithCustomToken(customToken)`.
6. After that, every protected API uses:

```http
Authorization: Bearer <Firebase ID token>
```

Get the ID token from Firebase (`user.getIdToken()`). Refresh it the same way the web app does. Do not persist the custom token.

Login and register use the **same two endpoints**. If the phone is new, Firebase creates the user (`isNewUser: true`). If the phone already exists, the same account is returned.

---

## 2. Base URLs

| Environment | Base URL |
|---|---|
| Production | `https://www.store1920.com` |
| Staging (if used) | `https://store1920.store` |

Use the same host the app already uses for other APIs. Prefer `www.store1920.com` in production.

Content-Type: `application/json`

---

## 3. Phone number rules

WhatsApp login is **UAE mobiles only**.

Accepted examples (all become `9715XXXXXXXX`):

| App input | `phoneCode` | Result |
|---|---|---|
| `0501234567` | `+971` | valid |
| `501234567` | `+971` | valid |
| `971501234567` | `+971` | valid |
| `+971501234567` | `+971` | valid |

Reject:

- landlines
- numbers that are not `971` + 9-digit local starting with `5`
- empty / non-digit junk

Send:

```json
{
  "phone": "0501234567",
  "phoneCode": "+971"
}
```

`countryCode` is accepted as an alias of `phoneCode`.

On **register**, also send `"name": "Full Name"` (letters, at least 2 characters). On login, `name` is optional.

---

## 4. CAPTCHA (required on first send)

The first OTP send for a number requires CAPTCHA. A **resend** while a code is still valid does **not** need a new CAPTCHA.

### 4.1 Get a math CAPTCHA

```http
GET /api/auth/captcha
```

Example response:

```json
{
  "challengeId": "abc123",
  "question": "4 + 7",
  "googleSiteKey": ""
}
```

Show `question` to the user. Send their numeric answer with the OTP request.

Optional: if `googleSiteKey` is non-empty, you may instead send a Google reCAPTCHA token as `recaptchaToken` (same as web).

---

## 5. Send WhatsApp OTP

```http
POST /api/auth/whatsapp-otp
```

### Request

```json
{
  "phone": "0501234567",
  "phoneCode": "+971",
  "name": "Ahmed Ali",
  "captchaChallengeId": "abc123",
  "captchaAnswer": "11"
}
```

| Field | Required | Notes |
|---|---|---|
| `phone` | yes | UAE mobile |
| `phoneCode` | yes | `+971` |
| `name` | register only | stored on new users |
| `captchaChallengeId` | first send | from `GET /api/auth/captcha` |
| `captchaAnswer` | first send | user answer |
| `recaptchaToken` | optional | instead of math CAPTCHA |

### Success `200`

```json
{
  "ok": true,
  "ttlSeconds": 600,
  "maskedPhone": "971****567",
  "message": "We sent a WhatsApp code to 971****567."
}
```

- OTP length: **4 digits** (`AUTH_WHATSAPP_OTP_LENGTH=4`)
- OTP lifetime: **10 minutes** (`ttlSeconds`: 600)
- Resend cooldown: **45 seconds**
- Max sends: **5 codes per 15 minutes** per number

### Errors

| Status | Meaning | App action |
|---|---|---|
| `400` | Bad phone or CAPTCHA failed | Show `error`, reload CAPTCHA |
| `423` | Account locked (5 wrong codes) | Show `error`, wait `retryAfterSeconds` (15 min lock) |
| `429` | Resend too soon / too many sends | Disable Resend for `retryAfterSeconds` |
| `503` | WhatsApp not configured | Show `error`, retry later |

Example error:

```json
{
  "error": "Please wait 32s before requesting another code.",
  "retryAfterSeconds": 32
}
```

---

## 6. Verify OTP and sign in

```http
PUT /api/auth/whatsapp-otp
```

### Request

```json
{
  "phone": "0501234567",
  "phoneCode": "+971",
  "code": "1234",
  "name": "Ahmed Ali"
}
```

`code` is the 4-digit WhatsApp message. Digits only.

### Success `200`

```json
{
  "ok": true,
  "customToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "isNewUser": false,
  "email": "",
  "name": "Ahmed Ali",
  "phone": "+971501234567",
  "linkedOrderCount": 0
}
```

| Field | Meaning |
|---|---|
| `customToken` | Firebase custom token — use once, immediately |
| `isNewUser` | `true` if this phone created a new Firebase user |
| `phone` | E.164 (`+9715…`) |
| `linkedOrderCount` | Guest checkout orders linked to this account by phone |

### Errors

| Status | Meaning |
|---|---|
| `400` | Invalid / expired code |
| `423` | Locked after 5 failed verifies |
| `503` | Firebase account create/token failed |

Wrong codes count toward lockout (5 failures → 15 minutes).

---

## 7. Flutter: Firebase sign-in

Use the **same Firebase project** as the website (same `apiKey`, `appId`, `projectId`).

```dart
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

const baseUrl = 'https://www.store1920.com';

Future<UserCredential> signInWithWhatsAppOtp({
  required String phone,
  required String phoneCode,
  required String code,
  String name = '',
}) async {
  final verify = await http.put(
    Uri.parse('$baseUrl/api/auth/whatsapp-otp'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'phone': phone,
      'phoneCode': phoneCode,
      'code': code,
      'name': name,
    }),
  );

  final body = jsonDecode(verify.body) as Map<String, dynamic>;
  if (verify.statusCode != 200 || body['ok'] != true) {
    throw Exception(body['error'] ?? 'Could not verify WhatsApp code');
  }

  final customToken = body['customToken'] as String;
  final credential = await FirebaseAuth.instance.signInWithCustomToken(customToken);

  // ID token for Store1920 APIs
  final idToken = await credential.user!.getIdToken();

  await http.post(
    Uri.parse('$baseUrl/api/auth/login-result'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'email': body['email'] ?? credential.user?.email ?? '',
      'success': true,
      'idToken': idToken,
    }),
  );

  return credential;
}
```

### After sign-in

1. Keep the Firebase user with default persistence (survives app restart).
2. For cart, orders, profile, wishlist, send `Authorization: Bearer $idToken`.
3. Refresh the ID token before it expires (~1 hour): `user.getIdToken(true)` when you get `401`.

### Send-OTP example

```dart
Future<Map<String, dynamic>> sendWhatsAppOtp({
  required String phone,
  required String phoneCode,
  required String captchaChallengeId,
  required String captchaAnswer,
  String name = '',
}) async {
  final res = await http.post(
    Uri.parse('$baseUrl/api/auth/whatsapp-otp'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'phone': phone,
      'phoneCode': phoneCode,
      'name': name,
      'captchaChallengeId': captchaChallengeId,
      'captchaAnswer': captchaAnswer,
    }),
  );
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  if (res.statusCode != 200 || body['ok'] != true) {
    throw Exception(body['error'] ?? 'Could not send WhatsApp code');
  }
  return body;
}
```

---

## 8. Suggested app UI

1. Phone field + country `+971`.
2. Name field if this is “Create account”.
3. Math CAPTCHA from `GET /api/auth/captcha`.
4. Button: **Send WhatsApp code**.
5. 4-digit OTP input + **Verify**.
6. Resend disabled for 45 seconds (`retryAfterSeconds` if the API returns it).
7. Show `maskedPhone` / `message` so the user knows where the code went.

Do not ask for a password on this path.

---

## 9. Related APIs (same auth system)

| Call | When |
|---|---|
| `GET /api/auth/captcha` | Before first OTP send |
| `POST /api/auth/login-result` | After Firebase sign-in (records session, lockout reset) |
| `GET /api/profile` | Load account (needs Bearer token) |
| `DELETE /api/auth/sessions` | Sign out this device or all devices |

Password reset over WhatsApp is a **different** route: `POST|PUT /api/auth/password-reset` with WhatsApp OTP. Do not use `/api/auth/whatsapp-otp` for password reset.

---

## 10. Do not

- Do not build a custom JWT instead of Firebase.
- Do not store or reuse `customToken` after `signInWithCustomToken`.
- Do not send the OTP to any other WhatsApp API — Store1920 sends it.
- Do not skip CAPTCHA on the first send.
- Do not use a non-UAE number; the API will return `400`.
- Do not treat a new tab / new app install as a new account if the same Firebase project + same phone is used. Same phone = same Firebase user.

---

## 11. Web vs app (same backend)

The website Sign In modal uses these exact endpoints. If the Flutter app matches this document, login, register, guest-order linking, and lockout behave the same as web.

Questions: use this file plus `docs/AUTH_SECURITY.md` and `APP_API_REQUIREMENTS.md`.
