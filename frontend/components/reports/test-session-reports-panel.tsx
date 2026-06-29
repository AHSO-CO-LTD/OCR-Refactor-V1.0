"use client";

import { ChevronDown, ChevronUp, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RoiResultDetailsDropdown } from "@/components/reports/roi-result-details-dropdown";
import { TestFailImagePreview } from "@/components/reports/test-fail-image-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ApiError,
  listProductProfiles,
  listTestSessionReports,
  type ProductProfile,
  type TestSessionReportListItem,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const pageSize = 5;

export function TestSessionReportsPanel() {
  const { t, apiError } = useI18n();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [sessions, setSessions] = useState<TestSessionReportListItem[]>([]);
  const [expandedSessionIds, setExpandedSessionIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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
        const [sessionResponse, productResponse] = await Promise.all([
          listTestSessionReports(accessToken, pageSize, currentPage),
          listProductProfiles(accessToken),
        ]);

        if (!cancelled) {
          setSessions(sessionResponse.data);
          setTotalPages(sessionResponse.meta.totalPages);
          setProducts(productResponse.data);
          setExpandedSessionIds([]);
        }
      } catch (cause) {
        if (!cancelled) {
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "reports.testSessionsLoadError")
              : t("reports.testSessionsLoadError");
          toast.error(message);
          setSessions([]);
          setProducts([]);
          setTotalPages(1);
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
  }, [apiError, currentPage, t]);

  const productsById = new Map(products.map((product) => [product.id, product]));

  function toggleSessionDetails(sessionId: string) {
    setExpandedSessionIds((current) =>
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId],
    );
  }

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
                  {(() => {
                    const sessionProduct = productsById.get(session.productId);
                    const expanded = expandedSessionIds.includes(session.id);

                    return (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-3 py-3">
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
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                              {session.folderName || t("reports.testSessionNoFolder")}
                            </Badge>
                            <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                              {formatMessage(t("lineTest.savedSessionSummary"), {
                                total: session.totalImages,
                                failed: session.failedImages.length,
                              })}
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
                            <Button
                              type="button"
                              variant="outline"
                              className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50"
                              onClick={() => toggleSessionDetails(session.id)}
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

                                    {sessionProduct && image.originalImageBase64 ? (
                                      <TestFailImagePreview
                                        imageSrc={image.originalImageBase64}
                                        product={sessionProduct}
                                        slots={image.roiResults.map((roi) => ({
                                          slotIndex: roi.slotIndex,
                                          slotLabel: roi.slotLabel,
                                          expectedText: roi.expectedText,
                                          rawText: roi.rawText,
                                          result: roi.result,
                                          errorMessage: roi.errorMessage,
                                        }))}
                                      />
                                    ) : null}
                                  </div>

                                  <RoiResultDetailsDropdown
                                    items={image.roiResults.map((roi, index) => ({
                                      key: `${image.id}-${roi.slotIndex ?? index}`,
                                      title:
                                        roi.slotLabel ??
                                        `${t("lineTest.roiSlot")} ${roi.slotIndex ?? "-"}`,
                                      result: roi.result,
                                      expectedText: roi.expectedText ?? "-",
                                      rawText: roi.rawText ?? "-",
                                      errorMessage: roi.errorMessage ?? "-",
                                    }))}
                                    emptyText={t("reports.testSessionNoRoi")}
                                    summary={
                                      image.errorMessage
                                        ? `${t("lineTest.error")}: ${image.errorMessage}`
                                        : t("reports.testSessionNoRoi")
                                    }
                                    viewLabel={t("lineTest.viewDetails")}
                                    hideLabel={t("lineTest.hideDetails")}
                                    resultLabel={t("lineTest.result")}
                                    expectedTextLabel={t("dashboard.expectedText")}
                                    rawTextLabel={t("dashboard.rawText")}
                                    errorLabel={t("lineTest.error")}
                                  />
                                </div>
                              ))
                            ) : (
                              <div className="border border-dashed border-slate-300 p-4 text-sm font-medium text-slate-500">
                                {t("reports.testSessionNoFailures")}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              ))}
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
                onNext={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
              />
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
      <Button
        type="button"
        variant="outline"
        className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50"
        disabled={currentPage <= 1}
        onClick={onPrevious}
      >
        {previousLabel}
      </Button>
      <div className="text-sm font-semibold text-slate-700">{pageIndicator}</div>
      <Button
        type="button"
        variant="outline"
        className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50"
        disabled={currentPage >= totalPages}
        onClick={onNext}
      >
        {nextLabel}
      </Button>
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
