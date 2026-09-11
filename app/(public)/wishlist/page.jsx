'use client';

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useRouter } from "next/navigation";
import axios from "axios";
import Image from "@/components/SafeNextImage";
import {
  HeartIcon,
  ShoppingCartIcon,
  TrashIcon,
  CheckCircle2,
} from "lucide-react";
import { useDispatch } from "react-redux";
import { addToCart } from "@/lib/features/cart/cartSlice";
import { trackProductAddToCart } from '@/lib/ecommerceTracking';
import { STORE_CURRENCY } from '@/lib/storeCurrency';
import { getProductPath } from "@/lib/productUrl";
import { useStorefrontMarket } from "@/lib/useStorefrontMarket";
import PageTitle from "@/components/PageTitle";
import CurrencySymbol, { AedText } from "@/components/CurrencySymbol";
import NewProductTagBadge from "@/components/NewProductTagBadge";

const PLACEHOLDER_IMAGE = "/placeholder.png";

/* ----------------------------------------------------
   Normalize wishlist item (API / Guest safe)
---------------------------------------------------- */
const getProduct = (item) => {
  if (!item) return null;

  if (item.product) {
    return {
      ...item.product,
      _pid: item.productId || item.product.id,
    };
  }

  return {
    ...item,
    _pid: item.productId || item.id,
  };
};

const resolveWishlistProductPath = (product) => {
  if (!product) return null;
  const path = getProductPath(product);
  return path === '/shop' ? null : path;
};

