"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { persistEmailTrackingToken } from "@/lib/emailTrackClient";

export default function EmailTrackCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = String(searchParams?.get("et") || "").trim();
    if (!token) return;
    persistEmailTrackingToken(token, window.location.href);
  }, [searchParams]);

  return null;
}
