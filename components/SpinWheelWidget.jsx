"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Gift, Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

const SPIN_DURATION_MS = 4800;

function buildConicGradient(slices) {
  let current = 0;
  const total = slices.reduce((sum, s) => sum + Number(s.weight || 0), 0) || 1;
  const stops = slices.map((slice) => {
    const part = (Number(slice.weight || 0) / total) * 100;
    const start = current;
    current += part;
    return `${slice.color || "#6366f1"} ${start}% ${current}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function getSliceCenterDegrees(slices, targetIndex) {
  const total = slices.reduce((sum, s) => sum + Number(s.weight || 0), 0) || 1;
  let acc = 0;
  for (let i = 0; i < slices.length; i += 1) {
    const segment = (Number(slices[i].weight || 0) / total) * 360;
    if (i === targetIndex) {
      return acc + segment / 2;
    }
    acc += segment;
  }
  return 0;
}

function WheelLabels({ slices }) {
  const total = slices.reduce((sum, s) => sum + Number(s.weight || 0), 0) || 1;
  let acc = 0;

  return slices.map((slice, index) => {
    const segment = (Number(slice.weight || 0) / total) * 360;
    const center = acc + segment / 2;
    acc += segment;
    const rad = ((center - 90) * Math.PI) / 180;
    const distance = 92;

    return (
      <span
        key={`${slice.label}-${index}`}
        className="pointer-events-none absolute z-10 max-w-[72px] truncate text-center text-[10px] font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] sm:text-[11px]"
        style={{
          left: `calc(50% + ${Math.cos(rad) * distance}px)`,
          top: `calc(50% + ${Math.sin(rad) * distance}px)`,
          transform: `translate(-50%, -50%) rotate(${center + 90}deg)`,
        }}
      >
        {slice.label}
      </span>
    );
  });
}

function RimLights() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: 12 }).map((_, index) => {
        const angle = (index / 12) * 360;
        return (
          <motion.span
            key={index}
            className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
            style={{
              marginLeft: -4,
              marginTop: -4,
              transform: `rotate(${angle}deg) translateY(-132px)`,
            }}
            animate={{
              opacity: [0.45, 1, 0.45],
              scale: [0.85, 1.15, 0.85],
            }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              delay: index * 0.12,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

export default function SpinWheelWidget() {
  const pathname = usePathname();
  const { getToken, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState("");
  const [rotation, setRotation] = useState(0);
  const [showLauncher, setShowLauncher] = useState(false);

  const hiddenByPath = ["/checkout", "/cart", "/order-success", "/order-failed", "/store", "/admin", "/dashboard"].some(
    (p) => pathname === p || pathname?.startsWith(p + "/"),
  );

  useEffect(() => {
    let ignore = false;

    const loadCampaign = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/spin/campaign");
        const data = await res.json();
        if (ignore) return;
        if (res.ok && data?.isEnabled && data?.campaign?.slices?.length) {
          setCampaign(data.campaign);
        } else {
          setCampaign(null);
        }
      } catch (err) {
        console.error("Spin campaign fetch failed:", err);
        if (!ignore) setCampaign(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    if (!hiddenByPath) {
      loadCampaign();
    }

    return () => {
      ignore = true;
    };
  }, [hiddenByPath]);

  useEffect(() => {
    if (!campaign || hiddenByPath) {
      setShowLauncher(false);
      return;
    }

    if (campaign.homePageOnly && pathname !== "/") {
      setShowLauncher(false);
      return;
    }

    const delayMs = Math.max(0, Number(campaign.showAfterSeconds || 0)) * 1000;
    if (!delayMs) {
      setShowLauncher(true);
      return;
    }

    setShowLauncher(false);
    const timer = setTimeout(() => setShowLauncher(true), delayMs);
    return () => clearTimeout(timer);
  }, [campaign, hiddenByPath, pathname]);

  const wheelBg = useMemo(() => {
    if (!campaign?.slices?.length) return "#e2e8f0";
    return buildConicGradient(campaign.slices);
  }, [campaign]);

  const handlePlay = async () => {
    if (!campaign?.slices?.length || spinning) return;

    setError("");
    setResult(null);

    const token = await getToken();
    if (!token) {
      setError("Please sign in first to spin and win rewards.");
      return;
    }

    setSpinning(true);

    try {
      const res = await fetch("/api/spin/play", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storeId: campaign.storeId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Unable to play spin right now.");
        setSpinning(false);
        return;
      }

      const idx = campaign.slices.findIndex((s) => s.label === data.sliceLabel);
      const targetIndex = idx >= 0 ? idx : 0;
      const centerDeg = getSliceCenterDegrees(campaign.slices, targetIndex);
      const targetRotation = rotation + 6 * 360 + (360 - centerDeg);

      setRotation(targetRotation);
      setResult(data);

      window.setTimeout(() => {
        setSpinning(false);
      }, SPIN_DURATION_MS);
    } catch (err) {
      console.error("Spin play failed:", err);
      setError("Unable to play spin right now.");
      setSpinning(false);
    }
  };

  if (loading || hiddenByPath || !campaign?.slices?.length || !showLauncher) return null;

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, y: 24, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        className="fixed bottom-24 right-4 z-[95] flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-red-600 px-5 py-3.5 font-bold text-white shadow-[0_12px_40px_rgba(234,88,12,0.45)]"
      >
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-full bg-white/20"
          animate={{ scale: [1, 1.35, 1], opacity: [0.35, 0, 0.35] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        />
        <Gift size={18} className="relative" />
        <span className="relative">Spin & Win</span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !spinning && setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="spin-wheel-title"
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
              initial={{ opacity: 0, y: 40, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

              <div className="relative border-b border-white/10 px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-amber-300">
                      <Sparkles size={16} />
                      <span className="text-xs font-semibold uppercase tracking-[0.2em]">Daily rewards</span>
                    </div>
                    <h3 id="spin-wheel-title" className="text-2xl font-black tracking-tight">
                      {campaign.campaignName || "Spin & Win"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Daily limit: {campaign.dailySpinLimit} spin(s)
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                    onClick={() => !spinning && setOpen(false)}
                    aria-label="Close spin wheel"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="relative px-5 py-6 sm:px-6">
                <div className="relative mx-auto h-[19rem] w-[19rem] max-w-full">
                  <motion.div
                    className="absolute left-1/2 top-0 z-30 -translate-x-1/2"
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <div className="h-0 w-0 border-x-[14px] border-b-[22px] border-x-transparent border-b-amber-400 drop-shadow-[0_4px_10px_rgba(251,191,36,0.6)]" />
                    <div className="mx-auto -mt-1 h-2 w-4 rounded-full bg-amber-300" />
                  </motion.div>

                  <div className="absolute inset-3 rounded-full bg-gradient-to-br from-amber-300 via-orange-500 to-rose-600 p-[10px] shadow-[0_0_40px_rgba(249,115,22,0.35)]">
                    <div className="relative h-full w-full rounded-full bg-slate-950/90 p-2">
                      <RimLights />

                      <motion.div
                        className="relative h-full w-full rounded-full border-4 border-white/20 shadow-inner"
                        style={{ background: wheelBg }}
                        animate={{ rotate: rotation }}
                        transition={{
                          duration: spinning ? SPIN_DURATION_MS / 1000 : 0.35,
                          ease: spinning ? [0.12, 0.8, 0.12, 1] : "easeOut",
                        }}
                      >
                        <WheelLabels slices={campaign.slices} />
                      </motion.div>

                      <motion.button
                        type="button"
                        onClick={handlePlay}
                        disabled={spinning}
                        whileHover={spinning ? undefined : { scale: 1.06 }}
                        whileTap={spinning ? undefined : { scale: 0.95 }}
                        className="absolute inset-0 z-20 m-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-amber-300 bg-gradient-to-br from-white to-amber-100 text-lg font-black text-orange-600 shadow-[0_8px_24px_rgba(0,0,0,0.25)] disabled:cursor-not-allowed"
                      >
                        {spinning ? (
                          <motion.span
                            className="h-6 w-6 rounded-full border-2 border-orange-500 border-t-transparent"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                          />
                        ) : (
                          "GO"
                        )}
                      </motion.button>
                    </div>
                  </div>
                </div>

                <motion.div
                  className="mt-6 grid grid-cols-2 gap-2"
                  initial="hidden"
                  animate="show"
                  variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: 0.06 } },
                  }}
                >
                  {campaign.slices.map((slice) => (
                    <motion.div
                      key={`${slice.label}-${slice.rewardType}`}
                      variants={{
                        hidden: { opacity: 0, y: 8 },
                        show: { opacity: 1, y: 0 },
                      }}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-sm"
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full shadow-[0_0_10px_currentColor]"
                        style={{ backgroundColor: slice.color, color: slice.color }}
                      />
                      <span className="truncate text-sm font-medium text-slate-200">{slice.label}</span>
                    </motion.div>
                  ))}
                </motion.div>

                <AnimatePresence mode="wait">
                  {error ? (
                    <motion.p
                      key="error"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                    >
                      {error}
                    </motion.p>
                  ) : null}

                  {result ? (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0, scale: 0.92, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="mt-4 overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/15 to-teal-500/10 p-4"
                    >
                      <p className="text-sm font-semibold text-emerald-200">{result.message}</p>
                      {result.couponCode ? (
                        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-slate-950/40 px-3 py-2.5">
                          <span className="font-mono text-base font-bold tracking-wider text-emerald-300">
                            {result.couponCode}
                          </span>
                          <button
                            type="button"
                            className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
                            onClick={() => navigator.clipboard?.writeText(result.couponCode)}
                          >
                            Copy
                          </button>
                        </div>
                      ) : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <motion.button
                  type="button"
                  onClick={handlePlay}
                  disabled={spinning}
                  whileHover={spinning ? undefined : { scale: 1.01 }}
                  whileTap={spinning ? undefined : { scale: 0.99 }}
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-orange-500 via-rose-500 to-red-600 py-3.5 text-base font-bold text-white shadow-[0_12px_30px_rgba(234,88,12,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {spinning ? "Spinning..." : user ? "Spin Now" : "Sign in to Spin"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
