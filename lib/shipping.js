// lib/shipping.js
import axios from 'axios';
import {
  getDefaultShippingOption,
  resolveShippingOptions,
} from '@/lib/shippingOptions';
import { FREE_DELIVERY_THRESHOLD_AED } from '@/lib/freeDeliveryPolicy';

const shippingCache = new Map();
const SHIPPING_CACHE_TTL_MS = 60_000;

export async function fetchShippingSettings(storeId) {
  const cacheKey = String(storeId || 'default');
  const cached = shippingCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SHIPPING_CACHE_TTL_MS) {
    return cached.setting;
  }

  try {
    const params = {};
    if (storeId) params.storeId = storeId;
    const { data } = await axios.get('/api/shipping', { params });
    const setting = data.setting;
    if (setting) {
      setting.shippingOptions = resolveShippingOptions(setting);
    }
    shippingCache.set(cacheKey, { setting, at: Date.now() });
    return setting;
  } catch (error) {
    // Soft-fail: use stale cache if rate-limited so product pages keep working.
    if (cached?.setting) {
      console.warn('Shipping settings rate-limited; using cached settings');
      return cached.setting;
    }
    console.error('Error fetching shipping settings:', error);
    return null;
  }
}

function getLineSubtotal(cartItems) {
  return cartItems.reduce((sum, item) => {
    const lineTotal = Number(item?._lineTotal);
    if (Number.isFinite(lineTotal)) return sum + lineTotal;
    const price = Number(item?._cartPrice ?? item?.price ?? 0) || 0;
    return sum + price * item.quantity;
  }, 0);
}

function splitCartByProductFreeShipping(cartItems, shippingSetting) {
  const productSpecificEnabled = Boolean(shippingSetting?.enableProductSpecificFreeShipping);
  if (!productSpecificEnabled) {
    return { chargeableItems: cartItems, waiveEntireOrder: false };
  }

  const freeItems = cartItems.filter((item) => Boolean(item?.freeShippingEligible));
  const chargeableItems = cartItems.filter((item) => !item?.freeShippingEligible);
  const mode = shippingSetting?.productSpecificFreeShippingMode === 'ORDER_LEVEL'
    ? 'ORDER_LEVEL'
    : 'MARKED_ITEMS_ONLY';

  if (mode === 'ORDER_LEVEL' && freeItems.length > 0) {
    return { chargeableItems: [], waiveEntireOrder: true };
  }

  return {
    chargeableItems,
    waiveEntireOrder: chargeableItems.length === 0 && freeItems.length > 0,
  };
}

export function cartHasOnlyFreeShippingProducts(cartItems = []) {
  return cartItems.length > 0 && cartItems.every((item) => Boolean(item?.freeShippingEligible));
}

function getTotalItemWeight(cartItems) {
  return cartItems.reduce((sum, item) => {
    const weight = Number(item?.weight ?? item?.productWeight ?? 0) || 0;
    return sum + weight * Number(item?.quantity || 0);
  }, 0);
}

function calculateOptionBaseFee({ cartItems, option, subtotal, stateFee }) {
  const shippingType = option?.shippingType || 'FLAT_RATE';

  if (shippingType === 'FREE') {
    return 0;
  }

  if (shippingType === 'FLAT_RATE') {
    return Number(option.flatRate || 0);
  }

  if (shippingType === 'PER_ITEM') {
    const totalItems = cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    let fee = Number(option.perItemFee || 0) * totalItems;
    if (option.maxItemFee != null) {
      fee = Math.min(fee, Number(option.maxItemFee || 0));
    }
    return fee;
  }

  if (shippingType === 'WEIGHT_BASED') {
    const totalWeight = getTotalItemWeight(cartItems);
    const baseWeight = Number(option.baseWeight || 1);
    const baseWeightFee = Number(option.baseWeightFee || 0);
    const additionalWeightFee = Number(option.additionalWeightFee || 0);

    if (totalWeight <= baseWeight) {
      return baseWeightFee;
    }

    const extraUnits = Math.ceil(totalWeight - baseWeight);
    return baseWeightFee + extraUnits * additionalWeightFee;
  }

  return Number(option?.flatRate || 0);
}

export function calculateShipping({
  cartItems,
  shippingSetting,
  shippingOption = null,
  paymentMethod = 'CARD',
  shippingState = '',
}) {
  if (!shippingSetting || !shippingSetting.enabled) return 0;

  const option =
    shippingOption
    || getDefaultShippingOption(shippingSetting, shippingState)
    || resolveShippingOptions(shippingSetting)[0];

  if (!option) return 0;

  const { chargeableItems, waiveEntireOrder } = splitCartByProductFreeShipping(
    cartItems,
    shippingSetting,
  );

  if (waiveEntireOrder) {
    let shippingFee = 0;
    if (paymentMethod === 'COD' && shippingSetting.enableCOD && shippingSetting.codFee) {
      shippingFee += shippingSetting.codFee;
    }
    return shippingFee;
  }

  const normalizedState = String(shippingState || '').trim().toLowerCase();
  const stateFeeEntry = Array.isArray(shippingSetting.stateCharges)
    ? shippingSetting.stateCharges.find(
        (entry) => String(entry?.state || '').trim().toLowerCase() === normalizedState,
      )
    : null;
  const stateFee = stateFeeEntry ? Number(stateFeeEntry.fee || 0) : null;
  const subtotal = getLineSubtotal(chargeableItems);

  let shippingFee = calculateOptionBaseFee({
    cartItems: chargeableItems,
    option,
    subtotal,
    stateFee,
  });

  const isExpress =
    option?.id === 'express' || /express/i.test(String(option?.name || ''));
  if (
    !isExpress
    && option.shippingType === 'FLAT_RATE'
    && subtotal >= FREE_DELIVERY_THRESHOLD_AED
    && typeof stateFee !== 'number'
  ) {
    shippingFee = 0;
  }

  if (typeof stateFee === 'number') {
    shippingFee = stateFee;
  }

  if (paymentMethod === 'COD' && shippingSetting.enableCOD && shippingSetting.codFee) {
    shippingFee += shippingSetting.codFee;
  }

  return shippingFee;
}
