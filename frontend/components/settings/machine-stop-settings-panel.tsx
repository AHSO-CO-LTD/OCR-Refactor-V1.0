"use client";

import { Clock3, Power, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  getMachineStopSettings,
  updateMachineStopSettings,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const DEFAULT_STOP_DELAY_SECONDS = 5;

export function MachineStopSettingsPanel() {
  const { apiError, t } = useI18n();
  const [delaySeconds, setDelaySeconds] = useState(
    String(DEFAULT_STOP_DELAY_SECONDS),
  );
  const [configured, setConfigured] = useState(true);
  const [powerOffCameraOnStop, setPowerOffCameraOnStop] = useState(true);
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
        const response = await getMachineStopSettings(accessToken);
        if (!cancelled) {
          setDelaySeconds(String(response.data.delaySeconds));
          setConfigured(response.data.configured);
          setPowerOffCameraOnStop(response.data.powerOffCameraOnStop);
        }
      } catch (cause) {
        if (!cancelled) {
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "settings.stopDelayLoadError")
              : t("settings.stopDelayLoadError");
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
    const parsedDelay = Number(delaySeconds);

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }
    if (
      !Number.isSafeInteger(parsedDelay) ||
      parsedDelay < 0 ||
      parsedDelay > 300
    ) {
      toast.warning(t("settings.stopDelayValidation"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("settings.stopDelaySaving"));
    try {
      const response = await updateMachineStopSettings(accessToken, {
        delaySeconds: parsedDelay,
        powerOffCameraOnStop,
      });
      setDelaySeconds(String(response.data.delaySeconds));
      setConfigured(response.data.configured);
      setPowerOffCameraOnStop(response.data.powerOffCameraOnStop);
      toast.success(t("settings.stopDelaySaved"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "settings.stopDelaySaveError")
          : t("settings.stopDelaySaveError");
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock3 className="h-5 w-5 text-orange-700" aria-hidden="true" />
          {t("settings.stopDelayTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <p className="text-sm leading-6 text-slate-600">
          {t("settings.stopDelayDescription")}
        </p>

        {!configured ? (
          <p className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {t("settings.stopDelayPlcRequired")}
          </p>
        ) : null}

        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          <span>{t("settings.stopDelaySeconds")}</span>
          <Input
            type="number"
            min={0}
            max={300}
            step={1}
            inputMode="numeric"
            value={delaySeconds}
            disabled={loading || saving}
            className="h-11 max-w-xs"
            onChange={(event) => setDelaySeconds(event.target.value)}
          />
          <span className="text-xs font-normal text-slate-500">
            {t("settings.stopDelayHint")}
          </span>
        </label>

        <label className="flex max-w-xl cursor-pointer items-start gap-3 border border-slate-300 bg-slate-50 px-4 py-3 text-slate-800">
          <input
            type="checkbox"
            checked={powerOffCameraOnStop}
            disabled={loading || saving || !configured}
            className="mt-0.5 h-5 w-5 shrink-0 accent-amber-700"
            onChange={(event) => setPowerOffCameraOnStop(event.target.checked)}
          />
          <span className="grid gap-1">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Power className="h-4 w-4 text-orange-700" aria-hidden="true" />
              {t("settings.stopPowerOption")}
            </span>
            <span className="text-xs font-normal leading-5 text-slate-600">
              {t("settings.stopPowerHint")}
            </span>
          </span>
        </label>

        <Button
          type="button"
          className="h-11"
          disabled={loading || saving || !configured}
          onClick={() => void handleSave()}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? t("settings.stopDelaySaving") : t("settings.stopDelaySave")}
        </Button>
      </CardContent>
    </Card>
  );
}
