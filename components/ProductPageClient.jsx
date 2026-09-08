"use client";

import { Component, useEffect, useState } from "react";
import axios from "axios";
import ProductDetails from "@/components/ProductDetails";
import ProductPageSkeleton from "@/components/ProductPageSkeleton";
import { isDomReconcileError } from "@/lib/domReconcileError";

function ProductDetailsLoadError({ onRetry, detail }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700">
        !
      </div>
      <h2 className="text-lg font-semibold text-slate-900">This page could not load</h2>
      <p className="mt-2 text-sm text-slate-600">
        The product page failed to load. This can happen after a site update — try reloading.
      </p>
      {detail && !isDomReconcileError({ message: detail }) ? (
        <p className="mt-3 break-words rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-500">
          {detail}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Back
        </button>
      </div>
    </div>
  );
}

class ProductDetailsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, generation: 0 };
  }

  static getDerivedStateFromError(error) {
    if (isDomReconcileError(error)) {
      return { error: null, generation: Date.now() };
    }
    return { error };
  }

  componentDidCatch(error) {
    if (isDomReconcileError(error)) {
      return;
    }
    console.error("[ProductPageClient] ProductDetails render error:", error);
  }

  render() {
    if (this.state.error) {
      const message = String(this.state.error?.message || "");
      return (
        <ProductDetailsLoadError
          detail={message}
          onRetry={() => {
            this.setState({ error: null, generation: Date.now() });
            window.location.reload();
          }}
        />
      );
    }

    return (
      <div key={this.state.generation} className="min-w-0">
        {this.props.children}
      </div>
    );
  }
}

export default function ProductPageClient({ slug, initialData }) {
  const [product, setProduct] = useState(initialData?.product || null);
  const [reviews, setReviews] = useState(initialData?.reviews || []);
  const [recommendedProducts, setRecommendedProducts] = useState(initialData?.relatedProducts || []);
  const [fbt, setFbt] = useState(initialData?.fbt || null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [slug]);

  useEffect(() => {
    const productId = product?._id || product?.id;
    if (!productId || typeof window === "undefined") return;

    let unsubscribe;
    let cancelled = false;

    const trackView = async (user) => {
      if (cancelled) return;
      if (user) {
        try {
          const token = await user.getIdToken();
          await axios.post(
            "/api/browse-history",
            { productId },
            { headers: { Authorization: `Bearer ${token}` } },
          );
        } catch {
          // Silent fail
        }
        return;
      }

      try {
        const viewed = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
        const filtered = viewed.filter((id) => id !== productId);
        filtered.unshift(productId);
        localStorage.setItem("recentlyViewed", JSON.stringify(filtered.slice(0, 20)));
      } catch (error) {
        console.error("Error saving to localStorage:", error);
      }
    };

    const startTracking = async () => {
      try {
        const { auth, waitForAuthReady } = await import("@/lib/firebase");
        const { onAuthStateChanged } = await import("firebase/auth");
        await waitForAuthReady();
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(auth, trackView);
      } catch (error) {
        console.warn("[ProductPageClient] browse tracking skipped:", error);
      }
    };

    const scheduleTrack = () => {
      if ("requestIdleCallback" in window) {
        const idleId = window.requestIdleCallback(() => {
          startTracking();
        }, { timeout: 2500 });
        return () => window.cancelIdleCallback(idleId);
      }

      const timerId = window.setTimeout(startTracking, 1200);
      return () => window.clearTimeout(timerId);
    };

    const cleanupSchedule = scheduleTrack();
    return () => {
      cancelled = true;
      cleanupSchedule?.();
      unsubscribe?.();
    };
  }, [product?._id, product?.id]);

  const refetchReviews = async () => {
    const productId = product?._id || product?.id;
    if (!productId) return;

    try {
      const { data } = await axios.get(`/api/review?productId=${productId}`);
      setReviews(data.reviews || []);
    } catch (error) {
      console.error("Error fetching reviews:", error);
    }
  };

  if (!product) {
    return <ProductPageSkeleton />;
  }

  return (
    <div className="relative w-full">
      <ProductDetailsErrorBoundary>
          <ProductDetails
            product={product}
            reviews={reviews}
            loadingReviews={false}
            reviewsPreloaded
            onReviewAdded={refetchReviews}
            recommendedProducts={recommendedProducts}
            initialFbt={fbt}
            fbtPreloaded
          />
        </ProductDetailsErrorBoundary>
    </div>
  );
}
