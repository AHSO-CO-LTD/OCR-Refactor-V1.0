"use client";

import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ApiError,
  listTestSessionReports,
  type TestSessionReportListItem,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

export function TestSessionReportsPanel() {
  const { t, apiError } = useI18n();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TestSessionReportListItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoading(true);
      const accessToken = getAccessToken();

      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await listTestSessionReports(accessToken, 20);

        if (!cancelled) {
          setSessions(response.data);
        }
      } catch (cause) {
        if (!cancelled) {
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "reports.testSessionsLoadError")
              : t("reports.testSessionsLoadError");
          toast.error(message);
          setSessions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [apiError, t]);

  return (
    <div className="grid min-w-0 gap-4">
      <Card className="border-[#86a8cf] bg-white shadow-none">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-950">
            <FolderOpen className="h-5 w-5 text-[#274d7d]" />
            {t("reports.testSessions")}
          </div>

          {loading ? (
            <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500">
              {t("reports.testSessionsLoading")}
            </div>
          ) : sessions.length > 0 ? (
            <div className="grid gap-3">
              {sessions.map((session) => (
                <div key={session.id} className="border border-slate-200 bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-950">
                        {session.productCode}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatMessage(t("reports.testSessionMeta"), {
                          actor: session.actorUsername,
                          createdAt: formatDateTime(session.createdAt),
                        })}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatMessage(t("reports.testSessionId"), {
                          reportId: session.id,
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                        {session.folderName || t("reports.testSessionNoFolder")}
                      </Badge>
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        {formatMessage(t("reports.testSessionOk"), {
                          count: session.okImages,
                        })}
                      </Badge>
                      <Badge className="border-red-200 bg-red-50 text-red-700">
                        {formatMessage(t("reports.testSessionFailed"), {
                          count: session.failedImages.length,
                        })}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid gap-3 p-3">
                    <div className="grid gap-3 md:grid-cols-4">
                      <SummaryTile
                        label={t("reports.testSessionTotal")}
                        value={session.totalImages}
                      />
                      <SummaryTile
                        label={t("operator.ok")}
                        value={session.okImages}
                      />
                      <SummaryTile
                        label={t("operator.ng")}
                        value={session.ngImages}
                      />
                      <SummaryTile
                        label={t("lineTest.error")}
                        value={session.errorImages}
                      />
                    </div>

                    {session.failedImages.length > 0 ? (
                      session.failedImages.map((image) => (
                        <div key={image.id} className="border border-slate-200 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-950">
                                {image.relativePath}
                              </div>
                              <div className="text-xs text-slate-500">
                                {image.cycleTimeMs !== null
                                  ? `${image.cycleTimeMs} ms`
                                  : "-"}
                              </div>
                            </div>
                            <Badge
                              className={
                                image.result === "NG"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : image.result === "UNKNOWN"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-slate-200 bg-slate-100 text-slate-700"
                              }
                            >
                              {image.result}
                            </Badge>
                          </div>

                          <div className="grid gap-2 px-3 py-3">
                            {image.errorMessage ? (
                              <div className="text-xs text-red-600">
                                {t("lineTest.error")}: {image.errorMessage}
                              </div>
                            ) : null}

                            {image.roiResults.length > 0 ? (
                              <div className="grid gap-2 lg:grid-cols-2">
                                {image.roiResults.map((roi, index) => (
                                  <div
                                    key={`${image.id}-${roi.slotIndex ?? index}`}
                                    className="border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                                  >
                                    <div className="mb-1 font-semibold text-slate-900">
                                      {roi.slotLabel ??
                                        `${t("lineTest.roiSlot")} ${roi.slotIndex ?? "-"}`}
                                    </div>
                                    <div>
                                      {t("lineTest.result")}: {roi.result}
                                    </div>
                                    <div>
                                      {t("dashboard.expectedText")}: {roi.expectedText ?? "-"}
                                    </div>
                                    <div>
                                      {t("dashboard.rawText")}: {roi.rawText ?? "-"}
                                    </div>
                                    <div>
                                      {t("lineTest.error")}: {roi.errorMessage ?? "-"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500">
                                {t("reports.testSessionNoRoi")}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="border border-dashed border-slate-300 p-4 text-sm font-medium text-slate-500">
                        {t("reports.testSessionNoFailures")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500">
              {t("reports.testSessionsEmpty")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

function formatMessage(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, String(value)),
    template,
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
