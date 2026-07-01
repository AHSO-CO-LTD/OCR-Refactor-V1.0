"use client";

import { AppShell } from "@/components/app-shell";
import { CameraIdentitiesPanel } from "@/components/camera/camera-identities-panel";

export default function CameraIdentitiesPage() {
  return (
    <AppShell
      titleKey="cameraIdentity.title"
      descriptionKey="cameraIdentity.description"
    >
      <CameraIdentitiesPanel />
    </AppShell>
  );
}
