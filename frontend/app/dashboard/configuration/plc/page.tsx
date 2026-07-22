"use client";

import { AppShell } from "@/components/app-shell";
import { PlcConfigurationPanel } from "@/components/plc/plc-configuration-panel";

export default function PlcConfigurationPage() {
  return (
    <AppShell>
      <PlcConfigurationPanel />
    </AppShell>
  );
}
