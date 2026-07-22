"use client";

import { Clock3, Power, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  getMachineInactivitySettings,
  updateMachineInactivitySettings,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const DEFAULT_TIMEOUT_SECONDS = 300;

export function MachineInactivitySettingsPanel() {
  const { apiError, t } = useI18n();
  const [enabled, setEnabled] = useState(true);
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    String(DEFAULT_TIMEOUT_SECONDS),
  );
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const accessToken = getAccessToken();
      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await getMachineInactivitySettings(accessToken);
        if (!cancelled) {
          setEnabled(response.data.enabled);
          setTimeoutSeconds(String(response.data.timeoutSeconds));
          setConfigured(response.data.configured);
        }
      } catch (cause) {
        if (!cancelled) {
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "settings.inactivityLoadError")
              : t("settings.inactivityLoadError");
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [apiError, t]);

  async function handleSave() {
    const accessToken = getAccessToken();
    const parsedTimeout = Number(timeoutSeconds);

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }
    if (
      !Number.isSafeInteger(parsedTimeout) ||
      parsedTimeout < 1 ||
      parsedTimeout > 86400
    ) {
      toast.warning(t("settings.inactivityValidation"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("settings.inactivitySaving"));
    try {
      const response = await updateMachineInactivitySettings(accessToken, {
        enabled,
        timeoutSeconds: parsedTimeout,
      });
      setEnabled(response.data.enabled);
      setTimeoutSeconds(String(response.data.timeoutSeconds));
      setConfigured(response.data.configured);
      toast.success(t("settings.inactivitySaved"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "settings.inactivitySaveError")
          : t("settings.inactivitySaveError");
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  const minutes = Math.max(0, Number(timeoutSeconds) / 60);

  return (
    <Card className="max-w-3xl">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock3 className="h-5 w-5 text-cyan-700" aria-hidden="true" />
          {t("settings.inactivityTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <p className="text-sm leading-6 text-slate-600">
          {t("settings.inactivityDescription")}
        </p>

        {!configured ? (
          <p className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {t("settings.inactivityPlcRequired")}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant={enabled ? "default" : "outline"}
            className={enabled ? "h-12 bg-emerald-700 hover:bg-emerald-800" : "h-12"}
            aria-pressed={enabled}
            disabled={loading || saving}
            onClick={() => setEnabled(true)}
          >
            <Power className="h-4 w-4" aria-hidden="true" />
            {t("settings.inactivityEnabled")}
          </Button>
          <Button
            type="button"
            variant={!enabled ? "default" : "outline"}
            className={!enabled ? "h-12 bg-slate-800 hover:bg-slate-900" : "h-12"}
            aria-pressed={!enabled}
            disabled={loading || saving}
            onClick={() => setEnabled(false)}
          >
            {t("settings.inactivityDisabled")}
          </Button>
        </div>

        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          <span>{t("settings.inactivityTimeout")}</span>
          <Input
            type="number"
            min={1}
            max={86400}
            step={1}
            inputMode="numeric"
            value={timeoutSeconds}
            disabled={loading || saving || !enabled}
            className="h-11 max-w-xs"
            onChange={(event) => setTimeoutSeconds(event.target.value)}
          />
          <span className="text-xs font-normal text-slate-500">
            {t("settings.inactivityTimeoutHint").replace(
              "{minutes}",
              Number.isFinite(minutes) ? minutes.toFixed(1) : "0.0",
            )}
          </span>
        </label>

        <Button
          type="button"
          className="h-11"
          disabled={loading || saving || !configured}
          onClick={() => void handleSave()}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving
            ? t("settings.inactivitySaving")
            : t("settings.inactivitySave")}
        </Button>
      </CardContent>
    </Card>
  );
}
