"use client";

import { AppShell } from "@/components/app-shell";
import { OperatorRuntimePanel } from "@/components/operator/operator-runtime-panel";

export default function LinePage() {
  return (
    <AppShell
      titleKey="operator.title"
      descriptionKey="operator.description"
    >
      <OperatorRuntimePanel />
    </AppShell>
  );
}
