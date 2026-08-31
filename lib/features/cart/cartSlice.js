import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import axios from 'axios'
import { auth } from '@/lib/firebase'

const CART_CLEARED_AT_KEY = 'cartClearedAt'
const CART_CLEARED_GRACE_MS = 120000

export function markCartClearedLocally() {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(CART_CLEARED_AT_KEY, String(Date.now()))
    } catch {}
}

export function clearCartClearedLocally() {
    if (typeof window === 'undefined') return
    try {
        localStorage.removeItem(CART_CLEARED_AT_KEY)
    } catch {}
}

export function wasCartClearedRecently() {
    if (typeof window === 'undefined') return false
    try {
        const clearedAt = Number(localStorage.getItem(CART_CLEARED_AT_KEY) || 0)
        return clearedAt > 0 && Date.now() - clearedAt < CART_CLEARED_GRACE_MS
    } catch {
        return false
    }
}

function toPlainCart(cart) {
    if (!cart) return {}
    if (cart instanceof Map) return Object.fromEntries(cart.entries())
    if (typeof cart?.entries === 'function' && typeof cart?.get === 'function') {
        try {
            return Object.fromEntries(cart.entries())
        } catch {
            // fall through
        }
    }
    if (typeof cart === 'object') {
        const out = {}
        for (const [key, value] of Object.entries(cart)) {
            if (value != null) out[key] = value
        }
        return out
    }
    return {}
}

const getEntryQty = (entry) => {
    if (typeof entry === 'number') return entry
    return entry?.quantity || 0
}

const getCartTotalQty = (cartItems = {}) => {
    return Object.values(cartItems).reduce((acc, entry) => acc + (getEntryQty(entry) || 0), 0)
}

export const uploadCart = createAsyncThunk('cart/uploadCart', 
    async ({ getToken } = {}, thunkAPI) => {
        try {
            const { cartItems } = thunkAPI.getState().cart;

            let token = null
            if (typeof getToken === 'function') {
                token = await getToken();
            } else if (auth?.currentUser) {
                token = await auth.currentUser.getIdToken();
            }

            if (!token) {
                return { success: true, skipped: true }
            }
            
            const config = { headers: { Authorization: `Bearer ${token}` } };

            // After an intentional clear, push empty cart — never re-upload items
            // that fetchCart raced back in for signed-in seller sessions.
            const cartPayload = (wasCartClearedRecently() && Object.keys(cartItems || {}).length > 0)
                ? {}
                : (cartItems || {});

            await axios.post('/api/cart', { cart: cartPayload }, config)
            return { success: true }
        } catch (error) {
            const details = error?.response?.data;
            const hasDetails = details && (typeof details !== 'object' || Object.keys(details).length > 0);
            if (hasDetails || error?.message) {
                console.warn('[uploadCart] warning:', details || error.message);
            }
            return thunkAPI.rejectWithValue(error.response?.data || { error: 'Failed to upload cart' })
        }
    }
)

export const fetchCart = createAsyncThunk('cart/fetchCart', 
    async ({ getToken }, thunkAPI) => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/cart', {headers: { Authorization: `Bearer ${token}` }})
            return data
        } catch (error) {
            return thunkAPI.rejectWithValue(error.response?.data || { error: 'Failed to fetch cart' })
        }
    }
)


