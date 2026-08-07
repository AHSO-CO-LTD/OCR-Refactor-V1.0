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
import { ExitAppDialog } from "@/components/system/exit-app-dialog";
import {
  ShutdownChecklist,
  type ShutdownChecklistItem,
} from "@/components/system/shutdown-checklist";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useVirtualKeyboard } from "@/components/ui/virtual-keyboard";
import {
  type DesktopShutdownStageId,
  type DesktopShutdownStageUpdate,
  getDesktopBridge,
} from "@/lib/desktop";
import { type TranslationKey, useI18n } from "@/lib/i18n";

type DesktopLifecycleContextValue = {
  requestExit: () => void;
  requestRestart: () => void;
};

const DesktopLifecycleContext =
  createContext<DesktopLifecycleContextValue | null>(null);

export function DesktopLifecycleProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { closeKeyboard } = useVirtualKeyboard();
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [shutdownLoading, setShutdownLoading] = useState(false);
  const [shutdownMode, setShutdownMode] = useState<"exit" | "restart">("exit");
  const [shutdownError, setShutdownError] = useState<string | null>(null);
  const [shutdownStages, setShutdownStages] = useState<
    Partial<Record<DesktopShutdownStageId, DesktopShutdownStageUpdate>>
  >({});
  const [shutdownStatus, setShutdownStatus] = useState("");

  const requestExit = useCallback(() => {
    if (shutdownLoading) {
      return;
    }

    if (!getDesktopBridge()) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    closeKeyboard();
    setRestartConfirmOpen(false);
    setShutdownError(null);
    setShutdownStages({});
    setExitConfirmOpen(true);
  }, [closeKeyboard, shutdownLoading, t]);

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
    const removeShutdownStageListener = bridge.onShutdownStage((stage) => {
      setShutdownStages((current) => ({
        ...current,
        [stage.id]: stage,
      }));
    });

    void bridge.setCloseConfirmationReady(true).catch(() => {
      toast.error(t("settings.exitError"));
    });

    return () => {
      removeCloseListener();
      removeShutdownListener();
      removeShutdownStageListener();
      void bridge.setCloseConfirmationReady(false).catch(() => undefined);
    };
  }, [requestExit, t]);

  async function executeExitApp() {
    const bridge = getDesktopBridge();

    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      setExitConfirmOpen(false);
      return;
    }

    setExitConfirmOpen(false);
    setShutdownLoading(true);
    setShutdownMode("exit");
    setShutdownError(null);
    setShutdownStages({});
    setShutdownStatus(t("settings.hardwareShutdownPreparing"));
    const toastId = toast.loading(t("settings.hardwareShutdownTitle"));

    try {
      await bridge.exitApp("app-and-hardware");
    } catch {
      toast.dismiss(toastId);
      const errorMessage = t("settings.hardwareShutdownError");
      toast.error(errorMessage);
      setShutdownError(errorMessage);
      setShutdownStatus(errorMessage);
    }
  }

  function confirmExitApp() {
    void executeExitApp();
  }

  function cancelExitAppShutdown() {
    setShutdownLoading(false);
    setShutdownError(null);
    setShutdownStages({});
    setShutdownStatus("");
    toast.info(t("settings.shutdownCancelled"));
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
      <ExitAppDialog
        open={exitConfirmOpen}
        title={t("settings.exitConfirmTitle")}
        description={t("settings.exitConfirmDescription")}
        confirmLabel={t("settings.exitHardwareConfirm")}
        cancelLabel={t("common.cancel")}
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
          error={shutdownError}
          checklist={
            shutdownMode === "exit"
              ? createShutdownChecklist(shutdownStages, t)
              : undefined
          }
          title={
            shutdownMode === "restart"
              ? t("settings.restartTitle")
              : t("settings.hardwareShutdownTitle")
          }
          description={
            shutdownMode === "restart"
              ? t("settings.restartDescription")
              : t("settings.hardwareShutdownDescription")
          }
          retryLabel={t("settings.shutdownRetry")}
          cancelLabel={t("common.cancel")}
          onRetry={
            shutdownMode === "exit" && shutdownError
              ? () => void executeExitApp()
              : undefined
          }
          onCancel={
            shutdownMode === "exit" && shutdownError
              ? cancelExitAppShutdown
              : undefined
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
  cancelLabel,
  checklist,
  description,
  detail,
  error,
  onCancel,
  onRetry,
  retryLabel,
  title,
}: {
  cancelLabel: string;
  checklist?: ShutdownChecklistItem[];
  description: string;
  detail: string;
  error: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
  retryLabel: string;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 px-4 text-slate-950"
      role={error ? "alert" : "status"}
      aria-live="polite"
      aria-busy={error ? "false" : "true"}
    >
      <section className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <div
            className={
              error
                ? "mt-1 grid h-9 w-9 shrink-0 place-items-center border-2 border-red-300 bg-red-50 font-bold text-red-700"
                : "mt-1 h-9 w-9 shrink-0 animate-spin border-2 border-slate-300 border-t-cyan-700"
            }
            aria-hidden="true"
          >
            {error ? "!" : null}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {description}
            </p>
            <p
              className={
                error
                  ? "mt-4 border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
                  : "mt-4 border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
              }
            >
              {detail}
            </p>
          </div>
        </div>
        {checklist ? (
          <ShutdownChecklist className="mt-5" items={checklist} />
        ) : null}
        {error && onRetry ? (
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                {cancelLabel}
              </Button>
            ) : null}
            <Button type="button" onClick={onRetry}>
              {retryLabel}
            </Button>
          </div>
        ) : null}
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

  if (status.includes("Preparing hardware shutdown")) {
    return t("settings.hardwareShutdownPreparing");
  }

  if (status.includes("Hardware shutdown failed")) {
    return t("settings.hardwareShutdownError");
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

function createShutdownChecklist(
  updates: Partial<Record<DesktopShutdownStageId, DesktopShutdownStageUpdate>>,
  t: (key: TranslationKey) => string,
): ShutdownChecklistItem[] {
  const definitions: Array<{
    id: DesktopShutdownStageId;
    label: TranslationKey;
  }> = [
    { id: "camera", label: "settings.shutdownStepCamera" },
    {
      id: "cameraOutputs",
      label: "settings.shutdownStepCameraOutputs",
    },
    {
      id: "remainingSignals",
      label: "settings.shutdownStepSignals",
    },
    { id: "plc", label: "settings.shutdownStepPlc" },
    { id: "app", label: "settings.shutdownStepApp" },
  ];

  return definitions
    .map(({ id, label }) => ({
      id,
      label: t(label),
      status: updates[id]?.status ?? "pending",
      error: updates[id]?.error,
    }))
    .filter((item) => item.status !== "skipped");
}
