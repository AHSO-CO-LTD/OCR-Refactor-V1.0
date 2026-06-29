"use client";

import { Save, TestTube2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import {
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

  function handleSave() {
    saveRuntimeTestSettings(settings);
    toast.success(t("settings.runtimeTestSaved"));
  }

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
        </CardContent>
      </Card>
    </div>
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
