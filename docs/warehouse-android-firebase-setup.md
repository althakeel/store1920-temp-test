# Firebase Setup — Warehouse Android App

Guide to connect your **Android warehouse app** to the same Firebase project used by **Store1920** (web store + seller dashboard).

After Firebase login, the app gets an **ID token** and calls Store1920 APIs (inventory, stock update). See also: [Warehouse Inventory API](./warehouse-inventory-api.md).

---

## Overview

```
Android App
    ↓
Firebase Auth (Email/Password or Google)
    ↓
Firebase ID Token
    ↓
GET /api/store/is-seller          ← verify store access
    ↓
GET/PATCH /api/store/inventory    ← search product + update stock
```

**Important:** Firebase only handles **login**. Store access (which store, permissions) is checked by the Store1920 backend using the same token.

---

## Firebase project (shared with Store1920)

Store1920 web app uses this Firebase project. Your Android app must use the **same project**.

| Setting | Value |
|---------|-------|
| **Project ID** | `store1920-7d673` |
| **Auth domain** | `store1920-7d673.firebaseapp.com` |
| **Storage bucket** | `store1920-7d673.firebasestorage.app` |

### Web client config (reference)

These values come from **Firebase Console → Project settings → Your apps → Web app**. They match `NEXT_PUBLIC_FIREBASE_*` in the Store1920 `.env`:

```json
{
  "apiKey": "YOUR_API_KEY",
  "authDomain": "store1920-7d673.firebaseapp.com",
  "projectId": "store1920-7d673",
  "storageBucket": "store1920-7d673.firebasestorage.app",
  "messagingSenderId": "YOUR_SENDER_ID",
  "appId": "YOUR_WEB_APP_ID",
  "measurementId": "YOUR_MEASUREMENT_ID"
}
```

> Android uses **`google-services.json`**, not this JSON directly — but both must be from the **same Firebase project**.

---

## Step 1 — Firebase Console: add Android app

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select project **`store1920-7d673`**
3. Click **Add app** → **Android**
4. Fill in:
   - **Android package name** — e.g. `com.store1920.warehouse` (must match your app `applicationId`)
   - **App nickname** — e.g. `Store1920 Warehouse`
   - **Debug signing certificate SHA-1** — required if you use **Google Sign-In** (optional for email/password only)
5. Download **`google-services.json`**
6. Place it in your Android project:

```
app/
  google-services.json
```

---

## Step 2 — Enable Authentication

1. Firebase Console → **Authentication** → **Sign-in method**
2. Enable methods you need:

| Method | Warehouse app | Notes |
|--------|---------------|-------|
| **Email/Password** | Recommended | Same as `/store/login` |
| **Google** | Optional | Needs SHA-1 + OAuth client setup |

3. **Users** tab — warehouse staff must already exist here (created via store invite, or owner account from `/create-store`).

### Who can log in?

A user must:

1. Have a **Firebase account** (email/password or Google)
2. Be linked to a **store** as owner or team member
3. Have **Inventory** permission (for stock APIs)

The app checks this with `GET /api/store/is-seller` after login.

---

## Step 3 — Android Gradle setup

### Project `build.gradle` (or `build.gradle.kts`)

```kotlin
plugins {
    id("com.google.gms.google-services") version "4.4.2" apply false
}
```

### App `build.gradle` (or `build.gradle.kts`)

```kotlin
plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

dependencies {
    // Firebase BOM (keeps versions aligned)
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-auth-ktx")

    // HTTP client for Store1920 API
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.11.0")
}
```

Sync Gradle after adding `google-services.json`.

---

## Step 4 — Initialize Firebase in Android

### `Application` class (optional but recommended)

```kotlin
import android.app.Application
import com.google.firebase.FirebaseApp

class WarehouseApp : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
    }
}
```

Register in `AndroidManifest.xml`:

```xml
<application
    android:name=".WarehouseApp"
    ...>
```

---

## Step 5 — Sign in (Email + Password)

Use the **same email and password** as the seller dashboard (`/store/login`).

