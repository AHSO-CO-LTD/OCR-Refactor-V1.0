"use client";

import { AppShell } from "@/components/app-shell";
import { TestSessionReportsPanel } from "@/components/reports/test-session-reports-panel";

export default function TestReportsPage() {
  return (
    <AppShell
      titleKey="testHistory.title"
      descriptionKey="testHistory.description"
    >
      <TestSessionReportsPanel />
    </AppShell>
  );
}
