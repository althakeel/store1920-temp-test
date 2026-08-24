"use client";
import { makeStore } from "./store";
import { Provider } from "react-redux";
import React, { useRef, useEffect } from "react";
import { auth } from "./firebase";
import { fetchCart } from "./features/cart/cartSlice";

export default function ReduxProvider({ children }) {
  const storeRef = useRef();
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  useEffect(() => {
    // Defer store writes until after the first commit so useSyncExternalStore
    // subscribers (react-redux) are fully mounted. Sync dispatch here triggers
    // React 19: "state update on a component that hasn't mounted yet".
    let cancelled = false;
    const rehydrateTimer = window.setTimeout(() => {
      if (cancelled || !storeRef.current) return;
      storeRef.current.dispatch({ type: "cart/rehydrateCart" });
    }, 0);

    const onStorage = (event) => {
      if (!event || event.key === 'cartState') {
        storeRef.current?.dispatch({ type: "cart/rehydrateCart", payload: { force: true } });
      }
    };

    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.clearTimeout(rehydrateTimer);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let fetchTimer = null;

    const unsub = auth.onAuthStateChanged((user) => {
      if (fetchTimer) window.clearTimeout(fetchTimer);
      if (!user || cancelled) return;

      fetchTimer = window.setTimeout(() => {
        if (cancelled || !storeRef.current) return;
        storeRef.current.dispatch(fetchCart({ getToken: async () => user.getIdToken() }));
      }, 0);
    });

    return () => {
      cancelled = true;
      if (fetchTimer) window.clearTimeout(fetchTimer);
      unsub();
    };
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
}
