"use client";

import { AppShell } from "@/components/app-shell";
import { SettingsTabsPanel } from "@/components/settings/settings-tabs-panel";

export default function SettingsPage() {
  return (
    <AppShell
      titleKey="settings.title"
      descriptionKey="settings.description"
    >
      <SettingsTabsPanel />
    </AppShell>
  );
}
