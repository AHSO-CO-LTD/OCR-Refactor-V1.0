"use client";

import { Clock3, FileCheck2, ImageDown, PauseCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { LineResultSettingsPanel } from "@/components/settings/line-result-settings-panel";
import { MachineInactivitySettingsPanel } from "@/components/settings/machine-inactivity-settings-panel";
import { MachineStopSettingsPanel } from "@/components/settings/machine-stop-settings-panel";
import { SettingsSectionTabs } from "@/components/settings/settings-section-tabs";
import { TrainingImageSettingsPanel } from "@/components/settings/training-image-settings-panel";
import { useI18n } from "@/lib/i18n";

type OperationSection = "inactivity" | "stop-delay" | "line-result" | "training";

export function OperationSettingsPanel({
  canManageInactivity,
  canManageLineResultSettings,
  canManageNgDisplay,
  canManageTrainingImages,
}: {
  canManageInactivity: boolean;
  canManageLineResultSettings: boolean;
  canManageNgDisplay: boolean;
  canManageTrainingImages: boolean;
}) {
  const { t } = useI18n();
  const sections = useMemo(
    () => [
      ...(canManageInactivity
        ? [
            {
              id: "inactivity",
              label: t("settings.tabInactivity"),
              icon: PauseCircle,
            },
            {
              id: "stop-delay",
              label: t("settings.tabStopDelay"),
              icon: Clock3,
            },
          ]
        : []),
      ...(canManageLineResultSettings
        ? [
            {
              id: "line-result",
              label: t("settings.tabLineResult"),
              icon: FileCheck2,
            },
          ]
        : []),
      ...(canManageTrainingImages
        ? [
            {
              id: "training",
              label: t("settings.tabTraining"),
              icon: ImageDown,
            },
          ]
        : []),
    ],
    [
      canManageInactivity,
      canManageLineResultSettings,
      canManageTrainingImages,
      t,
    ],
  );
  const [activeSection, setActiveSection] = useState<OperationSection>(() =>
    canManageInactivity ? "inactivity" : "line-result",
  );

  return (
    <section className="space-y-5">
      <SettingsSectionTabs
        activeId={activeSection}
        items={sections}
        onSelect={(id) => setActiveSection(id as OperationSection)}
      />
      {canManageInactivity && activeSection === "inactivity" ? (
        <MachineInactivitySettingsPanel />
      ) : null}
      {canManageInactivity && activeSection === "stop-delay" ? (
        <MachineStopSettingsPanel />
      ) : null}
      {canManageLineResultSettings && activeSection === "line-result" ? (
        <LineResultSettingsPanel
          canManageNgDisplay={canManageNgDisplay}
        />
      ) : null}
      {canManageTrainingImages && activeSection === "training" ? (
        <TrainingImageSettingsPanel />
      ) : null}
    </section>
  );
}
