"use client";

import { ChevronDown, ChevronUp, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ModelPathField } from "@/components/products/model-path-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  updateProductAiSettings,
  type ProductProfile,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken, getStoredUser } from "@/lib/session";

type AiSettingsPanelProps = {
  onDirtyChange?: (dirty: boolean) => void;
  product: ProductProfile | null;
  onSaved: (product: ProductProfile) => void;
};

type AiSettingsDraft = {
  modelPath: string;
  thresholdAccept: number;
  thresholdMns: number;
  rowThreshold: number;
};

function toDraft(product: ProductProfile | null): AiSettingsDraft {
  return {
    modelPath: product?.modelPath ?? "",
    thresholdAccept: product?.thresholdAccept ?? 0.5,
    thresholdMns: product?.thresholdMns ?? 0.5,
    rowThreshold: product?.rowThreshold ?? 20,
  };
}

export function AiSettingsPanel({
  onDirtyChange,
  product,
  onSaved,
}: AiSettingsPanelProps) {
  const { t, apiError } = useI18n();
  const canManageRowThreshold = getStoredUser()?.role === "dev";
  const [draft, setDraft] = useState<AiSettingsDraft>(() => toDraft(product));
  const [saving, setSaving] = useState(false);
  const [developerOptionsOpen, setDeveloperOptionsOpen] = useState(false);
  const dirty = Boolean(
    product &&
      (draft.modelPath.trim() !== (product.modelPath ?? "").trim() ||
        draft.thresholdAccept !== product.thresholdAccept ||
        draft.thresholdMns !== product.thresholdMns ||
        (canManageRowThreshold &&
          draft.rowThreshold !== product.rowThreshold)),
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  function updateNumberDraft(
    key: "thresholdAccept" | "thresholdMns" | "rowThreshold",
    value: string,
  ) {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;

    setDraft((current) => ({
      ...current,
      [key]: nextValue,
    }));
  }

  async function handleSave() {
    if (!product) {
      toast.warning(t("camera.selectProductFirst"));
      return;
    }

    if (
      draft.thresholdAccept < 0 ||
      draft.thresholdAccept > 1 ||
      draft.thresholdMns < 0 ||
      draft.thresholdMns > 1
    ) {
      toast.warning(t("settings.aiThresholdValidation"));
      return;
    }

    if (
      canManageRowThreshold &&
      (!Number.isInteger(draft.rowThreshold) ||
        draft.rowThreshold < 0 ||
        draft.rowThreshold > 500)
    ) {
      toast.warning(t("settings.aiRowThresholdValidation"));
      return;
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("settings.aiProfileSaving"));

    try {
      const response = await updateProductAiSettings(accessToken, product.id, {
        modelPath: draft.modelPath.trim() || null,
        thresholdAccept: draft.thresholdAccept,
        thresholdMns: draft.thresholdMns,
        ...(canManageRowThreshold
          ? { rowThreshold: draft.rowThreshold }
          : {}),
      });

      setDraft(toDraft(response.data));
      onSaved(response.data);
      toast.success(t("settings.aiProfileSaved"), { id: toastId });
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
          <CardTitle className="text-lg">{t("nav.aiSettings")}</CardTitle>
          <p className="mt-1 text-sm text-slate-600">
            {t("settings.aiCompactDescription")}
          </p>
        </div>
        <div className="shrink-0 border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950">
          {product.code}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <ModelPathField
          value={draft.modelPath}
          disabled={saving}
          showHint={false}
          onChange={(modelPath) =>
            setDraft((current) => ({ ...current, modelPath }))
          }
        />

        <div className="grid gap-4 md:grid-cols-2">
          <NumberField
            label={t("settings.aiThresholdAccept")}
            value={draft.thresholdAccept}
            min={0}
            max={1}
            step={0.01}
            disabled={saving}
            onChange={(value) => updateNumberDraft("thresholdAccept", value)}
          />
          <NumberField
            label={t("settings.aiThresholdMns")}
            value={draft.thresholdMns}
            min={0}
            max={1}
            step={0.01}
            disabled={saving}
            onChange={(value) => updateNumberDraft("thresholdMns", value)}
          />
        </div>

        {canManageRowThreshold ? (
          <div className="border-t border-slate-200 pt-4">
            <Button
              type="button"
              variant="outline"
              className="border-slate-300 bg-white"
              aria-expanded={developerOptionsOpen}
              onClick={() => setDeveloperOptionsOpen((current) => !current)}
            >
              {developerOptionsOpen ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
              {t("settings.aiDeveloperOptions")}
            </Button>

            {developerOptionsOpen ? (
              <div className="mt-4 max-w-md">
                <NumberField
                  label={t("settings.aiRowThreshold")}
                  value={draft.rowThreshold}
                  min={0}
                  max={500}
                  step={1}
                  disabled={saving}
                  onChange={(value) => updateNumberDraft("rowThreshold", value)}
                />
                <p className="mt-2 text-xs text-slate-500">
                  {t("settings.aiRowThresholdHint")}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? t("settings.aiProfileSaving") : t("settings.aiProfileSave")}
        </Button>
      </CardContent>
    </Card>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
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
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 text-base tabular-nums"
      />
    </label>
  );
}
