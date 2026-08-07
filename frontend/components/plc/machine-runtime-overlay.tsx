"use client";

import {
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCcw,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  disconnectPlc,
  getMachineRuntimeStatus,
  reconnectMachinePlc,
  resumeMachineOperation,
  type MachineRuntimeStatus,
  type MachineRuntimeStep,
} from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const POLL_INTERVAL_MS = 500;

type MachineRuntimeOverlayProps = {
  enabled: boolean;
};

export function MachineRuntimeOverlay({
  enabled,
}: MachineRuntimeOverlayProps) {
  const { apiError, t } = useI18n();
  const [status, setStatus] = useState<MachineRuntimeStatus | null>(null);
  const [resuming, setResuming] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [reconnectingPlc, setReconnectingPlc] = useState(false);
  const [disconnectingPlc, setDisconnectingPlc] = useState(false);
  const [dismissedNoticeKey, setDismissedNoticeKey] = useState<string | null>(
    null,
  );
  const pollingRef = useRef(false);
  const noticeKey = buildNoticeKey(status);
  const canDismiss = canDismissNotice(status);
  const machineStopOverlayActive =
    status?.idleReason === "machine_stop" &&
    ["stopping", "idle_machine_stop"].includes(status.state);
  const machineStartTransitionActive =
    status !== null &&
    !status.plcOffline &&
    ["resuming", "waiting_camera"].includes(status.state);

  const refresh = useCallback(async () => {
    if (!enabled || pollingRef.current) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;
    pollingRef.current = true;
    try {
      const response = await getMachineRuntimeStatus(accessToken);
      setStatus(response.data);
    } catch {
      // Connection errors are already surfaced by the normal API watchdog.
    } finally {
      pollingRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initialId = window.setTimeout(() => void refresh(), 0);
    const intervalId = window.setInterval(
      () => void refresh(),
      POLL_INTERVAL_MS,
    );
    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, [enabled, refresh]);

  async function handleResume() {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }
    setResuming(true);
    const toastId = toast.loading(t("machine.resuming"));
    try {
      const response = await resumeMachineOperation(accessToken);
      setStatus(response.data);
      toast.success(t("machine.resumeSuccess"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "machine.resumeError")
          : t("machine.resumeError");
      toast.error(message, { id: toastId });
    } finally {
      setResuming(false);
    }
  }

  async function handleRestart() {
    const bridge = getDesktopBridge();
    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }
    setRestarting(true);
    toast.loading(t("settings.restarting"));
    try {
      await bridge.restartApp();
    } catch {
      toast.error(t("settings.restartError"));
      setRestarting(false);
    }
  }

  async function handleReconnectPlc() {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setReconnectingPlc(true);
    const toastId = toast.loading(t("machine.plcReconnecting"));
    try {
      const response = await reconnectMachinePlc(accessToken);
      setStatus(response.data);
      setDismissedNoticeKey(null);
      toast.success(t("machine.plcReconnectSuccess"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "machine.plcReconnectError")
          : t("machine.plcReconnectError");
      toast.error(message, { id: toastId });
    } finally {
      setReconnectingPlc(false);
    }
  }

  async function handleDisconnectPlc() {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setDisconnectingPlc(true);
    const toastId = toast.loading(t("plc.disconnecting"));
    try {
      await disconnectPlc(accessToken);
      await refresh();
      toast.success(t("plc.disconnectSuccess"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "plc.disconnectError")
          : t("plc.disconnectError");
      toast.error(message, { id: toastId });
    } finally {
      setDisconnectingPlc(false);
    }
  }

  function handleDismiss() {
    setDismissedNoticeKey(noticeKey);
    toast.info(t("machine.noticeDismissed"));
  }

  if (
    !enabled ||
    !status ||
    machineStopOverlayActive ||
    machineStartTransitionActive ||
    status.state === "inactive" ||
    (canDismiss &&
      noticeKey !== null &&
      dismissedNoticeKey === noticeKey) ||
    (status.state === "running" && !status.plcOffline)
  ) {
    return null;
  }

  const restartRequired = status.state === "restart_required";
  const plcOffline = status.plcOffline;
  const displayedError = apiError(
    status.plcErrorMessage ?? status.message ?? "",
    plcOffline ? "machine.plcReconnectError" : "machine.resumeError",
  );
  const waitingForManualResume = status.state === "idle_capture_timeout";
  const transitionRunning = ["stopping", "resuming", "waiting_camera"].includes(
    status.state,
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 px-4 py-6 text-slate-950"
      role="dialog"
      aria-modal="true"
      aria-labelledby="machine-runtime-title"
      aria-describedby="machine-runtime-description"
    >
      <section className="w-full max-w-2xl border border-slate-300 bg-white">
        <header className="flex items-start gap-4 border-b border-slate-200 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-amber-300 bg-amber-50 text-amber-700">
            {restartRequired ? (
              <TriangleAlert className="h-6 w-6" aria-hidden="true" />
            ) : transitionRunning ? (
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            ) : (
              <Clock3 className="h-6 w-6" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="machine-runtime-title" className="text-xl font-semibold">
              {overlayTitle(status, t)}
            </h2>
            <p
              id="machine-runtime-description"
              className="mt-1 text-sm leading-6 text-slate-600"
            >
              {overlayDescription(status, t)}
            </p>
          </div>
          {canDismiss ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={handleDismiss}
              aria-label={t("machine.closeNotice")}
              title={t("machine.closeNotice")}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          ) : null}
        </header>

        <div className="grid gap-4 p-5">
          {status.countdownSeconds !== null &&
          status.state === "waiting_camera" ? (
            <p
              className="border border-cyan-300 bg-cyan-50 px-4 py-3 text-center text-lg font-semibold text-cyan-950"
              role="status"
              aria-live="polite"
            >
              {t("machine.cameraCountdown").replace(
                "{seconds}",
                String(status.countdownSeconds),
              )}
            </p>
          ) : null}

          {status.steps.length > 0 ? (
            <ol className="grid gap-2">
              {status.steps.map((step) => (
                <li
                  key={step.id}
                  className="flex items-center justify-between gap-3 border border-slate-200 px-3 py-3"
                >
                  <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-800">
                    <StepIcon status={step.status} />
                    {stepLabel(step, status, t)}
                  </span>
                  <span className={stepStatusClass(step.status)}>
                    {t(
                      `machine.step.${step.status === "running" ? "runningStatus" : step.status}`,
                    )}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          {(status.plcErrorMessage || status.message) &&
          (plcOffline || status.state === "error" || restartRequired) ? (
            <p
              className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {displayedError}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 p-4">
          {plcOffline ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-12 min-w-44"
                onClick={() => void handleDisconnectPlc()}
                disabled={disconnectingPlc || reconnectingPlc}
              >
                <XCircle
                  className={
                    disconnectingPlc ? "h-4 w-4 animate-pulse" : "h-4 w-4"
                  }
                  aria-hidden="true"
                />
                {t("plc.disconnect")}
              </Button>
              <Button
                type="button"
                className="h-12 min-w-52"
                onClick={() => void handleReconnectPlc()}
                disabled={reconnectingPlc || disconnectingPlc}
              >
                <RefreshCcw
                  className={
                    reconnectingPlc ? "h-4 w-4 animate-spin" : "h-4 w-4"
                  }
                  aria-hidden="true"
                />
                {t("machine.reconnectPlc")}
              </Button>
            </>
          ) : null}
          {canDismiss && !plcOffline ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 min-w-40"
              onClick={handleDismiss}
            >
              {t("machine.closeNotice")}
            </Button>
          ) : null}
          {waitingForManualResume ? (
            <Button
              type="button"
              className="h-12 min-w-52"
              onClick={() => void handleResume()}
              disabled={resuming}
            >
              <RefreshCcw
                className={resuming ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                aria-hidden="true"
              />
              {t("machine.resume")}
            </Button>
          ) : null}
          {restartRequired ? (
            <Button
              type="button"
              className="h-12 min-w-52"
              onClick={() => void handleRestart()}
              disabled={restarting}
            >
              <RefreshCcw
                className={restarting ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                aria-hidden="true"
              />
              {t("machine.restartApp")}
            </Button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function buildNoticeKey(status: MachineRuntimeStatus | null) {
  if (!status) return null;
  if (status.plcOffline) {
    return `plc:${status.plcErrorMessage ?? status.message ?? "offline"}`;
  }
  const transitionStartedAt =
    status.steps.find((step) => step.id === "signal")?.at ??
    status.steps.find((step) => step.id === "running")?.at ??
    status.steps[0]?.at ??
    status.updatedAt;
  return `${status.idleReason ?? "runtime"}:${transitionStartedAt}`;
}

function canDismissNotice(
  status: MachineRuntimeStatus | null,
) {
  if (!status) return false;
  if (status.plcOffline) return true;
  return ["waiting_camera", "restart_required", "error"].includes(
    status.state,
  );
}

function StepIcon({ status }: { status: MachineRuntimeStep["status"] }) {
  if (status === "done") {
    return (
      <CheckCircle2
        className="h-5 w-5 shrink-0 text-emerald-600"
        aria-hidden="true"
      />
    );
  }
  if (status === "failed") {
    return (
      <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
    );
  }
  if (status === "running") {
    return (
      <Loader2
        className="h-5 w-5 shrink-0 animate-spin text-cyan-700"
        aria-hidden="true"
      />
    );
  }
  return (
    <Clock3 className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
  );
}

function overlayTitle(
  status: MachineRuntimeStatus,
  t: (key: string) => string,
) {
  if (status.plcOffline) return t("machine.plcOfflineTitle");
  if (status.state === "restart_required") return t("machine.restartTitle");
  if (status.state === "idle_machine_stop") return t("machine.stopTitle");
  if (status.state === "idle_capture_timeout") return t("machine.timeoutTitle");
  return t("machine.transitionTitle");
}

function overlayDescription(
  status: MachineRuntimeStatus,
  t: (key: string) => string,
) {
  if (status.plcOffline) return t("machine.plcOfflineDescription");
  if (status.state === "restart_required")
    return t("machine.restartDescription");
  if (status.state === "idle_machine_stop") return t("machine.stopWaiting");
  if (status.state === "idle_capture_timeout") {
    return t("machine.timeoutWaiting").replace(
      "{seconds}",
      String(status.sleepTimeSeconds),
    );
  }
  return t("machine.resuming");
}

function stepLabel(
  step: MachineRuntimeStep,
  status: MachineRuntimeStatus,
  t: (key: string) => string,
) {
  if (step.id === "plc") return t("machine.step.plc");
  if (step.id === "signal") return t("machine.step.signal");
  if (step.id === "timeout") {
    return t("machine.step.timeout").replace(
      "{seconds}",
      String(status.sleepTimeSeconds),
    );
  }
  if (step.id === "outputs") return t("machine.step.outputsOff");
  if (step.id === "idle") return t("machine.step.idle");
  if (step.id === "running") return t("machine.step.running");
  if (step.id === "power") {
    return status.idleReason === "capture_timeout"
      ? t("machine.step.powerKept")
      : t("machine.step.powerOn");
  }
  if (step.id === "light") {
    return status.state === "stopping"
      ? t("machine.step.lightOff")
      : t("machine.step.lightOn");
  }
  if (step.id === "camera") {
    return status.state === "stopping" || status.state.startsWith("idle_")
      ? t("machine.step.cameraStop")
      : t("machine.step.cameraWait");
  }
  return step.message;
}

function stepStatusClass(status: MachineRuntimeStep["status"]) {
  const base = "shrink-0 border px-2 py-1 text-xs font-medium";
  if (status === "done")
    return `${base} border-emerald-300 bg-emerald-50 text-emerald-800`;
  if (status === "failed")
    return `${base} border-red-300 bg-red-50 text-red-800`;
  if (status === "running")
    return `${base} border-cyan-300 bg-cyan-50 text-cyan-900`;
  return `${base} border-slate-300 bg-slate-50 text-slate-600`;
}
