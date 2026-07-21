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
};

const initialSnapshot: StatusSnapshot = {
  apiHealth: null,
  license: null,
};

export function LoginSystemStatus({ className, onChange }: Props) {
  const { apiError, t } = useI18n();
  const [snapshot, setSnapshot] = useState<StatusSnapshot>(initialSnapshot);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const [healthResponse, licenseResponse] = await Promise.all([
        getApiHealth(),
        getPublicSystemLicense(),
      ]);

      setSnapshot({
        apiHealth: healthResponse.data,
        license: licenseResponse.data,
      });
      onChange({
        checking: false,
        apiConnected: healthResponse.data.status === "ok",
        licenseReady:
          licenseResponse.data.licensed === true &&
          licenseResponse.data.donglePresent === true,
      });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "auth.connectionError")
          : t("auth.connectionError");

      setSnapshot(initialSnapshot);
      setError(message);
      onChange({
        checking: false,
        apiConnected: false,
        licenseReady: false,
      });
    } finally {
      setChecking(false);
    }
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

  const apiConnected = snapshot.apiHealth?.status === "ok";
  const licenseReady =
    snapshot.license?.licensed === true &&
    snapshot.license?.donglePresent === true;

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

      <div className="login-status-grid mt-3 grid gap-2 sm:grid-cols-3">
        <StatusCell
          label={t("login.apiConnection")}
          value={
            apiConnected ? t("dashboard.connected") : t("dashboard.pending")
          }
          tone={apiConnected ? "ok" : "idle"}
        />
        <StatusCell
          label={t("login.securityCheck")}
          value={
            snapshot.license?.licensed === true
              ? t("dashboard.licensed")
              : snapshot.license?.licensed === false
                ? t("dashboard.unlicensed")
                : t("dashboard.pending")
          }
          tone={
            snapshot.license?.licensed === true
              ? "ok"
              : snapshot.license?.licensed === false
                ? "error"
                : "idle"
          }
        />
        <StatusCell
          label={t("login.dongleGate")}
          value={
            snapshot.license?.donglePresent === true
              ? t("dashboard.donglePresent")
              : snapshot.license?.donglePresent === false
                ? t("dashboard.dongleMissing")
                : t("dashboard.pending")
          }
          tone={
            snapshot.license?.donglePresent === true
              ? "ok"
              : snapshot.license?.donglePresent === false
                ? "error"
                : "idle"
          }
        />
      </div>

      <div className="login-status-checked mt-3 break-words text-xs text-slate-500">
        {t("dashboard.lastChecked")}:{" "}
        {snapshot.license?.lastCheckedAt ?? t("dashboard.noData")}
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
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "error" | "idle";
}) {
  return (
    <div className="login-status-cell min-w-0 border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </span>
        <span className={statusPillClass(tone)} />
      </div>
      <div className="login-status-value mt-2 break-words text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function statusPillClass(tone: "ok" | "error" | "idle") {
  const base = "inline-flex h-2.5 w-2.5 shrink-0 rounded-full";

  if (tone === "ok") {
    return `${base} bg-emerald-500`;
  }

  if (tone === "error") {
    return `${base} bg-red-500`;
  }

  return `${base} bg-slate-300`;
}
