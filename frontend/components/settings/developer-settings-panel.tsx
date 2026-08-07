"use client";

import { Braces, Terminal, TestTube2 } from "lucide-react";
import { useState } from "react";
import { OcrTestSettingsPanel } from "@/components/settings/ocr-test-settings-panel";
import { RuntimeTestSettingsPanel } from "@/components/settings/runtime-test-settings-panel";
import { SettingsSectionTabs } from "@/components/settings/settings-section-tabs";
import { TerminalSettingsPanel } from "@/components/settings/terminal-settings-panel";
import { useI18n } from "@/lib/i18n";

type DeveloperSection = "ocr-test" | "runtime-test" | "terminal";

export function DeveloperSettingsPanel() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<DeveloperSection>("ocr-test");

  return (
    <section className="space-y-5">
      <div className="border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
        {t("settings.developerDescription")}
      </div>
      <SettingsSectionTabs
        activeId={activeSection}
        items={[
          { id: "ocr-test", label: t("settings.tabOcrTest"), icon: Braces },
          {
            id: "runtime-test",
            label: t("settings.tabRuntimeTest"),
            icon: TestTube2,
          },
          { id: "terminal", label: t("settings.tabTerminal"), icon: Terminal },
        ]}
        onSelect={(id) => setActiveSection(id as DeveloperSection)}
      />
      {activeSection === "ocr-test" ? <OcrTestSettingsPanel /> : null}
      {activeSection === "runtime-test" ? <RuntimeTestSettingsPanel /> : null}
      {activeSection === "terminal" ? <TerminalSettingsPanel /> : null}
    </section>
  );
}
