'use client'
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import ProductDetails from "@/components/ProductDetails";
import ProductDescription from "@/components/ProductDescription";
import CountdownTimer from "@/components/CountdownTimer";
import { Sparkles, Gift, Tag, AlertCircle, X } from "lucide-react";
import { getProductPath } from "@/lib/productUrl";

function setOfferTokenCookie(value) {
  if (typeof document === 'undefined' || !value) return;
  document.cookie = `activeOfferToken=${encodeURIComponent(value)}; path=/; max-age=2592000; SameSite=Lax`;
}

function getOfferTokenCookie() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )activeOfferToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function SpecialOfferBySlugPage() {
  const { slug } = useParams();
  const searchParams = useSearchParams();
  const queryTokenRaw = searchParams.get('token');
  const queryToken = typeof queryTokenRaw === 'string' && /^[a-f0-9]{16,}$/i.test(queryTokenRaw)
    ? queryTokenRaw
    : null;
  const pathToken = typeof slug === 'string' && /^[a-f0-9]{16,}$/i.test(slug) ? slug : null;
  const token = queryToken || pathToken;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState(null);
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);
  const [showTopBanner, setShowTopBanner] = useState(true);
  const [resolvedToken, setResolvedToken] = useState(token || null);
  const prevSlugRef = useRef(slug);

  useEffect(() => {
    const slugChanged = prevSlugRef.current !== slug;
    if (slugChanged) {
      prevSlugRef.current = slug;
    }

    if (token) {
      setResolvedToken(token);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('activeOfferToken', token);
      }
      setOfferTokenCookie(token);
      return;
    }

    // New offer slug without token → resolve by slug (don't clear on ?token= URL cleanup)
    if (slugChanged) {
      setResolvedToken(null);
    }
  }, [token, slug]);

  // Clean URL: Remove token from visible URL after it's been stored safely
  // Do this AFTER token is stored, to avoid race conditions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!queryToken || !slug || pathToken) return;
    
    // Only clean URL if we've already stored the token
    if (resolvedToken === token) {
      // Defer the URL replacement to avoid interfering with data fetch
      const timer = setTimeout(() => {
        router.replace(`/offer/${encodeURIComponent(String(slug))}`);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [queryToken, slug, pathToken, resolvedToken, token, router]);

  useEffect(() => {
    if (resolvedToken) {
      console.log('[Offer Page] Using token-based resolution:', resolvedToken.substring(0, 8) + '...');
      fetchOfferDetails(resolvedToken);
      return;
    }

    if (slug && typeof slug === 'string' && !pathToken) {
      console.log('[Offer Page] Using slug-based resolution:', slug);
      fetchOfferDetailsBySlug(slug);
      return;
    }

    console.log('[Offer Page] No token or valid slug found', { resolvedToken, slug, pathToken });
    setError('Offer token is missing');
    setLoading(false);
  }, [resolvedToken, slug, pathToken]);

  const applyOfferData = (data, activeToken) => {
    setOffer(data.offer);
    setProduct(data.product);
    setExpired(!data.valid && data.expired);

    if (activeToken) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('activeOfferToken', activeToken);
      }
      setOfferTokenCookie(activeToken);
    }

    if (!data.valid) {
      if (data.expired) {
        toast.error("This offer has expired");
      } else if (data.used) {
        toast.error("This offer has already been used");
      } else {
        toast.error("This offer is no longer valid");
      }

      setTimeout(() => {
        router.push(getProductPath(data.product));
      }, 3000);
    }

    if (data.product.slug && slug) {
      const cleanSlug = String(data.product.slug).trim();
      const needsCleanUrl =
        cleanSlug !== slug || Boolean(queryToken) || Boolean(pathToken);
      if (needsCleanUrl && cleanSlug) {
        router.replace(`/offer/${encodeURIComponent(cleanSlug)}`);
      }
    }
  };

  const fetchOfferDetails = async (activeToken) => {
    try {
      console.log('[fetchOfferDetails] Validating token:', activeToken.substring(0, 8) + '...');
      setLoading(true);
      setError(null);
      const { data } = await axios.get(`/api/personalized-offers/validate/${encodeURIComponent(activeToken)}`);

      if (data.success && data.product) {
        console.log('[fetchOfferDetails] Token validated successfully');
        applyOfferData(data, activeToken);
      } else {
        console.log('[fetchOfferDetails] Token validation returned error:', data.error);
        setError(data.error || "Invalid offer");
        toast.error(data.error || "Invalid offer link");
      }
    } catch (error) {
      console.error("[fetchOfferDetails] Token validation failed:", error.response?.status, error.message);
      
      // If token validation fails with 404, try to use slug-based resolution
      if (error.response?.status === 404 && slug && !pathToken) {
        console.log("[fetchOfferDetails] Token not found (404), falling back to slug-based resolution...");
        await fetchOfferDetailsBySlug(slug);
        return;
      }
      
      const errorMsg = error.response?.data?.error || "Failed to load offer";
      setError(errorMsg);
      toast.error(errorMsg);

      setTimeout(() => {
        router.push('/');
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  const fetchOfferDetailsBySlug = async (productSlug) => {
    try {
      console.log('[fetchOfferDetailsBySlug] Resolving offer for slug:', productSlug);
      setLoading(true);
      setError(null);
      const encoded = encodeURIComponent(productSlug);
      const { data } = await axios.get(
        `/api/personalized-offers/resolve/${encoded}?slug=${encoded}`
      );

      if (data.success && data.product && data.offer?.offerToken) {
        console.log('[fetchOfferDetailsBySlug] Offer resolved successfully');
        applyOfferData(data, data.offer.offerToken);
      } else {
        console.log('[fetchOfferDetailsBySlug] Slug resolution returned error:', data.error);
        setError(data.error || "Invalid offer");
        toast.error(data.error || "Invalid offer link");
      }
    } catch (error) {
      console.error("[fetchOfferDetailsBySlug] Slug resolution failed:", error.response?.status, error.message);
      const errorMsg = error.response?.data?.error || "Failed to load offer";
      setError(errorMsg);
      toast.error(errorMsg);

      setTimeout(() => {
        router.push('/');
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleOfferExpire = () => {
    setExpired(true);
    toast.error("Offer has expired! Redirecting to normal product page...");
    setTimeout(() => {
      if (product?.slug) {
        router.push(getProductPath(product));
      }
    }, 3000);
  };

  const customerDisplayName = offer?.customerName?.trim()
    || offer?.customerEmail?.split('@')?.[0]
    || 'there';
  const bannerMessage = offer?.discountPercent
    ? `Hi ${customerDisplayName}! 🎁 Super Discount: ${offer.discountPercent}% OFF - limited period only.`
    : `Hi ${customerDisplayName}! 🎁 Exclusive limited-time offer for you.`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your exclusive offer...</p>
        </div>
      </div>
    );
  }

  if (error || !offer || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertCircle className="mx-auto mb-4 text-red-500" size={64} />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Offer Not Found</h1>
          <p className="text-gray-600 mb-4">{error || "This offer link is invalid or has expired."}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  const productWithDiscount = {
    ...product,
    _id: product._id || product.id,
    price: product.discountedPrice,
    AED: product.originalPrice,
    originalPrice: product.originalPrice,
    specialOffer: {
      isSpecialOffer: true,
      discountPercent: offer.discountPercent,
      savings: product.savings,
      offerToken: resolvedToken || offer.offerToken
    }
  };

  return (
    <div className="min-h-screen w-full">
      {showTopBanner && (
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 text-white py-1 px-2 sm:py-1.5 sm:px-3 relative overflow-hidden">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 overflow-hidden">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold whitespace-nowrap">
              <Sparkles className="animate-pulse flex-shrink-0" size={12} />
              <span className="truncate">{bannerMessage}</span>
              <Sparkles className="animate-pulse flex-shrink-0" size={12} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowTopBanner(false)}
            aria-label="Close offer banner"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-white/15 hover:bg-white/25 transition"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="w-full">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-24 lg:pb-0">
          <div>
          <ProductDetails
            product={productWithDiscount}
            offerData={{
              countdownTimer: !expired && offer && (
                <CountdownTimer
                  expiresAt={offer.expiresAt}
                  onExpire={handleOfferExpire}
                />
              ),
              discountBadge: (
                <div className="bg-green-500 rounded-md p-2 sm:p-2.5 text-white">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <div>
                        <div className="text-[9px] sm:text-[10px] opacity-90">Your Exclusive Discount</div>
                        <div className="text-xl sm:text-2xl font-bold leading-none">{offer.discountPercent}% OFF</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] sm:text-[10px] opacity-90">You Save</div>
                      <div className="text-xl sm:text-2xl font-bold leading-none">AED{product.savings}</div>
                    </div>
                  </div>
                </div>
              ),
              priceComparison: (
                <div className="p-2 sm:p-2.5 bg-yellow-50 border border-yellow-300 rounded-md">
                  <div className="flex items-center justify-between gap-1.5">
                    <div>
                      <div className="text-[9px] sm:text-[10px] text-gray-600">Regular Price</div>
                      <div className="text-base sm:text-lg text-gray-500 line-through leading-none">AED{product.originalPrice}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] sm:text-[10px] text-green-600 font-semibold">Your Special Price</div>
                      <div className="text-xl sm:text-2xl font-bold text-green-600 leading-none">AED{product.discountedPrice}</div>
                    </div>
                  </div>
                </div>
              )
            }}
          />
          </div>

          <ProductDescription product={product} />

          <div className="mt-4 sm:mt-8 bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-amber-600 flex-shrink-0 mt-1" size={20} />
              <div className="text-sm text-amber-800">
                <strong>Important:</strong> This is a time-limited exclusive offer.
                After the countdown ends, this special pricing will no longer be available
                and the product will return to its regular price.
              </div>
            </div>
          </div>

          <div className="mt-4 sm:mt-8 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 text-center">
            <div className="bg-white p-3 sm:p-4 rounded-lg shadow">
              <div className="text-xl sm:text-2xl mb-1 sm:mb-2">✓</div>
              <div className="text-xs sm:text-sm font-medium">Secure Checkout</div>
            </div>
            <div className="bg-white p-3 sm:p-4 rounded-lg shadow">
              <div className="text-xl sm:text-2xl mb-1 sm:mb-2">🚚</div>
              <div className="text-xs sm:text-sm font-medium">Fast Delivery</div>
            </div>
            <div className="bg-white p-3 sm:p-4 rounded-lg shadow">
              <div className="text-xl sm:text-2xl mb-1 sm:mb-2">💯</div>
              <div className="text-xs sm:text-sm font-medium">100% Authentic</div>
            </div>
            <div className="bg-white p-3 sm:p-4 rounded-lg shadow">
              <div className="text-xl sm:text-2xl mb-1 sm:mb-2">🔒</div>
              <div className="text-xs sm:text-sm font-medium">Safe Payment</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
