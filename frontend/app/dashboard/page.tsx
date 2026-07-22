import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DashboardStatusPanel } from "@/components/dashboard/dashboard-status-panel";
import {
  DASHBOARD_OVERVIEW_VISIBLE,
  OPERATOR_STARTUP_ROUTE,
} from "@/lib/operator-startup-preferences";

export default function DashboardPage() {
  if (!DASHBOARD_OVERVIEW_VISIBLE) {
    redirect(OPERATOR_STARTUP_ROUTE);
  }

  return (
    <AppShell
      titleKey="dashboard.title"
      descriptionKey="dashboard.description"
    >
      <DashboardStatusPanel />
    </AppShell>
  );
}
