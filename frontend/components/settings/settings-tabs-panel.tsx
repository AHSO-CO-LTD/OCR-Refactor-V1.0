"use client";

import { ArrowLeft, Code2, Download, Settings2, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppUpdatePanel } from "@/components/settings/app-update-panel";
import { DeveloperSettingsPanel } from "@/components/settings/developer-settings-panel";
import { GeneralSettingsPanel } from "@/components/settings/general-settings-panel";
import { OperationSettingsPanel } from "@/components/settings/operation-settings-panel";
import { SettingsSectionTabs } from "@/components/settings/settings-section-tabs";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { getStoredUser } from "@/lib/session";

type SettingsTab = "general" | "operation" | "update" | "developer";

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
  const canManageTrainingImages =
    currentRole === "dev" || currentRole === "admin";
  const canManageDeveloperSettings = currentRole === "dev";
  const canManageUpdates = currentRole === "dev" || currentRole === "admin";
  const canManageInactivity = currentRole === "dev" || currentRole === "admin";
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <div className="space-y-5">
      <Button asChild variant="outline" className="h-11">
        <Link href="/dashboard/line">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("settings.backToOperation")}
        </Link>
      </Button>

      <SettingsSectionTabs
        activeId={activeTab}
        items={[
          { id: "general", label: t("settings.tabGeneral"), icon: Settings2 },
          ...(canManageLineResultSettings
            ? [
                {
                  id: "operation",
                  label: t("settings.tabOperation"),
                  icon: SlidersHorizontal,
                },
              ]
            : []),
          ...(canManageUpdates
            ? [{ id: "update", label: t("settings.tabUpdate"), icon: Download }]
            : []),
          ...(canManageDeveloperSettings
            ? [
                {
                  id: "developer",
                  label: t("settings.tabDeveloper"),
                  icon: Code2,
                },
              ]
            : []),
        ]}
        onSelect={(id) => setActiveTab(id as SettingsTab)}
      />

      {activeTab === "general" ? <GeneralSettingsPanel /> : null}
      {canManageLineResultSettings && activeTab === "operation" ? (
        <OperationSettingsPanel
          canManageInactivity={canManageInactivity}
          canManageLineResultSettings={canManageLineResultSettings}
          canManageNgDisplay={canManageNgDisplay}
          canManageTrainingImages={canManageTrainingImages}
        />
      ) : null}
      {canManageUpdates && activeTab === "update" ? <AppUpdatePanel /> : null}
      {canManageDeveloperSettings && activeTab === "developer" ? (
        <DeveloperSettingsPanel />
      ) : null}
    </div>
  );
}