function WishlistItemRow({
  product,
  isSelected,
  market,
  convertPrice,
  onToggleSelect,
  onRemove,
  onAddToCart,
  onOpenProduct,
}) {
  const img = product.images?.[0] || PLACEHOLDER_IMAGE;
  const discount = product.AED
    ? Math.round(((product.AED - product.price) / product.AED) * 100)
    : 0;
  const convertedPrice = convertPrice(Number(product.price) || 0);
  const convertedAED = convertPrice(Number(product.AED) || 0);

  return (
    <article
      className={`relative flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all sm:flex-row sm:items-stretch sm:p-5 ${
        isSelected
          ? 'border-orange-400 ring-2 ring-orange-100'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        aria-label={isSelected ? 'Deselect item' : 'Select item'}
        className="absolute right-4 top-4 z-10 sm:static sm:order-first sm:self-center"
      >
        <div className={`rounded-full p-0.5 ${isSelected ? 'bg-orange-500' : 'bg-white ring-1 ring-slate-200'}`}>
          <CheckCircle2
            size={24}
            className={isSelected ? 'text-white' : 'text-slate-400'}
            strokeWidth={isSelected ? 2.5 : 2}
          />
        </div>
      </button>

      <button
        type="button"
        onClick={onOpenProduct}
        className="mx-auto w-full max-w-[220px] shrink-0 overflow-hidden rounded-xl bg-slate-50 p-4 sm:mx-0 sm:w-40 md:w-44"
      >
        <div className="relative aspect-square w-full">
          <Image
            src={img}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 220px, 176px"
            className="object-contain transition-transform duration-300 hover:scale-105"
          />
          <NewProductTagBadge product={product} size="card" />
        </div>
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 sm:pr-2">
        <div>
          <button
            type="button"
            onClick={onOpenProduct}
            className="text-left"
          >
            <h3 className="text-base font-semibold leading-snug text-slate-900 line-clamp-3 sm:text-lg">
              {product.name}
            </h3>
          </button>

          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
            <span className="inline-flex items-baseline gap-1 text-2xl font-bold text-slate-900 sm:text-3xl">
              <CurrencySymbol currency={market.currency} />
              {Math.round(convertedPrice).toLocaleString()}
            </span>
            {product.AED ? (
              <span className="inline-flex items-baseline gap-1 text-sm text-slate-400 line-through">
                <CurrencySymbol currency={market.currency} />
                {Math.round(convertedAED).toLocaleString()}
              </span>
            ) : null}
            {discount > 0 ? (
              <span className="inline-flex rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white">
                {discount}% OFF
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddToCart}
            className="inline-flex h-11 flex-1 min-w-[140px] items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 sm:flex-none sm:min-w-[160px]"
          >
            <ShoppingCartIcon size={16} />
            Add to Cart
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-500 transition hover:bg-rose-100"
            aria-label="Remove from wishlist"
          >
            <TrashIcon size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}

function PriceSummaryPanel({
  selectedCount,
  total,
  market,
  convertPrice,
  onGoToCart,
  onGoToCheckout,
  className = '',
}) {
  const hasSelection = selectedCount > 0;
  const formattedTotal = `${market.currency} ${Math.round(convertPrice(total)).toLocaleString()}`;

  return (
    <div className={`rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-rose-50 p-5 shadow-sm ${className}`.trim()}>
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-full bg-orange-500 p-2">
          <ShoppingCartIcon size={18} className="text-white" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Order Summary</h3>
      </div>

      <div className="space-y-3 rounded-xl bg-white p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-600">Selected items</span>
          <span className="text-lg font-semibold text-slate-900">{selectedCount}</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="font-semibold text-slate-900">Total</span>
          <span className="text-2xl font-bold text-orange-600">
            <AedText currency={market.currency}>{formattedTotal}</AedText>
          </span>
        </div>
      </div>

      {hasSelection ? (
        <div className="mt-4 space-y-2.5">
          <button
            type="button"
            onClick={onGoToCart}
            className="w-full rounded-xl border-2 border-orange-400 bg-white py-3 text-sm font-bold text-orange-600 transition hover:bg-orange-50"
          >
            Go to Cart
          </button>
          <button
            type="button"
            onClick={onGoToCheckout}
            className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 py-3.5 text-sm font-bold text-white shadow-md transition hover:from-orange-600 hover:to-rose-600"
          >
            Go to Checkout
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-orange-200 bg-white/80 px-4 py-5 text-center">
          <p className="text-sm font-medium text-slate-700">Select items to continue</p>
          <p className="mt-1 text-xs text-slate-500">
            Tap the circle on each product, or use Select All above.
          </p>
        </div>
      )}
    </div>
  );
}

function WishlistAuthed() {
  const { user, loading: authLoading } = useAuth();
  const isSignedIn = !!user;
  const router = useRouter();
  const dispatch = useDispatch();
  const { market, convertPrice } = useStorefrontMarket();

  const [wishlist, setWishlist] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ----------------------------------------------------
     Load wishlist
  ---------------------------------------------------- */
  useEffect(() => {
    if (authLoading) return;
    isSignedIn ? loadUserWishlist() : loadGuestWishlist();
  }, [authLoading, isSignedIn]);

  const loadGuestWishlist = () => {
    try {
      const data = JSON.parse(
        localStorage.getItem("guestWishlist") || "[]"
      );
      const normalized = Array.isArray(data) ? data : [];
      setWishlist(normalized);

      // Hydrate missing slugs for old guest wishlist entries
      const missingSlugIds = [...new Set(
        normalized
          .filter((item) => item && !item.slug)
          .map((item) => item.productId || item.id)
          .filter(Boolean)
      )];

      if (missingSlugIds.length > 0) {
        axios
          .post('/api/products/batch', { productIds: missingSlugIds })
          .then(({ data: batchData }) => {
            const map = new Map((batchData?.products || []).map((p) => [String(p._id), p.slug]));
            const hydrated = normalized.map((item) => {
              if (!item) return item;
              if (item.slug) return item;
              const pid = item.productId || item.id;
              const slug = map.get(String(pid));
              return slug ? { ...item, slug } : item;
            });
            setWishlist(hydrated);
            localStorage.setItem('guestWishlist', JSON.stringify(hydrated));
            window.dispatchEvent(new Event('wishlistUpdated'));
          })
          .catch(() => {
            // ignore slug hydration failures
          });
      }
    } catch {
      setWishlist([]);
    } finally {
      setLoading(false);
      window.dispatchEvent(new Event('wishlistUpdated'));
    }
  };

  const loadUserWishlist = async () => {
    try {
      const token = await user.getIdToken();
      const { data } = await axios.get("/api/wishlist", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWishlist(Array.isArray(data?.wishlist) ? data.wishlist : []);
    } catch {
      setWishlist([]);
    } finally {
      setLoading(false);
      window.dispatchEvent(new Event('wishlistUpdated'));
    }
  };

  /* ----------------------------------------------------
     Wishlist actions
  ---------------------------------------------------- */
  const removeFromWishlist = async (pid) => {
    if (!isSignedIn) {
      const updated = wishlist.filter(
        (i) => (i.productId || i.id) !== pid
      );
      localStorage.setItem("guestWishlist", JSON.stringify(updated));
      setWishlist(updated);
      setSelected((s) => s.filter((x) => x !== pid));
      window.dispatchEvent(new Event('wishlistUpdated'));
      return;
    }

    const token = await user.getIdToken();
    await axios.post(
      "/api/wishlist",
      { productId: pid, action: "remove" },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setWishlist((w) => w.filter((i) => i.productId !== pid));
    setSelected((s) => s.filter((x) => x !== pid));
    window.dispatchEvent(new Event('wishlistUpdated'));
  };

  const toggleSelect = (pid) => {
    setSelected((s) =>
      s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]
    );
  };

  const selectAll = () => {
    setSelected(
      selected.length === wishlist.length
        ? []
        : wishlist.map((i) => i.productId || i.id)
    );
  };

  const addSelectedItemsToCart = () => {
    let added = 0;
    selected.forEach((pid) => {
      const item = wishlist.find(
        (i) => (i.productId || i.id) === pid
      );
      const product = getProduct(item);
      if (product) {
        const productId = product._id || product.productId || product._pid || item?.productId || item?.id;
        if (!productId) return;
        trackProductAddToCart({
          product,
          productId,
          name: product.name || product.title || 'Product',
          price: Number(product.price) || 0,
          quantity: 1,
          currency: STORE_CURRENCY,
        });
        dispatch(addToCart({ productId, price: Number(product.price) || 0 }));
        added += 1;
      }
    });
    return added;
  };

  const goToCartWithSelected = () => {
    const added = addSelectedItemsToCart();
    if (added > 0) router.push("/cart");
  };

  const goToCheckoutWithSelected = () => {
    const added = addSelectedItemsToCart();
    if (added > 0) router.push("/checkout");
  };

  const resolveProductPath = async (product) => {
    const direct = resolveWishlistProductPath(product);
    if (direct) return direct;

    const pid = product?._id || product?.productId || product?._pid || product?.id;
    if (!pid) return null;

    try {
      const { data } = await axios.post('/api/products/batch', { productIds: [pid] });
      const fetched = data?.products?.[0];
      if (fetched) return resolveWishlistProductPath(fetched);
    } catch {
      // ignore
    }
    return null;
  };

  const total = selected.reduce((sum, pid) => {
    const item = wishlist.find(
      (i) => (i.productId || i.id) === pid
    );
    const product = getProduct(item);
    return sum + Number(product?.price || 0);
  }, 0);

  if (authLoading || loading) {
    return (
      <>
        <PageTitle title="My Wishlist" />
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title="My Wishlist" />

      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        {!isSignedIn && wishlist.length > 0 ? (
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Browsing as a guest.{' '}
            <button
              type="button"
              onClick={() => router.push('/sign-in')}
              className="font-semibold text-orange-600 hover:text-orange-700"
            >
              Sign in
            </button>{' '}
            to save your wishlist across devices.
          </div>
        ) : null}

        {wishlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-20 text-center">
            <div className="mb-6 rounded-full bg-gradient-to-br from-pink-100 to-red-100 p-8">
              <HeartIcon size={64} className="text-red-500" strokeWidth={1.5} />
            </div>
            <h2 className="mb-2 text-3xl font-bold text-slate-900">Your wishlist is empty</h2>
            <p className="mb-8 max-w-md text-slate-500">
              Save items you love by tapping the heart icon on any product page.
            </p>
            <button
              type="button"
              onClick={() => router.push('/shop')}
              className="rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-8 py-3.5 font-semibold text-white shadow-lg transition hover:from-orange-600 hover:to-rose-600"
            >
              Start Shopping
            </button>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-8">
            <main className="min-w-0">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">My Wishlist</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {wishlist.length} {wishlist.length === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={selectAll}
                  className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-600 transition hover:bg-orange-100"
                >
                  <CheckCircle2 size={18} />
                  {selected.length === wishlist.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="space-y-4 pb-24 lg:pb-0">
                {wishlist.map((item) => {
                  const product = getProduct(item);
                  if (!product) return null;

                  const isSelected = selected.includes(product._pid);

                  return (
                    <WishlistItemRow
                      key={product._pid}
                      product={product}
                      isSelected={isSelected}
                      market={market}
                      convertPrice={convertPrice}
                      onToggleSelect={() => toggleSelect(product._pid)}
                      onRemove={() => removeFromWishlist(product._pid)}
                      onAddToCart={() => {
                        const productId = product._id || product.productId || product._pid;
                        trackProductAddToCart({
                          product,
                          productId,
                          name: product.name || product.title || 'Product',
                          price: Number(product.price) || 0,
                          quantity: 1,
                          currency: STORE_CURRENCY,
                        });
                        dispatch(addToCart({
                          productId,
                          price: Number(product.price) || 0,
                        }));
                      }}
                      onOpenProduct={async () => {
                        const productPath = await resolveProductPath(product);
                        if (productPath) router.push(productPath);
                      }}
                    />
                  );
                })}
              </div>

              <div className="mt-6 lg:hidden">
                <PriceSummaryPanel
                  selectedCount={selected.length}
                  total={total}
                  market={market}
                  convertPrice={convertPrice}
                  onGoToCart={goToCartWithSelected}
                  onGoToCheckout={goToCheckoutWithSelected}
                />
              </div>
            </main>

            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <PriceSummaryPanel
                  selectedCount={selected.length}
                  total={total}
                  market={market}
                  convertPrice={convertPrice}
                  onGoToCart={goToCartWithSelected}
                  onGoToCheckout={goToCheckoutWithSelected}
                />
              </div>
            </aside>
          </div>
        )}
      </div>

      {selected.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-200 bg-white p-4 shadow-2xl lg:hidden">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {selected.length} {selected.length === 1 ? 'item' : 'items'} selected
              </p>
              <p className="text-xl font-bold text-slate-900">
                <span className="inline-flex items-baseline gap-1">
                  <CurrencySymbol currency={market.currency} />
                  {Math.round(convertPrice(total)).toLocaleString()}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goToCartWithSelected}
                className="rounded-xl border-2 border-orange-400 px-4 py-3 text-sm font-semibold text-orange-600"
              >
                Cart
              </button>
              <button
                type="button"
                onClick={goToCheckoutWithSelected}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-5 py-3 text-sm font-bold text-white"
              >
                <ShoppingCartIcon size={18} />
                Checkout
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function WishlistPage() {
  return <WishlistAuthed />;
}
