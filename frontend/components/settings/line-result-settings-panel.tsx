"use client";

import { FolderOpen, Save } from "lucide-react";
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
  type LineResultSavePolicy,
  type LineResultSettings,
} from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const defaultSettings: LineResultSettings = {
  id: "default",
  saveFolderPath: "",
  savePolicy: "all",
  saveBySession: true,
  newSessionOnLineStop: true,
  newSessionOnProductChange: true,
  createdAt: "",
  updatedAt: "",
};

export function LineResultSettingsPanel() {
  const { t, apiError } = useI18n();
  const bridge = getDesktopBridge();
  const [settings, setSettings] = useState<LineResultSettings>(defaultSettings);
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
          setSettings(response.data);
        }
      } catch (cause) {
        if (!cancelled) {
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "settings.lineResultLoadError")
              : t("settings.lineResultLoadError");
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [apiError, t]);

  function updateField<Key extends keyof LineResultSettings>(
    key: Key,
    value: LineResultSettings[Key],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function handlePickFolder() {
    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    try {
      const result = await bridge.selectFolder();

      if (result.canceled || !result.folderPath) {
        return;
      }

      updateField("saveFolderPath", result.folderPath);
    } catch {
      toast.error(t("settings.lineResultFolderPickError"));
    }
  }

  async function handleSave() {
    const accessToken = getAccessToken();
    const saveFolderPath = settings.saveFolderPath?.trim() || null;

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    if (settings.savePolicy !== "none" && !saveFolderPath) {
      toast.warning(t("settings.lineResultFolderRequired"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("settings.lineResultSaving"));

    try {
      const response = await updateLineResultSettings(accessToken, {
        saveFolderPath,
        savePolicy: settings.savePolicy,
        saveBySession: true,
        newSessionOnLineStop: true,
        newSessionOnProductChange: true,
      });

      setSettings(response.data);
      toast.success(t("settings.lineResultSaved"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "settings.lineResultSaveError")
          : t("settings.lineResultSaveError");
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("settings.lineResultTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <p className="text-sm text-slate-600">
            {t("settings.lineResultDescription")}
          </p>

          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">
              {t("settings.lineResultSavePolicy")}
            </label>
            <Select
              value={settings.savePolicy}
              disabled={loading || saving}
              className="h-11 border-slate-300 bg-white text-sm"
              onChange={(event) =>
                updateField(
                  "savePolicy",
                  event.target.value as LineResultSavePolicy,
                )
              }
            >
              <option value="all">{t("settings.lineResultPolicyAll")}</option>
              <option value="ok">{t("settings.lineResultPolicyOk")}</option>
              <option value="ng">{t("settings.lineResultPolicyNg")}</option>
              <option value="none">{t("settings.lineResultPolicyNone")}</option>
            </Select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">
              {t("settings.lineResultFolder")}
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={settings.saveFolderPath ?? ""}
                disabled={loading || saving}
                className="h-11 border-slate-300 bg-white text-sm"
                onChange={(event) =>
                  updateField("saveFolderPath", event.target.value)
                }
              />
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={loading || saving}
                onClick={() => void handlePickFolder()}
              >
                <FolderOpen className="h-4 w-4" />
                {t("settings.chooseFolder")}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              {t("settings.lineResultFolderHint")}
            </p>
          </div>

          <div className="grid gap-3 border border-slate-200 bg-slate-50 p-4">
            <SessionRow
              label={t("settings.lineResultSessionMode")}
              value={t("settings.lineResultSessionModeValue")}
            />
            <SessionRow
              label={t("settings.lineResultStopReason")}
              value={t("settings.lineResultStopReasonValue")}
            />
            <SessionRow
              label={t("settings.lineResultProductChangeReason")}
              value={t("settings.lineResultProductChangeReasonValue")}
            />
          </div>

          <Button
            type="button"
            disabled={loading || saving}
            onClick={() => void handleSave()}
          >
            <Save className="h-4 w-4" />
            {saving
              ? t("settings.lineResultSaving")
              : t("settings.lineResultSave")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">
            {t("settings.lineResultCurrentStatus")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <StatusRow
            label={t("settings.lineResultSavePolicy")}
            value={t(`settings.lineResultPolicyValue.${settings.savePolicy}`)}
          />
          <StatusRow
            label={t("settings.lineResultFolder")}
            value={settings.saveFolderPath || t("settings.notConfigured")}
          />
          <StatusRow
            label={t("settings.lineResultSession")}
            value={
              settings.saveBySession
                ? t("settings.enabled")
                : t("settings.disabled")
            }
          />
          <StatusRow
            label={t("settings.lineResultStopSession")}
            value={
              settings.newSessionOnLineStop
                ? t("settings.enabled")
                : t("settings.disabled")
            }
          />
          <StatusRow
            label={t("settings.lineResultProductSession")}
            value={
              settings.newSessionOnProductChange
                ? t("settings.enabled")
                : t("settings.disabled")
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SessionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <div className="text-sm font-semibold text-slate-800">{label}</div>
      <div className="text-sm text-slate-600">{value}</div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 border-b border-slate-100 pb-3 text-sm last:border-b-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="break-words font-semibold text-slate-950">{value}</span>
    </div>
  );
}
