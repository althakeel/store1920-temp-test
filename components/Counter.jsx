'use client'
import { Minus, Plus } from 'lucide-react';
import { useDispatch, useSelector } from "react-redux";
import {
  isBulkBundleProduct,
  isMatrixStyleProduct,
  resolveCartLinePricing,
  resolveBulkCartMaxPacks,
  resolveMatrixCartMaxPacks,
} from '@/lib/bulkBundleCart';
import { decrementCartItem, incrementCartItem } from '@/lib/bundleCartActions';

const Counter = ({ productId, maxQty, product, variant = 'default', onDecrease }) => {

    const { cartItems } = useSelector(state => state.cart);

    const dispatch = useDispatch();

    const entry = cartItems[productId];
    const quantity = typeof entry === 'number' ? entry : entry?.quantity || 0;
    const pricing = product ? resolveCartLinePricing(product, entry, quantity) : null;
    const isMatrix = Boolean(product && isMatrixStyleProduct(product));
    const isBundle = Boolean(product && !isMatrix && isBulkBundleProduct(product));
    const displayQuantity = quantity;
    const matrixMaxPacks = isMatrix ? resolveMatrixCartMaxPacks(product, entry) : null;
    const bulkMaxPacks = isBundle ? resolveBulkCartMaxPacks(product, entry) : null;
    const normalizedMaxQty = typeof maxQty === 'number'
      ? Math.max(0, maxQty)
      : (matrixMaxPacks != null ? matrixMaxPacks : (bulkMaxPacks != null ? bulkMaxPacks : null));
    const canIncrement = normalizedMaxQty === null ? true : quantity < normalizedMaxQty;

    const addToCartHandler = () => {
        incrementCartItem(dispatch, {
          productId,
          entry,
          product,
          price: typeof entry === 'object' ? entry?.price : undefined,
          maxQty: normalizedMaxQty,
        });
    }

    const removeFromCartHandler = () => {
        if (typeof onDecrease === 'function') {
            onDecrease();
            return;
        }
        decrementCartItem(dispatch, { productId, entry, product });
    }

    if (variant === 'cart') {
        return (
            <div className="inline-flex h-10 shrink-0 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                    type="button"
                    onClick={removeFromCartHandler}
                    className="inline-flex w-10 items-center justify-center text-slate-600 transition hover:bg-slate-50"
                    aria-label="Decrease quantity"
                >
                    <Minus size={15} />
                </button>
                <span className="flex min-w-[2.5rem] items-center justify-center border-x border-slate-200 bg-slate-50 px-2 text-sm font-semibold tabular-nums text-slate-900">
                    {displayQuantity}
                </span>
                <button
                    type="button"
                    onClick={addToCartHandler}
                    disabled={!canIncrement}
                    className="inline-flex w-10 items-center justify-center text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Increase quantity"
                >
                    <Plus size={15} />
                </button>
            </div>
        );
    }

    return (
        <div className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 px-3 py-1 max-sm:text-sm text-slate-600">
            <button type="button" onClick={removeFromCartHandler} className="p-1 select-none">-</button>
            <p className="min-w-[1.75rem] p-1 text-center tabular-nums">{displayQuantity}</p>
            <button
                type="button"
                onClick={addToCartHandler}
                disabled={!canIncrement}
                className={`p-1 select-none ${!canIncrement ? 'opacity-40 cursor-not-allowed' : ''}`}
            >+
            </button>
        </div>
    )
}

export default Counter
