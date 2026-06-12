"use client";

import { AppShell } from "@/components/app-shell";
import { OperatorRuntimePanel } from "@/components/operator/operator-runtime-panel";

export default function DashboardPage() {
  return (
    <AppShell>
      <OperatorRuntimePanel />
    </AppShell>
  );
}
