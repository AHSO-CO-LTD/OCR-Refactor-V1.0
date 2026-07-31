"use client";

import {
  CircleOff,
  CircleX,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { CameraPreviewConnectionStatus } from "@/components/camera/use-connected-camera-preview";
import { Button } from "@/components/ui/button";
import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

type CameraConnectionOverlayProps = {
  deviceName?: string;
  onReconnect: () => void;
  showReconnectWhileConnecting?: boolean;
  status: CameraPreviewConnectionStatus;
};

type VisibleCameraStatus = Exclude<
  CameraPreviewConnectionStatus,
  "idle" | "connected"
>;

const statusConfig: Record<
  VisibleCameraStatus,
  {
    descriptionKey: TranslationKey;
    icon: LucideIcon;
    iconClassName: string;
    labelKey: TranslationKey;
    spin?: boolean;
  }
> = {
  connecting: {
    descriptionKey: "cameraPreview.connectingDescription",
    icon: LoaderCircle,
    iconClassName: "text-cyan-300",
    labelKey: "cameraPreview.connecting",
    spin: true,
  },
  disconnected: {
    descriptionKey: "cameraPreview.disconnectedDescription",
    icon: CircleOff,
    iconClassName: "text-slate-300",
    labelKey: "cameraPreview.disconnected",
  },
  mismatch: {
    descriptionKey: "cameraPreview.mismatchDescription",
    icon: TriangleAlert,
    iconClassName: "text-amber-300",
    labelKey: "cameraPreview.mismatch",
  },
  error: {
    descriptionKey: "cameraPreview.errorDescription",
    icon: CircleX,
    iconClassName: "text-red-300",
    labelKey: "cameraPreview.error",
  },
};

export function CameraConnectionOverlay({
  deviceName,
  onReconnect,
  showReconnectWhileConnecting = false,
  status,
}: CameraConnectionOverlayProps) {
  const { t } = useI18n();

  if (status === "idle" || status === "connected") {
    return null;
  }

  const config = statusConfig[status];
  const Icon = config.icon;
  const canReconnect =
    status !== "connecting" || showReconnectWhileConnecting;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={status === "connecting"}
      className="flex h-full w-full items-center justify-center bg-slate-950/90 p-6 text-center text-white"
    >
      <div className="flex max-w-md flex-col items-center gap-4">
        <Icon
          aria-hidden="true"
          className={`h-12 w-12 ${config.iconClassName} ${config.spin ? "animate-spin" : ""}`}
        />
        <div className="space-y-1">
          <div className="text-lg font-semibold">{t(config.labelKey)}</div>
          <p className="text-sm leading-6 text-slate-300">
            {t(config.descriptionKey)}
          </p>
          {deviceName ? (
            <p className="break-all font-mono text-xs text-slate-400">
              {deviceName}
            </p>
          ) : null}
        </div>
        {canReconnect ? (
          <Button
            type="button"
            variant="outline"
            className="min-w-36 border-white bg-white text-slate-950 hover:bg-slate-100"
            onClick={onReconnect}
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {t("cameraPreview.reconnect")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
