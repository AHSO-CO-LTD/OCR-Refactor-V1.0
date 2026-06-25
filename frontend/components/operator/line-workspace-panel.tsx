"use client";

import { OperatorRuntimePanel } from "@/components/operator/operator-runtime-panel";

export function LineWorkspacePanel() {
  return (
    <div className="grid h-full min-w-0 min-h-0 gap-3">
      <OperatorRuntimePanel />
    </div>
  );
}
