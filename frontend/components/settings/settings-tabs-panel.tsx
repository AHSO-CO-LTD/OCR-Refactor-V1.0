"use client";

import { useState } from "react";
import { AiSettingsPanel } from "@/components/settings/ai-settings-panel";
import { DesktopSettingsPanel } from "@/components/settings/desktop-settings-panel";
import { LanguageSettingsPanel } from "@/components/settings/language-settings-panel";
import { LineResultSettingsPanel } from "@/components/settings/line-result-settings-panel";
import { OcrTestSettingsPanel } from "@/components/settings/ocr-test-settings-panel";
import { RuntimeTestSettingsPanel } from "@/components/settings/runtime-test-settings-panel";
import { TerminalSettingsPanel } from "@/components/settings/terminal-settings-panel";
import { VolumeSettingsPanel } from "@/components/settings/volume-settings-panel";
import { useI18n } from "@/lib/i18n";
import { getStoredUser } from "@/lib/session";

type SettingsTab =
  | "desktop"
  | "language"
  | "volume"
  | "ai"
  | "line-result"
  | "ocr-test"
  | "runtime-test"
  | "terminal";

export function SettingsTabsPanel() {
  const { t } = useI18n();
  const currentRole =
    typeof window === "undefined" ? null : getStoredUser()?.role ?? null;
  const canManageAiSettings =
    currentRole === "dev" ||
    currentRole === "admin" ||
    currentRole === "engineer";
  const canManageLineResultSettings = canManageAiSettings;
  const canManageOcrTestSettings = currentRole === "dev";
  const canManageRuntimeTestSettings = currentRole === "dev";
  const canManageTerminalSettings = currentRole === "dev";
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
        {canManageAiSettings ? (
          <TabButton
            active={activeTab === "ai"}
            label={t("settings.tabAi")}
            onClick={() => setActiveTab("ai")}
          />
        ) : null}
        {canManageLineResultSettings ? (
          <TabButton
            active={activeTab === "line-result"}
            label={t("settings.tabLineResult")}
            onClick={() => setActiveTab("line-result")}
          />
        ) : null}
        {canManageOcrTestSettings ? (
          <TabButton
            active={activeTab === "ocr-test"}
            label={t("settings.tabOcrTest")}
            onClick={() => setActiveTab("ocr-test")}
          />
        ) : null}
        {canManageRuntimeTestSettings ? (
          <TabButton
            active={activeTab === "runtime-test"}
            label={t("settings.tabRuntimeTest")}
            onClick={() => setActiveTab("runtime-test")}
          />
        ) : null}
        {canManageTerminalSettings ? (
          <TabButton
            active={activeTab === "terminal"}
            label={t("settings.tabTerminal")}
            onClick={() => setActiveTab("terminal")}
          />
        ) : null}
      </div>

      {activeTab === "desktop" ? <DesktopSettingsPanel /> : null}
      {activeTab === "language" ? <LanguageSettingsPanel /> : null}
      {activeTab === "volume" ? <VolumeSettingsPanel /> : null}
      {canManageAiSettings && activeTab === "ai" ? <AiSettingsPanel /> : null}
      {canManageLineResultSettings && activeTab === "line-result" ? (
        <LineResultSettingsPanel />
      ) : null}
      {canManageOcrTestSettings && activeTab === "ocr-test" ? (
        <OcrTestSettingsPanel />
      ) : null}
      {canManageRuntimeTestSettings && activeTab === "runtime-test" ? (
        <RuntimeTestSettingsPanel />
      ) : null}
      {canManageTerminalSettings && activeTab === "terminal" ? (
        <TerminalSettingsPanel />
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
