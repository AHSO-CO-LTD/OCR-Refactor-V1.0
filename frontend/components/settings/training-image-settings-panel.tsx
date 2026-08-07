"use client";

import { FolderOpen, ImageDown, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  getLineResultSettings,
  updateLineResultSettings,
  type LineResultSettings,
  type TrainingImageSavePolicy,
} from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type TrainingImageSettings = Pick<
  LineResultSettings,
  | "trainingImageEnabled"
  | "trainingImageSaveFolderPath"
  | "trainingImageSavePolicy"
>;

const defaultSettings: TrainingImageSettings = {
  trainingImageEnabled: false,
  trainingImageSaveFolderPath: "",
  trainingImageSavePolicy: "all",
};

export function TrainingImageSettingsPanel() {
  const { apiError, t } = useI18n();
  const bridge = getDesktopBridge();
  const [settings, setSettings] = useState<TrainingImageSettings>(defaultSettings);
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
        const response = await getLineResultSettings(accessToken);
        if (!cancelled) {
          setSettings({
            trainingImageEnabled: response.data.trainingImageEnabled,
            trainingImageSaveFolderPath: response.data.trainingImageSaveFolderPath,
            trainingImageSavePolicy: response.data.trainingImageSavePolicy,
          });
        }
      } catch (cause) {
        if (!cancelled) {
          toast.error(
            cause instanceof ApiError
              ? apiError(cause.message, "settings.lineResultLoadError")
              : t("settings.lineResultLoadError"),
          );
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

  async function handlePickFolder() {
    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    try {
      const result = await bridge.selectFolder();
      if (!result.canceled && result.folderPath) {
        setSettings((current) => ({
          ...current,
          trainingImageSaveFolderPath: result.folderPath,
        }));
      }
    } catch {
      toast.error(t("settings.trainingImagesFolderPickError"));
    }
  }

  async function handleSave() {
    const accessToken = getAccessToken();
    const trainingImageSaveFolderPath =
      settings.trainingImageSaveFolderPath?.trim() || null;

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }
    if (settings.trainingImageEnabled && !trainingImageSaveFolderPath) {
      toast.warning(t("settings.trainingImagesFolderRequired"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("settings.trainingImagesSaving"));
    try {
      const response = await updateLineResultSettings(accessToken, {
        trainingImageEnabled: settings.trainingImageEnabled,
        trainingImageSaveFolderPath,
        trainingImageSavePolicy: settings.trainingImageSavePolicy,
      });
      setSettings({
        trainingImageEnabled: response.data.trainingImageEnabled,
        trainingImageSaveFolderPath: response.data.trainingImageSaveFolderPath,
        trainingImageSavePolicy: response.data.trainingImageSavePolicy,
      });
      toast.success(t("settings.trainingImagesSaved"), { id: toastId });
    } catch (cause) {
      toast.error(
        cause instanceof ApiError
          ? apiError(cause.message, "settings.trainingImagesSaveError")
          : t("settings.trainingImagesSaveError"),
        { id: toastId },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImageDown className="h-5 w-5 text-cyan-700" aria-hidden="true" />
            {t("settings.trainingImagesTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <p className="text-sm leading-6 text-slate-600">
            {t("settings.trainingImagesDescription")}
          </p>

          <div className="grid gap-3 border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="text-sm font-semibold text-slate-800">
              {t("settings.trainingImagesCapture")}
            </div>
            <Button
              type="button"
              variant="outline"
              aria-pressed={settings.trainingImageEnabled}
              disabled={loading || saving}
              className={[
                "h-11 min-w-48",
                settings.trainingImageEnabled
                  ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
              ].join(" ")}
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  trainingImageEnabled: !current.trainingImageEnabled,
                }))
              }
            >
              {t(
                settings.trainingImageEnabled
                  ? "settings.trainingImagesEnabled"
                  : "settings.trainingImagesDisabled",
              )}
            </Button>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">
              {t("settings.trainingImagesSavePolicy")}
            </label>
            <Select
              value={settings.trainingImageSavePolicy}
              disabled={loading || saving || !settings.trainingImageEnabled}
              className="h-11 border-slate-300 bg-white text-sm"
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  trainingImageSavePolicy: event.target
                    .value as TrainingImageSavePolicy,
                }))
              }
            >
              <option value="all">{t("settings.trainingImagesPolicyAll")}</option>
              <option value="ok">{t("settings.trainingImagesPolicyOk")}</option>
              <option value="ng">{t("settings.trainingImagesPolicyNg")}</option>
            </Select>
            <p className="text-xs text-slate-500">
              {t("settings.trainingImagesUnknownExcluded")}
            </p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">
              {t("settings.trainingImagesFolder")}
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={settings.trainingImageSaveFolderPath ?? ""}
                disabled={loading || saving || !settings.trainingImageEnabled}
                className="h-11 border-slate-300 bg-white text-sm"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    trainingImageSaveFolderPath: event.target.value,
                  }))
                }
              />
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={loading || saving || !settings.trainingImageEnabled}
                onClick={() => void handlePickFolder()}
              >
                <FolderOpen className="h-4 w-4" />
                {t("settings.chooseFolder")}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              {t("settings.trainingImagesFolderHint")}
            </p>
          </div>

          <Button type="button" disabled={loading || saving} onClick={() => void handleSave()}>
            <Save className="h-4 w-4" />
            {saving ? t("settings.trainingImagesSaving") : t("settings.trainingImagesSave")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("settings.lineResultCurrentStatus")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <StatusRow
            label={t("settings.trainingImagesStatus")}
            value={t(
              settings.trainingImageEnabled
                ? "settings.trainingImagesEnabled"
                : "settings.trainingImagesDisabled",
            )}
          />
          <StatusRow
            label={t("settings.trainingImagesSavePolicy")}
            value={t(`settings.trainingImagesPolicyValue.${settings.trainingImageSavePolicy}`)}
          />
          <StatusRow
            label={t("settings.trainingImagesFolder")}
            value={settings.trainingImageSaveFolderPath || t("settings.notConfigured")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 pb-3 text-sm last:border-b-0 last:pb-0 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="break-words font-semibold text-slate-950">{value}</span>
    </div>
  );
}
