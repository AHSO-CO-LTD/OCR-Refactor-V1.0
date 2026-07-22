"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppUpdateOverlay } from "@/components/update/app-update-overlay";
import {
  getDesktopBridge,
  type DesktopUpdateState,
} from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const browserState: DesktopUpdateState = {
  currentVersion: "development",
  details: {},
  message: "Desktop updater unavailable.",
  status: "idle",
  timestamp: new Date(0).toISOString(),
};

type AppUpdateContextValue = {
  checkForUpdates: () => Promise<void>;
  desktopAvailable: boolean;
  downloadUpdate: () => Promise<void>;
  state: DesktopUpdateState;
};

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const bridge = getDesktopBridge();
  const [state, setState] = useState<DesktopUpdateState>(browserState);
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    let active = true;

    void bridge.getUpdateStatus().then((nextState) => {
      if (active) setState(nextState);
    });
    void bridge.getUpdateRecovery().then((notice) => {
      if (!active || !notice) return;
      if (notice.status === "completed") {
        toast.success(
          t("update.completedNotice")
            .replace("{from}", notice.fromVersion)
            .replace("{to}", notice.targetVersion),
        );
      } else {
        toast.error(
          t("update.rollbackNotice")
            .replace("{version}", notice.fromVersion)
            .replace("{error}", notice.failure ?? t("update.unknownError")),
        );
      }
      void bridge.acknowledgeUpdateRecovery();
    });
    const unsubscribe = bridge.onUpdateStatus((payload) => {
      if (active) setState(payload);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge, t]);

  async function checkForUpdates() {
    if (!bridge) {
      toast.warning(t("update.desktopOnly"));
      return;
    }
    const toastId = toast.loading(t("update.checking"));
    const result = await bridge.checkForUpdates(getAccessToken() ?? "");
    if (!result.success) {
      toast.error(result.error ?? t("update.checkError"), { id: toastId });
      return;
    }
    if (result.skipped) {
      toast.warning(t("update.packagedOnly"), { id: toastId });
      return;
    }
    const next = result.state;
    toast.success(
      next?.status === "available" ? t("update.availableToast") : t("update.upToDateToast"),
      { id: toastId },
    );
  }

  async function downloadUpdate() {
    if (!bridge) {
      toast.warning(t("update.desktopOnly"));
      return;
    }
    setOverlayOpen(true);
    const result = await bridge.downloadUpdate(getAccessToken() ?? "");
    if (!result.success) {
      toast.error(result.error ?? t("update.downloadError"));
    }
  }

  async function installUpdate() {
    if (!bridge) return;
    const result = await bridge.installUpdate(getAccessToken() ?? "");
    if (!result.success) {
      toast.error(result.error ?? t("update.installError"));
    }
  }

  async function exportLog() {
    if (!bridge) return;
    const result = await bridge.exportUpdateLog();
    if (!result.canceled) toast.success(t("update.logExported"));
  }

  const value: AppUpdateContextValue = {
    checkForUpdates,
    desktopAvailable: Boolean(bridge),
    downloadUpdate,
    state,
  };

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
      <AppUpdateOverlay
        open={overlayOpen}
        state={state}
        onClose={() => setOverlayOpen(false)}
        onExportLog={() => void exportLog()}
        onInstall={() => void installUpdate()}
      />
    </AppUpdateContext.Provider>
  );
}

export function useAppUpdate() {
  const context = useContext(AppUpdateContext);
  if (!context) throw new Error("useAppUpdate must be used within AppUpdateProvider");
  return context;
}
