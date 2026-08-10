"use client";

import { Plus, Save, Tags, X } from "lucide-react";
import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  updateProductOcrAcceptedVariants,
  type ProductProfile,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type OcrAcceptedVariantsPanelProps = {
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: (product: ProductProfile) => void;
  product: ProductProfile | null;
};

function normalizeVariant(value: string) {
  return value.trim().toUpperCase();
}

function uniqueVariants(values: string[]) {
  return [...new Set(values.map(normalizeVariant).filter(Boolean))];
}

export function OcrAcceptedVariantsPanel({
  onDirtyChange,
  onSaved,
  product,
}: OcrAcceptedVariantsPanelProps) {
  const { apiError, t } = useI18n();
  const [draft, setDraft] = useState<string[]>(() =>
    uniqueVariants(product?.ocrAcceptedVariants ?? []),
  );
  const [nextVariant, setNextVariant] = useState("");
  const [saving, setSaving] = useState(false);

  const savedVariants = useMemo(
    () => uniqueVariants(product?.ocrAcceptedVariants ?? []),
    [product?.ocrAcceptedVariants],
  );
  const dirty =
    draft.length !== savedVariants.length ||
    draft.some((variant, index) => variant !== savedVariants[index]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  function addVariant() {
    const normalized = normalizeVariant(nextVariant);
    if (!normalized) return;
    if (normalized === normalizeVariant(product?.code ?? "")) {
      toast.warning(t("ocrVariants.primaryCodeExists"));
      return;
    }
    if (draft.includes(normalized)) {
      toast.warning(t("ocrVariants.duplicate"));
      return;
    }
    if (draft.length >= 20) {
      toast.warning(t("ocrVariants.limit"));
      return;
    }

    setDraft((current) => [...current, normalized]);
    setNextVariant("");
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addVariant();
  }

  async function saveVariants() {
    if (!product) {
      toast.warning(t("camera.selectProductFirst"));
      return;
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("ocrVariants.saving"));
    try {
      const response = await updateProductOcrAcceptedVariants(
        accessToken,
        product.id,
        draft,
      );
      setDraft(uniqueVariants(response.data.ocrAcceptedVariants));
      onSaved(response.data);
      toast.success(t("ocrVariants.saved"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "ocrVariants.saveError")
          : t("ocrVariants.saveError");
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  if (!product) {
    return (
      <div className="border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
        {t("camera.selectProductFirst")}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 border-b border-slate-200">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tags className="h-5 w-5 text-cyan-700" aria-hidden="true" />
            {t("ocrVariants.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-slate-600">
            {t("ocrVariants.description")}
          </p>
        </div>
        <div className="shrink-0 border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950">
          {product.code}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block text-sm font-medium text-slate-700">
            {t("ocrVariants.inputLabel")}
            <Input
              value={nextVariant}
              disabled={saving}
              autoComplete="off"
              placeholder={t("ocrVariants.placeholder")}
              onChange={(event) => setNextVariant(event.target.value)}
              onKeyDown={handleInputKeyDown}
              className="mt-2 h-12 text-base"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={saving || !nextVariant.trim()}
            onClick={addVariant}
            className="h-12 gap-2 px-5 text-base"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("ocrVariants.add")}
          </Button>
        </div>

        {draft.length === 0 ? (
          <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            {t("ocrVariants.empty")}
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {draft.map((variant) => (
              <li
                key={variant}
                className="flex min-h-11 items-center justify-between gap-3 border border-slate-200 bg-white px-3 font-mono text-sm font-semibold text-slate-950"
              >
                <span className="min-w-0 truncate">{variant}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={saving}
                  onClick={() =>
                    setDraft((current) =>
                      current.filter((item) => item !== variant),
                    )
                  }
                  aria-label={`${t("ocrVariants.remove")} ${variant}`}
                  className="h-9 w-9 shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-500">
            {t("ocrVariants.matchHint")}
          </p>
          <Button
            type="button"
            disabled={saving || !dirty}
            onClick={() => void saveVariants()}
            className="h-12 gap-2 px-5 text-base"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? t("ocrVariants.saving") : t("ocrVariants.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
