"use client";

import { RotateCcw, Save, Volume2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  defaultSoundSettings,
  getSoundSettings,
  saveSoundSettings,
  type SoundSettings,
} from "@/lib/sound-settings";
import { useI18n } from "@/lib/i18n";

export function VolumeSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SoundSettings>(() => getSoundSettings());

  function updateSetting(key: keyof SoundSettings, value: number) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSave() {
    saveSoundSettings(settings);
    toast.success(t("settings.volumeSaved"));
  }

  function handleReset() {
    setSettings(defaultSoundSettings);
    saveSoundSettings(defaultSoundSettings);
    toast.success(t("settings.volumeReset"));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("settings.volumeTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t("settings.volumeDescription")}
          </div>

          <div className="grid gap-4">
            <VolumeSlider
              label={t("settings.volumeMaster")}
              value={settings.masterVolume}
              onChange={(value) => updateSetting("masterVolume", value)}
            />
            <VolumeSlider
              label={t("settings.volumeOk")}
              value={settings.okVolume}
              onChange={(value) => updateSetting("okVolume", value)}
            />
            <VolumeSlider
              label={t("settings.volumeNg")}
              value={settings.ngVolume}
              onChange={(value) => updateSetting("ngVolume", value)}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSave}>
              <Save className="h-4 w-4" />
              {t("settings.volumeSave")}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
              {t("settings.volumeResetButton")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("settings.currentState")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-5 text-sm">
          <StateRow label={t("settings.volumeMaster")} value={`${settings.masterVolume}%`} />
          <StateRow label={t("settings.volumeOk")} value={`${settings.okVolume}%`} />
          <StateRow label={t("settings.volumeNg")} value={`${settings.ngVolume}%`} />
        </CardContent>
      </Card>
    </div>
  );
}

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Volume2 className="h-4 w-4 text-slate-500" />
          {label}
        </div>
        <div className="text-sm font-semibold text-slate-700">{value}%</div>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 h-10 w-full accent-cyan-700"
      />
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
