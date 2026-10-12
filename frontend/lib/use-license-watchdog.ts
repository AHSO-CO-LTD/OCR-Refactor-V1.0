"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, getPublicSystemLicense, type SystemLicenseState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export const LICENSE_WATCHDOG_INTERVAL_MS = 2000;

type LicenseWatchdogOptions = {
  enabled?: boolean;
  onLicenseLost?: (license: SystemLicenseState) => void;
};

export function useLicenseWatchdog({
  enabled = true,
  onLicenseLost,
}: LicenseWatchdogOptions = {}) {
  const { apiError, t } = useI18n();
  const [license, setLicense] = useState<SystemLicenseState | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const lostHandledRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function checkLicense() {
      try {
        setChecking(true);
        const response = await getPublicSystemLicense();

        if (cancelled) {
          return;
        }

        const nextLicense = response.data;
        setLicense(nextLicense);
        setError("");

        const licenseLost =
          nextLicense.licensed === false || nextLicense.donglePresent === false;

        if (licenseLost && !lostHandledRef.current) {
          lostHandledRef.current = true;
          onLicenseLost?.(nextLicense);
        }

        if (!licenseLost) {
          lostHandledRef.current = false;
        }
      } catch (cause) {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? apiError(cause.message, "auth.connectionError")
            : t("auth.connectionError"),
        );
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    let nextCheckTimer: number | null = null;
    async function poll() {
      await checkLicense();
      if (!cancelled) {
        nextCheckTimer = window.setTimeout(
          () => void poll(),
          LICENSE_WATCHDOG_INTERVAL_MS,
        );
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (nextCheckTimer !== null) window.clearTimeout(nextCheckTimer);
    };
  }, [apiError, enabled, onLicenseLost, t]);

  return { checking, error, license };
}
