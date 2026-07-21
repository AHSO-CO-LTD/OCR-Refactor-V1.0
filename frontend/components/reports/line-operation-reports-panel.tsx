"use client";

import { Download, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  downloadLineOperationReport,
  getLineOperationReport,
  type LineOperationReportSummary,
  type LineReportGroupBy,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type ReportFilter = {
  from: string;
  to: string;
  groupBy: LineReportGroupBy;
};

export function LineOperationReportsPanel() {
  const { apiError, t } = useI18n();
  const initial = currentMonthFilter();
  const [draft, setDraft] = useState<ReportFilter>(initial);
  const [filter, setFilter] = useState<ReportFilter>(initial);
  const [report, setReport] = useState<LineOperationReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    const timerId = window.setTimeout(async () => {
      const token = getAccessToken();
      if (!token) {
        if (active) setLoading(false);
        return;
      }
      try {
        const range = toApiRange(filter);
        const response = await getLineOperationReport(
          token,
          range.from,
          range.to,
          filter.groupBy,
        );
        if (active) setReport(response.data);
      } catch (cause) {
        const message =
          cause instanceof ApiError
            ? apiError(cause.message, "reports.lineLoadError")
            : t("reports.lineLoadError");
        if (active) {
          toast.error(message);
          setReport(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [apiError, filter, t]);

  async function handleExport() {
    const token = getAccessToken();
    if (!token) {
      toast.error(t("users.missingSession"));
      return;
    }
    setExporting(true);
    const toastId = toast.loading(t("reports.exporting"));
    try {
      const range = toApiRange(draft);
      const blob = await downloadLineOperationReport(
        token,
        range.from,
        range.to,
        draft.groupBy,
      );
      downloadBlob(blob, `line-report-${draft.from}-${draft.to}.xlsx`);
      toast.success(t("reports.exportSuccess"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "reports.exportError")
          : t("reports.exportError");
      toast.error(message, { id: toastId });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="border-[#86a8cf] bg-white shadow-none">
      <CardHeader className="border-b border-slate-200">
        <CardTitle>{t("reports.lineResults")}</CardTitle>
        <p className="text-sm text-slate-500">{t("reports.lineResultsHint")}</p>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_auto]">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>{t("reports.fromDate")}</span>
            <Input
              type="date"
              value={draft.from}
              max={draft.to}
              className="h-11"
              onChange={(event) =>
                setDraft((current) => ({ ...current, from: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>{t("reports.toDate")}</span>
            <Input
              type="date"
              value={draft.to}
              min={draft.from}
              className="h-11"
              onChange={(event) =>
                setDraft((current) => ({ ...current, to: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>{t("reports.groupBy")}</span>
            <Select
              value={draft.groupBy}
              className="h-11"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  groupBy: event.target.value as LineReportGroupBy,
                }))
              }
            >
              <option value="day">{t("reports.byDay")}</option>
              <option value="month">{t("reports.byMonth")}</option>
              <option value="year">{t("reports.byYear")}</option>
            </Select>
          </label>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={loading || !isValidFilter(draft)}
              onClick={() => {
                setLoading(true);
                setFilter({ ...draft });
              }}
            >
              <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {t("reports.applyFilter")}
            </Button>
            <Button
              type="button"
              className="h-11"
              disabled={exporting || !isValidFilter(draft)}
              onClick={() => void handleExport()}
            >
              <Download className="h-4 w-4" />
              {t("reports.exportXlsx")}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {t("reports.lineLoading")}
          </div>
        ) : report ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryTile label={t("reports.sessions")} value={report.totals.sessions} />
              <SummaryTile label={t("reports.latchedResults")} value={report.totals.results} />
              <SummaryTile label={t("operator.ok")} value={report.totals.ok} tone="ok" />
              <SummaryTile label={t("operator.ng")} value={report.totals.ng} tone="ng" />
              <SummaryTile label={t("reports.unknown")} value={report.totals.unknown} />
            </div>
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-3">{t("reports.period")}</th>
                    <th className="px-3 py-3">{t("reports.sessions")}</th>
                    <th className="px-3 py-3">{t("reports.latchedResults")}</th>
                    <th className="px-3 py-3">OK</th>
                    <th className="px-3 py-3">NG</th>
                    <th className="px-3 py-3">UNKNOWN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.groups.map((group) => (
                    <tr key={group.period}>
                      <td className="px-3 py-3 font-medium">{group.period}</td>
                      <td className="px-3 py-3">{group.sessions}</td>
                      <td className="px-3 py-3">{group.results}</td>
                      <td className="px-3 py-3 text-emerald-700">{group.ok}</td>
                      <td className="px-3 py-3 text-red-700">{group.ng}</td>
                      <td className="px-3 py-3 text-slate-500">{group.unknown}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {t("reports.lineEmpty")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "ok" | "ng";
  value: number;
}) {
  return (
    <div className="border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div
        className={[
          "mt-2 text-3xl font-bold",
          tone === "ok"
            ? "text-emerald-700"
            : tone === "ng"
              ? "text-red-700"
              : "text-slate-950",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function currentMonthFilter(): ReportFilter {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: localDateValue(firstDay),
    to: localDateValue(now),
    groupBy: "day",
  };
}

function localDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidFilter(filter: ReportFilter) {
  return Boolean(filter.from && filter.to && filter.from <= filter.to);
}

function toApiRange(filter: ReportFilter) {
  const from = new Date(`${filter.from}T00:00:00`);
  const to = new Date(`${filter.to}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
