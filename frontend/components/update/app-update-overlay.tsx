"use client";

import { AlertTriangle, CheckCircle2, Download, FileText, LoaderCircle, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DesktopUpdateState } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";

type AppUpdateOverlayProps = {
  onClose: () => void;
  onExportLog: () => void;
  onInstall: () => void;
  open: boolean;
  state: DesktopUpdateState;
};

const activeStatuses = new Set(["downloading", "preparing", "installing"]);

export function AppUpdateOverlay({
  onClose,
  onExportLog,
  onInstall,
  open,
  state,
}: AppUpdateOverlayProps) {
  const { t } = useI18n();
  if (!open) return null;

  const progress = Math.max(0, Math.min(100, state.details.percent ?? 0));
  const active = activeStatuses.has(state.status);
  const downloaded = state.status === "downloaded";
  const failed = state.status === "error";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4" role="presentation">
      <section
        aria-labelledby="update-overlay-title"
        aria-modal="true"
        className="w-full max-w-2xl border border-slate-300 bg-white"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <StatusIcon status={state.status} />
            <div>
              <h2 id="update-overlay-title" className="text-xl font-bold text-slate-950">
                {t(`update.overlayTitle.${state.status}`)}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t(`update.overlayDescription.${state.status}`)}
              </p>
            </div>
          </div>
          {!active ? (
            <Button variant="outline" size="icon" onClick={onClose} aria-label={t("common.close")}>
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <VersionCell label={t("update.currentVersion")} value={state.currentVersion} />
            <VersionCell label={t("update.newVersion")} value={state.details.version ?? "-"} />
          </div>

          {state.status === "downloading" ? (
            <div className="space-y-2" aria-live="polite">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                <span>{t("update.downloadProgress")}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-3 overflow-hidden border border-slate-300 bg-slate-100">
                <div
                  className="h-full bg-cyan-700 transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">{formatTransfer(state)}</p>
            </div>
          ) : null}

          {state.status === "preparing" ? (
            <div className="border border-cyan-200 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">
              {t("update.backupExplanation")}
            </div>
          ) : null}

          {downloaded ? (
            <div className="border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
              {t("update.restartExplanation")}
            </div>
          ) : null}

          {failed ? (
            <div className="border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800" role="alert">
              <strong className="block">{t("update.failedTitle")}</strong>
              <span className="break-words">{state.message}</span>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end sm:p-6">
          {failed ? (
            <Button variant="outline" onClick={onExportLog}>
              <FileText className="h-4 w-4" />
              {t("update.exportLog")}
            </Button>
          ) : null}
          {downloaded ? (
            <Button onClick={onInstall}>
              <RotateCw className="h-4 w-4" />
              {t("update.installAndRestart")}
            </Button>
          ) : null}
          {!active && !downloaded ? (
            <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function StatusIcon({ status }: { status: DesktopUpdateState["status"] }) {
  const className = "h-6 w-6";
  if (status === "error") return <AlertTriangle className={`${className} text-red-700`} />;
  if (status === "downloaded") return <CheckCircle2 className={`${className} text-emerald-700`} />;
  if (status === "downloading") return <Download className={`${className} text-cyan-800`} />;
  return <LoaderCircle className={`${className} animate-spin text-cyan-800`} />;
}

function VersionCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">v{value.replace(/^v/, "")}</p>
    </div>
  );
}

function formatTransfer(state: DesktopUpdateState) {
  const transferred = formatBytes(state.details.transferred);
  const total = formatBytes(state.details.total);
  const speed = formatBytes(state.details.bytesPerSecond);
  return `${transferred} / ${total} · ${speed}/s`;
}

function formatBytes(value?: number) {
  if (!value || value <= 0) return "0 MB";
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
