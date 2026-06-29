"use client";

import { AppShell } from "@/components/app-shell";
import { LineWorkspacePanel } from "@/components/operator/line-workspace-panel";

export default function LinePage() {
  return (
    <AppShell
      titleKey="operator.title"
      descriptionKey="operator.description"
    >
      <LineWorkspacePanel />
    </AppShell>
  );
}
