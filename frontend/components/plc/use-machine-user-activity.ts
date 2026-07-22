"use client";

import { useEffect } from "react";
import { notifyMachineUserActivity } from "@/lib/api";
import { getAccessToken } from "@/lib/session";

const ACTIVITY_REPORT_INTERVAL_MS = 15_000;

export function useMachineUserActivity(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let lastReportedAt = 0;
    let requestInFlight = false;

    function reportActivity() {
      const now = Date.now();
      if (
        requestInFlight ||
        now - lastReportedAt < ACTIVITY_REPORT_INTERVAL_MS
      ) {
        return;
      }

      const accessToken = getAccessToken();
      if (!accessToken) return;

      lastReportedAt = now;
      requestInFlight = true;
      void notifyMachineUserActivity(accessToken)
        .catch(() => undefined)
        .finally(() => {
          requestInFlight = false;
        });
    }

    window.addEventListener("scroll", reportActivity, true);
    window.addEventListener("wheel", reportActivity, { passive: true });
    window.addEventListener("pointerdown", reportActivity, { passive: true });
    window.addEventListener("touchstart", reportActivity, { passive: true });
    window.addEventListener("keydown", reportActivity);
    window.addEventListener("focus", reportActivity);

    return () => {
      window.removeEventListener("scroll", reportActivity, true);
      window.removeEventListener("wheel", reportActivity);
      window.removeEventListener("pointerdown", reportActivity);
      window.removeEventListener("touchstart", reportActivity);
      window.removeEventListener("keydown", reportActivity);
      window.removeEventListener("focus", reportActivity);
    };
  }, [enabled]);
}
