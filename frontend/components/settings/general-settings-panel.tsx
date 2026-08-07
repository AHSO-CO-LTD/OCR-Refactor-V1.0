"use client";

import { Languages, MonitorCog } from "lucide-react";
import { useState } from "react";
import { DesktopSettingsPanel } from "@/components/settings/desktop-settings-panel";
import { LanguageSettingsPanel } from "@/components/settings/language-settings-panel";
import { SettingsSectionTabs } from "@/components/settings/settings-section-tabs";
import { useI18n } from "@/lib/i18n";

type GeneralSection = "desktop" | "language";

export function GeneralSettingsPanel() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<GeneralSection>("desktop");

  return (
    <section className="space-y-5">
      <SettingsSectionTabs
        activeId={activeSection}
        items={[
          { id: "desktop", label: t("settings.tabDesktop"), icon: MonitorCog },
          { id: "language", label: t("settings.tabLanguage"), icon: Languages },
        ]}
        onSelect={(id) => setActiveSection(id as GeneralSection)}
      />
      {activeSection === "desktop" ? <DesktopSettingsPanel /> : null}
      {activeSection === "language" ? <LanguageSettingsPanel /> : null}
    </section>
  );
}
