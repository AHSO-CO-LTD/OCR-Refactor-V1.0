"use client";

import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  defaultDesktopWindowSettings,
  getDesktopBridge,
  type DesktopWindowPreset,
  type DesktopWindowSettings,
} from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";

const presetOptions: Array<{
  value: DesktopWindowPreset;
  labelKey: string;
  width: number;
  height: number;
}> = [
  { value: "factory", labelKey: "settings.presetFactory", width: 1280, height: 1080 },
  { value: "hd", labelKey: "settings.presetHd", width: 1366, height: 768 },
  { value: "fullHd", labelKey: "settings.presetFullHd", width: 1920, height: 1080 },
  { value: "fourThree", labelKey: "settings.presetFourThree", width: 1280, height: 960 },
  { value: "custom", labelKey: "settings.presetCustom", width: 1280, height: 1080 },
];

export function DesktopSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<DesktopWindowSettings>(
    defaultDesktopWindowSettings,
  );
  const [appliedSettings, setAppliedSettings] = useState<DesktopWindowSettings>(
    defaultDesktopWindowSettings,
  );
  const bridge = getDesktopBridge();
  const [loading, setLoading] = useState(Boolean(bridge));
  const [saving, setSaving] = useState(false);
  const isDesktop = Boolean(bridge);

  useEffect(() => {
    if (!bridge) {
      return;
    }

    bridge
      .getWindowSettings()
      .then((nextSettings) => {
        setSettings(nextSettings);
        setAppliedSettings(nextSettings);
      })
      .catch(() => toast.error(t("settings.loadError")))
      .finally(() => setLoading(false));
  }, [bridge, t]);

  function updateSettings(partial: Partial<DesktopWindowSettings>) {
    setSettings((current) => {
      const nextSettings = { ...current, ...partial };
      const preset = presetOptions.find(
        (item) => item.value === nextSettings.windowPreset,
      );

      if (preset && preset.value !== "custom") {
        nextSettings.width = preset.width;
        nextSettings.height = preset.height;
      }

      return nextSettings;
    });
  }

  async function handleSave() {
    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("settings.saving"));
    const requiresRestart = settings.frameless !== appliedSettings.frameless;

    try {
      const nextSettings = await bridge.applyWindowSettings(settings);
      setSettings(nextSettings);
      setAppliedSettings(nextSettings);
      toast.success(t("settings.saved"), { id: toastId });
      if (requiresRestart) {
        toast.warning(t("settings.framelessRestartRequired"));
      }
    } catch {
      toast.error(t("settings.saveError"), { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg">{t("settings.windowMode")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {!isDesktop ? (
              <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t("settings.desktopOnly")}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              <ToggleTile
                checked={settings.fullscreen}
                label={t("settings.fullscreen")}
                description={t("settings.fullscreenHint")}
                onChange={(checked) => updateSettings({ fullscreen: checked })}
              />
              <ToggleTile
                checked={settings.frameless}
                label={t("settings.frameless")}
                description={t("settings.framelessHint")}
                onChange={(checked) => updateSettings({ frameless: checked })}
              />
              <ToggleTile
                checked={settings.alwaysOnTop}
                label={t("settings.alwaysOnTop")}
                description={t("settings.alwaysOnTopHint")}
                onChange={(checked) => updateSettings({ alwaysOnTop: checked })}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("settings.screenPreset")}
                <Select
                  value={settings.windowPreset}
                  onChange={(event) =>
                    updateSettings({
                      windowPreset: event.target.value as DesktopWindowPreset,
                    })
                  }
                  className="mt-2"
                >
                  {presetOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {t(option.labelKey)}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                {t("settings.uiScale")}
                <div className="mt-2 grid grid-cols-[1fr_72px] gap-3">
                  <input
                    type="range"
                    min="75"
                    max="150"
                    step="5"
                    value={Math.round(settings.zoomFactor * 100)}
                    onChange={(event) =>
                      updateSettings({
                        zoomFactor: Number(event.target.value) / 100,
                      })
                    }
                    className="h-10 w-full accent-cyan-700"
                  />
                  <div className="flex h-10 items-center justify-center border border-slate-300 bg-white text-sm font-semibold text-slate-950">
                    {Math.round(settings.zoomFactor * 100)}%
                  </div>
                </div>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("settings.windowWidth")}
                <Input
                  type="number"
                  min={1024}
                  max={3840}
                  disabled={settings.windowPreset !== "custom"}
                  value={settings.width}
                  onChange={(event) =>
                    updateSettings({ width: Number(event.target.value) })
                  }
                  className="mt-2"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                {t("settings.windowHeight")}
                <Input
                  type="number"
                  min={720}
                  max={2160}
                  disabled={settings.windowPreset !== "custom"}
                  value={settings.height}
                  onChange={(event) =>
                    updateSettings({ height: Number(event.target.value) })
                  }
                  className="mt-2"
                />
              </label>
            </div>

            <Button
              onClick={handleSave}
              disabled={loading || saving}
            >
              <Save className="h-4 w-4" />
              {saving ? t("settings.saving") : t("settings.save")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg">{t("settings.currentState")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-5 text-sm">
            <StateRow
              label={t("settings.runtime")}
              value={isDesktop ? t("settings.electron") : t("settings.browser")}
            />
            <StateRow
              label={t("settings.windowSize")}
              value={`${settings.width} x ${settings.height}`}
            />
            <StateRow
              label={t("settings.uiScale")}
              value={`${Math.round(settings.zoomFactor * 100)}%`}
            />
            <StateRow
              label={t("settings.fullscreen")}
              value={settings.fullscreen ? t("common.yes") : t("common.no")}
            />
            <StateRow
              label={t("settings.frameless")}
              value={settings.frameless ? t("common.yes") : t("common.no")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ToggleTile({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-28 cursor-pointer flex-col justify-between border border-slate-200 bg-slate-50 p-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-950">{label}</span>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            className="h-5 w-5 accent-cyan-700"
          />
        </div>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
    </label>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-950">{value}</span>
    </div>
  );
}
