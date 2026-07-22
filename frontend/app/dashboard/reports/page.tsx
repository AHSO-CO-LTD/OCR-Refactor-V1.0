"use client";

import { AppShell } from "@/components/app-shell";
import { LineOperationReportsPanel } from "@/components/reports/line-operation-reports-panel";

export default function ReportsPage() {
  return (
    <AppShell
      titleKey="operationReports.title"
      descriptionKey="operationReports.description"
    >
      <LineOperationReportsPanel />
    </AppShell>
  );
}
