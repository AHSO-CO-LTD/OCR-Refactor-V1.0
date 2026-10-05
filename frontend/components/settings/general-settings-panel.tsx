"use client";

import { Languages, MonitorCog, ServerCog } from "lucide-react";
import { useState } from "react";
import { DesktopSettingsPanel } from "@/components/settings/desktop-settings-panel";
import { DongilServerSettingsPanel } from "@/components/settings/dongil-server-settings-panel";
import { LanguageSettingsPanel } from "@/components/settings/language-settings-panel";
import { SettingsSectionTabs } from "@/components/settings/settings-section-tabs";
import { useI18n } from "@/lib/i18n";

type GeneralSection = "desktop" | "language" | "dongil";

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
          { id: "dongil", label: t("settings.tabDongil"), icon: ServerCog },
        ]}
        onSelect={(id) => setActiveSection(id as GeneralSection)}
      />
      {activeSection === "desktop" ? <DesktopSettingsPanel /> : null}
      {activeSection === "language" ? <LanguageSettingsPanel /> : null}
      {activeSection === "dongil" ? <DongilServerSettingsPanel /> : null}
    </section>
  );
}
