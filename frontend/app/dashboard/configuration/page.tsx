"use client";

import { AppShell } from "@/components/app-shell";
import { CameraLiveViewPanel } from "@/components/camera/camera-live-view-panel";

export default function ConfigurationPage() {
  return (
    <AppShell>
      <CameraLiveViewPanel configurationMode />
    </AppShell>
  );
}
