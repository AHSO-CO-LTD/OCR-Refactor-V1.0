"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, getLineResultSettings } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const lineDisplaySettingsEvent = "ocr-line-display-settings-updated";
let loadWarningShown = false;

export function notifyLineDisplaySettingsUpdated(
  showNgRecognizedText: boolean,
) {
  window.dispatchEvent(
    new CustomEvent<boolean>(lineDisplaySettingsEvent, {
      detail: showNgRecognizedText,
    }),
  );
}

export function useLineDisplaySettings() {
  const { apiError, t } = useI18n();
  const [showNgRecognizedText, setShowNgRecognizedText] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const accessToken = getAccessToken();

    function handleUpdated(event: Event) {
      const nextValue = (event as CustomEvent<boolean>).detail;
      if (typeof nextValue === "boolean") {
        setShowNgRecognizedText(nextValue);
      }
    }

    window.addEventListener(lineDisplaySettingsEvent, handleUpdated);

    if (accessToken) {
      getLineResultSettings(accessToken)
        .then((response) => {
          if (!cancelled) {
            setShowNgRecognizedText(response.data.showNgRecognizedText);
          }
        })
        .catch((cause) => {
          if (cancelled || loadWarningShown) return;
          loadWarningShown = true;
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "settings.ngTextLoadFallback")
              : t("settings.ngTextLoadFallback");
          toast.warning(message);
        });
    }

    return () => {
      cancelled = true;
      window.removeEventListener(lineDisplaySettingsEvent, handleUpdated);
    };
  }, [apiError, t]);

  return { showNgRecognizedText };
}
