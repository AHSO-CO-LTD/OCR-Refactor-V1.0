"use client";

import { ChevronDown, ChevronUp, FolderOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RoiResultDetailsDropdown } from "@/components/reports/roi-result-details-dropdown";
import { TestFailImagePreview } from "@/components/reports/test-fail-image-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ApiError,
  getLineOperationResultImage,
  listLineOperationResults,
  listProductProfiles,
  type LineOperationResultSession,
  type ProductProfile,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const pageSize = 5;

export function LineOperationResultReportsPanel() {
  const { apiError, t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [sessions, setSessions] = useState<LineOperationResultSession[]>([]);
  const [summary, setSummary] = useState<{
    sessions: number;
    results: number;
    ok: number;
    ng: number;
    unknown: number;
  } | null>(null);
  const [expandedSessionIds, setExpandedSessionIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setLoading(true);
      const accessToken = getAccessToken();
      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        const [sessionResponse, productResponse] = await Promise.all([
          listLineOperationResults(accessToken, pageSize, currentPage),
          listProductProfiles(accessToken),
        ]);
        if (cancelled) return;
        setSessions(sessionResponse.data);
        setSummary(sessionResponse.summary);
        setTotalPages(sessionResponse.meta.totalPages);
        setProducts(productResponse.data);
        setExpandedSessionIds([]);
      } catch (cause) {
        if (cancelled) return;
        const message =
          cause instanceof ApiError
            ? apiError(cause.message, "operationReports.sessionsLoadError")
            : t("operationReports.sessionsLoadError");
        toast.error(message);
        setSessions([]);
        setSummary(null);
        setProducts([]);
        setTotalPages(1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadResults();
    return () => {
      cancelled = true;
    };
  }, [apiError, currentPage, t]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  return (
    <div className="grid min-w-0 gap-4">
      <Card className="border-[#86a8cf] bg-white shadow-none">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-950">
            <FolderOpen className="h-5 w-5 text-[#274d7d]" />
            {t("operationReports.sessions")}
          </div>

          {summary ? (
            <section className="mb-4 border border-slate-200 bg-slate-50 p-3">
              <h2 className="mb-3 text-sm font-bold text-slate-800">
                {t("operationReports.summary")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <SummaryTile label={t("reports.sessions")} value={summary.sessions} />
                <SummaryTile
                  label={t("operationReports.totalResults")}
                  value={summary.results}
                />
                <SummaryTile label={t("operator.ok")} value={summary.ok} />
                <SummaryTile label={t("operator.ng")} value={summary.ng} />
                <SummaryTile label={t("reports.unknown")} value={summary.unknown} />
              </div>
            </section>
          ) : null}

          {loading ? (
            <EmptyState>{t("operationReports.sessionsLoading")}</EmptyState>
          ) : sessions.length > 0 ? (
            <div className="grid gap-3">
              {sessions.map((session) => {
                const expanded = expandedSessionIds.includes(session.id);
                return (
                  <div key={session.id} className="border border-slate-200 bg-slate-50">
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-950">
                          {session.productCode}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatMessage(t("operationReports.sessionMeta"), {
                            actor: session.startedBy,
                            createdAt: formatDateTime(session.startedAt),
                          })}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatMessage(t("operationReports.sessionId"), {
                            sessionId: session.id,
                          })}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                          {formatMessage(t("operationReports.totalResults"), {
                            count: session.totalResults,
                          })}
                        </Badge>
                        <ResultBadge result="OK" count={session.okResults} />
                        <ResultBadge result="NG" count={session.ngResults} />
                        <Button
                          type="button"
                          variant="outline"
                          className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50"
                          onClick={() =>
                            setExpandedSessionIds((current) =>
                              current.includes(session.id)
                                ? current.filter((id) => id !== session.id)
                                : [...current, session.id],
                            )
                          }
                        >
                          {expanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          {expanded
                            ? t("lineTest.hideDetails")
                            : t("lineTest.viewDetails")}
                        </Button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="grid gap-3 border-t border-slate-200 p-3">
                        <div className="grid gap-3 md:grid-cols-4">
                          <SummaryTile
                            label={t("operationReports.totalResults")}
                            value={session.totalResults}
                          />
                          <SummaryTile label={t("operator.ok")} value={session.okResults} />
                          <SummaryTile label={t("operator.ng")} value={session.ngResults} />
                          <SummaryTile
                            label={t("reports.unknown")}
                            value={session.unknownResults}
                          />
                        </div>
                        {session.results.map((result) => (
                          <LineOperationCaptureCard
                            key={result.captureId}
                            product={productsById.get(session.productId)}
                            result={result}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                previousLabel={t("common.previous")}
                nextLabel={t("common.next")}
                pageIndicator={formatMessage(t("common.pageIndicator"), {
                  page: currentPage,
                  total: totalPages,
                })}
                onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              />
            </div>
          ) : (
            <EmptyState>{t("operationReports.sessionsEmpty")}</EmptyState>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LineOperationCaptureCard({
  product,
  result,
}: {
  product: ProductProfile | undefined;
  result: LineOperationResultSession["results"][number];
}) {
  const { apiError, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!expanded || !result.imageAvailable || imageSrc || imageError) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;
    let cancelled = false;

    void getLineOperationResultImage(accessToken, result.captureId)
      .then((response) => {
        if (!cancelled) setImageSrc(response.data.imageBase64);
      })
      .catch((cause) => {
        if (cancelled) return;
        setImageError(true);
        if (cause instanceof ApiError && cause.status >= 500) {
          toast.error(apiError(cause.message, "operationReports.imageUnavailable"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiError, expanded, imageError, imageSrc, result.captureId, result.imageAvailable]);

  return (
    <div className="border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-950">
            {formatMessage(t("operationReports.captureMeta"), {
              capturedAt: formatDateTime(result.capturedAt),
            })}
          </div>
          <div className="truncate font-mono text-xs text-slate-500">{result.captureId}</div>
        </div>
        <div className="flex items-center gap-2">
          <ResultBadge result={result.result} />
          <Button
            type="button"
            variant="outline"
            className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? t("lineTest.hideDetails") : t("lineTest.viewDetails")}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="grid gap-3 px-3 py-3">
          {product && imageSrc ? (
            <TestFailImagePreview
              imageSrc={imageSrc}
              product={product}
              slots={result.slots.map((slot) => ({
                errorMessage: slot.errorMessage,
                expectedText: slot.expectedText,
                rawText: slot.rawText,
                result: slot.result,
                rows: slot.rows,
                slotIndex: slot.slotIndex,
                slotLabel: slot.slotLabel,
              }))}
            />
          ) : !product || !result.imageAvailable || imageError ? (
            <div className="border border-dashed border-slate-300 p-3 text-sm text-slate-500">
              {t("operationReports.imageUnavailable")}
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 p-3 text-sm text-slate-500">
              {t("common.loading")}
            </div>
          )}
          <RoiResultDetailsDropdown
            items={result.slots.map((slot, index) => ({
              key: `${result.captureId}-${slot.slotIndex ?? index}`,
              title:
                slot.slotLabel ?? `${t("lineTest.roiSlot")} ${slot.slotIndex ?? "-"}`,
              result: slot.result,
              expectedText: slot.expectedText ?? "-",
              rawText:
                slot.rows.length > 0 ? slot.rows.join(" / ") : slot.rawText ?? "-",
              errorMessage: slot.errorMessage ?? "-",
            }))}
            emptyText={t("reports.testSessionNoRoi")}
            summary={t("reports.testSessionNoRoi")}
            viewLabel={t("lineTest.viewDetails")}
            hideLabel={t("lineTest.hideDetails")}
            resultLabel={t("lineTest.result")}
            expectedTextLabel={t("dashboard.expectedText")}
            rawTextLabel={t("dashboard.rawText")}
            errorLabel={t("lineTest.error")}
          />
        </div>
      ) : null}
    </div>
  );
}

function ResultBadge({ result, count }: { result: "OK" | "NG" | "UNKNOWN"; count?: number }) {
  const className =
    result === "OK"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : result === "NG"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return <Badge className={className}>{count === undefined ? result : `${result} ${count}`}</Badge>;
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  previousLabel,
  nextLabel,
  pageIndicator,
  onPrevious,
  onNext,
}: {
  currentPage: number;
  totalPages: number;
  previousLabel: string;
  nextLabel: string;
  pageIndicator: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white px-3 py-3">
      <Button type="button" variant="outline" className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50" disabled={currentPage <= 1} onClick={onPrevious}>
        {previousLabel}
      </Button>
      <div className="text-sm font-semibold text-slate-700">{pageIndicator}</div>
      <Button type="button" variant="outline" className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50" disabled={currentPage >= totalPages} onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500">{children}</div>;
}

function formatMessage(template: string, values: Record<string, string | number>) {
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