```kotlin
import com.google.firebase.auth.FirebaseAuth

class AuthRepository {
    private val auth = FirebaseAuth.getInstance()

    suspend fun signInWithEmail(email: String, password: String): String {
        val result = auth.signInWithEmailAndPassword(email.trim(), password).await()
        val user = result.user ?: throw Exception("Login failed")
        return user.getIdToken(true).await().token
            ?: throw Exception("Could not get ID token")
    }

    fun signOut() = auth.signOut()

    fun currentUser() = auth.currentUser

    suspend fun getIdToken(forceRefresh: Boolean = false): String? {
        return auth.currentUser?.getIdToken(forceRefresh)?.await()?.token
    }
}
```

> Use `kotlinx-coroutines-play-services` for `.await()` on Firebase tasks:
> `implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")`

---

## Step 6 — Verify store access

After login, confirm the user is a seller before showing the warehouse UI.

```http
GET https://YOUR-DOMAIN.com/api/store/is-seller
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

### Kotlin example

```kotlin
suspend fun checkSellerAccess(idToken: String): SellerAccess {
    val request = Request.Builder()
        .url("$BASE_URL/api/store/is-seller")
        .addHeader("Authorization", "Bearer $idToken")
        .get()
        .build()

    val response = client.newCall(request).execute()
    val body = gson.fromJson(response.body?.string(), SellerAccessResponse::class.java)

    if (!body.isSeller) {
        throw Exception("No store access: ${body.reason}")
    }
    return body
}
```

### Success response

```json
{
  "isSeller": true,
  "userId": "firebase-uid-here",
  "isOwner": false,
  "accessRole": "member",
  "permissions": { "inventory": true, "orders": true },
  "storeInfo": {
    "_id": "store-mongo-id",
    "name": "My Store",
    "username": "mystore"
  }
}
```

### Not a seller

```json
{
  "isSeller": false,
  "reason": "not-seller-or-not-approved"
}
```

Show an error and sign out if `isSeller` is `false`.

---

## Step 7 — Call inventory APIs with the token

Every Store1920 API request:

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json
```

### Token helper (reuse everywhere)

```kotlin
class ApiClient(
    private val authRepository: AuthRepository,
    private val baseUrl: String
) {
    suspend fun authorizedRequest(builder: Request.Builder): Request {
        val token = authRepository.getIdToken() ?: throw Exception("Not logged in")
        return builder
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .build()
    }
}
```

### Example: scan SKU → add stock

```kotlin
// 1. Search product
val searchUrl = "$baseUrl/api/store/inventory?q=${Uri.encode(sku)}&historyOnly=false"
val searchReq = apiClient.authorizedRequest(Request.Builder().url(searchUrl).get())
val product = /* parse items[0] */

// 2. Add stock
val body = JSONObject()
    .put("productId", product.id)
    .put("stockToAdd", quantity)
    .toString()
    .toRequestBody("application/json".toMediaType())

val patchReq = apiClient.authorizedRequest(
    Request.Builder().url("$baseUrl/api/store/inventory").patch(body)
)
```

Full API details: [warehouse-inventory-api.md](./warehouse-inventory-api.md)

---

## Step 8 — Token refresh

Firebase ID tokens expire after **~1 hour**.

| When | What to do |
|------|------------|
| Before each API call | `getIdToken(false)` — uses cached token if valid |
| After `401 Unauthorized` | `getIdToken(true)` — force refresh, retry once |
| App start | If `FirebaseAuth.currentUser != null`, refresh token and call `is-seller` |

```kotlin
suspend fun getValidToken(): String {
    val user = FirebaseAuth.getInstance().currentUser
        ?: throw Exception("Session expired. Please sign in again.")
    return user.getIdToken(false).await().token
        ?: throw Exception("Could not get token")
}
```

---

## Optional — Google Sign-In on Android

If you want Google login (same as web dashboard):

1. Firebase Console → Project settings → Your Android app → add **SHA-1** fingerprint:

```bash
# Debug keystore (Windows)
keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```

2. Download updated `google-services.json`
3. Add dependency:

```kotlin
implementation("com.google.android.gms:play-services-auth:21.2.0")
```

4. Use Google Sign-In → exchange for Firebase credential:

```kotlin
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.firebase.auth.GoogleAuthProvider

val account = GoogleSignIn.getSignedInAccountFromIntent(data).await()
val credential = GoogleAuthProvider.getCredential(account.idToken, null)
val result = FirebaseAuth.getInstance().signInWithCredential(credential).await()
val idToken = result.user?.getIdToken(true)?.await()?.token
```

