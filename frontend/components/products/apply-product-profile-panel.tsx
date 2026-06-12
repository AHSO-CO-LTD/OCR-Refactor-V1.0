"use client";

import { CopyCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { ProductProfile } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type ApplyProductProfilePanelProps = {
  products: ProductProfile[];
  sourceProductId: string;
  selectedTargetIds: string[];
  applyToAll: boolean;
  applying: boolean;
  onSourceChange: (productId: string) => void;
  onApplyToAllChange: (applyToAll: boolean) => void;
  onApply: () => void;
};

export function ApplyProductProfilePanel({
  products,
  sourceProductId,
  selectedTargetIds,
  applyToAll,
  applying,
  onSourceChange,
  onApplyToAllChange,
  onApply,
}: ApplyProductProfilePanelProps) {
  const { t } = useI18n();
  const availableTargets = applyToAll
    ? products.filter((product) => product.id !== sourceProductId).length
    : selectedTargetIds.filter((id) => id !== sourceProductId).length;
  const disabled = products.length < 2 || !sourceProductId || availableTargets === 0;

  return (
    <Card className="p-4 shadow-none">
      <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 min-[900px]:grid-cols-[minmax(220px,320px)_minmax(200px,1fr)]">
          <label className="block text-sm font-medium text-slate-700">
            {t("products.templateProfile")}
            <Select
              value={sourceProductId}
              onChange={(event) => onSourceChange(event.target.value)}
              className="mt-2 h-12 text-base"
            >
              <option value="">{t("products.selectTemplate")}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code}
                </option>
              ))}
            </Select>
          </label>

          <div className="flex min-w-0 flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(event) => onApplyToAllChange(event.target.checked)}
                className="h-5 w-5"
              />
              {t("products.applyToAll")}
            </label>
            <p className="text-sm text-slate-500">
              {applyToAll
                ? t("products.applyAllHint")
                : t("products.applySelectedHint")}
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={onApply}
          disabled={disabled || applying}
          className="h-12 px-5 text-base"
        >
          <CopyCheck className="h-4 w-4" aria-hidden="true" />
          {applying ? t("products.applying") : t("products.applyProfile")}
        </Button>
      </div>
    </Card>
  );
}
