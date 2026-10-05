"use client";

import { CloudUpload, Pause, Play, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  cancelDongilHistorySync,
  getDongilHistorySyncCurrent,
  listDongilHistorySyncInvalid,
  pauseDongilHistorySync,
  resumeDongilHistorySync,
  retryDongilHistorySyncFailures,
  type DongilHistorySyncInvalidItem,
  type DongilHistorySyncRun,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";
import { cn } from "@/lib/utils";

type DongilHistorySyncProcessingProps = {
  enabled: boolean;
  canManage: boolean;
};

const historySyncStateKeys = {
  PREPARING: "historySync.state.PREPARING",
  RUNNING: "historySync.state.RUNNING",
  PAUSED: "historySync.state.PAUSED",
  BLOCKED: "historySync.state.BLOCKED",
  CANCELLED: "historySync.state.CANCELLED",
  COMPLETED: "historySync.state.COMPLETED",
} as const;

const reconciliationPhaseKeys = {
  WAITING_FOR_UPLOAD: "historySync.reconciliationPhase.WAITING_FOR_UPLOAD",
  COUNTERS: "historySync.reconciliationPhase.COUNTERS",
  RESULT_IDS: "historySync.reconciliationPhase.RESULT_IDS",
  FINALIZING: "historySync.reconciliationPhase.FINALIZING",
  COMPLETED: "historySync.reconciliationPhase.COMPLETED",
} as const;

const MINIMIZED_RUN_STORAGE_KEY = "dongil-history-sync:minimized-run-id";
const UPLOAD_NOTIFIED_RUN_STORAGE_KEY =
  "dongil-history-sync:upload-notified-run-id";
const COMPLETED_NOTIFIED_RUN_STORAGE_KEY =
  "dongil-history-sync:completed-notified-run-id";

export const DONGIL_HISTORY_SYNC_NAVBAR_SLOT_ID =
  "dongil-history-sync-navbar-slot";

export function DongilHistorySyncProcessing({
  enabled,
  canManage,
}: DongilHistorySyncProcessingProps) {
  const { t } = useI18n();
  const [run, setRun] = useState<DongilHistorySyncRun | null>(null);
  const [hidden, setHidden] = useState(false);
  const [visibilityRunId, setVisibilityRunId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    "pause" | "resume" | "retry" | "cancel" | null
  >(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showManualItems, setShowManualItems] = useState(false);
  const [manualItems, setManualItems] = useState<DongilHistorySyncInvalidItem[]>(
    [],
  );
  const [manualItemsLoading, setManualItemsLoading] = useState(false);
  const [manualItemsError, setManualItemsError] = useState<string | null>(null);
  const lastRunId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!enabled || !accessToken) return;

    try {
      const response = await getDongilHistorySyncCurrent(accessToken);
      setRun(response.data);
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : t("historySync.loadFailed"),
      );
    }
  }, [enabled, t]);

  useEffect(() => {
    if (!enabled) {
      setRun(null);
      return;
    }

    void load();
    const timer = window.setInterval(() => void load(), 3_000);
    return () => window.clearInterval(timer);
  }, [enabled, load]);

  useEffect(() => {
    if (!run?.id || run.id === lastRunId.current) return;
    lastRunId.current = run.id;
    setHidden(
      window.localStorage.getItem(MINIMIZED_RUN_STORAGE_KEY) === run.id,
    );
    setVisibilityRunId(run.id);
    setShowManualItems(false);
    setManualItems([]);
    setManualItemsError(null);
  }, [run?.id]);

  useEffect(() => {
    if (
      run?.id &&
      (run.state === "COMPLETED" || run.state === "CANCELLED") &&
      window.localStorage.getItem(MINIMIZED_RUN_STORAGE_KEY) === run.id
    ) {
      window.localStorage.removeItem(MINIMIZED_RUN_STORAGE_KEY);
    }
  }, [run?.id, run?.state]);

  useEffect(() => {
    if (!run?.id || !run.uploadCompletedAt || run.state === "COMPLETED") return;
    if (
      window.localStorage.getItem(UPLOAD_NOTIFIED_RUN_STORAGE_KEY) === run.id
    ) {
      return;
    }
    window.localStorage.setItem(UPLOAD_NOTIFIED_RUN_STORAGE_KEY, run.id);
    toast.success(t("historySync.uploadCompleted"));
  }, [run?.id, run?.uploadCompletedAt, t]);

  useEffect(() => {
    if (!run?.id || run.state !== "COMPLETED") return;
    if (
      window.localStorage.getItem(COMPLETED_NOTIFIED_RUN_STORAGE_KEY) === run.id
    ) {
      return;
    }
    window.localStorage.setItem(COMPLETED_NOTIFIED_RUN_STORAGE_KEY, run.id);
    toast.success(t("historySync.completedSuccess"));
  }, [run?.id, run?.state, t]);

  if (!run || run.state === "COMPLETED" || run.state === "CANCELLED") {
    return null;
  }
  if (visibilityRunId !== run.id) return null;

  async function executeAction(action: "pause" | "resume" | "retry" | "cancel") {
    const accessToken = getAccessToken();
    if (!accessToken || !canManage) return;

    setLoadingAction(action);
    try {
      if (action === "pause") {
        await pauseDongilHistorySync(accessToken);
      } else if (action === "resume") {
        await resumeDongilHistorySync(accessToken);
      } else if (action === "cancel") {
        await cancelDongilHistorySync(accessToken);
        setCancelConfirmOpen(false);
      } else {
        await retryDongilHistorySyncFailures(accessToken);
      }
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : t("historySync.actionFailed"),
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function loadManualItems() {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setShowManualItems(true);
    setManualItemsLoading(true);
    try {
      const response = await listDongilHistorySyncInvalid(accessToken);
      setManualItems(response.data);
      setManualItemsError(null);
    } catch (cause) {
      setManualItemsError(
        cause instanceof Error
          ? cause.message
          : t("historySync.manualItemsLoadFailed"),
      );
    } finally {
      setManualItemsLoading(false);
    }
  }

  const isPaused = run.state === "PAUSED";
  const isBlocked = run.state === "BLOCKED";
  const statusKey = historySyncStateKeys[run.state];
  const delivery = run.delivery;
  const progress = Math.max(0, Math.min(100, delivery.percent));
  const batch = Math.min(run.currentBatch, run.totalBatches);
  const reconciliation = run.reconciliation;
  const reconciliationProgress = Math.max(
    0,
    Math.min(100, reconciliation.percent),
  );

  if (hidden) {
    const compactProgress =
      delivery.phase === "COMPLETED" ? reconciliationProgress : progress;
    const compactDescription =
      delivery.phase === "COMPLETED"
        ? t("historySync.compactVerifying")
            .replace("{verified}", formatNumber(reconciliation.verified))
            .replace("{total}", formatNumber(reconciliation.total))
            .replace("{percent}", String(reconciliationProgress))
        : t("historySync.compactProgress")
            .replace("{confirmed}", formatNumber(delivery.confirmed))
            .replace("{total}", formatNumber(delivery.total))
            .replace("{percent}", String(progress));
    const navbarSlot =
      typeof document === "undefined"
        ? null
        : document.getElementById(DONGIL_HISTORY_SYNC_NAVBAR_SLOT_ID);

    if (!navbarSlot) return null;

    return createPortal(
      <button
        type="button"
        onClick={() => {
          window.localStorage.removeItem(MINIMIZED_RUN_STORAGE_KEY);
          setHidden(false);
        }}
        aria-label={`${t("historySync.processingTitle")}. ${compactDescription}`}
        title={`${t("historySync.processingTitle")}. ${compactDescription}`}
        className="flex h-10 min-w-12 max-w-64 items-center justify-center gap-2 border border-cyan-300 bg-cyan-50 px-3 text-left text-cyan-950 transition hover:bg-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700"
      >
        <CloudUpload className="h-5 w-5 shrink-0 text-cyan-800" aria-hidden="true" />
        <span className="text-sm font-bold tabular-nums min-[1450px]:hidden">
          {compactProgress}%
        </span>
        <span className="hidden min-w-0 min-[1450px]:block">
          <span className="block truncate text-sm font-semibold text-slate-950">
            {t("historySync.processingTitle")}
          </span>
          <span className="block text-xs text-slate-600">
            {compactDescription}
          </span>
        </span>
      </button>,
      navbarSlot,
    );
  }

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/45 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dongil-history-sync-title"
        className="mx-auto flex min-h-full w-full max-w-4xl items-center"
      >
        <div className="w-full border border-slate-200 bg-white shadow-2xl">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="border border-cyan-200 bg-cyan-50 p-2 text-cyan-800">
                <CloudUpload className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="dongil-history-sync-title" className="text-lg font-bold text-slate-950">
                  {t("historySync.processingTitle")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t("historySync.processingDescription")}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "w-fit border px-3 py-1 text-sm font-semibold",
                isBlocked
                  ? "border-red-200 bg-red-50 text-red-800"
                  : isPaused
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-cyan-200 bg-cyan-50 text-cyan-900",
              )}
            >
              {t(statusKey)}
            </span>
          </header>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="text-sm font-semibold text-slate-950">
                  {delivery.phase === "COMPLETED"
                    ? t("historySync.uploadCompleted")
                    : t("historySync.batchProgress")
                        .replace("{current}", String(batch))
                        .replace("{total}", String(run.totalBatches))}
                </p>
                <p className="text-sm text-slate-600">
                  {t("historySync.resultProgress")
                    .replace("{confirmed}", formatNumber(delivery.confirmed))
                    .replace("{total}", formatNumber(delivery.total))
                    .replace("{percent}", String(progress))}
                </p>
              </div>
              <div className="mt-3 h-3 overflow-hidden bg-slate-200" aria-hidden="true">
                <div
                  className={cn(
                    "h-full transition-[width] duration-300",
                    delivery.phase === "COMPLETED"
                      ? "bg-emerald-600"
                      : "bg-cyan-700",
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="border border-sky-200 bg-sky-50/40 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {t("historySync.reconciliationTitle")}
                  </p>
                  <p className="mt-1 text-sm text-sky-900">
                    {t(reconciliationPhaseKeys[reconciliation.phase])}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  {t("historySync.reconciliationProgress")
                    .replace("{verified}", formatNumber(reconciliation.verified))
                    .replace("{total}", formatNumber(reconciliation.total))
                    .replace("{percent}", String(reconciliationProgress))}
                </p>
              </div>
              <div className="mt-3 h-3 overflow-hidden bg-sky-100" aria-hidden="true">
                <div
                  className="h-full bg-sky-700 transition-[width] duration-300"
                  style={{ width: `${reconciliationProgress}%` }}
                />
              </div>
              <div className="mt-3 flex flex-col gap-1 text-xs text-slate-600 sm:flex-row sm:justify-between">
                <span>
                  {t("historySync.reconciliationScopes")
                    .replace("{completed}", String(reconciliation.completedScopes))
                    .replace("{total}", String(reconciliation.totalScopes))}
                </span>
                {reconciliation.currentScope ? (
                  <span className="font-medium text-slate-700">
                    {t("historySync.reconciliationCurrentScope")
                      .replace("{scope}", reconciliation.currentScope.scope)
                      .replace("{scopeKey}", reconciliation.currentScope.scopeKey)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label={t("historySync.accepted")}
                value={formatNumber(run.acceptedCount)}
                className="border-emerald-200 bg-emerald-50 text-emerald-900"
              />
              <Metric
                label={t("historySync.replayed")}
                value={formatNumber(run.replayedCount)}
                className="border-sky-200 bg-sky-50 text-sky-900"
              />
              <Metric
                label={t("historySync.failed")}
                value={formatNumber(run.failedCount)}
                className="border-red-200 bg-red-50 text-red-900"
              />
            </div>

            <div className="grid gap-x-6 gap-y-3 border-y border-slate-100 py-4 text-sm sm:grid-cols-2">
              <Detail label={t("historySync.currentBatchId")} value={run.lastBatchId} />
              <Detail label={t("historySync.lastRetry")} value={formatTimestamp(run.lastRetryAt)} />
              <Detail
                label={t("historySync.checkpoint")}
                value={formatTimestamp(run.checkpointedAt)}
              />
              <Detail
                label={t("historySync.manualReview")}
                value={formatNumber(run.invalidCount)}
              />
            </div>

            {run.invalidCount > 0 ? (
              <div className="border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-amber-900">
                    {t("historySync.manualItemsDescription").replace(
                      "{count}",
                      formatNumber(run.invalidCount),
                    )}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={manualItemsLoading}
                    onClick={() => void loadManualItems()}
                  >
                    {manualItemsLoading
                      ? t("common.loading")
                      : t("historySync.viewManualItems")}
                  </Button>
                </div>
                {showManualItems ? (
                  <div className="mt-4 overflow-x-auto border border-amber-200 bg-white">
                    {manualItemsError ? (
                      <p className="p-3 text-sm text-red-800">{manualItemsError}</p>
                    ) : manualItems.length === 0 && !manualItemsLoading ? (
                      <p className="p-3 text-sm text-slate-600">
                        {t("historySync.manualItemsEmpty")}
                      </p>
                    ) : (
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-amber-100 text-amber-950">
                          <tr>
                            <th className="px-3 py-2 font-semibold">
                              {t("historySync.manualItemsSource")}
                            </th>
                            <th className="px-3 py-2 font-semibold">
                              {t("historySync.manualItemsReason")}
                            </th>
                            <th className="px-3 py-2 font-semibold">
                              {t("historySync.manualItemsCapturedAt")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {manualItems.map((item) => (
                            <tr key={item.id} className="border-t border-slate-100">
                              <td className="max-w-56 truncate px-3 py-2 font-mono text-xs">
                                {item.sourceLogId}
                              </td>
                              <td className="px-3 py-2">{item.reason}</td>
                              <td className="whitespace-nowrap px-3 py-2">
                                {formatTimestamp(item.capturedAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {run.lastErrorMessage || loadError ? (
              <p className="border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
                {run.lastErrorMessage ?? loadError}
              </p>
            ) : null}
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.localStorage.setItem(MINIMIZED_RUN_STORAGE_KEY, run.id);
                setHidden(true);
              }}
            >
              {t("historySync.continueOperation")}
            </Button>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {run.failedCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loadingAction !== null}
                    onClick={() => void executeAction("retry")}
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", loadingAction === "retry" && "animate-spin")}
                      aria-hidden="true"
                    />
                    {t("historySync.retryFailures")}
                  </Button>
                ) : null}
                {isPaused || isBlocked ? (
                  <Button
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() => void executeAction("resume")}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    {t("historySync.resume")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loadingAction !== null}
                    onClick={() => void executeAction("pause")}
                  >
                    <Pause className="h-4 w-4" aria-hidden="true" />
                    {t("historySync.pause")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                  disabled={loadingAction !== null}
                  onClick={() => setCancelConfirmOpen(true)}
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  {t("historySync.cancel")}
                </Button>
              </div>
            ) : null}
          </footer>
          <ConfirmModal
            open={cancelConfirmOpen}
            title={t("historySync.cancelConfirmTitle")}
            description={t("historySync.cancelConfirmDescription")}
            confirmLabel={
              loadingAction === "cancel"
                ? t("historySync.cancelling")
                : t("historySync.cancel")
            }
            cancelLabel={t("common.cancel")}
            loading={loadingAction === "cancel"}
            destructive
            overlayClassName="z-[120]"
            onConfirm={() => void executeAction("cancel")}
            onCancel={() => setCancelConfirmOpen(false)}
          />
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className={cn("border p-4", className)}>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-slate-100 pb-2 sm:block sm:border-0 sm:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-slate-900 sm:mt-1 sm:block sm:text-left">
        {value ?? "—"}
      </span>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatTimestamp(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}
