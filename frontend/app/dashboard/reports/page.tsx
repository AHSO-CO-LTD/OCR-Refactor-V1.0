"use client";

import { AppShell } from "@/components/app-shell";
import { TestSessionReportsPanel } from "@/components/reports/test-session-reports-panel";

export default function ReportsPage() {
  return (
    <AppShell
      titleKey="reports.title"
      descriptionKey="reports.description"
    >
      <TestSessionReportsPanel />
    </AppShell>
  );
}
