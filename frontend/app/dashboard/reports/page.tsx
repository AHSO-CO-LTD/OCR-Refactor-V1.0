"use client";

import { AppShell } from "@/components/app-shell";
import { LineOperationResultReportsPanel } from "@/components/reports/line-operation-result-reports-panel";

export default function ReportsPage() {
  return (
    <AppShell
      titleKey="operationReports.title"
      descriptionKey="operationReports.description"
    >
      <LineOperationResultReportsPanel />
    </AppShell>
  );
}