**Email/password is simpler** for a warehouse device app.

---

## API base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://store1920.com` (or your live domain) |
| Local dev | `http://10.0.2.2:3000` (Android emulator → host machine) |
| Physical device on LAN | `http://YOUR_PC_IP:3000` |

Store in `BuildConfig` or `local.properties`:

```properties
STORE1920_API_URL=https://store1920.com
```

---

## Data models (Kotlin)

```kotlin
data class SellerAccessResponse(
    val isSeller: Boolean,
    val reason: String? = null,
    val userId: String? = null,
    val isOwner: Boolean = false,
    val accessRole: String? = null,
    val storeInfo: StoreInfo? = null
)

data class StoreInfo(
    val _id: String,
    val name: String?,
    val username: String?
)

data class InventoryProduct(
    val _id: String,
    val name: String,
    val sku: String,
    val hasVariants: Boolean,
    val stockQuantity: Int,
    val currentStock: Int,
    val inStock: Boolean,
    val variantStocks: List<VariantStock> = emptyList(),
    val image: String?
)

data class VariantStock(
    val index: Int,
    val label: String,
    val stock: Int
)
```

---

## Security checklist

| Item | Action |
|------|--------|
| `google-services.json` | Commit to private repo only; contains project identifiers |
| API keys in Firebase | Client API keys are public by design; restrict in [Google Cloud Console](https://console.cloud.google.com/) if needed |
| HTTPS | Use HTTPS in production, never plain HTTP |
| Token storage | Keep token in memory; rely on Firebase Auth persistence for session |
| Logout | Call `FirebaseAuth.signOut()` when user logs out |
| Permissions | Check `is-seller` response; hide stock UI if `inventory` permission is false |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `CONFIGURATION_NOT_FOUND` / Firebase init fails | Wrong `google-services.json` or package name mismatch |
| `auth/invalid-credential` | Wrong email/password |
| `isSeller: false` | User not added to store team, or store not approved |
| `401` on inventory API | Token missing/expired — refresh with `getIdToken(true)` |
| `Product not found` | SKU belongs to another store, or wrong `historyOnly` flag |
| Emulator cannot reach localhost | Use `10.0.2.2` instead of `127.0.0.1` |
| Google Sign-In fails | Add SHA-1 to Firebase, update `google-services.json` |

### Debug Firebase config (server)

```http
GET https://YOUR-DOMAIN.com/api/debug/firebase-client
```

Returns project ID, auth domain, and setup hints (no secrets).

---

## Recommended app screens

1. **Login** — email + password
2. **Loading** — verify `is-seller`
3. **Home** — scan barcode / search SKU
4. **Product detail** — name, image, current stock, variants
5. **Add stock** — quantity input → PATCH inventory
6. **Success** — show new stock + optional history link
7. **Settings** — logout, store name from `storeInfo`

---

## Quick start checklist

- [ ] Create Android app in Firebase project `store1920-7d673`
- [ ] Download `google-services.json` into `app/`
- [ ] Enable **Email/Password** in Firebase Authentication
- [ ] Add Firebase Auth dependency in Gradle
- [ ] Implement login → `getIdToken()`
- [ ] Call `GET /api/store/is-seller` after login
- [ ] Call inventory APIs with `Authorization: Bearer <token>`
- [ ] Handle token refresh on 401
- [ ] Test with a real store team account that has Inventory access

---

## Related docs

| Document | Purpose |
|----------|---------|
| [warehouse-inventory-api.md](./warehouse-inventory-api.md) | Product search, stock update, history APIs |
| [warehouse-app-emx-tracking-pickup.md](./warehouse-app-emx-tracking-pickup.md) | EMX tracking, pickup, labels, order details |
| [warehouse-tracking-api.md](./warehouse-tracking-api.md) | Tracking API short reference |
| [warehouse-order-packing-api.md](./warehouse-order-packing-api.md) | Pack button / packed history |
| Store web login | `/store/login` |
| Store inventory UI | `/store/inventory` |

---

## Changelog

| Date | Notes |
|------|-------|
| 2026-06-16 | Initial Firebase Android setup guide |
