"use client";

import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  bulkUpdateProductAiSettings,
  listProductProfiles,
  type ProductProfile,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type ApplyScope = "all" | "selected";

type AiSettingsDraft = {
  thresholdAccept: number;
  thresholdMns: number;
  rowThreshold: number;
};

const defaultDraft: AiSettingsDraft = {
  thresholdAccept: 0.5,
  thresholdMns: 0.5,
  rowThreshold: 20,
};

export function AiSettingsPanel() {
  const { t, apiError } = useI18n();
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyScope, setApplyScope] = useState<ApplyScope>("all");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<AiSettingsDraft>(defaultDraft);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      const accessToken = getAccessToken();

      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await listProductProfiles(accessToken);

        if (cancelled) {
          return;
        }

        setProducts(response.data);

        const firstProduct = response.data[0];
        if (firstProduct) {
          setDraft({
            thresholdAccept: firstProduct.thresholdAccept,
            thresholdMns: firstProduct.thresholdMns,
            rowThreshold: firstProduct.rowThreshold,
          });
        }
      } catch (cause) {
        if (!cancelled) {
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "settings.aiLoadError")
              : t("settings.aiLoadError");
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [apiError, t]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.includes(product.id)),
    [products, selectedProductIds],
  );
  const selectedCount = selectedProducts.length;
  const matchingCount = products.filter(
    (product) =>
      product.thresholdAccept === draft.thresholdAccept &&
      product.thresholdMns === draft.thresholdMns &&
      product.rowThreshold === draft.rowThreshold,
  ).length;

  function updateDraft<K extends keyof AiSettingsDraft>(key: K, value: string) {
    const nextValue = Number(value);

    setDraft((current) => ({
      ...current,
      [key]: Number.isFinite(nextValue) ? nextValue : current[key],
    }));
  }

  function toggleSelectedProduct(productId: string, checked: boolean) {
    setSelectedProductIds((current) =>
      checked
        ? [...current, productId]
        : current.filter((item) => item !== productId),
    );
  }

  async function handleSave() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    if (applyScope === "selected" && selectedProductIds.length === 0) {
      toast.warning(t("settings.aiSelectProducts"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("settings.aiSaving"));

    try {
      const response = await bulkUpdateProductAiSettings(accessToken, {
        thresholdAccept: draft.thresholdAccept,
        thresholdMns: draft.thresholdMns,
        rowThreshold: draft.rowThreshold,
        applyToAll: applyScope === "all",
        productIds: applyScope === "selected" ? selectedProductIds : undefined,
      });

      const targetIds = new Set(selectedProductIds);
      setProducts((current) =>
        current.map((product) =>
          applyScope === "all" || targetIds.has(product.id)
            ? {
                ...product,
                thresholdAccept: draft.thresholdAccept,
                thresholdMns: draft.thresholdMns,
                rowThreshold: draft.rowThreshold,
              }
            : product,
        ),
      );
      toast.success(
        formatMessage(t("settings.aiSaved"), {
          count: response.data.updatedCount,
        }),
        { id: toastId },
      );
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "settings.aiSaveError")
          : t("settings.aiSaveError");
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg">{t("settings.aiTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <p className="text-sm text-slate-600">
              {t("settings.aiDescription")}
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <ScopeTile
                active={applyScope === "all"}
                label={t("settings.aiApplyAll")}
                description={t("settings.aiApplyAllHint")}
                onClick={() => setApplyScope("all")}
              />
              <ScopeTile
                active={applyScope === "selected"}
                label={t("settings.aiApplySelected")}
                description={t("settings.aiApplySelectedHint")}
                onClick={() => setApplyScope("selected")}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <NumberField
                label={t("settings.aiThresholdAccept")}
                value={draft.thresholdAccept}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => updateDraft("thresholdAccept", value)}
              />
              <NumberField
                label={t("settings.aiThresholdMns")}
                value={draft.thresholdMns}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => updateDraft("thresholdMns", value)}
              />
              <NumberField
                label={t("settings.aiRowThreshold")}
                value={draft.rowThreshold}
                min={0}
                max={500}
                step={1}
                onChange={(value) => updateDraft("rowThreshold", value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <HintTile
                label={t("settings.aiThresholdAccept")}
                value={t("settings.aiThresholdAcceptHint")}
              />
              <HintTile
                label={t("settings.aiThresholdMns")}
                value={t("settings.aiThresholdMnsHint")}
              />
              <HintTile
                label={t("settings.aiRowThreshold")}
                value={t("settings.aiRowThresholdHint")}
              />
            </div>

            {applyScope === "selected" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-950">
                    {t("settings.aiProducts")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-300 bg-white"
                      onClick={() =>
                        setSelectedProductIds(products.map((product) => product.id))
                      }
                    >
                      {t("settings.aiSelectAll")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-300 bg-white"
                      onClick={() => setSelectedProductIds([])}
                    >
                      {t("settings.aiClearSelection")}
                    </Button>
                  </div>
                </div>

                {products.length > 0 ? (
                  <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {products.map((product) => {
                      const checked = selectedProductIds.includes(product.id);

                      return (
                        <label
                          key={product.id}
                          className="flex min-h-14 items-center gap-3 border border-slate-200 bg-white px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-cyan-700"
                            checked={checked}
                            onChange={(event) =>
                              toggleSelectedProduct(product.id, event.target.checked)
                            }
                          />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-950">
                              {product.code}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {product.name}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    {loading ? t("settings.aiLoading") : t("settings.aiNoProducts")}
                  </div>
                )}
              </div>
            ) : null}

            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading || saving || products.length === 0}
            >
              <Save className="h-4 w-4" />
              {saving ? t("settings.aiSaving") : t("settings.aiSave")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg">{t("settings.currentState")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-5 text-sm">
            <StateRow
              label={t("settings.aiApplyMode")}
              value={
                applyScope === "all"
                  ? t("settings.aiApplyAll")
                  : t("settings.aiApplySelected")
              }
            />
            <StateRow
              label={t("settings.aiThresholdAccept")}
              value={draft.thresholdAccept.toFixed(2)}
            />
            <StateRow
              label={t("settings.aiThresholdMns")}
              value={draft.thresholdMns.toFixed(2)}
            />
            <StateRow
              label={t("settings.aiRowThreshold")}
              value={String(Math.round(draft.rowThreshold))}
            />
            <StateRow
              label={t("settings.aiSelectedCount")}
              value={String(selectedCount)}
            />
            <StateRow
              label={t("settings.aiMatchingCount")}
              value={`${matchingCount}/${products.length}`}
            />
          </CardContent>
        </Card>
      </div>
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

function ScopeTile({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex min-h-28 flex-col justify-between border p-4 text-left transition",
        active
          ? "border-cyan-300 bg-cyan-50 text-cyan-950"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
      ].join(" ")}
    >
      <div className="font-semibold">{label}</div>
      <div className="text-sm text-slate-500">{description}</div>
    </button>
  );
}

function HintTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-950">{label}</div>
      <div className="mt-2 text-sm text-slate-600">{value}</div>
    </div>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 text-base"
      />
    </label>
  );
}
