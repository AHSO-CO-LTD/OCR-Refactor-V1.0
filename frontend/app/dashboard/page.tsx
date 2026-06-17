"use client";

import { AppShell } from "@/components/app-shell";
import { DashboardStatusPanel } from "@/components/dashboard/dashboard-status-panel";

export default function DashboardPage() {
  return (
    <AppShell
      titleKey="dashboard.title"
      descriptionKey="dashboard.description"
    >
      <DashboardStatusPanel />
    </AppShell>
  );
}
