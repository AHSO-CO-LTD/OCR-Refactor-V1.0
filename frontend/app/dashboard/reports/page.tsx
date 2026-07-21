"use client";

import { AppShell } from "@/components/app-shell";
import { TestSessionReportsPanel } from "@/components/reports/test-session-reports-panel";
import { LineOperationReportsPanel } from "@/components/reports/line-operation-reports-panel";

export default function ReportsPage() {
  return (
    <AppShell
      titleKey="reports.title"
      descriptionKey="reports.description"
    >
      <div className="grid gap-5">
        <LineOperationReportsPanel />
        <TestSessionReportsPanel />
      </div>
    </AppShell>
  );
}
