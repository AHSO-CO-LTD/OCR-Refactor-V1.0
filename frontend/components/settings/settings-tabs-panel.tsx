"use client";

import { useState } from "react";
import { DesktopSettingsPanel } from "@/components/settings/desktop-settings-panel";
import { LanguageSettingsPanel } from "@/components/settings/language-settings-panel";
import { OcrTestSettingsPanel } from "@/components/settings/ocr-test-settings-panel";
import { VolumeSettingsPanel } from "@/components/settings/volume-settings-panel";
import { useI18n } from "@/lib/i18n";
import { getStoredUser } from "@/lib/session";

type SettingsTab = "desktop" | "language" | "volume" | "ocr-test";

export function SettingsTabsPanel() {
  const { t } = useI18n();
  const currentRole =
    typeof window === "undefined" ? null : getStoredUser()?.role ?? null;
  const canManageOcrTestSettings = currentRole === "dev";
  const [activeTab, setActiveTab] = useState<SettingsTab>("desktop");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <TabButton
          active={activeTab === "desktop"}
          label={t("settings.tabDesktop")}
          onClick={() => setActiveTab("desktop")}
        />
        <TabButton
          active={activeTab === "language"}
          label={t("settings.tabLanguage")}
          onClick={() => setActiveTab("language")}
        />
        <TabButton
          active={activeTab === "volume"}
          label={t("settings.tabVolume")}
          onClick={() => setActiveTab("volume")}
        />
        {canManageOcrTestSettings ? (
          <TabButton
            active={activeTab === "ocr-test"}
            label={t("settings.tabOcrTest")}
            onClick={() => setActiveTab("ocr-test")}
          />
        ) : null}
      </div>

      {activeTab === "desktop" ? <DesktopSettingsPanel /> : null}
      {activeTab === "language" ? <LanguageSettingsPanel /> : null}
      {activeTab === "volume" ? <VolumeSettingsPanel /> : null}
      {canManageOcrTestSettings && activeTab === "ocr-test" ? (
        <OcrTestSettingsPanel />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex h-10 items-center border px-4 text-sm font-medium transition",
        active
          ? "border-cyan-200 bg-cyan-50 text-cyan-900"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
