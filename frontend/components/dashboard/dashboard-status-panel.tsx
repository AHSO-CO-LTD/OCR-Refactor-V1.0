"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ApiError,
  getApiHealth,
  getCurrentInspection,
  getSystemLicense,
  listProductProfiles,
  type CurrentInspectionState,
  type HealthResponse,
  type SystemLicenseState,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type DashboardSnapshot = {
  apiHealth: HealthResponse["data"] | null;
  license: SystemLicenseState | null;
  inspection: CurrentInspectionState | null;
  productCount: number;
  activeProductCount: number;
};

const initialSnapshot: DashboardSnapshot = {
  apiHealth: null,
  license: null,
  inspection: null,
  productCount: 0,
  activeProductCount: 0,
};

export function DashboardStatusPanel() {
  const { apiError, t } = useI18n();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardStatus() {
      const accessToken = getAccessToken();

      if (!accessToken) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [healthResponse, inspectionResponse, productsResponse] =
          await Promise.all([
            getApiHealth(),
            getCurrentInspection(accessToken),
            listProductProfiles(accessToken),
          ]);

        let license: SystemLicenseState | null = null;

        try {
          const licenseResponse = await getSystemLicense(accessToken);
          license = licenseResponse.data;
        } catch (cause) {
          if (
            !(cause instanceof ApiError) ||
            ![403, 404].includes(cause.status)
          ) {
            throw cause;
          }
        }

        if (cancelled) {
          return;
        }

        const products = productsResponse.data;
        setSnapshot({
          apiHealth: healthResponse.data,
          license,
          inspection: inspectionResponse.data,
          productCount: products.length,
          activeProductCount: products.filter((product) => product.active).length,
        });
      } catch (cause) {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? apiError(cause.message, "dashboard.loadError")
            : t("dashboard.loadError"),
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboardStatus();

    return () => {
      cancelled = true;
    };
  }, [apiError, t]);

  const inspection = snapshot.inspection;
  const license = snapshot.license;
  const latestResult = inspection?.lastResult?.result ?? "UNKNOWN";
  const inspectionStatus = inspection?.status ?? "idle";
  const latestResultLabel = formatResultLabel(latestResult, t);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatusCard
          label={t("dashboard.apiSession")}
          value={
            snapshot.apiHealth?.status === "ok"
              ? t("dashboard.connected")
              : t("dashboard.pending")
          }
          tone={snapshot.apiHealth?.status === "ok" ? "ok" : "idle"}
          detail={snapshot.apiHealth?.timestamp ?? t("dashboard.noData")}
        />
        <StatusCard
          label={t("dashboard.license")}
          value={formatLicenseLabel(license, t)}
          tone={formatLicenseTone(license)}
          detail={formatLicenseDetail(license, t)}
        />
        <StatusCard
          label={t("dashboard.inspection")}
          value={formatStatusLabel(inspectionStatus, t)}
          tone={inspectionStatus === "running" ? "ok" : "idle"}
          detail={
            inspection?.currentProductCode ??
            inspection?.productCode ??
            t("dashboard.noInspection")
          }
        />
        <StatusCard
          label={t("dashboard.okNg")}
          value={`${inspection?.okCount ?? 0} / ${inspection?.ngCount ?? 0}`}
          tone={
            latestResult === "NG"
              ? "error"
              : latestResult === "OK"
                ? "ok"
                : "idle"
          }
          detail={`${t("dashboard.quantity")}: ${inspection?.quantity ?? 0}`}
        />
        <StatusCard
          label={t("dashboard.productProfiles")}
          value={String(snapshot.activeProductCount)}
          tone="info"
          detail={`${t("dashboard.totalProfiles")}: ${snapshot.productCount}`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader className="flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">{t("dashboard.stationStatus")}</CardTitle>
              <p className="text-sm text-slate-500">{t("dashboard.description")}</p>
            </div>
            <Button
              asChild
              size="sm"
            >
              <Link href="/dashboard/line">{t("dashboard.openLine")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {loading ? (
              <div className="flex min-h-40 items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
              </div>
            ) : error ? (
              <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <DetailBlock
                  title={t("dashboard.lineStatus")}
                  rows={[
                    [t("dashboard.inspection"), formatStatusLabel(inspectionStatus, t)],
                    [
                      t("dashboard.currentProduct"),
                      inspection?.currentProductCode ??
                        inspection?.productCode ??
                        t("dashboard.noData"),
                    ],
                    [t("dashboard.lastResult"), latestResultLabel],
                    [t("dashboard.lastScan"), inspection?.latestScanAt ?? t("dashboard.noData")],
                  ]}
                />
                <DetailBlock
                  title={t("dashboard.batchOverview")}
                  rows={[
                    [t("dashboard.quantity"), String(inspection?.quantity ?? 0)],
                    [t("operator.count"), String(inspection?.count ?? 0)],
                    [t("operator.batch"), String(inspection?.batch ?? 0)],
                    [t("operator.packSize"), String(inspection?.batchSize ?? 0)],
                  ]}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg">{t("dashboard.latestSlots")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-14 animate-pulse border border-slate-200 bg-slate-50"
                  />
                ))}
              </div>
            ) : inspection?.slots && inspection.slots.length > 0 ? (
              <div className="space-y-3">
                {inspection.slots.map((slot) => (
                  <div
                    key={`${slot.slotIndex}-${slot.slotLabel}`}
                    className="border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">
                          {slot.slotLabel ?? `slot-${slot.slotIndex ?? "?"}`}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {t("dashboard.expectedText")}: {slot.expectedText ?? "-"}
                        </div>
                      </div>
                      <span
                        className={statusPillClass(
                          slot.result === "OK"
                            ? "ok"
                            : slot.result === "NG"
                              ? "error"
                              : "idle",
                        )}
                      >
                        {formatResultLabel(slot.result, t)}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-slate-700">
                      {t("dashboard.rawText")}: {slot.rawText || "-"}
                    </div>
                    {slot.errorMessage ? (
                      <div className="mt-2 text-xs text-red-700">
                        {slot.errorMessage}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                {t("dashboard.noInspection")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "error" | "idle" | "info";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-2xl font-semibold text-slate-950">{value}</div>
            <span className={statusPillClass(tone)} />
          </div>
          <div className="text-sm text-slate-500">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailBlock({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="border border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
        {title}
      </div>
      <div className="space-y-3 px-4 py-4">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <span className="text-slate-500">{label}</span>
            <span className="max-w-[60%] text-right font-medium text-slate-950">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatStatusLabel(
  status: string,
  t: (key: string) => string,
) {
  switch (status) {
    case "running":
      return t("dashboard.running");
    case "completed":
      return t("dashboard.completed");
    case "failed":
      return t("dashboard.failed");
    case "stopped":
      return t("dashboard.stopped");
    default:
      return t("dashboard.idle");
  }
}

function formatResultLabel(
  result: "OK" | "NG" | "UNKNOWN",
  t: (key: string) => string,
) {
  switch (result) {
    case "OK":
      return t("operator.ok");
    case "NG":
      return t("operator.ng");
    default:
      return t("dashboard.idle");
  }
}

function formatLicenseLabel(
  license: SystemLicenseState | null,
  t: (key: string) => string,
) {
  if (!license || license.status === "unknown") {
    return t("dashboard.pending");
  }

  return license.status === "licensed"
    ? t("dashboard.licensed")
    : t("dashboard.unlicensed");
}

function formatLicenseDetail(
  license: SystemLicenseState | null,
  t: (key: string) => string,
) {
  if (!license) {
    return t("dashboard.noData");
  }

  const dongleLabel =
    license.donglePresent === true
      ? t("dashboard.donglePresent")
      : license.donglePresent === false
        ? t("dashboard.dongleMissing")
        : t("dashboard.noData");

  const checkedLabel = license.lastCheckedAt ?? t("dashboard.noData");

  return `${dongleLabel} · ${t("dashboard.lastChecked")}: ${checkedLabel}`;
}

function formatLicenseTone(
  license: SystemLicenseState | null,
): "ok" | "error" | "idle" | "info" {
  if (!license || license.status === "unknown") {
    return "idle";
  }

  return license.status === "licensed" ? "ok" : "error";
}

function statusPillClass(tone: "ok" | "error" | "idle" | "info") {
  const base = "inline-flex h-2.5 w-2.5 shrink-0 rounded-full";

  if (tone === "ok") {
    return `${base} bg-emerald-500`;
  }

  if (tone === "error") {
    return `${base} bg-red-500`;
  }

  if (tone === "info") {
    return `${base} bg-cyan-600`;
  }

  return `${base} bg-slate-300`;
}
