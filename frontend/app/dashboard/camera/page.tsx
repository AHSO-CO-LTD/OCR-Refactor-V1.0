"use client";

import { AppShell } from "@/components/app-shell";
import { CameraLiveViewPanel } from "@/components/camera/camera-live-view-panel";

export default function CameraPage() {
  return (
    <AppShell
      titleKey="camera.title"
      descriptionKey="camera.description"
    >
      <CameraLiveViewPanel />
    </AppShell>
  );
}
