"use client";

import { Save, TestTube2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import {
  MAX_INSPECTION_RESULT_DELAY_MS,
  MIN_INSPECTION_RESULT_DELAY_MS,
  clampInspectionResultDelayMs,
  getRuntimeTestSettings,
  saveRuntimeTestSettings,
  subscribeRuntimeTestSettings,
  type RuntimeTestSettings,
} from "@/lib/runtime-test-settings";

export function RuntimeTestSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<RuntimeTestSettings>(() =>
    getRuntimeTestSettings(),
  );

  useEffect(() => {
    return subscribeRuntimeTestSettings(() => {
      setSettings(getRuntimeTestSettings());
    });
  }, []);

  function updateSetting(nextSettings: RuntimeTestSettings) {
    setSettings(nextSettings);
  }

  function updateInspectionResultDelayMs(value: number) {
    updateSetting({
      ...settings,
      inspectionResultDelayMs: clampInspectionResultDelayMs(value),
    });
  }

  function handleSave() {
    saveRuntimeTestSettings(settings);
    toast.success(t("settings.runtimeTestSaved"));
  }

  const inspectionResultDelaySeconds = (
    settings.inspectionResultDelayMs / 1000
  ).toFixed(1);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TestTube2 className="h-5 w-5 text-cyan-700" />
            {t("settings.runtimeTestTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {t("settings.runtimeTestDescription")}
          </div>

          <label className="flex min-h-14 items-center gap-3 border border-slate-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-cyan-700"
              checked={settings.ignorePlcInDev}
              onChange={(event) =>
                updateSetting({
                  ...settings,
                  ignorePlcInDev: event.target.checked,
                })
              }
            />
            <div className="min-w-0">
              <div className="font-semibold text-slate-950">
                {t("settings.runtimeTestIgnorePlc")}
              </div>
              <div className="text-sm leading-5 text-slate-500">
                {t("settings.runtimeTestIgnorePlcHint")}
              </div>
            </div>
          </label>

          <label className="flex min-h-14 items-center gap-3 border border-slate-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-cyan-700"
              checked={settings.operatorAutoLoginOnStartup}
              onChange={(event) =>
                updateSetting({
                  ...settings,
                  operatorAutoLoginOnStartup: event.target.checked,
                })
              }
            />
            <div className="min-w-0">
              <div className="font-semibold text-slate-950">
                {t("settings.runtimeTestOperatorAutoLogin")}
              </div>
              <div className="text-sm leading-5 text-slate-500">
                {t("settings.runtimeTestOperatorAutoLoginHint")}
              </div>
            </div>
          </label>

          <div className="grid gap-3 border border-slate-200 bg-white px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-slate-950">
                  {t("settings.runtimeTestResultDelay")}
                </div>
                <div className="text-sm leading-5 text-slate-500">
                  {t("settings.runtimeTestResultDelayHint")}
                </div>
              </div>
              <div className="border border-cyan-200 bg-cyan-50 px-3 py-1 text-sm font-semibold text-cyan-900">
                {formatSecondsLabel(
                  t("settings.runtimeTestResultDelayValue"),
                  inspectionResultDelaySeconds,
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <input
                type="range"
                min={MIN_INSPECTION_RESULT_DELAY_MS}
                max={MAX_INSPECTION_RESULT_DELAY_MS}
                step={100}
                value={settings.inspectionResultDelayMs}
                className="h-11 w-full accent-cyan-700"
                aria-label={t("settings.runtimeTestResultDelay")}
                onChange={(event) =>
                  updateInspectionResultDelayMs(Number(event.target.value))
                }
              />
              <Input
                type="number"
                min={MIN_INSPECTION_RESULT_DELAY_MS / 1000}
                max={MAX_INSPECTION_RESULT_DELAY_MS / 1000}
                step={0.1}
                inputMode="decimal"
                value={inspectionResultDelaySeconds}
                className="h-11 text-center text-base font-semibold"
                aria-label={t("settings.runtimeTestResultDelay")}
                onChange={(event) =>
                  updateInspectionResultDelayMs(Number(event.target.value) * 1000)
                }
              />
            </div>
          </div>

          <Button type="button" onClick={handleSave}>
            <Save className="h-4 w-4" />
            {t("settings.runtimeTestSave")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("settings.currentState")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-5 text-sm">
          <StateRow
            label={t("settings.runtimeTestIgnorePlcState")}
            value={
              settings.ignorePlcInDev
                ? t("settings.runtimeTestIgnored")
                : t("settings.runtimeTestRequired")
            }
          />
          <StateRow
            label={t("settings.runtimeTestOperatorAutoLoginState")}
            value={
              settings.operatorAutoLoginOnStartup
                ? t("settings.runtimeTestOperatorAutoLoginEnabled")
                : t("settings.runtimeTestOperatorAutoLoginDisabled")
            }
          />
          <StateRow
            label={t("settings.runtimeTestResultDelayState")}
            value={formatSecondsLabel(
              t("settings.runtimeTestResultDelayValue"),
              inspectionResultDelaySeconds,
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function formatSecondsLabel(template: string, seconds: string) {
  return template.replace("{seconds}", seconds);
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-950">{value}</span>
    </div>
  );
}
