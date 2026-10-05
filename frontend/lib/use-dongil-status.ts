"use client";

import { useCallback, useEffect, useState } from "react";
import { getDesktopBridge, type DesktopDongilStatus } from "@/lib/desktop";

export function useDongilStatus(refreshMs = 5_000) {
  const [status, setStatus] = useState<DesktopDongilStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setError("Desktop runtime is unavailable.");
      setLoading(false);
      return null;
    }
    try {
      const response = await bridge.getDongilStatus();
      const nextStatus = response.data ?? null;
      setStatus(nextStatus);
      setError(null);
      return nextStatus;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Dongil status is unavailable.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), refreshMs);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh, refreshMs]);

  return { status, loading, error, refresh };
}
