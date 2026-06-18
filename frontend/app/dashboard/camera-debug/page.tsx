"use client";

import { AppShell } from "@/components/app-shell";
import { CameraDebugPanel } from "@/components/camera/camera-debug-panel";

export default function CameraDebugPage() {
  return (
    <AppShell
      titleKey="cameraDebug.title"
      descriptionKey="cameraDebug.description"
    >
      <CameraDebugPanel />
    </AppShell>
  );
}
