"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Check, Tag, Truck, Zap, AlertTriangle } from "lucide-react";
import axios from "axios";
import { countryCodes, UAE_PHONE_CODE, UAE_PHONE_CODE_OPTIONS } from "@/assets/countryCodes";
import { indiaStatesAndDistricts } from "@/assets/indiaStatesAndDistricts";
import { useSelector, useDispatch } from "react-redux";
import { fetchAddress, clearAddresses } from "@/lib/features/address/addressSlice";
import {
  readGuestCheckoutState,
  writeGuestCheckoutState,
  upsertGuestAddress,
  removeGuestAddress,
  formToGuestDraft,
  normalizeGuestAddress,
  isCompleteGuestDraft,
} from "@/lib/guestCheckoutAddress";
import { clearCart, deleteItemFromCart, setCartEntry } from "@/lib/features/cart/cartSlice";
import { fetchShippingSettings, calculateShipping, cartHasOnlyFreeShippingProducts } from "@/lib/shipping";
import { getActiveCheckoutAlert } from '@/lib/checkoutAlert';
import {
  getPaymentMethodLimitError,
  isPaymentMethodEnabled,
  isPaymentMethodOverLimit,
} from '@/lib/paymentMethodLimits';
import {
  getAvailableShippingOptions,
  getDefaultShippingOption,
  getShippingOptionById,
} from '@/lib/shippingOptions';
import { trackMetaEvent } from "@/lib/metaPixelClient";
import { trackBeginCheckoutDual } from "@/lib/ecommerceTracking";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import dynamic from "next/dynamic";
import Script from "next/script";
import Link from "next/link";
import Image from "@/components/SafeNextImage";
import BnplLogo from "@/components/BnplLogo";
import { useStorefrontI18n } from "@/lib/useStorefrontI18n";
import { useStorefrontMarket } from "@/lib/useStorefrontMarket";
import { isStorefrontWalletEnabled } from "@/lib/storefrontWallet";
import { trackCustomerEvent, withOrderTrackingFields, getOrCreateAnonymousId, getOrCreateSessionId } from '@/lib/trackingClient';
import { pushGtmEcommerceEvent } from '@/lib/pushGtmEcommerceEvent';
import { cartLinesToGtmItems, cartLinesToMetaItems } from '@/lib/gtmEcommerceHelpers';
import { runTrackedOnce } from '@/lib/trackingDedupe';
import { GTM_EVENTS, gtmDedupeKey } from '@/lib/gtmEvents';
import { getCartEntryProductId, getCartEntryQuantity, isFreeGiftEntry } from "@/lib/freeGiftUtils";
import { getCartProductIdsNeedingVariants, mergeFetchedProducts } from '@/lib/cartProductFetch';
import { resolveCartLinePricing, resolveMatrixCartMaxPacks, isBulkBundleProduct, isMatrixStyleProduct, findBulkBundleVariant, getBulkBundleTiers } from "@/lib/bulkBundleCart";
import { decrementCartItem, incrementCartItem } from "@/lib/bundleCartActions";
import { STORE1920_LOGO_PATH } from "@/lib/brandLogo";
import {
  STORE1920_SUPPORT_EMAIL,
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact';
import {
  rememberPendingCheckoutOrder,
  getPendingCheckoutOrderId,
  clearPendingCheckoutOrder,
} from '@/lib/pendingCheckoutOrder';
import {
  getPhoneInputError,
  getPhoneValidationMessage,
  isValidPhoneNumber,
} from '@/lib/phoneValidation';
import { UAE_EMIRATES, getUaeAreaOptionsForEmirate, getUaeAreasForEmirate, isUaeCountry } from "@/lib/uaeEmirateAreas";
import SearchableSelect from "@/components/SearchableSelect";
import PhoneNumberField from "@/components/PhoneNumberField";
import VisaLogo from '../../../assets/creditcards/visa.png';
import MastercardLogo from '../../../assets/creditcards/mastercard.png';
import GooglePayLogo from '../../../assets/creditcards/google-pay.png';
import AmexLogo from '../../../assets/creditcards/11.webp';
import { STORE_CURRENCY } from '@/lib/storeCurrency';
import { getProductSubtitle } from '@/lib/productDisplay';
import { getProductPath } from '@/lib/productUrl';
import { collectCheckoutValidationIssues, scrollToCheckoutField } from '@/lib/checkoutValidation';
import CheckoutValidationAlert from '@/components/CheckoutValidationAlert';
import toast from 'react-hot-toast';

const SignInModal = dynamic(() => import("@/components/SignInModal"), { ssr: false });
const AddressModal = dynamic(() => import("@/components/AddressModal"), { ssr: false });
const PrepaidUpsellModal = dynamic(() => import("@/components/PrepaidUpsellModal"), { ssr: false });

function formatDeliveryDays(value, fallback = '2-5') {
  const raw = String(value || fallback).replace(/\s*days?/gi, '').trim();
  return raw ? `${raw} days` : `${fallback} days`;
}

function resolveGuestCity(values) {
  return String(values?.district || values?.state || values?.city || '').trim();
}

function getGuestCountryOptions() {
  return countryCodes.map((entry) => entry.label.replace(/ \(.*\)/, ''));
}

function getGuestCountryCode(countryName) {
  const match = countryCodes.find((entry) => entry.label.replace(/ \(.*\)/, '') === countryName);
  return match?.code || '+971';
}

const CHECKOUT_ORDER_PREVIEW_LIMIT = 4;
const CHECKOUT_RETURN_PATH_KEY = 'store1920_checkout_return_path';

function CheckoutAlertBanner({ alert, className = '' }) {
  if (!alert) return null;

  return (
    <div
      role="alert"
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold">{alert.title}</p>
          <p className="mt-1 text-sm leading-relaxed">{alert.message}</p>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPageUI({ initialCheckoutAlert = null }) {
  const { user, loading: authLoading, getToken } = useAuth();
  const dispatch = useDispatch();
  const { t, isArabic } = useStorefrontI18n();
  const { market, convertPrice } = useStorefrontMarket();
  const storefrontWalletEnabled = isStorefrontWalletEnabled();
  const addressList = useSelector((state) => state.address?.list || []);
  const addressFetchError = useSelector((state) => state.address?.error);
  const [guestAddresses, setGuestAddresses] = useState([]);
  const guestHydratedRef = useRef(false);
  const checkoutAddressList = user ? addressList : guestAddresses;
  const { cartItems } = useSelector((state) => state.cart);
  const products = useSelector((state) => state.product.list);
  
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  const [form, setForm] = useState({
    addressId: "",
    payment: "cod",
    phoneCode: '+971',
    country: 'United Arab Emirates',
    state: 'Dubai',
    district: '',
    street: '',
    city: '',
    pincode: '',
    name: '',
    email: '',
    phone: '',
    alternatePhone: '',
    alternatePhoneCode: '+971',
  });

  // For India / UAE state-area dropdowns
  const [districts, setDistricts] = useState(() => getUaeAreasForEmirate('Dubai'));
  const [placingOrder, setPlacingOrder] = useState(false);
  const [payingNow, setPayingNow] = useState(false);
  const [showPrepaidModal, setShowPrepaidModal] = useState(false);
  const [upsellOrderId, setUpsellOrderId] = useState(null);
  const [upsellOrderTotal, setUpsellOrderTotal] = useState(0);
  const [upsellToken, setUpsellToken] = useState('');
  const [navigatingToSuccess, setNavigatingToSuccess] = useState(false);
  const [shippingSetting, setShippingSetting] = useState(null);
  const [checkoutAlert, setCheckoutAlert] = useState(initialCheckoutAlert);
  const [shipping, setShipping] = useState(0);
  const [shippingMethod, setShippingMethod] = useState('');
  const [showSignIn, setShowSignIn] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showAllOrderItemsModal, setShowAllOrderItemsModal] = useState(false);
  const [removeLastItemConfirm, setRemoveLastItemConfirm] = useState(null);
  const [leavingCheckout, setLeavingCheckout] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [abandonSaved, setAbandonSaved] = useState(false);
  const [abandonHeartbeat, setAbandonHeartbeat] = useState(0);
  const [tabbyCardLoaded, setTabbyCardLoaded] = useState(false);

  // Coupon logic
  const [coupon, setCoupon] = useState("");
  const [couponError, setCouponError] = useState("");
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [storeId, setStoreId] = useState(null);
  const [formError, setFormError] = useState("");
  const [sidebarPayError, setSidebarPayError] = useState("");
  const [validationAlertOpen, setValidationAlertOpen] = useState(false);
  const [validationIssues, setValidationIssues] = useState([]);
  const [invalidFieldIds, setInvalidFieldIds] = useState(() => new Set());
  const [checkoutProductsLoaded, setCheckoutProductsLoaded] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWalletBalance, setUseWalletBalance] = useState(true);
  const beginCheckoutTrackedRef = useRef(false);
  const tabbyPublicKey = process.env.NEXT_PUBLIC_TABBY_PUBLIC_KEY || '';
  const tabbyMerchantCode = process.env.NEXT_PUBLIC_TABBY_MERCHANT_CODE || process.env.TABBY_MERCHANT_CODE || 'Store1920';
  const formatMoney = (amount) => {
    const converted = Number(convertPrice(Number(amount || 0)) || 0);
    return `${market.currency} ${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };
  const formatMoneyFixed = (amount) => {
    const converted = Number(convertPrice(Number(amount || 0)) || 0);
    return `${market.currency} ${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const cleanDigits = (value) => (value ? String(value).replace(/\D/g, '') : '');
  const sanitizePincode = (value) => cleanDigits(value).trim();
  const isZeroOnlyPincode = (value) => /^0+$/.test(String(value || '').trim());
  const isIndiaCountry = (value) => String(value || '').trim().toLowerCase() === 'india';
  const hasValidPhone = (value, code = form.phoneCode || '+971') => isValidPhoneNumber(value, code);
  const pickValidPincode = (...values) => {
    for (const value of values) {
      const normalized = sanitizePincode(value);
      if (normalized && !isZeroOnlyPincode(normalized)) return normalized;
    }
    return '';
  };
  
  const handleApplyCoupon = async (e, codeOverride) => {
    if (e?.preventDefault) e.preventDefault();
    const codeToApply = String(codeOverride ?? coupon ?? '').trim();
    if (!codeToApply) {
      setCouponError("Enter a coupon code to see discount.");
      return;
    }

    if (form.payment !== 'card') {
      setCouponError('Coupons are available only for card payments.');
      return;
    }
    
    if (!user) {
      setCouponError("Please sign in to use coupons.");
      setShowSignIn(true);
      return;
    }
    
    if (!storeId) {
      setCouponError("Store information not loaded. Please refresh.");
      return;
    }
    
    setCoupon(codeToApply);
    setCouponLoading(true);
    setCouponError("");
    
    try {
      const cartItemsArray = Object.entries(cartItems || {})
        .map(([id, value]) => ({
          productId: getCartEntryProductId(id, value),
          quantity: getCartEntryQuantity(value),
          variantId: typeof value === 'object' ? value?.variantId : undefined,
          isFreeGift: isFreeGiftEntry(value),
        }))
        .filter((item) => item.quantity > 0 && item.productId && !item.isFreeGift);
      
      // Calculate total for validation
      const itemsTotal = cartItemsArray.reduce((sum, item) => {
        const product = products.find((p) => p._id === item.productId);
        if (!product) return sum;
        const cartValue = cartItems[item.productId] ?? cartItems[Object.keys(cartItems).find((key) => getCartEntryProductId(key, cartItems[key]) === item.productId)];
        const pricing = resolveCartLinePricing(product, cartValue, item.quantity);
        return sum + pricing.lineTotal;
      }, 0);
      
      const cartProductIds = cartItemsArray.map((item) => item.productId);
      
      console.log('Applying coupon:', codeToApply.toUpperCase());
      console.log('Order total:', itemsTotal);
      console.log('Cart products:', cartProductIds);
      
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeToApply.toUpperCase(),
          storeId: storeId,
          orderTotal: itemsTotal,
          userId: user.uid,
          cartProductIds: cartProductIds, // Send product IDs for product-specific validation
        }),
      });
      
      const data = await res.json();
      
      console.log('Coupon validation response:', data);
      
      if (res.ok && data.valid) {
        console.log('✅ Coupon applied successfully!');
        console.log('Discount amount:', data.coupon.discountAmount);
        setAppliedCoupon(data.coupon);
        setCouponError("");
        setShowCouponModal(false);
        setCoupon(''); // Clear input
      } else {
        console.error('❌ Coupon validation failed:', data.error);
        setCouponError(data.error || "Invalid coupon code");
        setAppliedCoupon(null);
      }
    } catch (error) {
      console.error('Error applying coupon:', error);
      setCouponError("Failed to apply coupon");
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (sessionStorage.getItem(CHECKOUT_RETURN_PATH_KEY)) return;
      const ref = document.referrer;
      if (!ref) return;
      const refUrl = new URL(ref, window.location.origin);
      if (refUrl.origin !== window.location.origin) return;
      const path = `${refUrl.pathname}${refUrl.search}`;
      if (path === '/checkout' || path === '/cart') return;
      sessionStorage.setItem(CHECKOUT_RETURN_PATH_KEY, path);
    } catch {
      // Ignore referrer parsing failures.
    }
  }, []);

  // If the customer returns to checkout after abandoning Tabby/Tamara/Stripe,
  // try to cancel ONLY if the order is still unpaid. Never clobber a capture
  // that completed while they bounced back to /checkout.
  useEffect(() => {
    const pendingOrderId = getPendingCheckoutOrderId();
    if (!pendingOrderId) return undefined;

    let cancelled = false;
    (async () => {
      try {
        await fetch('/api/payment-cancelled', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: pendingOrderId,
            reason: 'Returned to checkout without completing payment',
          }),
        });
      } catch (error) {
        console.error('Failed to cancel pending checkout order:', error);
      } finally {
        if (!cancelled) clearPendingCheckoutOrder();
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!storefrontWalletEnabled || !user || !getToken) {
      setWalletBalance(0);
      return undefined;
    }

    let ignore = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/wallet', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!ignore && res.ok) {
          setWalletBalance(Number(data.rupeesValue ?? data.coins ?? 0));
        }
      } catch {
        if (!ignore) setWalletBalance(0);
      }
    })();

    return () => { ignore = true; };
  }, [user, getToken, storefrontWalletEnabled]);

  // Fetch only the products that are in the cart (fast targeted batch fetch)
  useEffect(() => {
    const cartKeys = [...new Set(
      Object.entries(cartItems || {})
        .map(([id, value]) => getCartEntryProductId(id, value))
        .filter((id) => {
          const trimmed = String(id || '').trim();
          return trimmed && trimmed !== 'undefined' && trimmed !== 'null';
        })
    )];
    if (cartKeys.length === 0) {
      setCheckoutProductsLoaded(true);
      return undefined;
    }

    const missingIds = getCartProductIdsNeedingVariants(cartItems, products);
    if (missingIds.length === 0) {
      setCheckoutProductsLoaded(true);
      return undefined;
    }

    let ignore = false;
    setCheckoutProductsLoaded(false);
    const loadCartProducts = async () => {
      try {
        const { data } = await axios.post('/api/products/batch', { productIds: missingIds });
        if (ignore || !data?.products?.length) return;
        dispatch({
          type: 'product/setProduct',
          payload: mergeFetchedProducts(products, data.products),
        });
      } catch (e) {
        console.warn('Cart product fetch failed:', e.message);
      } finally {
        if (!ignore) setCheckoutProductsLoaded(true);
      }
    };
    loadCartProducts();
    return () => { ignore = true; };
  }, [cartItems, dispatch, products]);

  // Keep abandoned-checkout timer alive while customer is still on the page
  useEffect(() => {
    if (placingOrder || payingNow) return undefined;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setAbandonHeartbeat((count) => count + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [placingOrder, payingNow]);

  // Capture abandoned checkout (debounced) — includes anonymous browser sessions
  useEffect(() => {
    if (placingOrder || payingNow) return undefined;
    const cartEntries = Object.entries(cartItems || {});
    if (cartEntries.length === 0) return undefined;

    const captureAbandonedCheckout = async () => {
      try {
        const items = cartEntries.map(([id, value]) => {
          const productId = getCartEntryProductId(id, value);
          const quantity = getCartEntryQuantity(value);
          const product = products.find((p) => String(p._id) === String(productId));
          if (isFreeGiftEntry(value)) {
            return {
              productId,
              quantity,
              price: 0,
              lineTotal: 0,
              name: product?.name || 'Product',
              variantOptions: typeof value === 'object' ? value?.variantOptions || null : null,
              isFreeGift: true,
            };
          }
          const pricing = resolveCartLinePricing(product, value, quantity);
          return {
            productId,
            quantity,
            price: pricing.unitPrice,
            lineTotal: pricing.lineTotal,
            name: product?.name || 'Product',
            variantOptions: typeof value === 'object' ? value?.variantOptions || null : null,
            isFreeGift: false,
          };
        }).filter((it) => it.quantity > 0 && it.productId);

        if (items.length === 0) return;

        const cartTotal = items.reduce(
          (sum, it) => sum + Number(it.lineTotal ?? (Number(it.price) * Number(it.quantity))),
          0,
        );
        const anonymousId = typeof window !== 'undefined' ? getOrCreateAnonymousId() : null;
        const sessionId = typeof window !== 'undefined' ? getOrCreateSessionId() : null;

        const payload = {
          items,
          cartTotal,
          currency: process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED',
          userId: user?.uid || null,
          anonymousId,
          sessionId,
          customer: {
            name: form.name || null,
            email: form.email || user?.email || null,
            phone: form.phone || null,
            phoneCode: form.phoneCode || '+971',
            address: {
              country: form.country,
              state: form.state,
              district: form.district,
              city: resolveGuestCity(form),
              street: form.street,
              pincode: form.pincode,
            },
          },
        };

        if (typeof window !== 'undefined' && !user) {
          writeGuestCheckoutState({
            addresses: guestAddresses,
            selectedId: form.addressId,
            draft: formToGuestDraft(form),
          });
        }

        const response = await fetch('/api/abandoned-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });

        if (response.ok) {
          setAbandonSaved(true);
        }
      } catch (e) {
        console.warn('[checkout] abandoned capture failed:', e?.message || e);
      }
    };

    const timer = setTimeout(captureAbandonedCheckout, 500);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        captureAbandonedCheckout();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [form, cartItems, products, user, guestAddresses, placingOrder, payingNow, abandonHeartbeat]);

  // Logged-in: fetch saved addresses. Guest: restore checkout address from local storage.
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      guestHydratedRef.current = false;
      if (getToken) dispatch(fetchAddress({ getToken }));
      return;
    }

    dispatch(clearAddresses());
    if (guestHydratedRef.current) return;

    const saved = readGuestCheckoutState();
    let addresses = (saved.addresses || []).map((address) => normalizeGuestAddress(address));
    if (!addresses.length && isCompleteGuestDraft(saved.draft)) {
      addresses = [normalizeGuestAddress(saved.draft)];
    }
    const selected = addresses.find((item) => String(item._id) === String(saved.selectedId))
      || addresses[0]
      || saved.draft
      || null;

    setGuestAddresses(addresses);

    if (selected) {
      setForm((f) => ({
        ...f,
        addressId: selected._id || f.addressId || '',
        name: selected.name || f.name,
        email: selected.email || f.email,
        phone: cleanDigits(selected.phone) || f.phone,
        phoneCode: selected.phoneCode || f.phoneCode || UAE_PHONE_CODE,
        alternatePhone: cleanDigits(selected.alternatePhone) || f.alternatePhone,
        alternatePhoneCode: selected.alternatePhoneCode || f.alternatePhoneCode || UAE_PHONE_CODE,
        street: selected.street || f.street,
        city: selected.city || f.city,
        state: selected.state || f.state,
        district: selected.district || f.district,
        country: selected.country || f.country,
        pincode: pickValidPincode(selected.zip, selected.pincode, f.pincode),
      }));

      if (selected.state && isUaeCountry(selected.country || 'United Arab Emirates')) {
        setDistricts(getUaeAreasForEmirate(selected.state));
      } else if (selected.state && isIndiaCountry(selected.country)) {
        const stateObj = indiaStatesAndDistricts.find((entry) => entry.state === selected.state);
        setDistricts(stateObj ? stateObj.districts : []);
      }
    }

    guestHydratedRef.current = true;
  }, [authLoading, user, getToken, dispatch]);

  useEffect(() => {
    if (authLoading || user || !guestHydratedRef.current) return;
    writeGuestCheckoutState({
      addresses: guestAddresses,
      selectedId: form.addressId,
      draft: formToGuestDraft(form),
    });
  }, [
    authLoading,
    user,
    guestAddresses,
    form.addressId,
    form.name,
    form.email,
    form.phone,
    form.phoneCode,
    form.alternatePhone,
    form.alternatePhoneCode,
    form.street,
    form.city,
    form.state,
    form.district,
    form.country,
    form.pincode,
  ]);
  
  // Fetch available coupons
  useEffect(() => {
    const fetchCoupons = async () => {
      try {
        console.log('=== COUPON FETCH START ===');
        
        // Try to fetch store info first to get storeId
        console.log('Fetching store info...');
        const storeRes = await fetch('/api/store-info');
        
        if (!storeRes.ok) {
          console.error('Store-info API returned status:', storeRes.status);
          const storeResText = await storeRes.text();
          console.error('Store-info response:', storeResText.substring(0, 200));
          return;
        }
        
        let storeData;
        try {
          storeData = await storeRes.json();
        } catch (parseError) {
          console.error('Failed to parse store-info response:', parseError);
          return;
        }
        
        console.log('Store data response:', storeData);
        
        if (!storeData.store || !storeData.store._id) {
          console.error('Failed to get store ID from store-info, trying debug endpoint...');
          
          // Fallback: try debug endpoint to see what's happening
          const debugRes = await fetch('/api/coupons-debug');
          if (!debugRes.ok) {
            console.error('Coupons-debug API returned status:', debugRes.status);
            return;
          }
          let debugData;
          try {
            debugData = await debugRes.json();
          } catch (parseError) {
            console.error('Failed to parse coupons-debug response:', parseError);
            return;
          }
          console.log('Debug data:', debugData);
          
          return;
        }
        
        const storeIdValue = storeData.store._id;
        console.log('Store ID found:', storeIdValue);
        setStoreId(storeIdValue);
        
        console.log('Fetching coupons for store:', storeIdValue);
        const couponUrl = `/api/coupons?storeId=${storeIdValue}`;
        console.log('Coupon URL:', couponUrl);

        const token = user ? await getToken() : null;
        const res = await fetch(couponUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        
        if (!res.ok) {
          console.error('Coupons API returned status:', res.status);
          const resText = await res.text();
          console.error('Coupons response:', resText.substring(0, 200));
          setAvailableCoupons([]);
          return;
        }
        
        let data;
        try {
          data = await res.json();
        } catch (parseError) {
          console.error('Failed to parse coupons response:', parseError);
          setAvailableCoupons([]);
          return;
        }
        
        console.log('Coupons API response:', data);
        console.log('Response status:', res.status);
        console.log('Coupons array:', data.coupons);
        
        if (data.coupons && Array.isArray(data.coupons)) {
          console.log(`Found ${data.coupons.length} coupons`);
          
          if (data.coupons.length > 0) {
            console.log('Setting available coupons:', data.coupons);
            setAvailableCoupons(data.coupons);
          } else {
            console.log('Coupons array is empty - calling debug endpoint to check DB');
            // Call debug endpoint to see what coupons actually exist
            const debugRes = await fetch('/api/coupons-debug');
            if (debugRes.ok) {
              const debugData = await debugRes.json();
              console.log('=== DEBUG INFO ===');
              console.log('Total coupons in DB:', debugData.totalCoupons);
              console.log('Store ID from DB:', debugData.storeId);
              console.log('Requested Store ID:', storeIdValue);
              console.log('All coupons:', debugData.coupons);
              console.log('Active coupons:', debugData.activeCoupons);
              console.log('==================');
            }
            setAvailableCoupons([]);
          }
        } else {
          console.log('No coupons array in response');
          setAvailableCoupons([]);
        }
        
        console.log('=== COUPON FETCH END ===');
      } catch (error) {
        console.error('Error fetching coupons:', error);
        console.error('Error details:', error.message || error);
        setAvailableCoupons([]);
      }
    };
    
    // Add small delay to ensure page is ready
    const timer = setTimeout(() => {
      fetchCoupons();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [user, getToken]);

  // Check if Razorpay is already loaded (in case script loaded before state update)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      setRazorpayLoaded(true);
    }
  }, []);

  // Auto-select first address
  useEffect(() => {
    if (user && addressList.length > 0 && !form.addressId) {
      const firstAddr = addressList[0];
      
      setForm((f) => {
        // Try to get phone from: address -> user profile -> keep existing
        const addressPhone = cleanDigits(firstAddr.phone);
        const userPhone = cleanDigits(user?.phoneNumber || user?.phone);
        const finalPhone = addressPhone || userPhone || f.phone || '';
        const finalPincode = pickValidPincode(firstAddr.zip, firstAddr.pincode, f.pincode);
        
        console.log('Loading address - Phone sources:', {
          addressPhone,
          userPhone,
          finalPhone,
          currentFormPhone: f.phone,
          addressHasPhone: !!firstAddr.phone,
          userHasPhone: !!(user?.phoneNumber || user?.phone)
        });
        
        return { 
          ...f, 
          addressId: firstAddr._id,
          name: firstAddr.name || f.name,
          email: firstAddr.email || f.email,
          phone: finalPhone,
          phoneCode: firstAddr.phoneCode || UAE_PHONE_CODE,
          alternatePhone: cleanDigits(firstAddr.alternatePhone),
          alternatePhoneCode: firstAddr.alternatePhoneCode || UAE_PHONE_CODE,
          street: firstAddr.street || f.street,
          city: firstAddr.city || f.city,
          state: firstAddr.state || f.state,
          district: firstAddr.district || f.district,
          country: firstAddr.country || f.country,
          pincode: finalPincode,
        };
      });
    }
  }, [user, addressList, form.addressId]);

  const handleDeleteAddress = async (addressId) => {
    const confirmed = window.confirm("Are you sure you want to delete this address? This action cannot be undone.");
    if (!confirmed) return;

    try {
      const token = await getToken();
      const res = await fetch(`/api/address/${addressId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        // Refresh address list
        dispatch(fetchAddress({ getToken }));
        setFormError("");
      } else {
        const error = await res.json();
        setFormError(error.message || "Failed to delete address");
      }
    } catch (error) {
      setFormError("Failed to delete address. Please try again.");
    }
  };

  // Build cart array
  const cartArray = [];
  const isPurchasableProduct = (product) => {
    if (!product) return false;
    if (product.inStock === false) return false;
    if (typeof product.stockQuantity === 'number' && product.stockQuantity <= 0) return false;
    return true;
  };
  for (const [key, value] of Object.entries(cartItems || {})) {
    const actualProductId = getCartEntryProductId(key, value);
    const product = products?.find((p) => String(p._id) === String(actualProductId));
    const qty = getCartEntryQuantity(value);
    const priceOverride = typeof value === 'number' ? undefined : value?.price;
    const freeGift = typeof value === 'object' ? value?.freeGift : undefined;
    const isFreeGift = isFreeGiftEntry(value);
    if (product && qty > 0) {
      if (isPurchasableProduct(product)) {
        const pricing = resolveCartLinePricing(product, value, qty);
        const unitPrice = isFreeGift ? 0 : pricing.unitPrice;
        cartArray.push({
          ...product,
          quantity: qty,
          _cartPrice: unitPrice,
          _lineTotal: pricing.lineTotal,
          _displayQuantity: pricing.displayQuantity,
          _isBulkBundle: pricing.isBulkBundle,
          _isMatrix: Boolean(pricing.isMatrix),
          _bundleTier: pricing.bundleTier,
          _cartKey: key,
          _productId: actualProductId,
          _isFreeGift: isFreeGift,
          _freeGift: freeGift || null,
          variantOptions: typeof value === 'object' ? value?.variantOptions || null : null,
          _variantOptions: typeof value === 'object' ? value?.variantOptions || null : null,
        });
      }
    }
  }

  const subtotal = cartArray.reduce((sum, item) => sum + (item._lineTotal ?? ((item._cartPrice ?? item.price ?? 0) * item.quantity)), 0);
  
  // Calculate coupon discount
  const couponDiscountRaw = Number(appliedCoupon?.discountAmount || 0);
  const couponDiscount = Number.isFinite(couponDiscountRaw) ? Number(couponDiscountRaw.toFixed(2)) : 0;
  const isFreeShippingCouponApplied = Boolean(appliedCoupon?.freeShipping);
  const effectiveShipping = isFreeShippingCouponApplied ? 0 : shipping;
  const shippingDiscount = isFreeShippingCouponApplied ? shipping : 0;
  const totalAfterCoupon = Math.max(0, subtotal - couponDiscount);
  
  const total = totalAfterCoupon + effectiveShipping;
  const walletRedeemAmount = storefrontWalletEnabled && user && useWalletBalance && walletBalance > 0
    ? Math.min(Math.floor(walletBalance), Math.floor(total))
    : 0;
  const totalAfterWallet = Math.max(0, Number((total - walletRedeemAmount).toFixed(2)));
  const isFullWalletPayment = user && walletRedeemAmount > 0 && totalAfterWallet === 0;
  const cartItemCount = cartArray.reduce(
    (sum, item) => sum + Number(item._displayQuantity ?? item.quantity ?? 0),
    0,
  );
  const hasFreeShippingProduct = cartHasOnlyFreeShippingProducts(cartArray);
  const availableShippingOptions = getAvailableShippingOptions(shippingSetting, form.state);
  const selectedShippingOption =
    getShippingOptionById(shippingSetting, shippingMethod)
    || getDefaultShippingOption(shippingSetting, form.state);
  const summaryDeliveryDays = formatDeliveryDays(selectedShippingOption?.estimatedDays, '2-5');
  const summaryDeliveryLabel = selectedShippingOption?.name || t('checkout.standardDelivery');
  const totalSavings = couponDiscount + shippingDiscount + walletRedeemAmount;
  const needsPaymentSelection = totalAfterWallet > 0;
  const paymentMethodSummary = (() => {
    if (form.payment === 'cod') return t('checkout.cashOnDelivery');
    if (form.payment === 'card') return t('checkout.creditDebitCard');
    if (form.payment === 'wallet') return t('checkout.walletBalance');
    if (form.payment === 'tamara') return 'Tamara';
    if (form.payment === 'tabby') return 'Tabby';
    return t('checkout.paymentMethods');
  })();
  const maxCODAmount = shippingSetting?.maxCODAmount || 0;
  const hasPersonalizedOfferItem = Object.values(cartItems || {}).some(
    (entry) => typeof entry === 'object' && !!entry?.offerToken
  );
  const buildCheckoutItems = () => cartArray.map((item) => {
    const cartKey = item._cartKey || item._id;
    const value = cartItems?.[cartKey];
    const qty = getCartEntryQuantity(value) || item.quantity || 0;
    const variantOptions = typeof value === 'object' ? value?.variantOptions : undefined;
    const offerToken = typeof value === 'object' ? value?.offerToken : undefined;
    const freeGift = typeof value === 'object' ? value?.freeGift : undefined;
    const fbtMainProductId = typeof value === 'object' ? value?.fbtBundle?.mainProductId : undefined;
    const bundleTier = item._bundleTier ?? variantOptions?.bundleQty;
    return {
      id: item._productId || item._id,
      quantity: qty,
      ...(variantOptions || bundleTier ? {
        variantOptions: {
          ...(variantOptions || {}),
          ...(bundleTier ? { bundleQty: Number(bundleTier) } : {}),
        },
      } : {}),
      ...(offerToken ? { offerToken } : {}),
      ...(freeGift ? { freeGift } : {}),
      ...(fbtMainProductId ? { fbtMainProductId: String(fbtMainProductId) } : {}),
    };
  }).filter((item) => item.quantity > 0 && item.id);
  const applyWalletToPayload = (payload) => {
    if (user && walletRedeemAmount > 0) {
      payload.coinsToRedeem = walletRedeemAmount;
    }
    return payload;
  };
  const isCODDisabledForOrder =
    hasPersonalizedOfferItem ||
    !isPaymentMethodEnabled(shippingSetting, 'cod') ||
    (maxCODAmount > 0 && totalAfterWallet > maxCODAmount);
  const isCardEnabled = isPaymentMethodEnabled(shippingSetting, 'card');
  const isTabbyEnabled = isPaymentMethodEnabled(shippingSetting, 'tabby');
  const isTamaraEnabled = isPaymentMethodEnabled(shippingSetting, 'tamara');
  const isCardOverLimit = isPaymentMethodOverLimit(shippingSetting, 'card', totalAfterWallet);
  const isTabbyOverLimit = isPaymentMethodOverLimit(shippingSetting, 'tabby', totalAfterWallet);
  const isTamaraOverLimit = isPaymentMethodOverLimit(shippingSetting, 'tamara', totalAfterWallet);
  const showCardPayment = isCardEnabled && !isCardOverLimit;
  const showTabbyPayment = isTabbyEnabled && !isTabbyOverLimit;
  const showTamaraPayment = isTamaraEnabled && !isTamaraOverLimit;
  const showCodPayment = !hasPersonalizedOfferItem && isPaymentMethodEnabled(shippingSetting, 'cod');
  const isPaymentMissing = needsPaymentSelection && !form.payment;
  const isInvalidPaymentSelection =
    form.payment !== 'wallet' && (
      (form.payment === 'cod' && isCODDisabledForOrder)
      || (form.payment === 'card' && (!isCardEnabled || isCardOverLimit))
      || (form.payment === 'tabby' && (!isTabbyEnabled || isTabbyOverLimit))
      || (form.payment === 'tamara' && (!isTamaraEnabled || isTamaraOverLimit))
    );
  const isPlaceOrderDisabled = placingOrder || payingNow;
  const hasCheckoutFormBlockers = isPaymentMissing || isInvalidPaymentSelection;
  const isCheckoutSubmitDisabled = isPlaceOrderDisabled;
  const placeOrderButtonActiveColors = 'bg-red-600 hover:bg-red-700';
  const placeOrderButtonColors = isPlaceOrderDisabled
    ? 'bg-gray-400 cursor-not-allowed opacity-75'
    : hasCheckoutFormBlockers
      ? 'bg-amber-600 hover:bg-amber-700'
      : placeOrderButtonActiveColors;
  const mobilePlaceOrderButtonColors = isPlaceOrderDisabled
    ? 'bg-gray-400 cursor-not-allowed opacity-75'
    : hasCheckoutFormBlockers
      ? 'bg-amber-600 hover:bg-amber-700'
      : placeOrderButtonActiveColors;
  const selectedAddressForView = form.addressId ? checkoutAddressList.find((a) => a._id === form.addressId) : null;
  const isLoggedInAreaMissing = Boolean(
    user
    && selectedAddressForView
    && isUaeCountry(selectedAddressForView.country || form.country)
    && String(selectedAddressForView.state || '').trim()
    && !String(selectedAddressForView.district || '').trim(),
  );
  const isLoggedInDistrictMissing = Boolean(
    user
    && selectedAddressForView
    && isIndiaCountry(selectedAddressForView.country || form.country)
    && String(selectedAddressForView.state || '').trim()
    && !String(selectedAddressForView.district || '').trim(),
  );
  const renderPayByMethodLabel = (methodKey) => (
    <span className="font-normal">
      {t('checkout.payBy')}{' '}
      <span className="font-bold">{t(`checkout.method${methodKey}`)}</span>
    </span>
  );
  const renderPlaceOrderButtonContent = () => {
    if (form.payment === 'tamara') return renderPayByMethodLabel('Tamara');
    if (form.payment === 'tabby') return renderPayByMethodLabel('Tabby');
    if (form.payment === 'cod') return renderPayByMethodLabel('Cod');
    if (form.payment === 'card') return renderPayByMethodLabel('Card');
    if (form.payment === 'wallet') return renderPayByMethodLabel('Wallet');
    return needsPaymentSelection ? t('checkout.selectPayment') : t('checkout.placeOrder');
  };
  const shouldShowPhoneRequired =
    !!user &&
    addressList.length > 0 &&
    !!form.addressId &&
    !hasValidPhone(form.phone) &&
    !hasValidPhone(selectedAddressForView?.phone) &&
    !hasValidPhone(user?.phoneNumber || user?.phone);
  const isPincodeError = /pincode/i.test(String(formError || ''));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!checkoutProductsLoaded) return;
    if (beginCheckoutTrackedRef.current) return;

    const gtmItems = cartLinesToGtmItems(cartArray);
    if (gtmItems.length === 0) return;

    beginCheckoutTrackedRef.current = true;

    const itemsValue = gtmItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const value = Number(totalAfterWallet > 0 ? totalAfterWallet : (subtotal + effectiveShipping) || itemsValue || 0);
    const currencyCode = market.currency || STORE_CURRENCY || 'AED';

    trackBeginCheckoutDual({
      value,
      currency: currencyCode,
      gtmItems,
      metaItems: cartLinesToMetaItems(cartArray),
      pageKey: '/checkout',
    });

    trackCustomerEvent({
        eventType: 'checkout_start',
        firebaseUid: user?.uid || null,
        userId: user?.uid || null,
        pageType: 'checkout',
        pagePath: '/checkout',
        value,
        currency: currencyCode,
        metadata: {
          itemCount: gtmItems.length,
          cartValue: value,
        },
      });
  }, [
    checkoutProductsLoaded,
    cartArray,
    totalAfterWallet,
    subtotal,
    effectiveShipping,
    market.currency,
  ]);

  useEffect(() => {
    if (hasPersonalizedOfferItem && form.payment === 'cod') {
      setForm((f) => ({ ...f, payment: 'card' }));
    }
  }, [hasPersonalizedOfferItem, form.payment]);

  useEffect(() => {
    if (!user || walletBalance <= 0) return;
    if (isFullWalletPayment) {
      if (form.payment !== 'wallet') {
        setForm((f) => ({ ...f, payment: 'wallet' }));
      }
      return;
    }
    if (form.payment === 'wallet') {
      setForm((f) => ({ ...f, payment: 'card' }));
    }
  }, [isFullWalletPayment, user, walletBalance, form.payment]);

  useEffect(() => {
    if (!form.payment || form.payment === 'wallet') return;
    const paymentUnavailable =
      (form.payment === 'card' && (!isCardEnabled || isCardOverLimit))
      || (form.payment === 'tabby' && (!isTabbyEnabled || isTabbyOverLimit))
      || (form.payment === 'tamara' && (!isTamaraEnabled || isTamaraOverLimit))
      || (form.payment === 'cod' && isCODDisabledForOrder);
    if (paymentUnavailable) {
      setForm((f) => ({ ...f, payment: '' }));
    }
  }, [
    form.payment,
    isCardEnabled,
    isTabbyEnabled,
    isTamaraEnabled,
    isCardOverLimit,
    isTabbyOverLimit,
    isTamaraOverLimit,
    isCODDisabledForOrder,
  ]);

  useEffect(() => {
    if (appliedCoupon && form.payment !== 'card') {
      setAppliedCoupon(null);
      setCoupon('');
      setCouponError('Coupons are available only for card payments.');
    }
  }, [appliedCoupon, form.payment]);

  // Meta Pixel: AddPaymentInfo once per payment method (not per total change).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!form.payment) return;
    if (cartArray.length === 0) return;

    const contentIds = cartArray
      .map((item) => String(item?._id || item?._cartKey || ''))
      .filter(Boolean);

    if (contentIds.length === 0) return;

    const paymentMethod = String(form.payment).toLowerCase();
    const eventKey = `meta_add_payment_info_${paymentMethod}`;
    // Claim before fbq — totalAfterWallet / cart remounts must not send a 2nd event.
    if (sessionStorage.getItem(eventKey)) return;
    sessionStorage.setItem(eventKey, '1');

    trackMetaEvent('AddPaymentInfo', {
      value: Number(totalAfterWallet || 0),
      currency: 'AED',
      content_type: 'product',
      content_ids: contentIds,
      num_items: cartArray.reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
      payment_method: String(form.payment).toUpperCase(),
    }, {
      eventID: `api:${paymentMethod}`,
      dedupeKey: `meta:AddPaymentInfo:${eventKey}`,
    });
  }, [form.payment, cartArray, totalAfterWallet]);

  // Load shipping settings - refetch on page load and when products change
  useEffect(() => {
    async function loadShipping() {
      const setting = await fetchShippingSettings();
      setShippingSetting(setting);
      console.log('Shipping settings loaded:', setting);
    }
    loadShipping();
  }, [products]); // Refetch when products load

  useEffect(() => {
    let cancelled = false;
    async function loadCheckoutAlert() {
      try {
        const { data } = await axios.get('/api/checkout-alert');
        if (!cancelled) {
          setCheckoutAlert(data?.checkoutAlert || null);
        }
      } catch {
        if (!cancelled) setCheckoutAlert(null);
      }
    }
    loadCheckoutAlert();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCheckoutAlert = getActiveCheckoutAlert(checkoutAlert, {
    language: isArabic ? 'ar' : 'en',
  });

  useEffect(() => {
    if (!shippingSetting) return;
    const available = getAvailableShippingOptions(shippingSetting, form.state);
    if (!available.length) return;

    const stillValid = available.some((option) => option.id === shippingMethod);
    if (!stillValid) {
      const defaultOption = available.find((option) => option.isDefault) || available[0];
      if (defaultOption) setShippingMethod(defaultOption.id);
    } else if (!shippingMethod) {
      const defaultOption = available.find((option) => option.isDefault) || available[0];
      if (defaultOption) setShippingMethod(defaultOption.id);
    }
  }, [shippingSetting, form.state, shippingMethod]);

  useEffect(() => {
    if (shippingSetting && cartArray.length > 0) {
      const option =
        getShippingOptionById(shippingSetting, shippingMethod)
        || getDefaultShippingOption(shippingSetting, form.state);
      const calculatedShipping = calculateShipping({
        cartItems: cartArray,
        shippingSetting,
        shippingOption: option,
        paymentMethod: form.payment === 'cod' ? 'COD' : 'CARD',
        shippingState: form.state,
      });
      setShipping(calculatedShipping);
    } else {
      setShipping(0);
    }
  }, [shippingSetting, cartArray, form.payment, form.state, shippingMethod]);

  // Redirect to shop when cart is empty (must be a top-level hook)
  useEffect(() => {
    if (
      !authLoading
      && (!cartItems || Object.keys(cartItems).length === 0)
      && !placingOrder
      && !showPrepaidModal
      && !upsellOrderId
      && !leavingCheckout
    ) {
      const timer = setTimeout(() => {
        router.push('/shop');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [authLoading, cartItems, router, placingOrder, showPrepaidModal, upsellOrderId, leavingCheckout]);

  const checkoutSelectClass =
    'w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-left text-sm text-slate-900 outline-none transition focus:border-[#f59e0b] focus:bg-white focus:ring-4 focus:ring-[#fde7c2]';

  const guestFieldClass =
    'w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#f59e0b] focus:bg-white focus:ring-4 focus:ring-[#fde7c2]';

  const guestLabelClass = 'mb-1.5 block text-sm font-semibold text-slate-700';

  const guestSectionClass =
    'grid w-full min-w-0 gap-4 rounded-2xl border border-[#f1e4d3] bg-white/88 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:gap-5 sm:p-5 md:rounded-[24px] md:p-6 md:shadow-[0_12px_32px_rgba(15,23,42,0.05)]';

  const guestStepBadgeClass =
    'rounded-full bg-[#fff5db] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#b45309]';

  const fieldHasError = (fieldId) => invalidFieldIds.has(fieldId);
  const fieldErrorClass = (fieldId) =>
    fieldHasError(fieldId) ? 'border-red-400 ring-4 ring-red-100 focus:border-red-400 focus:ring-red-100' : '';
  const getStreetRequiredMessage = () => {
    if (String(form.district || '').trim() && !String(form.street || '').trim()) {
      return t('checkout.streetRequiredWithArea');
    }
    return t('checkout.street');
  };
  const getFieldRequiredMessage = (fieldId) => {
    const messageMap = {
      'guest-area': t('checkout.selectAreaRequired'),
      'guest-district': t('checkout.selectDistrict'),
      'guest-state': t('checkout.selectEmirate'),
      'guest-country': t('checkout.country'),
      'guest-name': t('checkout.fullName'),
      'guest-email': t('checkout.emailAddress'),
      'guest-phone': t('checkout.phoneNumber'),
      'guest-street': getStreetRequiredMessage(),
      'guest-pincode': 'Pincode',
      'checkout-payment': t('checkout.selectPaymentRequired'),
      'checkout-address': t('checkout.fillAddress'),
      'checkout-address-area': t('checkout.selectAreaRequired'),
      'checkout-address-district': t('checkout.selectDistrict'),
    };
    return messageMap[fieldId] || (isArabic ? 'هذا الحقل مطلوب' : 'This field is required');
  };
  const fieldRequiredHint = (fieldId) =>
    fieldHasError(fieldId) ? (
      <p className="mt-1 text-xs font-medium text-red-600">
        {getFieldRequiredMessage(fieldId)}
      </p>
    ) : null;

  const handleValidationIssueClick = (fieldId) => {
    setValidationAlertOpen(false);
    scrollToCheckoutField(fieldId);
  };

  const getValidationLabel = (issue) => {
    const labelMap = {
      'Full name': t('checkout.fullName'),
      'Email address': t('checkout.emailAddress'),
      'Valid email address': t('checkout.emailAddress'),
      'Phone number': t('checkout.phoneNumber'),
      'Street address': t('checkout.street'),
      'Emirate': t('checkout.selectEmirate'),
      'State': t('checkout.selectState'),
      'State / Emirate': t('checkout.emirateState'),
      'Country': t('checkout.country'),
      'Area': t('checkout.selectArea'),
      'District': t('checkout.selectDistrict'),
      'Pincode': 'Pincode',
      'Payment method': t('checkout.paymentMethods'),
      'Delivery address': t('checkout.deliveryAddress'),
    };
    return labelMap[issue.label] || issue.label;
  };

  const resolveCheckoutValidationContext = () => {
    const cleanedPhone = cleanDigits(form.phone);
    const selectedAddr = (form.addressId && checkoutAddressList.find((a) => a._id === form.addressId)) || null;
    const resolvedPhone =
      cleanedPhone || cleanDigits(selectedAddr?.phone) || cleanDigits(user?.phoneNumber || user?.phone);
    const resolvedCountry = form.country || selectedAddr?.country || 'United Arab Emirates';
    const resolvedPincode = isIndiaCountry(resolvedCountry) ? sanitizePincode(form.pincode) : '';
    return { resolvedPhone, resolvedCountry, resolvedPincode };
  };

  const showCheckoutValidationFeedback = (rawIssues) => {
    const issues = rawIssues.map((issue) => ({ ...issue, label: getValidationLabel(issue) }));
    setValidationIssues(issues);
    setInvalidFieldIds(new Set(rawIssues.map((issue) => issue.id)));
    setValidationAlertOpen(true);
    scrollToCheckoutField(issues[0]?.id);

    const firstIssue = rawIssues[0];
    const streetIssue = rawIssues.find(
      (issue) => issue.id === 'guest-street' || (issue.id === 'checkout-address' && issue.label === 'Street address'),
    );
    const message = streetIssue
      && firstIssue?.id === streetIssue.id
      && String(form.district || '').trim()
      ? t('checkout.streetRequiredWithArea')
      : issues.length > 1
        ? t('checkout.pleaseCompleteFields').replace(
          '{fields}',
          issues.map((issue) => issue.label).join(', '),
        )
        : t('checkout.pleaseCompleteField').replace('{field}', issues[0]?.label || '');

    setFormError(message);
    setSidebarPayError(message);
    toast.error(message, {
      duration: 6000,
      position: 'top-center',
      style: { zIndex: 99999, fontWeight: 600 },
    });
  };

  const runCheckoutFormValidation = (resolvedPhone, resolvedCountry, resolvedPincode) => {
    const rawIssues = collectCheckoutValidationIssues({
      user,
      form,
      addressList,
      resolvedPhone,
      resolvedCountry,
      resolvedPincode,
      needsPaymentSelection,
    });

    if (!rawIssues.length) {
      setInvalidFieldIds(new Set());
      setSidebarPayError('');
      return true;
    }

    showCheckoutValidationFeedback(rawIssues);
    return false;
  };

  const handlePlaceOrderClick = (event) => {
    if (placingOrder || payingNow) {
      event.preventDefault();
      return;
    }

    const { resolvedPhone, resolvedCountry, resolvedPincode } = resolveCheckoutValidationContext();
    const rawIssues = collectCheckoutValidationIssues({
      user,
      form,
      addressList,
      resolvedPhone,
      resolvedCountry,
      resolvedPincode,
      needsPaymentSelection,
    });

    if (rawIssues.length > 0) {
      event.preventDefault();
      showCheckoutValidationFeedback(rawIssues);
    }
  };

  const handleStateSelect = (value) => {
    setInvalidFieldIds(new Set());
    setValidationAlertOpen(false);
    setSidebarPayError('');
    if (isUaeCountry(form.country)) {
      setDistricts(getUaeAreasForEmirate(value));
    } else {
      const stateObj = indiaStatesAndDistricts.find((s) => s.state === value);
      setDistricts(stateObj ? stateObj.districts : []);
    }
    setForm((f) => ({ ...f, state: value, district: '' }));
  };

  const handleGuestCountryChange = (value) => {
    setForm((f) => ({
      ...f,
      country: value,
      state: '',
      district: '',
      phoneCode: getGuestCountryCode(value),
    }));
    setDistricts([]);
  };

  const handleChange = (e) => {
    setInvalidFieldIds(new Set());
    setValidationAlertOpen(false);
    setSidebarPayError('');
    const { name, value } = e.target;
    if (name === 'state') {
      handleStateSelect(value);
    } else if (name === 'country') {
      setForm(f => ({ ...f, country: value, state: '', district: '', alternatePhoneCode: f.alternatePhoneCode || f.phoneCode }));
      setDistricts([]);
    } else if (name === 'payment') {
      setForm(f => ({ ...f, [name]: value }));
    } else if (name === 'pincode') {
      if (isIndiaCountry(form.country)) {
        const numeric = String(value || '').replace(/\D/g, '').slice(0, 10);
        setForm(f => ({ ...f, pincode: numeric }));
      } else {
        const normalized = String(value || '').replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 20);
        setForm(f => ({ ...f, pincode: normalized }));
      }
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  // Razorpay Payment Handler
  const handleRazorpayPayment = async (paymentPayload) => {
    const trackedPayload = withOrderTrackingFields(paymentPayload);
    // Check if Razorpay is available (script might have loaded but state not updated)
    if (typeof window !== 'undefined' && window.Razorpay && !razorpayLoaded) {
      setRazorpayLoaded(true);
    }

    if (!razorpayLoaded && !window.Razorpay) {
      setFormError("Payment system is still loading. Please wait a moment and try again.");
      return false;
    }

    if (!window.Razorpay) {
      setFormError("Payment system failed to load. Please refresh the page and try again.");
      setPlacingOrder(false);
      return false;
    }

    try {
      // Step 1: Create Razorpay order on backend
      const orderRes = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(totalAfterWallet), // Ensure it's a whole number
          currency: "AED",
          receipt: `order_${Date.now()}`,
        }),
      });

      if (!orderRes.ok) {
        const errorData = await orderRes.json();
        setFormError(errorData.error || "Failed to create payment order");
        setPlacingOrder(false);
        return false;
      }

      const orderData = await orderRes.json();
      if (!orderData.success || !orderData.orderId) {
        setFormError("Failed to initialize payment");
        setPlacingOrder(false);
        return false;
      }

      // Step 2: Open Razorpay checkout with the order ID
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: orderData.orderId, // Use the order ID from backend
        amount: Math.round(totalAfterWallet * 100), // Amount in paise
        currency: "AED",
        name: "store1920",
        description: "Order Payment",
        image: STORE1920_LOGO_PATH,
        handler: async function (response) {
          try {
            // Verify payment on backend AND create order
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                paymentPayload: trackedPayload,
              }),
            });

            const responseData = await verifyRes.json();

            // Check for orderId from verify response (handles both _id and orderId fields)
            const orderId = responseData.orderId || responseData._id || responseData.id;

            if (verifyRes.ok && responseData.success && orderId) {
              // Payment successful - clear cart and redirect to success page
              dispatch(clearCart());
              router.push(`/order-success?orderId=${orderId}`);
            } else {
              // Payment or order creation failed - redirect to failed page
              setPlacingOrder(false);
              router.push(`/order-failed?reason=${encodeURIComponent(responseData.message || 'Payment verification failed')}`);
            }
          } catch (error) {
            // Network or parsing error - redirect to failed page
            setPlacingOrder(false);
            router.push(`/order-failed?reason=${encodeURIComponent('Payment verification error. Please contact support.')}`);
          }
        },
        prefill: {
          name: trackedPayload.guestInfo?.name || form.name || user?.displayName || "",
          email: trackedPayload.guestInfo?.email || form.email || user?.email || "",
          contact: trackedPayload.guestInfo?.phone || form.phone || "",
        },
        theme: {
          color: "#F97316", // Orange color
        },
        modal: {
          ondismiss: function() {
            setPlacingOrder(false);
            router.push(`/order-failed?reason=${encodeURIComponent('Payment cancelled by user')}`);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      return true;
    } catch (error) {
      console.error("Payment initiation error:", error);
      setFormError("Failed to initiate payment. Please try again.");
      setPlacingOrder(false);
      return false;
    }
  };

  // Stripe Payment Handler — creates order with paymentMethod STRIPE, then redirects to Stripe Checkout
  const fetchCheckoutOrders = async (fetchOptions, { timeoutMs = 45000 } = {}) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      return await fetch('/api/orders', {
        ...fetchOptions,
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch (fetchErr) {
      if (fetchErr?.name === 'AbortError') {
        throw new Error('Order is taking too long. Please try again.');
      }
      throw fetchErr;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };

  const renderPlacingOrderLabel = () => {
    if (form.payment === 'card' || form.payment === 'tamara' || form.payment === 'tabby') {
      return 'Redirecting to payment...';
    }
    return t('checkout.placingOrder');
  };

  const handleStripePayment = async (paymentPayload) => {
    try {
      const trackedPayload = withOrderTrackingFields(paymentPayload);
      let fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackedPayload),
      };

      if (user && getToken) {
        const token = await getToken();
        fetchOptions.headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetchCheckoutOrders(fetchOptions);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.message || errData.error || 'Failed to initiate Stripe payment';
        setFormError(msg);
        setPlacingOrder(false);
        return false;
      }

      const data = await res.json();

      const sessionUrl = data?.session?.url;
      if (sessionUrl) {
        if (data?.orderId) rememberPendingCheckoutOrder(data.orderId);
        // Redirect to Stripe-hosted checkout page
        window.location.href = sessionUrl;
        return true;
      }

      setFormError('Could not create Stripe checkout session. Please try again.');
      setPlacingOrder(false);
      return false;
    } catch (error) {
      setFormError(error.message || 'Stripe payment failed. Please try again.');
      setPlacingOrder(false);
      return false;
    }
  };

  // Tamara BNPL Handler — creates order with paymentMethod TAMARA, then redirects to Tamara checkout
  const handleTamaraPayment = async (paymentPayload) => {
    try {
      const trackedPayload = withOrderTrackingFields(paymentPayload);
      let fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackedPayload),
      };

      if (user && getToken) {
        const token = await getToken();
        fetchOptions.headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetchCheckoutOrders(fetchOptions);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.message || errData.error || 'Failed to initiate Tamara payment';
        setFormError(msg);
        setPlacingOrder(false);
        return false;
      }

      const data = await res.json();
      const checkoutUrl = data?.checkout_url;
      if (checkoutUrl) {
        if (data?.orderId) rememberPendingCheckoutOrder(data.orderId);
        window.location.href = checkoutUrl;
        return true;
      }

      setFormError('Could not create Tamara checkout session. Please try again.');
      setPlacingOrder(false);
      return false;
    } catch (error) {
      setFormError(error.message || 'Tamara payment failed. Please try again.');
      setPlacingOrder(false);
      return false;
    }
  };

  // Tabby BNPL Handler — creates order with paymentMethod TABBY, then redirects to Tabby checkout
  const handleTabbyPayment = async (paymentPayload) => {
    try {
      const trackedPayload = withOrderTrackingFields(paymentPayload);
      let fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackedPayload),
      };

      if (user && getToken) {
        const token = await getToken();
        fetchOptions.headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetchCheckoutOrders(fetchOptions);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.message || errData.error || 'Failed to initiate Tabby payment';
        setFormError(msg);
        setPlacingOrder(false);
        return false;
      }

      const data = await res.json();
      const checkoutUrl = data?.checkout_url;
      if (checkoutUrl) {
        if (data?.orderId) rememberPendingCheckoutOrder(data.orderId);
        window.location.href = checkoutUrl;
        return true;
      }

      setFormError('Could not create Tabby checkout session. Please try again.');
      setPlacingOrder(false);
      return false;
    } catch (error) {
      setFormError(error.message || 'Tabby payment failed. Please try again.');
      setPlacingOrder(false);
      return false;
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && window.TabbyCard) {
      setTabbyCardLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (form.payment !== 'tabby') return;
    if (!tabbyCardLoaded) return;
    if (!window.TabbyCard) return;
    if (!tabbyPublicKey || !tabbyMerchantCode) return;

    const price = Number(totalAfterWallet || 0).toFixed(2);
    if (Number(price) <= 0) return;

    try {
      new window.TabbyCard({
        selector: '#tabbyCard',
        currency: 'AED',
        price,
        lang: 'en',
        shouldInheritBg: false,
        publicKey: tabbyPublicKey,
        merchantCode: tabbyMerchantCode,
      });
    } catch (err) {
      console.error('TabbyCard init error:', err);
    }
  }, [form.payment, totalAfterWallet, tabbyPublicKey, tabbyMerchantCode, tabbyCardLoaded]);

  const handleSubmit = async (e, paymentOverride = null) => {
    e?.preventDefault?.();
    setFormError("");
    setSidebarPayError("");

    const payment = paymentOverride || form.payment;
    if (paymentOverride && paymentOverride !== form.payment) {
      setForm((f) => ({ ...f, payment: paymentOverride }));
    }

    const effectivePayment = isFullWalletPayment ? 'wallet' : payment;
    const paymentMissing = needsPaymentSelection && !effectivePayment;
    const invalidCodSelection = effectivePayment === 'cod' && isCODDisabledForOrder;
    const invalidOnlinePaymentSelection =
      effectivePayment !== 'wallet' && (
        (effectivePayment === 'card' && (!isCardEnabled || isCardOverLimit))
        || (effectivePayment === 'tabby' && (!isTabbyEnabled || isTabbyOverLimit))
        || (effectivePayment === 'tamara' && (!isTamaraEnabled || isTamaraOverLimit))
      );

    if (paymentMissing) {
      setInvalidFieldIds(new Set(['checkout-payment']));
      toast.error(t('checkout.selectPaymentRequired'), { id: 'checkout-validation' });
      scrollToCheckoutField('checkout-payment');
      return;
    }

    if (invalidCodSelection || invalidOnlinePaymentSelection) {
      const limitMessage = getPaymentMethodLimitError(
        shippingSetting,
        effectivePayment,
        totalAfterWallet,
        { hasPersonalizedOfferItem },
      );
      const paymentMessage = limitMessage
        || (hasPersonalizedOfferItem
          ? 'COD is not available for personalized offer products. Please use online payment.'
          : !isPaymentMethodEnabled(shippingSetting, 'cod')
            ? 'Cash on Delivery is not available.'
            : `COD is not available for orders above ${formatMoney(maxCODAmount)}.`);
      setFormError(paymentMessage);
      toast.error(paymentMessage, { id: 'checkout-validation' });
      return;
    }

    // Validate required fields
    if (cartArray.length === 0) {
      setFormError("All items in your cart are currently out of stock. Please remove them to continue.");
      return;
    }

    // Clean and validate phone number
    const cleanedPhone = cleanDigits(form.phone);
    const cleanedAlternatePhone = cleanDigits(form.alternatePhone);
    const selectedAddr = (form.addressId && checkoutAddressList.find(a => a._id === form.addressId)) || null;
    const fallbackPhone = cleanDigits(selectedAddr?.phone) || cleanDigits(user?.phoneNumber || user?.phone);
    const resolvedPhone = cleanedPhone || fallbackPhone;
    const resolvedCountry = form.country || selectedAddr?.country || 'United Arab Emirates';
    const isIndiaCheckout = isIndiaCountry(resolvedCountry);
    let resolvedPincode = sanitizePincode(form.pincode);

    if (!cleanedPhone && resolvedPhone) {
      setForm((f) => ({ ...f, phone: resolvedPhone }));
    }

    if (!form.country && resolvedCountry) {
      setForm((f) => ({ ...f, country: resolvedCountry }));
    }

    if (isIndiaCheckout) {
      if ((!resolvedPincode || isZeroOnlyPincode(resolvedPincode)) && selectedAddr) {
        const fallbackPincode = pickValidPincode(selectedAddr?.zip, selectedAddr?.pincode);

        if (fallbackPincode) {
          resolvedPincode = fallbackPincode;
          setForm((f) => ({ ...f, pincode: fallbackPincode }));
        }
      }
    } else {
      resolvedPincode = '';
    }

    if (!runCheckoutFormValidation(resolvedPhone, resolvedCountry, resolvedPincode)) {
      return;
    }

    console.log('Checkout validation - Phone details:', {
      originalPhone: form.phone,
      cleanedPhone: resolvedPhone,
      cleanedLength: resolvedPhone.length,
      isValid: isValidPhoneNumber(resolvedPhone, form.phoneCode || '+971')
    });

    const phoneCodeForValidation = form.phoneCode || '+971';
    const altCodeForValidation = form.alternatePhoneCode || phoneCodeForValidation;

    if (form.alternatePhone) {
      const alternatePhoneError = getPhoneInputError(cleanedAlternatePhone, altCodeForValidation);
      if (alternatePhoneError) {
        setFormError(alternatePhoneError);
        return;
      }
    }
    
    // Validate main phone number
    const mainPhoneError = getPhoneInputError(resolvedPhone, phoneCodeForValidation);
    if (mainPhoneError) {
      console.warn('Phone validation failed:', {
        hasValue: !!resolvedPhone,
        length: resolvedPhone.length
      });
      setFormError(mainPhoneError);
      return;
    }

    setPlacingOrder(true);
    
    // For card payment, use Stripe Checkout
    if (effectivePayment === 'card') {
      if (getPhoneInputError(resolvedPhone, phoneCodeForValidation)) {
        setFormError(getPhoneInputError(resolvedPhone, phoneCodeForValidation));
        setPlacingOrder(false);
        return;
      }
      try {
        const itemsFromStateCard = buildCheckoutItems();

        let payload = {
          items: itemsFromStateCard,
          paymentMethod: 'STRIPE',
          shippingFee: shipping,
          shippingMethod: shippingMethod,
          paymentStatus: 'pending',
        };

        if (appliedCoupon && (couponDiscount > 0 || isFreeShippingCouponApplied)) {
          payload.coupon = {
            code: appliedCoupon.code,
            discountAmount: couponDiscount,
            freeShipping: isFreeShippingCouponApplied,
            shippingDiscount,
            title: appliedCoupon.title,
            description: appliedCoupon.description,
          };
        }

        if (user) {
          const addressId = form.addressId || (addressList[0] && addressList[0]._id);
          if (addressId) {
            payload.addressId = addressId;
          }
        } else {
          if (!form.name || !form.email || !resolvedPhone || !form.street || !resolveGuestCity(form) || !form.state || !resolvedCountry) {
            setFormError("Please fill all required shipping details.");
            setPlacingOrder(false);
            return;
          }
          payload.isGuest = true;
          payload.guestInfo = {
            name: form.name,
            email: form.email,
            phone: resolvedPhone,
            phoneCode: form.phoneCode,
            alternatePhone: cleanedAlternatePhone || '',
            alternatePhoneCode: form.alternatePhone ? form.alternatePhoneCode || form.phoneCode : '',
            street: form.street,
            city: resolveGuestCity(form),
            state: form.state,
            district: form.district || '',
            country: resolvedCountry,
            pincode: resolvedPincode || '',
          };
        }

        await handleStripePayment(applyWalletToPayload(payload));
      } catch (error) {
        setFormError(error.message || "Payment failed");
        setPlacingOrder(false);
      }
      return;
    }

    // Tamara BNPL payment
    if (effectivePayment === 'tamara') {
      try {
        const itemsForTamara = buildCheckoutItems();

        let payload = {
          items: itemsForTamara,
          paymentMethod: 'TAMARA',
          shippingFee: shipping,
          shippingMethod: shippingMethod,
          paymentStatus: 'pending',
        };

        if (user) {
          const addressId = form.addressId || (addressList[0] && addressList[0]._id);
          if (addressId) payload.addressId = addressId;
        } else {
          if (!form.name || !form.email || !resolvedPhone || !form.street || !resolveGuestCity(form) || !form.state || !resolvedCountry) {
            setFormError("Please fill all required shipping details.");
            setPlacingOrder(false);
            return;
          }
          payload.isGuest = true;
          payload.guestInfo = {
            name: form.name,
            email: form.email,
            phone: resolvedPhone,
            phoneCode: form.phoneCode,
            alternatePhone: cleanedAlternatePhone || '',
            alternatePhoneCode: form.alternatePhone ? form.alternatePhoneCode || form.phoneCode : '',
            street: form.street,
            city: resolveGuestCity(form),
            state: form.state,
            district: form.district || '',
            country: resolvedCountry,
            pincode: resolvedPincode || '',
          };
        }

        await handleTamaraPayment(applyWalletToPayload(payload));
      } catch (error) {
        setFormError(error.message || "Tamara payment failed");
        setPlacingOrder(false);
      }
      return;
    }

    // Tabby BNPL payment
    if (effectivePayment === 'tabby') {
      try {
        const itemsForTabby = buildCheckoutItems();

        let payload = {
          items: itemsForTabby,
          paymentMethod: 'TABBY',
          shippingFee: shipping,
          shippingMethod: shippingMethod,
          paymentStatus: 'pending',
        };

        if (user) {
          const addressId = form.addressId || (addressList[0] && addressList[0]._id);
          if (addressId) payload.addressId = addressId;
        } else {
          if (!form.name || !form.email || !resolvedPhone || !form.street || !resolveGuestCity(form) || !form.state || !resolvedCountry) {
            setFormError("Please fill all required shipping details.");
            setPlacingOrder(false);
            return;
          }
          payload.isGuest = true;
          payload.guestInfo = {
            name: form.name,
            email: form.email,
            phone: resolvedPhone,
            phoneCode: form.phoneCode,
            alternatePhone: cleanedAlternatePhone || '',
            alternatePhoneCode: form.alternatePhone ? form.alternatePhoneCode || form.phoneCode : '',
            street: form.street,
            city: resolveGuestCity(form),
            state: form.state,
            district: form.district || '',
            country: resolvedCountry,
            pincode: resolvedPincode || '',
          };
        }

        await handleTabbyPayment(applyWalletToPayload(payload));
      } catch (error) {
        setFormError(error.message || 'Tabby payment failed');
        setPlacingOrder(false);
      }
      return;
    }
    
    // COD and other payment methods - Now supports guest checkout
    // Validate phone number for COD
    if (getPhoneInputError(resolvedPhone, phoneCodeForValidation)) {
      setFormError(getPhoneInputError(resolvedPhone, phoneCodeForValidation));
      setPlacingOrder(false);
      return;
    }
    
    try {
      let addressId = form.addressId;
      // If logged in and no address selected, skip address creation for now
      // Orders can work without addressId
      
      // Validate payment method for remaining balance
      if (!effectivePayment) {
        setFormError("Please select a payment method.");
        setPlacingOrder(false);
        return;
      }

      // Validate payment method limits
      const paymentLimitError = getPaymentMethodLimitError(
        shippingSetting,
        effectivePayment,
        totalAfterWallet,
        { hasPersonalizedOfferItem },
      );
      if (paymentLimitError) {
        setFormError(paymentLimitError);
        setPlacingOrder(false);
        return;
      }

      // Validate COD limit
      if (effectivePayment === 'cod') {
        if (hasPersonalizedOfferItem) {
          setFormError('COD is not available for personalized offer products. Please use online payment.');
          setPlacingOrder(false);
          return;
        }

        const maxCODAmount = shippingSetting?.maxCODAmount || 0;
        const remainingAmount = totalAfterWallet;
        
        if (!isPaymentMethodEnabled(shippingSetting, 'cod')) {
          setFormError("Cash on Delivery is not available.");
          setPlacingOrder(false);
          return;
        }
        
        if (maxCODAmount > 0 && remainingAmount > maxCODAmount) {
          setFormError(`COD is not available for orders above ${formatMoney(maxCODAmount)}. Your order amount is ${formatMoneyFixed(remainingAmount)}. Please use online payment.`);
          setPlacingOrder(false);
          return;
        }
      }

      // Build order payload
      let payload;
      const recoveryToken = typeof window !== 'undefined'
        ? sessionStorage.getItem('abandonedCartRecoveryToken')
        : null;
      
      console.log('Checkout - User state:', user ? 'logged in' : 'guest');
      console.log('Checkout - User object:', user);
      
      // Build items directly from cartItems to preserve variantOptions
      const itemsFromState = buildCheckoutItems();
      
      const finalPaymentMethod = effectivePayment === 'cod'
        ? 'COD'
        : effectivePayment === 'wallet'
          ? 'WALLET'
          : effectivePayment.toUpperCase();

      if (user) {
        console.log('Building logged-in user payload...');
        payload = {
          items: itemsFromState,
          paymentMethod: finalPaymentMethod,
          shippingFee: shipping,
          shippingMethod: shippingMethod,
        };
        // Add coupon data if applied
        if (appliedCoupon && (couponDiscount > 0 || isFreeShippingCouponApplied)) {
          payload.coupon = {
            code: appliedCoupon.code,
            discountAmount: couponDiscount,
            freeShipping: isFreeShippingCouponApplied,
            shippingDiscount,
            title: appliedCoupon.title,
            description: appliedCoupon.description,
          };
        }
        // Only add addressId if it exists
        if (addressId || (addressList[0] && addressList[0]._id)) {
          payload.addressId = addressId || addressList[0]._id;
        } else if (form.street && resolveGuestCity(form) && form.state && form.country) {
          // User is logged in but has no saved address - include address in payload
          payload.addressData = {
            name: form.name || user.displayName || '',
            email: form.email || user.email || '',
            phone: resolvedPhone || '',
            phoneCode: form.phoneCode,
            alternatePhone: cleanedAlternatePhone || '',
            alternatePhoneCode: form.alternatePhone ? form.alternatePhoneCode || form.phoneCode : '',
            street: form.street,
            city: resolveGuestCity(form),
            state: form.state,
            district: form.district || '',
            country: resolvedCountry,
            zip: resolvedPincode || '',
            district: form.district || ''
          };
        }
      } else {
        console.log('Building guest checkout payload...');
        payload = {
          items: itemsFromState,
          paymentMethod: finalPaymentMethod,
          shippingFee: shipping,
          shippingMethod: shippingMethod,
          isGuest: true,
          guestInfo: {
            name: form.name,
            email: form.email,
            phone: resolvedPhone,
            phoneCode: form.phoneCode,
            alternatePhone: cleanedAlternatePhone || '',
            alternatePhoneCode: form.alternatePhone ? form.alternatePhoneCode || form.phoneCode : '',
            street: form.street,
            city: resolveGuestCity(form),
            state: form.state,
            district: form.district || '',
            country: resolvedCountry,
            pincode: resolvedPincode || '',
          }
        };
        // Add coupon for guest if applied
        if (appliedCoupon && (couponDiscount > 0 || isFreeShippingCouponApplied)) {
          payload.coupon = {
            code: appliedCoupon.code,
            discountAmount: couponDiscount,
            freeShipping: isFreeShippingCouponApplied,
            shippingDiscount,
            title: appliedCoupon.title,
            description: appliedCoupon.description,
          };
        }
      }

      if (recoveryToken) {
        payload.recoveryToken = recoveryToken;
      }

      applyWalletToPayload(payload);
      
      console.log('Submitting order:', payload);
      
      let fetchOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withOrderTrackingFields(payload)),
      };
      
      if (user && getToken) {
        console.log('Adding Authorization header for logged-in user...');
        const token = await getToken();
        console.log('Got token:', token ? 'yes' : 'no');
        fetchOptions.headers = {
          ...fetchOptions.headers,
          Authorization: `Bearer ${token}`,
        };
      } else {
        console.log('No Authorization header - guest checkout');
      }
      
      console.log('Final fetch options:', { ...fetchOptions, body: 'payload' });

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller
        ? window.setTimeout(() => controller.abort(), 45000)
        : null;

      let res;
      try {
        res = await fetch("/api/orders", {
          ...fetchOptions,
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch (fetchErr) {
        if (fetchErr?.name === 'AbortError') {
          setFormError('Order is taking too long. Please try again.');
        } else {
          setFormError(fetchErr.message || 'Order failed. Please try again.');
        }
        setPlacingOrder(false);
        return;
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const errorText = await res.text();
        let msg = errorText;
        try {
          const data = JSON.parse(errorText);
          msg = data.message || data.error || errorText;
        } catch {}
        if (/pincode/i.test(String(msg || ''))) {
          msg = 'Please enter a valid pincode.';
        }
        setFormError(msg);
        setPlacingOrder(false);
        const isInputValidationError = /pincode|phone|shipping address|required|missing/i.test(String(msg || '').toLowerCase());
        if (!isInputValidationError) {
          router.push(`/order-failed?reason=${encodeURIComponent(msg)}`);
        }
        return;
      }
      const data = await res.json();
      const createdOrderId = data.id || data._id || data.orderId || data.order?._id;
      if (createdOrderId) {
        setPlacingOrder(false);

        if (effectivePayment === 'cod' && data.autoEmxShipping !== true) {
          const orderTotal = Number(data.total ?? data.order?.total ?? totalAfterWallet ?? 0);
          setUpsellOrderId(createdOrderId);
          setUpsellOrderTotal(orderTotal);
          setUpsellToken(String(data.prepaidUpsellToken || ''));
          setShowPrepaidModal(true);
          setPlacingOrder(false);
          // Show modal before clearing cart so empty-cart redirect does not fire first.
          queueMicrotask(() => dispatch(clearCart()));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('walletUpdated'));
          }
          return;
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('walletUpdated'));
        }

        setNavigatingToSuccess(true);
        dispatch(clearCart());
        router.push(`/order-success?orderId=${createdOrderId}`);
      } else {
        // No order ID returned - treat as failure
        setFormError("Order creation failed. Please try again.");
        setPlacingOrder(false);
        router.push(`/order-failed?reason=${encodeURIComponent('Order creation failed')}`);
      }

    } catch (err) {
      const errorMsg = err.message || "Order failed. Please try again.";
      setFormError(errorMsg);
      setPlacingOrder(false);
      router.push(`/order-failed?reason=${encodeURIComponent(errorMsg)}`);
    } finally {
      setPlacingOrder(false);
    }
  };

  const completePrepaidUpsell = useCallback(() => {
    const orderId = upsellOrderId;
    if (!orderId) return;
    setShowPrepaidModal(false);
    setUpsellOrderId(null);
    setUpsellOrderTotal(0);
    setUpsellToken('');
    setNavigatingToSuccess(true);
    router.push(`/order-success?orderId=${orderId}`);
  }, [router, upsellOrderId]);

  const handlePayNowForExistingOrder = async () => {
    if (!upsellOrderId) return;

    try {
      setPayingNow(true);
      const headers = { 'Content-Type': 'application/json' };
      if (user && getToken) {
        try {
          const token = await getToken(true);
          if (token) headers.Authorization = `Bearer ${token}`;
        } catch (tokenError) {
          console.warn('[checkout] prepaid upsell auth token unavailable', tokenError);
        }
      }

      // Stripe Checkout for the COD order (5% off applied only after Stripe pays).
      const res = await fetch('/api/orders/prepaid-upsell', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderId: upsellOrderId,
          prepaidUpsellToken: upsellToken || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }

      setPayingNow(false);
      const message = data?.error || 'Failed to create payment. Continuing with COD...';
      alert(message);
      setTimeout(() => {
        setShowPrepaidModal(false);
        setUpsellToken('');
        router.push(`/order-success?orderId=${upsellOrderId}`);
      }, 1200);
    } catch (err) {
      console.error('Payment error:', err);
      setPayingNow(false);
      alert('Payment failed. Continuing with COD...');
      setTimeout(() => {
        setNavigatingToSuccess(true);
        setShowPrepaidModal(false);
        setUpsellToken('');
        router.push(`/order-success?orderId=${upsellOrderId}`);
      }, 1200);
    }
  };

  if (authLoading) return null;

  if (leavingCheckout) return null;
  
  if ((!cartItems || Object.keys(cartItems).length === 0) && !showPrepaidModal && !navigatingToSuccess && !upsellOrderId) {
    return (
      <div className="py-20 text-center min-h-[50vh] flex flex-col items-center justify-center">
        <div className="text-6xl mb-4">🛒</div>
        <div className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</div>
        <div className="text-gray-600 mb-6">Add some products to your cart and come back!</div>
        <button 
          onClick={() => router.push('/shop')}
          className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  if (showPrepaidModal) {
    return (
      <>
        <PrepaidUpsellModal 
          open={showPrepaidModal}
          orderTotal={upsellOrderTotal}
          discountAmount={upsellOrderTotal * 0.05}
          onClose={() => {}}
          onNoThanks={completePrepaidUpsell}
          onAutoDismiss={completePrepaidUpsell}
          onPayNow={handlePayNowForExistingOrder}
          loading={payingNow}
        />
        <Script 
          src="https://checkout.razorpay.com/v1/checkout.js" 
          strategy="afterInteractive"
          onLoad={() => {
            console.log('Razorpay script loaded successfully');
            setRazorpayLoaded(true);
          }}
          onError={(e) => {
            console.error('Failed to load Razorpay script:', e);
            setFormError('Payment system failed to load. Please check your internet connection and refresh.');
          }}
        />
      </>
    );
  }

  if (navigatingToSuccess) {
    return null;
  }

  const checkoutOrderPreviewItems = cartArray.slice(0, CHECKOUT_ORDER_PREVIEW_LIMIT);
  const checkoutOrderHiddenCount = Math.max(0, cartArray.length - CHECKOUT_ORDER_PREVIEW_LIMIT);

  const getRemovableCartItems = () => cartArray.filter((i) => !i._isFreeGift);

  const wouldDecrementRemoveItem = (item) => {
    if (item._isBulkBundle) {
      const tiers = getBulkBundleTiers(item);
      const currentTier = Number(item._bundleTier) || tiers[0] || 1;
      return tiers.indexOf(currentTier) <= 0;
    }
    const cartKey = item._cartKey || item._id;
    const entry = cartItems?.[cartKey];
    return getCartEntryQuantity(entry) <= 1;
  };

  const stepCheckoutBulkTier = (item, delta) => {
    const cartKey = item._cartKey || item._id;
    const entry = cartItems?.[cartKey];
    if (!entry || typeof entry !== 'object') return;

    const tiers = getBulkBundleTiers(item);
    if (!tiers.length) return;

    const currentTier = Number(item._bundleTier) || tiers[0];
    const currentIndex = Math.max(0, tiers.indexOf(currentTier));
    const nextIndex = currentIndex + delta;

    if (nextIndex < 0) {
      if (getRemovableCartItems().length <= 1) {
        setRemoveLastItemConfirm({ cartKey, product: item });
        return;
      }
      dispatch(deleteItemFromCart({ productId: cartKey }));
      return;
    }

    const nextTier = tiers[Math.min(tiers.length - 1, nextIndex)];
    const variant = findBulkBundleVariant(item, nextTier);
    dispatch(setCartEntry({
      productId: cartKey,
      entry: {
        ...entry,
        quantity: 1,
        price: Number(variant?.price ?? entry.price ?? item.price ?? 0),
        variantOptions: {
          ...(entry.variantOptions || {}),
          bundleQty: nextTier,
        },
      },
    }));
  };

  const navigateAwayFromCheckout = (product) => {
    let returnPath = null;
    try {
      returnPath = sessionStorage.getItem(CHECKOUT_RETURN_PATH_KEY);
      sessionStorage.removeItem(CHECKOUT_RETURN_PATH_KEY);
    } catch {
      // Ignore sessionStorage failures.
    }

    const productPath = product?.slug || product?._id ? getProductPath(product) : '/shop';
    const safeReturn = returnPath && returnPath !== '/checkout' && returnPath !== '/cart'
      ? returnPath
      : null;

    if (safeReturn) {
      router.replace(safeReturn);
      return;
    }

    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.replace(productPath);
  };

  const handleCheckoutRemoveItem = (item) => {
    const cartKey = item._cartKey || item._id;
    if (getRemovableCartItems().length <= 1) {
      setRemoveLastItemConfirm({ cartKey, product: item });
      return;
    }
    dispatch(deleteItemFromCart({ productId: cartKey }));
  };

  const handleCheckoutDecrementItem = (item) => {
    if (item._isBulkBundle) {
      if (getRemovableCartItems().length <= 1 && wouldDecrementRemoveItem(item)) {
        setRemoveLastItemConfirm({ cartKey: item._cartKey || item._id, product: item });
        return;
      }
      stepCheckoutBulkTier(item, -1);
      return;
    }

    const cartKey = item._cartKey || item._id;
    const entry = cartItems?.[cartKey];
    if (getRemovableCartItems().length <= 1 && wouldDecrementRemoveItem(item)) {
      setRemoveLastItemConfirm({ cartKey, product: item });
      return;
    }
    decrementCartItem(dispatch, {
      productId: cartKey,
      entry,
      product: item,
    });
  };

  const confirmRemoveLastItem = () => {
    if (!removeLastItemConfirm) return;
    const { cartKey, product } = removeLastItemConfirm;
    setRemoveLastItemConfirm(null);
    setShowAllOrderItemsModal(false);
    setLeavingCheckout(true);
    dispatch(deleteItemFromCart({ productId: cartKey }));
    navigateAwayFromCheckout(product);
  };

  const renderCheckoutOrderItem = (item) => (
    <div key={item._cartKey || item._id} className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-3 gap-3">
      <img src={item.image || item.images?.[0] || '/placeholder.png'} alt={item.name} className="w-14 h-14 object-cover rounded-md border shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 truncate">{item.name}</div>
        <div className="text-xs text-gray-500 truncate">
          {getProductSubtitle(item, {
            variantOptions: item.variantOptions || item._variantOptions,
            quantity: item._isMatrix ? item.quantity : undefined,
          }) || ''}
        </div>
        {item._isFreeGift ? (
          <div className="text-xs font-semibold text-green-600">Free gift</div>
        ) : null}
        <div className="text-xs text-gray-400">{item._isFreeGift ? 'FREE' : formatMoney(item._lineTotal ?? item._cartPrice ?? item.price ?? 0)}</div>
      </div>
      <div className="flex flex-col items-center gap-1 shrink-0">
        {item._isFreeGift ? (
          <div className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">AUTO-ADDED</div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 active:bg-gray-400"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCheckoutDecrementItem(item);
                }}
              >
                -
              </button>
              <span className="px-2 text-sm">
                {item._displayQuantity ?? item.quantity}
              </span>
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 active:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={item._isBulkBundle
                  ? (() => {
                    const tiers = getBulkBundleTiers(item);
                    const currentTier = Number(item._bundleTier) || tiers[tiers.length - 1];
                    return tiers.indexOf(currentTier) >= tiers.length - 1;
                  })()
                  : (item._isMatrix
                    ? item.quantity >= (resolveMatrixCartMaxPacks(item, cartItems?.[item._cartKey || item._id]) ?? Infinity)
                    : false)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (item._isBulkBundle) {
                    stepCheckoutBulkTier(item, 1);
                    return;
                  }
                  const cartKey = item._cartKey || item._id;
                  const entry = cartItems?.[cartKey];
                  incrementCartItem(dispatch, {
                    productId: cartKey,
                    entry,
                    product: item,
                    price: item._cartPrice ?? item.price,
                    maxQty: item._isMatrix
                      ? resolveMatrixCartMaxPacks(item, entry)
                      : undefined,
                  });
                }}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="text-xs text-red-500 hover:text-red-700 hover:underline mt-1 active:text-red-800"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCheckoutRemoveItem(item);
              }}
            >
              {t('checkout.remove')}
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="bg-white pb-24 pt-0 md:min-h-[35dvh] md:pb-14 md:py-10">
      {activeCheckoutAlert ? (
        <div className="mx-auto max-w-[1250px] px-4 pb-3 pt-3 md:pb-4 md:pt-4" dir={isArabic ? 'rtl' : 'ltr'}>
          <CheckoutAlertBanner alert={activeCheckoutAlert} />
        </div>
      ) : null}
      <div className="mx-auto grid max-w-[1250px] grid-cols-1 gap-0 md:grid-cols-3 md:gap-8 md:px-4" dir={isArabic ? 'rtl' : 'ltr'}>
        {/* Left column: address, form, payment */}
        <div className="md:col-span-2">
          <div className="border-y border-gray-100 bg-white px-4 pb-4 pt-2 md:rounded-xl md:border md:p-8 md:shadow-sm">
            {/* Cart Items Section */}
            <div className="mb-4 md:mb-6">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-gray-900">{t('checkout.yourOrder')}</h2>
                {checkoutOrderHiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllOrderItemsModal(true)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-[#f59e0b] hover:text-[#b45309]"
                  >
                    {isArabic ? `عرض الكل (${cartArray.length})` : `View All (${cartArray.length})`}
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {checkoutOrderPreviewItems.map(renderCheckoutOrderItem)}
                {checkoutOrderHiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllOrderItemsModal(true)}
                    className="flex min-h-[88px] items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-slate-700 transition hover:border-[#f59e0b] hover:bg-amber-50 hover:text-[#b45309]"
                  >
                    <span className="text-lg font-bold">+{checkoutOrderHiddenCount}</span>
                  </button>
                ) : null}
              </div>
            </div>
            {/* Shipping Method Section */}
            <div className="mb-4 md:mb-6">
              <h2 className="mb-1 text-xl font-bold text-gray-900">{t('checkout.deliveryMethod')}</h2>
              <p className="mb-4 text-sm text-slate-500">Choose how fast you want your order delivered.</p>
              <div className="space-y-3">
                {availableShippingOptions.map((option) => {
                  const optionFee = calculateShipping({
                    cartItems: cartArray,
                    shippingSetting,
                    shippingOption: option,
                    paymentMethod: form.payment === 'cod' ? 'COD' : 'CARD',
                    shippingState: form.state,
                  });
                  const optionDays = formatDeliveryDays(option.estimatedDays, '3-5');
                  const isSelected = shippingMethod === option.id;
                  const isExpressLike = /express/i.test(option.name);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setShippingMethod(option.id)}
                      className={`w-full rounded-xl border-2 p-4 text-left transition-colors ${
                        isSelected
                          ? 'border-emerald-300 bg-white'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          {isExpressLike ? (
                            <Zap className="h-5 w-5" strokeWidth={2} />
                          ) : (
                            <Truck className="h-5 w-5" strokeWidth={2} />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-slate-900">{option.name}</span>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {t('checkout.deliveredIn', { days: optionDays })}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <span className={`text-sm font-semibold ${
                            optionFee === 0 ? 'text-emerald-600' : 'text-slate-900'
                          }`}>
                            {optionFee === 0 ? t('cart.free') : formatMoney(optionFee)}
                          </span>
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                            isSelected ? 'border-emerald-400 bg-emerald-400' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {!availableShippingOptions.length ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No delivery options are available for the selected location.
                  </p>
                ) : null}
              </div>
              
              {/* State-wise charge note */}
              {form.state && shippingSetting?.stateCharges && Array.isArray(shippingSetting.stateCharges) && (() => {
                const stateCharge = shippingSetting.stateCharges.find(
                  (entry) => String(entry?.state || '').trim().toLowerCase() === String(form.state || '').trim().toLowerCase()
                );
                return stateCharge ? (
                  <div className="text-xs text-slate-600 mt-2">
                    ℹ️ <span className="font-medium">Shipping charge for {form.state}:</span> {formatMoney(stateCharge.fee)} (varies by state)
                  </div>
                ) : null;
              })()}
            </div>
            {/* Shipping Details Section */}
            <form id="checkout-form" onSubmit={handleSubmit} className="flex flex-col gap-0">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div className="font-semibold">{isPincodeError ? 'Address Validation' : 'Validation Error'}</div>
                    <div className="text-sm mt-1">{isPincodeError ? 'Please enter a valid pincode.' : formError}</div>
                  </div>
                </div>
              )}
              
              {/* Guest Checkout Notice */}
              {!user && (
                <div className="mb-4 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-blue-950 mb-1">{t('checkout.checkoutAsGuest')}</h3>
                      <p className="text-sm text-blue-800/90">{t('checkout.guestSubtitle')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSignIn(true)}
                      className="shrink-0 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                    >
                      {t('checkout.signInInstead')}
                    </button>
                  </div>
                </div>
              )}
              
              {!user ? (
                <p className="mb-4 text-sm text-slate-600">{t('checkout.shippingDetails')}</p>
              ) : (
                <h2 className="text-xl font-bold mb-3 mt-1 text-gray-900">{t('checkout.shippingDetails')}</h2>
              )}
              {/* ...existing code for address/guest form... */}
              {/* Show address fetch error if present */}
              {user && addressFetchError && (
                <div className="text-red-600 font-semibold mb-2">
                  {addressFetchError === 'Unauthorized' ? (
                    <>
                      You are not logged in or your session expired. <button className="underline text-blue-600" type="button" onClick={() => setShowSignIn(true)}>Sign in again</button>.
                    </>
                  ) : addressFetchError}
                </div>
              )}
              {checkoutAddressList.length > 0 && !(user && addressFetchError) ? (
                <div id="checkout-address">
                  {/* Shipping Address Section - Noon.com Style */}
                  <div className={`bg-white rounded-lg border ${
                    fieldHasError('checkout-address')
                    || fieldHasError('checkout-address-area')
                    || fieldHasError('checkout-address-district')
                    || isLoggedInAreaMissing
                    || isLoggedInDistrictMissing
                      ? 'border-red-300 ring-2 ring-red-100'
                      : 'border-gray-200'
                  }`}>
                    <div className="px-4 py-3 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">{t('checkout.address')}</span>
                        <button 
                          type="button"
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          onClick={() => setShowAddressModal(true)}
                        >
                          {t('checkout.switchAddress')}
                        </button>
                      </div>
                    </div>
                    
                    {form.addressId && (() => {
                      const selectedAddress = checkoutAddressList.find(a => a._id === form.addressId);
                      if (!selectedAddress) return null;
                      return (
                        <div 
                          className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => {
                            console.log('📍 Address card clicked!');
                            setShowAddressModal(true);
                          }}
                        >
                          <div className="flex items-start gap-3">
                            {/* Location Pin Icon */}
                            <div className="flex-shrink-0 mt-0.5">
                              <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                              </svg>
                            </div>
                            
                            {/* Address Details */}
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900 mb-1">
                                {t('checkout.deliverTo')} <span className="font-bold">{selectedAddress.name?.toUpperCase() || 'HOME'}</span>
                              </div>
                              <div className="text-sm text-gray-600 leading-relaxed">
                                {selectedAddress.street}
                                {selectedAddress.city && ` - ${selectedAddress.city}`}
                                {selectedAddress.district && ` - ${selectedAddress.district}`}
                                {selectedAddress.state && ` - ${selectedAddress.state}`}
                              </div>
                            </div>
                            
                            {/* Right Arrow */}
                            <div className="flex-shrink-0">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    
                    {!form.addressId && (
                      <div 
                        className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => setShowAddressModal(true)}
                      >
                        <div className="flex items-center justify-center gap-2 text-blue-600 font-medium">
                          <span className="text-xl">+</span>
                          <span>{t('checkout.selectDeliveryAddress')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                {fieldRequiredHint('checkout-address')}
                {fieldRequiredHint('checkout-address-area')}
                {fieldRequiredHint('checkout-address-district')}
                {(isLoggedInAreaMissing || isLoggedInDistrictMissing) && !fieldHasError('checkout-address-area') && !fieldHasError('checkout-address-district') ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-medium text-red-700">
                      {isLoggedInAreaMissing ? t('checkout.selectAreaRequired') : t('checkout.selectDistrict')}
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-sm font-semibold text-red-700 underline"
                      onClick={() => {
                        if (selectedAddressForView?._id) {
                          setEditingAddressId(selectedAddressForView._id);
                        }
                        setShowAddressModal(true);
                      }}
                    >
                      {isArabic ? 'تحديث العنوان' : 'Update address'}
                    </button>
                  </div>
                ) : null}
                
                {/* Phone Number Section - Show for logged-in users if missing from address */}
                {shouldShowPhoneRequired && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-3">
                    <div className="flex items-start gap-2 mb-3">
                      <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-yellow-800">{t('checkout.phoneRequired')}</p>
                        <p className="text-xs text-yellow-700 mt-1">{t('checkout.phoneRequiredDesc')}</p>
                      </div>
                    </div>
                    <PhoneNumberField
                      phone={form.phone}
                      phoneCode={form.phoneCode}
                      onPhoneChange={(value) => setForm((f) => ({ ...f, phone: value }))}
                      onPhoneCodeChange={handleChange}
                      countryOptions={UAE_PHONE_CODE_OPTIONS}
                      selectClassName="border border-yellow-300 bg-white rounded px-2 py-2 focus:border-yellow-400"
                      inputClassName="border border-yellow-300 bg-white rounded px-4 py-2 flex-1 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-200"
                      errorClassName="text-red-500 text-xs mt-2"
                      showLabel={false}
                      showHint={false}
                    />
                  </div>
                )}
                </div>
              ) : (checkoutAddressList.length === 0 && user) ? (
                <button 
                  type="button"
                  className="w-full border-2 border-dashed border-blue-400 rounded-lg p-4 text-blue-600 font-semibold hover:bg-blue-50 transition"
                  onClick={() => {
                    setEditingAddressId(null);
                    setShowAddressModal(true);
                  }}
                >
                  <span className="text-xl">+</span> Add Delivery Address
                </button>
              ) : (!user) ? (
                <div className="grid w-full min-w-0 gap-5">
                  <div className={guestSectionClass}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-900">{t('checkout.contactDetails')}</h3>
                        <p className="mt-1 text-sm text-slate-500">{t('checkout.contactDetailsHint')}</p>
                      </div>
                      <span className={guestStepBadgeClass}>Step 1</span>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label htmlFor="guest-name" className={guestLabelClass}>{t('checkout.fullName')}</label>
                        <input
                          id="guest-name"
                          className={`${guestFieldClass} ${fieldErrorClass('guest-name')}`}
                          type="text"
                          name="name"
                          placeholder="Enter your name"
                          value={form.name || ''}
                          onChange={handleChange}
                          required
                        />
                        {fieldRequiredHint('guest-name')}
                      </div>

                      <div className="min-w-0">
                        <label htmlFor="guest-email" className={guestLabelClass}>{t('checkout.emailAddress')}</label>
                        <input
                          id="guest-email"
                          className={`${guestFieldClass} ${fieldErrorClass('guest-email')}`}
                          type="email"
                          name="email"
                          placeholder={t('checkout.emailAddress')}
                          value={form.email || ''}
                          onChange={handleChange}
                        />
                        {fieldRequiredHint('guest-email')}
                      </div>
                    </div>

                    <div id="guest-phone" className="min-w-0">
                      <PhoneNumberField
                        label={t('checkout.phoneNumber')}
                        phone={form.phone}
                        phoneCode={form.phoneCode}
                        onPhoneChange={(value) => {
                          setInvalidFieldIds(new Set());
                          setValidationAlertOpen(false);
                          setForm((f) => ({ ...f, phone: value }));
                        }}
                        onPhoneCodeChange={handleChange}
                        countryOptions={UAE_PHONE_CODE_OPTIONS}
                        inputClassName={`flex-1 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#f59e0b] focus:bg-white focus:ring-4 focus:ring-[#fde7c2] ${fieldErrorClass('guest-phone')}`}
                      />
                      {fieldRequiredHint('guest-phone')}
                    </div>
                  </div>

                  <div className={guestSectionClass}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-900">{t('checkout.deliveryAddress')}</h3>
                        <p className="mt-1 text-sm text-slate-500">{t('checkout.deliveryAddressHint')}</p>
                      </div>
                      <span className={guestStepBadgeClass}>Step 2</span>
                    </div>

                    <div className={`grid min-w-0 gap-5 ${isUaeCountry(form.country) && form.state ? 'sm:grid-cols-2' : ''}`}>
                      <div id="guest-state" className="min-w-0">
                        <label className={guestLabelClass}>
                          {isUaeCountry(form.country) ? t('checkout.selectEmirate') : t('checkout.emirateState')}
                        </label>
                        {form.country === 'India' ? (
                          <SearchableSelect
                            value={form.state}
                            onChange={handleStateSelect}
                            options={indiaStatesAndDistricts.map((s) => s.state)}
                            placeholder={t('checkout.selectState')}
                            searchPlaceholder="Search state..."
                            required
                            hasError={fieldHasError('guest-state')}
                            triggerClassName={checkoutSelectClass}
                          />
                        ) : isUaeCountry(form.country) ? (
                          <SearchableSelect
                            value={form.state}
                            onChange={handleStateSelect}
                            options={UAE_EMIRATES}
                            placeholder={t('checkout.selectEmirate')}
                            searchPlaceholder="Search emirate..."
                            required
                            hasError={fieldHasError('guest-state')}
                            triggerClassName={checkoutSelectClass}
                          />
                        ) : (
                          <input
                            className={`${guestFieldClass} ${fieldErrorClass('guest-state')}`}
                            type="text"
                            name="state"
                            placeholder={t('checkout.emirateState')}
                            value={form.state || ''}
                            onChange={handleChange}
                            required
                          />
                        )}
                        {fieldRequiredHint('guest-state')}
                      </div>

                      {isUaeCountry(form.country) && form.state ? (
                        <div id="guest-area" className="min-w-0">
                          <label className={guestLabelClass}>{t('checkout.selectArea')}</label>
                          <SearchableSelect
                            value={form.district}
                            onChange={(value) => {
                              setInvalidFieldIds(new Set());
                              setValidationAlertOpen(false);
                              setSidebarPayError('');
                              setForm((f) => ({ ...f, district: value }));
                            }}
                            options={getUaeAreaOptionsForEmirate(form.state, form.district)}
                            placeholder={t('checkout.selectArea')}
                            searchPlaceholder="Search area..."
                            emptyMessage={t('checkout.noAreasFound')}
                            listHint={t('checkout.areaListHint', {
                              count: getUaeAreaOptionsForEmirate(form.state, form.district).length,
                              emirate: form.state,
                            })}
                            allowCustomValue
                            formatCustomOption={(area) => t('checkout.useCustomArea', { area })}
                            required
                            hasError={fieldHasError('guest-area')}
                            triggerClassName={checkoutSelectClass}
                          />
                          {fieldRequiredHint('guest-area')}
                          {!fieldHasError('guest-area') ? (
                            <p className="mt-1 text-xs text-slate-500">{t('checkout.areaHint')}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <label htmlFor="guest-street" className={guestLabelClass}>{t('checkout.street')}</label>
                      <input
                        id="guest-street"
                        className={`${guestFieldClass} ${fieldErrorClass('guest-street')}`}
                        type="text"
                        name="street"
                        placeholder={t('checkout.streetHint')}
                        value={form.street || ''}
                        onChange={handleChange}
                        required
                      />
                      <p className="mt-1 text-xs text-slate-500">{t('checkout.streetHint')}</p>
                      {fieldRequiredHint('guest-street')}
                    </div>

                    {form.country === 'India' && form.state ? (
                      <div id="guest-district" className="min-w-0">
                        <label className={guestLabelClass}>{t('checkout.selectDistrict')}</label>
                        <select
                          className={`${guestFieldClass} ${fieldErrorClass('guest-district')}`}
                          name="district"
                          value={form.district}
                          onChange={handleChange}
                          required
                        >
                          <option value="">{t('checkout.selectDistrict')}</option>
                          {districts.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        {fieldRequiredHint('guest-district')}
                      </div>
                    ) : !isUaeCountry(form.country) && form.country !== 'India' ? (
                      <div className="min-w-0">
                        <label className={guestLabelClass}>{t('checkout.selectDistrict')}</label>
                        <input
                          className={guestFieldClass}
                          type="text"
                          name="district"
                          placeholder="Area or district"
                          value={form.district || ''}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    ) : null}

                    {form.country === 'India' ? (
                      <div id="guest-pincode" className="min-w-0 sm:max-w-xs">
                        <label htmlFor="guest-pincode-input" className={guestLabelClass}>Pincode</label>
                        <input
                          id="guest-pincode-input"
                          className={`${guestFieldClass} ${fieldErrorClass('guest-pincode')}`}
                          type="text"
                          name="pincode"
                          inputMode="numeric"
                          placeholder="6-digit pincode"
                          value={form.pincode || ''}
                          onChange={handleChange}
                          maxLength={6}
                        />
                        {fieldRequiredHint('guest-pincode')}
                      </div>
                    ) : null}

                    <div id="guest-country" className="min-w-0">
                      <label className={guestLabelClass}>{t('checkout.country')}</label>
                      <SearchableSelect
                        value={form.country}
                        onChange={(value) => {
                          setInvalidFieldIds(new Set());
                          setValidationAlertOpen(false);
                          handleGuestCountryChange(value);
                        }}
                        options={getGuestCountryOptions()}
                        placeholder="Select Country"
                        searchPlaceholder="Search country..."
                        emptyMessage="No countries found"
                        required
                        hasError={fieldHasError('guest-country')}
                        triggerClassName={checkoutSelectClass}
                      />
                      {fieldRequiredHint('guest-country')}
                    </div>
                  </div>
                </div>
              ) : null}
              <h2 className="text-xl font-bold mb-3 mt-4 text-gray-900">{t('checkout.paymentMethods')}</h2>
              {fieldRequiredHint('checkout-payment')}

              {storefrontWalletEnabled && user && walletBalance > 0 ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useWalletBalance}
                      onChange={(e) => setUseWalletBalance(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-amber-600"
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-gray-900">{t('checkout.useWalletBalance')}</span>
                      <p className="mt-1 text-sm text-amber-900">
                        {t('checkout.walletAvailable', { amount: formatMoney(walletBalance) })}
                      </p>
                      {useWalletBalance && walletRedeemAmount > 0 ? (
                        <p className="mt-1 text-sm font-medium text-amber-800">
                          -{formatMoney(walletRedeemAmount)} {t('checkout.walletApplied')}
                        </p>
                      ) : null}
                    </div>
                  </label>
                </div>
              ) : null}

              {storefrontWalletEnabled && isFullWalletPayment ? (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-900">{t('checkout.payWithWallet')}</p>
                  <p className="mt-1 text-sm text-emerald-800">{t('checkout.walletCoversOrder')}</p>
                </div>
              ) : (
              <div id="checkout-payment" className={`flex flex-col gap-2 mb-4 ${fieldHasError('checkout-payment') ? 'rounded-2xl ring-2 ring-red-100' : ''}`}>
                {/* Credit Card Option */}
                {showCardPayment ? (
                <label className="flex items-center gap-3 p-4 border-2 rounded-lg transition-all cursor-pointer border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                  <input
                    type="radio"
                    name="payment"
                    value="card"
                    checked={form.payment === 'card'}
                    onChange={handleChange}
                    className="accent-blue-600 w-5 h-5"
                  />
                  <div className="flex-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                        <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
                      </svg>
                      <div>
                        <span className="font-semibold text-gray-900">{t('checkout.creditDebitCard')}</span>
                        <div className="text-xs text-gray-600">{t('checkout.cardSubtitle')}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Image src={VisaLogo} alt="Visa" width={36} height={24} className="h-5 w-auto object-contain rounded-sm bg-black"/>
                      <Image src={MastercardLogo} alt="Mastercard" width={36} height={24} className="h-5 w-auto object-contain"/>
                      <Image src={AmexLogo} alt="American Express" width={36} height={24} className="h-5 w-auto object-contain"/>
                      <Image src={GooglePayLogo} alt="Google Pay" width={40} height={24} className="h-5 w-auto object-contain rounded-sm bg-black"/>
                    </div>
                  </div>
                </label>
                ) : null}

                {/* Cash on Delivery Option */}
                {showCodPayment ? (() => {
                  const maxCODAmount = shippingSetting?.maxCODAmount || 0;
                  const remainingAmount = totalAfterWallet;
                  const isCODDisabled =
                    (maxCODAmount > 0 && remainingAmount > maxCODAmount);

                  return (
                    <label className={`flex items-center gap-3 p-4 border-2 rounded-lg transition-all ${
                      isCODDisabled
                        ? 'opacity-50 cursor-not-allowed border-gray-300 bg-gray-50'
                        : 'cursor-pointer border-gray-200 hover:border-green-400 hover:bg-green-50/30 has-[:checked]:border-green-500 has-[:checked]:bg-green-50'
                    }`}>
                      <input
                        type="radio"
                        name="payment"
                        value="cod"
                        checked={form.payment === 'cod' && !isCODDisabled}
                        onChange={handleChange}
                        disabled={isCODDisabled}
                        className="accent-green-600 w-5 h-5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                          </svg>
                          <div>
                            <span className="font-semibold text-gray-900">{t('checkout.cashOnDelivery')}</span>
                            <div className="text-xs text-gray-600">{t('checkout.codSubtitle')}</div>
                          </div>
                        </div>
                        {isCODDisabled && maxCODAmount > 0 && remainingAmount > maxCODAmount && (
                          <span className="text-xs text-red-600 ml-8">Max limit AED{maxCODAmount}</span>
                        )}
                      </div>
                    </label>
                  );
                })() : null}

                {/* Tamara BNPL Option */}
                {showTamaraPayment ? (() => {
                  const tamaraInstalment = totalAfterWallet > 0 ? Number((totalAfterWallet / 4).toFixed(2)) : 0;
                  return (
                    <label className="flex flex-col gap-0 p-4 border-2 rounded-lg transition-all cursor-pointer border-gray-200 hover:border-[#f075a3] has-[:checked]:border-[#f075a3] has-[:checked]:bg-[#fff5f9]">
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="payment"
                          value="tamara"
                          checked={form.payment === 'tamara'}
                          onChange={handleChange}
                          className="w-5 h-5 flex-shrink-0"
                          style={{ accentColor: '#f075a3' }}
                        />
                        <BnplLogo provider="tamara" size="checkout" />
                        <span className="text-sm font-semibold text-gray-900">Split in up to 4 payments</span>
                        <span className="ml-0.5 w-4 h-4 rounded-full border border-gray-400 text-gray-400 text-[10px] flex items-center justify-center flex-shrink-0" title="Pay in 4 equal interest-free instalments">?</span>
                      </div>
                      <div className="ml-8 mt-1">
                        <p className="text-sm text-[#F75B94]">
                          Pay <span className="font-bold text-base">{formatMoneyFixed(tamaraInstalment)}</span> today
                        </p>
                        <p className="text-xs text-gray-500">and the rest in 3 interest-free payments</p>
                      </div>
                      {totalAfterWallet > 0 && (
                        <div className="ml-8 grid grid-cols-4 gap-2 mt-3">
                          {['Today', 'In 1 month', 'In 2 months', 'In 3 months'].map((label) => (
                            <div key={label} className="flex flex-col items-center bg-white border border-gray-200 rounded-md pt-2 pb-1 px-1 text-center">
                              <span className="text-xs font-bold text-gray-900">{formatMoneyFixed(tamaraInstalment)}</span>
                              <span className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</span>
                              <div className="mt-1.5 h-[3px] w-full rounded-full bg-gradient-to-r from-[#f075a3] to-[#fbb6ce]" />
                            </div>
                          ))}
                        </div>
                      )}
                    </label>
                  );
                })() : null}

                {/* Tabby BNPL Option */}
                {showTabbyPayment ? (() => {
                  const tabbyInstalment = totalAfterWallet > 0 ? Number((totalAfterWallet / 4).toFixed(2)) : 0;
                  return (
                    <label className="flex flex-col gap-0 p-4 border-2 rounded-lg transition-all cursor-pointer border-gray-200 hover:border-[#3DBEA3] has-[:checked]:border-[#3DBEA3] has-[:checked]:bg-[#f0faf8]">
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="payment"
                          value="tabby"
                          checked={form.payment === 'tabby'}
                          onChange={handleChange}
                          className="w-5 h-5 flex-shrink-0"
                          style={{ accentColor: '#3DBEA3' }}
                        />
                        <BnplLogo provider="tabby" size="checkout" />
                        <span className="text-sm font-semibold text-gray-900">Split in up to 4 payments</span>
                        <span className="ml-0.5 w-4 h-4 rounded-full border border-gray-400 text-gray-400 text-[10px] flex items-center justify-center flex-shrink-0" title="Pay in 4 equal interest-free instalments">?</span>
                      </div>
                      <div className="ml-8 mt-1">
                        <p className="text-sm text-[#2E9E88]">
                          Pay <span className="font-bold text-base">{formatMoneyFixed(tabbyInstalment)}</span> today
                        </p>
                        <p className="text-xs text-gray-500">and the rest in 3 interest-free payments</p>
                      </div>
                      {totalAfterWallet > 0 && (
                        <div className="ml-8 grid grid-cols-4 gap-2 mt-3">
                          {['Today', 'In 1 month', 'In 2 months', 'In 3 months'].map((label) => (
                            <div key={label} className="flex flex-col items-center bg-white border border-gray-200 rounded-md pt-2 pb-1 px-1 text-center">
                              <span className="text-xs font-bold text-gray-900">{formatMoneyFixed(tabbyInstalment)}</span>
                              <span className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</span>
                              <div className="mt-1.5 h-[3px] w-full rounded-full bg-gradient-to-r from-[#3DBEA3] to-[#a7e8de]" />
                            </div>
                          ))}
                        </div>
                      )}
                      {form.payment === 'tabby' && (
                        <div className="ml-8 mt-3 border border-gray-200 rounded-lg p-2 bg-white" id="tabbyCard"></div>
                      )}
                    </label>
                  );
                })() : null}
              </div>
              )}

              {hasPersonalizedOfferItem && (
                <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  COD is not available for personalized offer products. Please use online payment.
                </div>
              )}
              
              {!user && !hasPersonalizedOfferItem && (
                <div className="mt-4 mb-8 text-sm text-gray-600 bg-green-50 border border-green-200 rounded-lg p-3">
                  <span className="font-semibold text-green-900">✓ Guest Checkout Available:</span> You can place COD orders without creating an account. Your order will be processed instantly!
                </div>
              )}
            </form>
          </div>
        </div>
        {/* Right column: discount input, order summary and place order button */}
        <div className="flex h-fit flex-col border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:rounded-xl md:border-2 md:border-slate-200 md:p-8">
          <div className="mb-4 pb-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">{t('checkout.orderSummary')}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t('checkout.itemCount', { count: cartItemCount })} · {formatMoney(subtotal)}
            </p>
          </div>

          {!appliedCoupon ? (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Tag size={16} className="text-slate-500" />
                <span className="text-sm font-semibold text-slate-800">{t('checkout.applyCoupon')}</span>
              </div>
              <form onSubmit={handleApplyCoupon} className="flex gap-2">
                <input
                  type="text"
                  value={coupon}
                  onChange={(e) => {
                    setCoupon(e.target.value);
                    if (couponError) setCouponError('');
                  }}
                  placeholder="Enter coupon code"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
                <button
                  type="submit"
                  disabled={couponLoading || form.payment !== 'card'}
                  className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {couponLoading ? '...' : 'Apply'}
                </button>
              </form>
              {couponError ? (
                <p className="mt-2 text-xs text-red-600">{couponError}</p>
              ) : null}
              {form.payment !== 'card' ? (
                <p className="mt-2 text-xs text-amber-700">
                  Select <strong>Card</strong> payment to use a coupon.
                </p>
              ) : !user ? (
                <p className="mt-2 text-xs text-slate-600">
                  Sign in to apply a coupon code.
                </p>
              ) : null}
              {availableCoupons.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowCouponModal(true)}
                  className="mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700"
                >
                  View {availableCoupons.length} available coupon{availableCoupons.length === 1 ? '' : 's'}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Price breakdown */}
          <div className="mb-4 space-y-3 border-b border-emerald-100 pb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{t('checkout.subtotal')}</span>
              <span className="font-medium text-slate-900">{formatMoney(subtotal)}</span>
            </div>

            {appliedCoupon && couponDiscount > 0 && (
              <div className="flex items-center justify-between text-sm text-blue-700">
                <span>{t('checkout.couponDiscount')} ({appliedCoupon.code})</span>
                <span className="font-semibold">-{formatMoney(couponDiscount)}</span>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{t('checkout.shippingHandling')}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {summaryDeliveryLabel} · {t('checkout.deliveredInDays', { days: summaryDeliveryDays })}
                  </p>
                  {hasFreeShippingProduct && effectiveShipping === 0 && !isFreeShippingCouponApplied ? (
                    <p className="mt-1 text-xs text-emerald-700">{t('checkout.productFreeShippingNote')}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {isFreeShippingCouponApplied && shipping > 0 ? (
                    <>
                      <span className="block text-xs text-slate-400 line-through">{formatMoney(shipping)}</span>
                      <span className="font-semibold text-emerald-600">{t('cart.free')}</span>
                    </>
                  ) : (
                    <span className={`font-semibold ${effectiveShipping === 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {effectiveShipping === 0 ? t('cart.free') : formatMoney(effectiveShipping)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {isFreeShippingCouponApplied && shippingDiscount > 0 && (
              <div className="flex items-center justify-between text-sm text-emerald-700">
                <span>{t('checkout.freeShippingCoupon')} ({appliedCoupon.code})</span>
                <span className="font-semibold">-{formatMoney(shippingDiscount)}</span>
              </div>
            )}

            {storefrontWalletEnabled && walletRedeemAmount > 0 && (
              <div className="flex items-center justify-between text-sm text-amber-800">
                <span>{t('checkout.walletApplied')}</span>
                <span className="font-semibold">-{formatMoney(walletRedeemAmount)}</span>
              </div>
            )}
          </div>

          {appliedCoupon && (couponDiscount > 0 || isFreeShippingCouponApplied) && (
            <div className="mb-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">{t('checkout.couponApplied')}</span>
                <span className="font-semibold text-slate-900">{appliedCoupon.code}</span>
              </div>
              {totalSavings > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">{t('checkout.youSave')}</span>
                  <span className="font-semibold text-emerald-700">{formatMoney(totalSavings)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setAppliedCoupon(null);
                  setCoupon('');
                }}
                className="text-xs font-semibold text-red-600 hover:text-red-700"
              >
                {t('checkout.removeCoupon')}
              </button>
            </div>
          )}

          <div className="mb-1 rounded-lg border border-emerald-200 bg-white px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-slate-900">{t('checkout.totalToPay')}</span>
              <span className="text-xl font-bold text-slate-900">{formatMoney(totalAfterWallet)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('checkout.inclVat')}</p>
            {needsPaymentSelection ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <span>{t('checkout.payWith')}:</span>
                {form.payment === 'tamara' ? (
                  <span className="text-slate-800">{renderPayByMethodLabel('Tamara')}</span>
                ) : form.payment === 'tabby' ? (
                  <span className="text-slate-800">{renderPayByMethodLabel('Tabby')}</span>
                ) : form.payment === 'cod' ? (
                  <span className="text-slate-800">{renderPayByMethodLabel('Cod')}</span>
                ) : form.payment === 'card' ? (
                  <span className="text-slate-800">{renderPayByMethodLabel('Card')}</span>
                ) : form.payment === 'wallet' ? (
                  <span className="text-slate-800">{renderPayByMethodLabel('Wallet')}</span>
                ) : (
                  <span className="font-medium text-slate-800">{paymentMethodSummary}</span>
                )}
              </p>
            ) : null}
          </div>
          {sidebarPayError ? (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 shadow-sm"
            >
              {sidebarPayError}
            </p>
          ) : isLoggedInAreaMissing || isLoggedInDistrictMissing ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {isLoggedInDistrictMissing ? t('checkout.selectDistrict') : t('checkout.selectAreaRequired')}
            </p>
          ) : null}
          <button
            type="submit"
            form="checkout-form"
            onClick={handlePlaceOrderClick}
            className={`mt-4 hidden md:flex relative w-full items-center justify-center text-white py-3.5 rounded-lg text-base transition shadow-md hover:shadow-lg ${placeOrderButtonColors} ${placingOrder ? 'animate-bounce' : ''}`}
            disabled={isCheckoutSubmitDisabled}
            aria-busy={placingOrder}
          >
            {placingOrder ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                {renderPlacingOrderLabel()}
              </span>
            ) : (
              renderPlaceOrderButtonContent()
            )}
            {placingOrder && (
              <span className="absolute left-0 top-0 h-full w-full overflow-hidden rounded opacity-20">
                <span className="block h-full w-1/3 bg-white animate-[shimmer_1.2s_ease_infinite]" />
              </span>
            )}
          </button>
          
          {/* Safe & Secure Checkout */}
          <div className="mt-6 border-t border-slate-200 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <h3 className="font-semibold text-gray-900">{t('checkout.safeCheckout')}</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-gray-700">{t('checkout.sslEncrypted')}</span>
              </div>
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-gray-700">{t('checkout.secureTransactions')}</span>
              </div>
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-gray-700">{t('checkout.dataProtected')}</span>
              </div>
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-gray-700">{t('checkout.easyReturns')}</span>
              </div>
            </div>
            
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 mb-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-emerald-900">{t('checkout.protectPayment')}</p>
                  <p className="text-xs text-emerald-800 mt-1">{t('checkout.protectPaymentDesc')}</p>
                </div>
              </div>
            </div>
            
            <div className="mb-3 text-xs text-gray-600">
              <p>
                {t('checkout.customerSupport', {
                  phone: formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE),
                  email: STORE1920_SUPPORT_EMAIL,
                })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              
              <span className="text-gray-300">•</span>
              <a href="/terms-and-conditions" className="text-gray-600 hover:text-gray-900 hover:underline">{t('checkout.termsOfUse')}</a>
              <span className="text-gray-300">•</span>
              <a href="/terms-of-sale" className="text-gray-600 hover:text-gray-900 hover:underline">{t('checkout.termsOfSale')}</a>
              <span className="text-gray-300">•</span>
              <a href="/shipping-policy" className="text-gray-600 hover:text-gray-900 hover:underline">{t('checkout.shippingPolicy')}</a>
              <span className="text-gray-300">•</span>
              <a href="/return-policy" className="text-gray-600 hover:text-gray-900 hover:underline">{t('checkout.returnPolicy')}</a>
              <span className="text-gray-300">•</span>
              <a href="/privacy-policy" className="text-gray-600 hover:text-gray-900 hover:underline">{t('checkout.privacyPolicy')}</a>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Footer - Only Total and Place Order on Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white p-3 shadow-lg md:hidden">
        <div className="mx-auto max-w-6xl">
          {sidebarPayError ? (
            <p
              role="alert"
              className="mb-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 shadow-sm"
            >
              {sidebarPayError}
            </p>
          ) : isLoggedInAreaMissing || isLoggedInDistrictMissing ? (
            <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {isLoggedInDistrictMissing ? t('checkout.selectDistrict') : t('checkout.selectAreaRequired')}
            </p>
          ) : null}
          <button
            type="submit"
            form="checkout-form"
            onClick={handlePlaceOrderClick}
            className={`relative w-full text-white py-4 rounded-lg text-base transition shadow-md hover:shadow-lg flex items-center justify-between px-6 ${mobilePlaceOrderButtonColors} ${placingOrder ? 'animate-bounce' : ''}`}
            disabled={isCheckoutSubmitDisabled}
            aria-busy={placingOrder}
          >
            <span className="text-lg font-bold">{formatMoney(totalAfterWallet)}</span>
            {placingOrder ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                {renderPlacingOrderLabel()}
              </span>
            ) : (
              <span className="flex items-center justify-end min-w-0">
                {renderPlaceOrderButtonContent()}
              </span>
            )}
            {placingOrder && (
              <span className="absolute left-0 top-0 h-full w-full overflow-hidden rounded opacity-20">
                <span className="block h-full w-1/3 bg-white animate-[shimmer_1.2s_ease_infinite]" />
              </span>
            )}
          </button>
        </div>
      </div>
      </div>

      <CheckoutValidationAlert
        open={validationAlertOpen}
        issues={validationIssues}
        title={isArabic ? 'يرجى إكمال هذه الحقول' : 'Please complete these fields'}
        hint={isArabic ? 'اضغط على الحقل للانتقال إليه' : 'Tap a field below to go there'}
        confirmLabel={isArabic ? 'حسناً' : 'OK'}
        onClose={() => setValidationAlertOpen(false)}
        onIssueClick={handleValidationIssueClick}
      />

      {removeLastItemConfirm ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            aria-label={t('checkout.removeLastItemCancel')}
            onClick={() => setRemoveLastItemConfirm(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-remove-last-item-title"
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            dir={isArabic ? 'rtl' : 'ltr'}
          >
            <h3 id="checkout-remove-last-item-title" className="text-lg font-semibold text-slate-900">
              {t('checkout.removeLastItemTitle')}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {t('checkout.removeLastItemMessage')}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRemoveLastItemConfirm(null)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {t('checkout.removeLastItemCancel')}
              </button>
              <button
                type="button"
                onClick={confirmRemoveLastItem}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                {t('checkout.removeLastItemConfirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAllOrderItemsModal ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            aria-label="Close all order items"
            onClick={() => setShowAllOrderItemsModal(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-all-items-title"
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <h3 id="checkout-all-items-title" className="text-lg font-semibold text-slate-900">
                {t('checkout.yourOrder')} ({cartArray.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowAllOrderItemsModal(false)}
                className="rounded-full px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                {isArabic ? 'إغلاق' : 'Close'}
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {cartArray.map(renderCheckoutOrderItem)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AddressModal 
        open={showAddressModal} 
        allowGuest={!user}
        setShowAddressModal={(show) => {
          setShowAddressModal(show);
          if (!show) setEditingAddressId(null);
        }} 
        onAddressAdded={(addr) => {
          const saved = !user ? upsertGuestAddress(guestAddresses, addr).address : addr;
          if (!user) {
            const next = upsertGuestAddress(guestAddresses, addr);
            setGuestAddresses(next.addresses);
            writeGuestCheckoutState({
              addresses: next.addresses,
              selectedId: next.address._id,
              draft: formToGuestDraft(next.address),
            });
          }
          setForm((f) => ({
            ...f,
            addressId: saved._id,
            name: saved.name || f.name,
            email: saved.email || f.email,
            phone: cleanDigits(saved.phone) || cleanDigits(user?.phoneNumber || user?.phone) || f.phone,
            phoneCode: saved.phoneCode || UAE_PHONE_CODE,
            alternatePhone: cleanDigits(saved.alternatePhone),
            alternatePhoneCode: saved.alternatePhoneCode || UAE_PHONE_CODE,
            street: saved.street || f.street,
            city: saved.city || f.city,
            state: saved.state || f.state,
            district: saved.district || f.district,
            country: saved.country || f.country,
            pincode: pickValidPincode(saved.zip, saved.pincode, f.pincode),
          }));
          if (user) dispatch(fetchAddress({ getToken }));
          setEditingAddressId(null);
        }}
        initialAddress={editingAddressId ? checkoutAddressList.find(a => a._id === editingAddressId) : null}
        isEdit={!!editingAddressId}
        onAddressUpdated={(updated) => {
          if (!user && updated) {
            const next = upsertGuestAddress(guestAddresses, updated);
            setGuestAddresses(next.addresses);
            writeGuestCheckoutState({
              addresses: next.addresses,
              selectedId: next.address._id,
              draft: formToGuestDraft(next.address),
            });
            setForm((f) => ({
              ...f,
              addressId: next.address._id,
              name: next.address.name || f.name,
              email: next.address.email || f.email,
              phone: cleanDigits(next.address.phone) || f.phone,
              phoneCode: next.address.phoneCode || f.phoneCode || UAE_PHONE_CODE,
              street: next.address.street || f.street,
              city: next.address.city || f.city,
              state: next.address.state || f.state,
              district: next.address.district || f.district,
              country: next.address.country || f.country,
              pincode: pickValidPincode(next.address.zip, next.address.pincode, f.pincode),
            }));
          } else if (user) {
            dispatch(fetchAddress({ getToken }));
          }
          setEditingAddressId(null);
        }}
        onAddressDeleted={(addressId) => {
          if (!user) {
            const next = removeGuestAddress(guestAddresses, addressId);
            setGuestAddresses(next);
            const nextSelected = next[0] || null;
            writeGuestCheckoutState({
              addresses: next,
              selectedId: nextSelected?._id || '',
              draft: nextSelected ? formToGuestDraft(nextSelected) : formToGuestDraft(form),
            });
            if (form.addressId === addressId) {
              if (nextSelected) {
                setForm((f) => ({
                  ...f,
                  addressId: nextSelected._id,
                  name: nextSelected.name || f.name,
                  email: nextSelected.email || f.email,
                  phone: cleanDigits(nextSelected.phone) || f.phone,
                  phoneCode: nextSelected.phoneCode || f.phoneCode || UAE_PHONE_CODE,
                  street: nextSelected.street || f.street,
                  city: nextSelected.city || f.city,
                  state: nextSelected.state || f.state,
                  district: nextSelected.district || f.district,
                  country: nextSelected.country || f.country,
                  pincode: pickValidPincode(nextSelected.zip, nextSelected.pincode, f.pincode),
                }));
              } else {
                setForm((f) => ({ ...f, addressId: '' }));
              }
            }
            return;
          }
          dispatch(fetchAddress({ getToken }));
          if (form.addressId === addressId) {
            setForm((f) => ({ ...f, addressId: '' }));
          }
        }}
        addressList={checkoutAddressList}
        selectedAddressId={form.addressId}
        onSelectAddress={(addressId) => {
          // Find the selected address and populate form with its data
          const selectedAddr = checkoutAddressList.find(a => a._id === addressId);
          if (selectedAddr) {
            setForm(f => {
              const addressPhone = cleanDigits(selectedAddr.phone);
              const userPhone = cleanDigits(user?.phoneNumber || user?.phone);
              const finalPhone = addressPhone || userPhone || f.phone || '';
              const finalPincode = pickValidPincode(selectedAddr.zip, selectedAddr.pincode, f.pincode);

              return { 
                ...f, 
                addressId,
                name: selectedAddr.name || f.name,
                email: selectedAddr.email || f.email,
                phone: finalPhone,
                phoneCode: selectedAddr.phoneCode || UAE_PHONE_CODE,
                alternatePhone: cleanDigits(selectedAddr.alternatePhone),
                alternatePhoneCode: selectedAddr.alternatePhoneCode || UAE_PHONE_CODE,
                street: selectedAddr.street || f.street,
                city: selectedAddr.city || f.city,
                state: selectedAddr.state || f.state,
                district: selectedAddr.district || f.district,
                country: selectedAddr.country || f.country,
                pincode: finalPincode,
              };
            });
          } else {
            setForm(f => ({ ...f, addressId }));
          }
        }}
      />
      <SignInModal open={showSignIn} onClose={() => setShowSignIn(false)} />
      <PrepaidUpsellModal 
        open={showPrepaidModal}
        orderTotal={upsellOrderTotal}
        discountAmount={upsellOrderTotal * 0.05}
        onClose={completePrepaidUpsell}
        onNoThanks={completePrepaidUpsell}
        onAutoDismiss={completePrepaidUpsell}
        onPayNow={handlePayNowForExistingOrder}
        loading={payingNow}
      />

      {/* Coupon Modal */}
      {showCouponModal && (
        <div className="fixed inset-0 bg-white/10 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={() => setShowCouponModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-xl font-bold text-gray-900">{t('checkout.applyCoupon')}</h3>
              <button onClick={() => setShowCouponModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Coupon Input */}
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <form onSubmit={handleApplyCoupon} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  className="border border-gray-300 rounded-lg px-4 py-3 flex-1 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="Enter coupon code"
                  value={coupon}
                  onChange={e => setCoupon(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={form.payment !== 'card'}
                  className={`font-semibold px-6 py-3 rounded-lg transition whitespace-nowrap w-full sm:w-auto ${
                    form.payment !== 'card'
                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  Apply
                </button>
              </form>
              {form.payment !== 'card' && (
                <div className="text-xs text-amber-600 mt-2">
                  Coupons are available only for card payments.
                </div>
              )}
              {couponError && <div className="text-red-500 text-xs mt-2">{couponError}</div>}
            </div>

            {/* Available Coupons */}
            <div className="p-4 sm:p-6">
              <h4 className="font-semibold text-gray-900 mb-4">Available Coupons</h4>
              
              {availableCoupons.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No coupons available at the moment</p>
              ) : (
                availableCoupons.map((cpn) => {
                  // Determine eligibility
                  // Convert cartItems object to array
                  const cartItemsArray = Object.entries(cartItems || {})
                    .map(([id, value]) => ({
                      productId: getCartEntryProductId(id, value),
                      quantity: getCartEntryQuantity(value),
                      variantId: typeof value === 'object' ? value?.variantId : undefined,
                      isFreeGift: isFreeGiftEntry(value),
                    }))
                    .filter((item) => item.quantity > 0 && item.productId && !item.isFreeGift);
                  
                  const itemsTotal = cartItemsArray.reduce((sum, item) => {
                    const product = products.find((p) => p._id === item.productId);
                    if (!product) return sum;
                    const cartValue = cartItems[Object.keys(cartItems).find((key) => getCartEntryProductId(key, cartItems[key]) === item.productId)];
                    const pricing = resolveCartLinePricing(product, cartValue, item.quantity);
                    return sum + pricing.lineTotal;
                  }, 0);
                  
                  const cartProductIds = cartItemsArray.map(item => item.productId);
                  
                  const canUseCoupons = form.payment === 'card';
                  let isEligible = true;
                  let ineligibleReason = '';

                  if (!canUseCoupons) {
                    isEligible = false;
                    ineligibleReason = 'Only for card payments';
                  }
                  
                  // Check if expired
                  if (cpn.isExpired) {
                    isEligible = false;
                    ineligibleReason = 'Coupon expired';
                  }
                  // Check if exhausted
                  else if (cpn.isExhausted) {
                    isEligible = false;
                    ineligibleReason = 'Usage limit reached';
                  }
                  // Check minimum order value
                  else if (itemsTotal < cpn.minOrderValue) {
                    isEligible = false;
                    ineligibleReason = `Min order AED${cpn.minOrderValue} required`;
                  }
                  // Check if product-specific
                  else if (cpn.specificProducts?.length > 0) {
                    const hasEligibleProduct = cpn.specificProducts.some(pid => cartProductIds.includes(pid));
                    if (!hasEligibleProduct) {
                      isEligible = false;
                      ineligibleReason = 'Not applicable for your products';
                    }
                  }
                  
                  const badgeColors = {
                    green: 'bg-green-100 text-green-700',
                    orange: 'bg-orange-100 text-orange-700',
                    purple: 'bg-purple-100 text-purple-700',
                    blue: 'bg-blue-100 text-blue-700',
                  };
                  const badgeClass = badgeColors[cpn.badgeColor] || badgeColors.green;
                  
                  return (
                    <div
                      key={cpn._id}
                      className={`border border-dashed rounded-lg p-4 mb-3 transition ${
                        isEligible 
                          ? 'border-green-200 bg-green-50 hover:border-green-300 hover:bg-green-100' 
                          : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-75'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`${badgeClass} font-bold text-xs px-2 py-1 rounded`}>
                            {cpn.code}
                          </div>
                          <div className="flex-1">
                            <span className="text-sm font-semibold text-gray-900 block">{cpn.title}</span>
                            {!isEligible && <span className="text-xs text-red-600 font-medium">{ineligibleReason}</span>}
                          </div>
                        </div>
                        {isEligible ? (
                          <button
                            type="button"
                            disabled={couponLoading}
                            onClick={() => handleApplyCoupon({ preventDefault: () => {} }, cpn.code)}
                            className="ml-2 whitespace-nowrap px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {couponLoading ? 'Applying...' : t('checkout.useCode')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="ml-2 whitespace-nowrap px-3 py-1.5 rounded-md bg-gray-200 text-gray-500 text-xs font-semibold cursor-not-allowed"
                          >
                            {t('checkout.notEligible')}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-600">{cpn.description}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Razorpay Script */}
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayLoaded(true)}
        onError={() => setFormError("Failed to load payment system")}
      />
      <Script src="https://checkout.tabby.ai/tabby-card.js" onLoad={() => setTabbyCardLoaded(true)} />
    </>
  );
}