const cartSlice = createSlice({
    name: 'cart',
    initialState: (() => {
        // Guard against SSR: only read localStorage in the browser
        if (typeof window === 'undefined') {
            return { total: 0, cartItems: {} };
        }
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem('cartState'));
        } catch {}
        return saved || { total: 0, cartItems: {} };
    })(),
    reducers: {
        rehydrateCart: (state, action) => {
            if (typeof window === 'undefined') {
                return;
            }
            let saved = null;
            const raw = localStorage.getItem('cartState');
            try {
                saved = JSON.parse(raw);
            } catch (e) {
                console.error('[cartSlice] Failed to parse cartState:', e);
            }
            
            // ONLY rehydrate if localStorage has items AND current state is empty
            const hasLocalItems = saved && saved.cartItems && Object.keys(saved.cartItems).length > 0;
            const currentIsEmpty = Object.keys(state.cartItems).length === 0;
            const force = !!action?.payload?.force;
            
            if (wasCartClearedRecently() && !hasLocalItems) {
                state.cartItems = {};
                state.total = 0;
                return;
            }

            if (hasLocalItems && (currentIsEmpty || force)) {
                if (wasCartClearedRecently() && force) {
                    // Another tab wrote items during clear-grace — keep cleared unless user re-added
                    // (re-add clears the grace flag via addToCart).
                    return;
                }
                state.cartItems = saved.cartItems;
                state.total = getCartTotalQty(saved.cartItems || {});
            } else if (force && (!saved || !saved.cartItems)) {
                state.cartItems = {};
                state.total = 0;
            }
        },
        addToCart: (state, action) => {
            clearCartClearedLocally()
            const { productId, maxQty, price, variantOptions, offerToken, discountPercent } = action.payload || {}
            const existingEntry = state.cartItems[productId]
            const existingQty = getEntryQty(existingEntry)
            const nextQty = existingQty + 1
            if (typeof maxQty === 'number' && nextQty > Math.max(0, maxQty)) {
                return
            }

            if (typeof existingEntry === 'object' && existingEntry !== null) {
                state.cartItems[productId] = {
                    ...existingEntry,
                    quantity: nextQty,
                    ...(price !== undefined ? { price } : {}),
                    ...(variantOptions !== undefined ? { variantOptions } : {}),
                    ...(offerToken !== undefined ? { offerToken } : {}),
                    ...(discountPercent !== undefined ? { discountPercent } : {}),
                }
            } else if (price !== undefined || variantOptions !== undefined || offerToken !== undefined || discountPercent !== undefined) {
                state.cartItems[productId] = {
                    quantity: nextQty,
                    ...(price !== undefined ? { price } : {}),
                    ...(variantOptions !== undefined ? { variantOptions } : {}),
                    ...(offerToken !== undefined ? { offerToken } : {}),
                    ...(discountPercent !== undefined ? { discountPercent } : {}),
                }
            } else {
                state.cartItems[productId] = nextQty
            }

            state.total = getCartTotalQty(state.cartItems)
        },
        removeFromCart: (state, action) => {
            const { productId } = action.payload
            const existing = state.cartItems[productId]
            const existingQty = getEntryQty(existing)
            if (!existingQty) return
            const nextQty = existingQty - 1
            if (nextQty <= 0) {
                delete state.cartItems[productId]
            } else {
                if (typeof existing === 'object' && existing !== null) {
                    state.cartItems[productId] = {
                        ...existing,
                        quantity: nextQty,
                    }
                } else {
                    state.cartItems[productId] = nextQty
                }
            }
            state.total = getCartTotalQty(state.cartItems)
            if (Object.keys(state.cartItems).length === 0) {
                markCartClearedLocally()
            }
        },
        deleteItemFromCart: (state, action) => {
            const { productId } = action.payload || {}
            if (!productId) return
            delete state.cartItems[productId]
            state.total = getCartTotalQty(state.cartItems)
            if (Object.keys(state.cartItems).length === 0) {
                markCartClearedLocally()
            }
        },
        setCartItemQuantity: (state, action) => {
            const { productId, quantity } = action.payload || {}
            if (!productId) return
            const newQty = Number(quantity)
            if (!newQty || newQty <= 0) {
                delete state.cartItems[productId]
            } else {
                const existing = state.cartItems[productId]
                if (typeof existing === 'object' && existing !== null) {
                    state.cartItems[productId] = { ...existing, quantity: newQty }
                } else {
                    state.cartItems[productId] = newQty
                }
            }
            state.total = getCartTotalQty(state.cartItems)
            if (Object.keys(state.cartItems).length === 0) {
                markCartClearedLocally()
            }
        },
        setCartEntry: (state, action) => {
            const { productId, entry } = action.payload || {}
            if (!productId || !entry || typeof entry !== 'object') return
            clearCartClearedLocally()
            state.cartItems[productId] = entry
            state.total = getCartTotalQty(state.cartItems)
        },
        clearCart: (state) => {
            state.cartItems = {}
            state.total = 0
            markCartClearedLocally()
        },
    },
    extraReducers: (builder)=>{
        builder.addCase(fetchCart.fulfilled, (state, action)=>{
            // Seller/signed-in accounts fetch often (navbar + focus). During clear-grace,
            // never rehydrate the deleted last item from a stale server cart — and wipe
            // any items a raced fetch already restored into local state.
            if (wasCartClearedRecently()) {
                state.cartItems = {};
                state.total = 0;
                return;
            }

            const serverCart = toPlainCart(action.payload?.cart);
            const serverKeys = Object.keys(serverCart);

            if (serverKeys.length > 0) {
                state.cartItems = serverCart;
            }
            // If the server cart is empty, keep the local cart (guest session or pending sync).
            state.total = getCartTotalQty(state.cartItems);
        })
    }
})

export const { addToCart, removeFromCart, clearCart, deleteItemFromCart, setCartItemQuantity, setCartEntry } = cartSlice.actions

export default cartSlice.reducer
