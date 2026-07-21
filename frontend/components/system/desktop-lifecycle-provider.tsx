"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useVirtualKeyboard } from "@/components/ui/virtual-keyboard";
import { getDesktopBridge } from "@/lib/desktop";
import { type TranslationKey, useI18n } from "@/lib/i18n";

type DesktopLifecycleContextValue = {
  requestExit: () => void;
  requestRestart: () => void;
};

const DesktopLifecycleContext =
  createContext<DesktopLifecycleContextValue | null>(null);

export function DesktopLifecycleProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { closeKeyboard } = useVirtualKeyboard();
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [shutdownLoading, setShutdownLoading] = useState(false);
  const [shutdownMode, setShutdownMode] = useState<"exit" | "restart">("exit");
  const [shutdownStatus, setShutdownStatus] = useState("");

  const requestExit = useCallback(() => {
    if (!getDesktopBridge()) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    closeKeyboard();
    setRestartConfirmOpen(false);
    setExitConfirmOpen(true);
  }, [closeKeyboard, t]);

  const requestRestart = useCallback(() => {
    if (!getDesktopBridge()) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    closeKeyboard();
    setExitConfirmOpen(false);
    setRestartConfirmOpen(true);
  }, [closeKeyboard, t]);

  useEffect(() => {
    const bridge = getDesktopBridge();

    if (!bridge) {
      return;
    }

    const removeCloseListener = bridge.onCloseRequested(requestExit);
    const removeShutdownListener = bridge.onShutdownStatus(setShutdownStatus);

    void bridge.setCloseConfirmationReady(true).catch(() => {
      toast.error(t("settings.exitError"));
    });

    return () => {
      removeCloseListener();
      removeShutdownListener();
      void bridge.setCloseConfirmationReady(false).catch(() => undefined);
    };
  }, [requestExit, t]);

  async function confirmExitApp() {
    const bridge = getDesktopBridge();

    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      setExitConfirmOpen(false);
      return;
    }

    setExitConfirmOpen(false);
    setShutdownLoading(true);
    setShutdownMode("exit");
    setShutdownStatus(t("settings.shutdownPreparing"));
    const toastId = toast.loading(t("settings.exiting"));

    try {
      await bridge.exitApp();
    } catch {
      toast.dismiss(toastId);
      toast.error(t("settings.exitError"));
      setShutdownLoading(false);
      setShutdownStatus("");
    }
  }

  async function confirmRestartApp() {
    const bridge = getDesktopBridge();

    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      setRestartConfirmOpen(false);
      return;
    }

    setRestartConfirmOpen(false);
    setShutdownLoading(true);
    setShutdownMode("restart");
    setShutdownStatus(t("settings.restartPreparing"));
    const toastId = toast.loading(t("settings.restarting"));

    try {
      await bridge.restartApp();
    } catch {
      toast.dismiss(toastId);
      toast.error(t("settings.restartError"));
      setShutdownLoading(false);
      setShutdownStatus("");
    }
  }

  const contextValue = useMemo(
    () => ({ requestExit, requestRestart }),
    [requestExit, requestRestart],
  );

  return (
    <DesktopLifecycleContext.Provider value={contextValue}>
      {children}
      <ConfirmModal
        open={exitConfirmOpen}
        title={t("settings.exitConfirmTitle")}
        description={t("settings.exitConfirmDescription")}
        confirmLabel={t("settings.exitConfirm")}
        cancelLabel={t("common.cancel")}
        destructive
        overlayClassName="z-[100]"
        onConfirm={confirmExitApp}
        onCancel={() => setExitConfirmOpen(false)}
      />
      <ConfirmModal
        open={restartConfirmOpen}
        title={t("settings.restartConfirmTitle")}
        description={t("settings.restartConfirmDescription")}
        confirmLabel={t("settings.restartConfirm")}
        cancelLabel={t("common.cancel")}
        overlayClassName="z-[100]"
        onConfirm={confirmRestartApp}
        onCancel={() => setRestartConfirmOpen(false)}
      />
      {shutdownLoading ? (
        <ShutdownOverlay
          detail={formatShutdownStatus(shutdownStatus, t)}
          title={
            shutdownMode === "restart"
              ? t("settings.restartTitle")
              : t("settings.shutdownTitle")
          }
          description={
            shutdownMode === "restart"
              ? t("settings.restartDescription")
              : t("settings.shutdownDescription")
          }
        />
      ) : null}
    </DesktopLifecycleContext.Provider>
  );
}

export function useDesktopLifecycle() {
  const context = useContext(DesktopLifecycleContext);

  if (!context) {
    throw new Error(
      "useDesktopLifecycle must be used inside DesktopLifecycleProvider",
    );
  }

  return context;
}

function ShutdownOverlay({
  description,
  detail,
  title,
}: {
  description: string;
  detail: string;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 px-4 text-slate-950"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <section className="w-full max-w-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="mt-1 h-9 w-9 shrink-0 animate-spin border-2 border-slate-300 border-t-cyan-700" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            <p className="mt-4 border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              {detail}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatShutdownStatus(
  status: string,
  t: (key: TranslationKey) => string,
) {
  if (status.includes("Preparing shutdown")) {
    return t("settings.shutdownPreparing");
  }

  if (status.includes("Restarting app")) {
    return t("settings.restartPreparing");
  }

  if (status.includes("frontend: stopping")) {
    return t("settings.shutdownFrontendStopping");
  }

  if (status.includes("frontend: stopped")) {
    return t("settings.shutdownFrontendStopped");
  }

  if (status.includes("backend: stopping")) {
    return t("settings.shutdownBackendStopping");
  }

  if (status.includes("backend: stopped")) {
    return t("settings.shutdownBackendStopped");
  }

  if (status.includes("device-tool: stopping")) {
    return t("settings.shutdownToolStopping");
  }

  if (status.includes("device-tool: stopped")) {
    return t("settings.shutdownToolStopped");
  }

  if (status.includes("Shutdown complete")) {
    return t("settings.shutdownComplete");
  }

  return status || t("settings.shutdownPreparing");
}
