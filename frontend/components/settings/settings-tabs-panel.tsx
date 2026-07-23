"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppUpdatePanel } from "@/components/settings/app-update-panel";
import { DesktopSettingsPanel } from "@/components/settings/desktop-settings-panel";
import { LanguageSettingsPanel } from "@/components/settings/language-settings-panel";
import { LineResultSettingsPanel } from "@/components/settings/line-result-settings-panel";
import { MachineInactivitySettingsPanel } from "@/components/settings/machine-inactivity-settings-panel";
import { OcrTestSettingsPanel } from "@/components/settings/ocr-test-settings-panel";
import { RuntimeTestSettingsPanel } from "@/components/settings/runtime-test-settings-panel";
import { TerminalSettingsPanel } from "@/components/settings/terminal-settings-panel";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { getStoredUser } from "@/lib/session";

type SettingsTab =
  | "desktop"
  | "language"
  | "inactivity"
  | "line-result"
  | "ocr-test"
  | "runtime-test"
  | "terminal"
  | "update";

export function SettingsTabsPanel() {
  const { t } = useI18n();
  const currentRole =
    typeof window === "undefined" ? null : getStoredUser()?.role ?? null;
  const canManageProductSettings =
    currentRole === "dev" ||
    currentRole === "admin" ||
    currentRole === "engineer";
  const canManageLineResultSettings = canManageProductSettings;
  const canManageNgDisplay = currentRole === "dev" || currentRole === "admin";
  const canManageOcrTestSettings = currentRole === "dev";
  const canManageRuntimeTestSettings = currentRole === "dev";
  const canManageTerminalSettings = currentRole === "dev";
  const canManageUpdates = currentRole === "dev" || currentRole === "admin";
  const canManageInactivity = currentRole === "dev" || currentRole === "admin";
  const [activeTab, setActiveTab] = useState<SettingsTab>("desktop");

  return (
    <div className="space-y-5">
      <Button asChild variant="outline" className="h-11">
        <Link href="/dashboard/line">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("settings.backToOperation")}
        </Link>
      </Button>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <TabButton
          active={activeTab === "desktop"}
          label={t("settings.tabDesktop")}
          onClick={() => setActiveTab("desktop")}
        />
        {canManageInactivity ? (
          <TabButton
            active={activeTab === "inactivity"}
            label={t("settings.tabInactivity")}
            onClick={() => setActiveTab("inactivity")}
          />
        ) : null}
        <TabButton
          active={activeTab === "language"}
          label={t("settings.tabLanguage")}
          onClick={() => setActiveTab("language")}
        />
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
        {canManageUpdates ? (
          <TabButton
            active={activeTab === "update"}
            label={t("settings.tabUpdate")}
            onClick={() => setActiveTab("update")}
          />
        ) : null}
      </div>

      {activeTab === "desktop" ? <DesktopSettingsPanel /> : null}
      {activeTab === "language" ? <LanguageSettingsPanel /> : null}
      {canManageInactivity && activeTab === "inactivity" ? (
        <MachineInactivitySettingsPanel />
      ) : null}
      {canManageLineResultSettings && activeTab === "line-result" ? (
        <LineResultSettingsPanel canManageNgDisplay={canManageNgDisplay} />
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
      {canManageUpdates && activeTab === "update" ? <AppUpdatePanel /> : null}
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
