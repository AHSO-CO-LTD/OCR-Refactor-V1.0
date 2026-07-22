"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  getApiHealth,
  getPublicSystemLicense,
  type HealthResponse,
  type SystemLicenseState,
} from "@/lib/api";
import {
  getDesktopBridge,
  type DesktopStartupSnapshot,
  type DesktopStartupStageStatus,
} from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import { LICENSE_WATCHDOG_INTERVAL_MS } from "@/lib/use-license-watchdog";
import { cn } from "@/lib/utils";

export type LoginGateStatus = {
  checking: boolean;
  apiConnected: boolean;
  licenseReady: boolean;
};

type Props = {
  className?: string;
  onChange: (status: LoginGateStatus) => void;
};

type StatusSnapshot = {
  apiHealth: HealthResponse["data"] | null;
  license: SystemLicenseState | null;
  desktopStartup: DesktopStartupSnapshot | null;
};

const initialSnapshot: StatusSnapshot = {
  apiHealth: null,
  license: null,
  desktopStartup: null,
};

type SummaryStatus = DesktopStartupStageStatus | "unknown";

export function LoginSystemStatus({ className, onChange }: Props) {
  const { apiError, t } = useI18n();
  const [snapshot, setSnapshot] = useState<StatusSnapshot>(initialSnapshot);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    const desktopBridge = getDesktopBridge();
    const [healthResult, licenseResult, startupResult] =
      await Promise.allSettled([
        getApiHealth(),
        getPublicSystemLicense(),
        desktopBridge?.getStartupSnapshot() ?? Promise.resolve(null),
      ]);

    const apiHealth =
      healthResult.status === "fulfilled" ? healthResult.value.data : null;
    const license =
      licenseResult.status === "fulfilled" ? licenseResult.value.data : null;
    const desktopStartup =
      startupResult.status === "fulfilled" ? startupResult.value : null;
    const apiConnected = apiHealth?.status === "ok";
    const licenseReady =
      license?.licensed === true && license?.donglePresent === true;

    setSnapshot({ apiHealth, license, desktopStartup });
    onChange({
      checking: false,
      apiConnected,
      licenseReady,
    });

    if (healthResult.status === "rejected" || licenseResult.status === "rejected") {
      const cause =
        healthResult.status === "rejected"
          ? healthResult.reason
          : licenseResult.status === "rejected"
            ? licenseResult.reason
            : null;
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "auth.connectionError")
          : t("auth.connectionError");

      setError(message);
    } else {
      setError("");
    }

    setChecking(false);
  }, [apiError, onChange, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatus();
    }, 0);
    const interval = window.setInterval(
      () => void loadStatus(),
      LICENSE_WATCHDOG_INTERVAL_MS,
    );

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [loadStatus]);

  useEffect(() => {
    const desktopBridge = getDesktopBridge();
    if (!desktopBridge) return;

    return desktopBridge.onStartupSnapshot((desktopStartup) => {
      setSnapshot((current) => ({ ...current, desktopStartup }));
    });
  }, []);

  const apiConnected = snapshot.apiHealth?.status === "ok";
  const licenseReady =
    snapshot.license?.licensed === true &&
    snapshot.license?.donglePresent === true;
  const softwareStatus = resolveSoftwareStatus(
    snapshot.desktopStartup,
    apiConnected,
    checking,
  );
  const licenseStatus = resolveLicenseStatus(
    snapshot.license,
    snapshot.desktopStartup,
    checking,
  );
  const plcStatus = resolveStartupGroupStatus(
    snapshot.desktopStartup,
    ["plc"],
    checking,
  );
  const cameraStatus = resolveStartupGroupStatus(
    snapshot.desktopStartup,
    ["cameraPower", "cameraLight", "camera"],
    checking,
    "camera",
  );

  return (
    <div className={cn("border border-slate-200 bg-slate-50 p-3", className)}>
      <div className="login-status-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950">
            {t("login.statusTitle")}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {checking
              ? t("auth.checking")
              : licenseReady
                ? t("login.ready")
                : t("login.blocked")}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={checking}
          onClick={() => {
            setChecking(true);
            setError("");
            void loadStatus();
          }}
        >
          {checking ? t("auth.checking") : t("login.recheck")}
        </Button>
      </div>

      <div className="login-status-grid mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatusCell
          label={t("login.softwareCheck")}
          value={t(`login.startupStatus.${softwareStatus}`)}
          status={softwareStatus}
        />
        <StatusCell
          label={t("login.licenseCheck")}
          value={t(`login.startupStatus.${licenseStatus}`)}
          status={licenseStatus}
        />
        <StatusCell
          label={t("login.plcCheck")}
          value={t(`login.startupStatus.${plcStatus}`)}
          status={plcStatus}
        />
        <StatusCell
          label={t("login.cameraCheck")}
          value={t(`login.startupStatus.${cameraStatus}`)}
          status={cameraStatus}
        />
      </div>

      <div className="login-status-checked mt-3 break-words text-xs text-slate-500">
        {t("dashboard.lastChecked")}:{" "}
        {snapshot.license?.lastCheckedAt ??
          snapshot.apiHealth?.timestamp ??
          t("dashboard.noData")}
      </div>

      {error ? (
        <div className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function StatusCell({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: SummaryStatus;
}) {
  return (
    <div className="login-status-cell min-w-0 border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </span>
        <span className={statusPillClass(status)} />
      </div>
      <div className="login-status-value mt-2 break-words text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function statusPillClass(status: SummaryStatus) {
  const base = "inline-flex h-2.5 w-2.5 shrink-0 rounded-full";

  if (status === "done") {
    return `${base} bg-emerald-500`;
  }

  if (status === "failed") {
    return `${base} bg-red-500`;
  }

  if (status === "warning") {
    return `${base} bg-amber-500`;
  }

  if (status === "running") {
    return `${base} animate-pulse bg-cyan-600`;
  }

  return `${base} bg-slate-300`;
}

function resolveSoftwareStatus(
  startup: DesktopStartupSnapshot | null,
  apiConnected: boolean,
  checking: boolean,
): SummaryStatus {
  if (!startup) {
    if (checking) return "running";
    return apiConnected ? "done" : "failed";
  }

  return resolveStartupGroupStatus(
    startup,
    ["deviceTool", "backend", "frontend", "database"],
    checking,
  );
}

function resolveLicenseStatus(
  license: SystemLicenseState | null,
  startup: DesktopStartupSnapshot | null,
  checking: boolean,
): SummaryStatus {
  if (license?.licensed === true && license.donglePresent === true) {
    return "done";
  }

  if (license?.licensed === false || license?.donglePresent === false) {
    return "failed";
  }

  return resolveStartupGroupStatus(startup, ["license"], checking);
}

function resolveStartupGroupStatus(
  startup: DesktopStartupSnapshot | null,
  stageIds: string[],
  checking: boolean,
  primaryStageId?: string,
): SummaryStatus {
  if (!startup) return checking ? "running" : "unknown";

  const stages = stageIds
    .map((id) => startup.stages.find((stage) => stage.id === id))
    .filter((stage) => stage !== undefined);

  if (stages.length === 0) return "unknown";

  const primaryStage = primaryStageId
    ? stages.find((stage) => stage.id === primaryStageId)
    : null;

  if (primaryStage?.status === "skipped") return "skipped";
  if (stages.some((stage) => stage.status === "failed")) return "failed";
  if (stages.some((stage) => stage.status === "running")) return "running";
  if (stages.some((stage) => stage.status === "warning")) return "warning";
  if (stages.some((stage) => stage.status === "pending")) return "pending";
  if (stages.some((stage) => stage.status === "done")) return "done";
  if (stages.every((stage) => stage.status === "skipped")) return "skipped";

  return "unknown";
}
