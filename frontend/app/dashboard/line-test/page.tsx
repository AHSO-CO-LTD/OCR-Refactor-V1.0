"use client";

import { AppShell } from "@/components/app-shell";
import { LineTestPanel } from "@/components/operator/line-test-panel";

export default function LineTestPage() {
  return (
    <AppShell
      titleKey="lineTest.title"
      descriptionKey="lineTest.description"
    >
      <LineTestPanel />
    </AppShell>
  );
}
