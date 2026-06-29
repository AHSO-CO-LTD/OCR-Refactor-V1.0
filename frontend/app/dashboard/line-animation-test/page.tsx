"use client";

import { AppShell } from "@/components/app-shell";
import { LineAnimationTestPanel } from "@/components/operator/line-animation-test-panel";

export default function LineAnimationTestPage() {
  return (
    <AppShell
      titleKey="lineAnimationTest.title"
      descriptionKey="lineAnimationTest.description"
    >
      <LineAnimationTestPanel />
    </AppShell>
  );
}
