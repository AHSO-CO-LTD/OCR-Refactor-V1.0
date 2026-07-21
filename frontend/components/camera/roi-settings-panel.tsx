"use client";

import { Plus, Redo2, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  CONFIGURATION_ROI_HEIGHT,
  CONFIGURATION_ROI_WIDTH,
  MAX_CONFIGURATION_ROIS,
} from "@/components/camera/roi-editor-geometry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  updateProductRoiRegions,
  type ProductProfile,
  type RoiRegion,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type RoiSettingsPanelProps = {
  canRedo: boolean;
  canUndo: boolean;
  onDraftChange: (regions: RoiRegion[]) => void;
  onEditStart: () => void;
  onRedo: () => void;
  onReset: () => void;
  onSaved: (product: ProductProfile) => void;
  onUndo: () => void;
  overlappingIndexes: Set<number>;
  product: ProductProfile | null;
};

export function RoiSettingsPanel({
  canRedo,
  canUndo,
  onDraftChange,
  onEditStart,
  onRedo,
  onReset,
  onSaved,
  onUndo,
  overlappingIndexes,
  product,
}: RoiSettingsPanelProps) {
  const { apiError, t } = useI18n();
  const [saving, setSaving] = useState(false);
  const regions = product?.roiRegions ?? [];

  function commit(nextRegions: RoiRegion[], snapshot = true) {
    if (snapshot) onEditStart();
    const sorted = [...nextRegions].sort((a, b) => a.index - b.index);
    onDraftChange(sorted);
  }

  function updateRegion(index: number, field: "x" | "y" | "rotation", value: number) {
    if (!Number.isFinite(value)) return;
    commit(
      regions.map((region) =>
        region.index === index ? { ...region, [field]: value } : region,
      ),
    );
  }

  function addRegion() {
    if (!product) return;
    if (regions.length >= MAX_CONFIGURATION_ROIS) {
      toast.warning(t("products.validationMaxRoi"));
      return;
    }

    const nextIndex = Math.max(0, ...regions.map((region) => region.index)) + 1;
    const offset = regions.length * 28;
    const x = Math.min(
      Math.max(CONFIGURATION_ROI_WIDTH / 2, product.camera.imageWidth / 2 + offset),
      product.camera.imageWidth - CONFIGURATION_ROI_WIDTH / 2,
    );
    const y = Math.min(
      Math.max(CONFIGURATION_ROI_HEIGHT / 2, product.camera.imageHeight / 2 + offset),
      product.camera.imageHeight - CONFIGURATION_ROI_HEIGHT / 2,
    );

    commit([
      ...regions,
      {
        height: CONFIGURATION_ROI_HEIGHT,
        index: nextIndex,
        rotation: 0,
        width: CONFIGURATION_ROI_WIDTH,
        x: Math.round(x),
        y: Math.round(y),
      },
    ]);
    toast.success(t("configuration.roiCreated"));
  }

  function deleteRegion(index: number) {
    commit(regions.filter((region) => region.index !== index));
    toast.success(t("products.roiDeleted"));
  }

  async function saveRegions() {
    const accessToken = getAccessToken();
    if (!accessToken || !product) {
      toast.error(t("users.missingSession"));
      return;
    }
    if (overlappingIndexes.size > 0) {
      toast.error(t("products.validationRoiOverlap"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("products.saving"));
    try {
      const response = await updateProductRoiRegions(
        accessToken,
        product.id,
        regions.map(({ index, x, y, rotation }) => ({
          height: CONFIGURATION_ROI_HEIGHT,
          index,
          rotation,
          width: CONFIGURATION_ROI_WIDTH,
          x,
          y,
        })),
      );
      onSaved(response.data);
      toast.success(t("products.updateSuccess"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? apiError(cause.message, "products.saveError")
          : t("products.saveError");
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  if (!product) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-slate-500">
          {t("camera.selectProductFirst")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div>
          <CardTitle className="text-lg">ROI · {product.code}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{t("configuration.roiHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onReset}>
            <RotateCcw className="h-4 w-4" />
            {t("configuration.resetRoi")}
          </Button>
          <Button type="button" variant="outline" onClick={onUndo} disabled={!canUndo} aria-label={t("products.undoRoi")}>
            <Undo2 className="h-4 w-4" />
            {t("common.undo")}
          </Button>
          <Button type="button" variant="outline" onClick={onRedo} disabled={!canRedo} aria-label={t("products.redoRoi")}>
            <Redo2 className="h-4 w-4" />
            {t("common.redo")}
          </Button>
          <Button type="button" variant="outline" onClick={addRegion} disabled={regions.length >= MAX_CONFIGURATION_ROIS}>
            <Plus className="h-4 w-4" />
            {t("configuration.addRoi")}
          </Button>
          <Button type="button" onClick={() => void saveRegions()} disabled={saving || overlappingIndexes.size > 0}>
            <Save className="h-4 w-4" />
            {saving ? t("products.saving") : t("common.save")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span>{t("configuration.roiInteractionHint")}</span>
          <span className="font-mono font-semibold">{CONFIGURATION_ROI_WIDTH} × {CONFIGURATION_ROI_HEIGHT}px</span>
        </div>
        {overlappingIndexes.size > 0 ? (
          <div className="border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800" role="alert">
            {t("products.validationRoiOverlap")}
          </div>
        ) : null}
        {regions.length === 0 ? (
          <div className="border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
            {t("configuration.noRoi")}
          </div>
        ) : (
          regions.map((region) => (
            <div
              key={region.index}
              className={[
                "grid gap-3 border bg-slate-50 p-3 md:grid-cols-[90px_repeat(3,minmax(0,1fr))_130px_44px]",
                overlappingIndexes.has(region.index) ? "border-red-300" : "border-slate-200",
              ].join(" ")}
            >
              <div className="flex items-center font-mono text-sm font-semibold text-cyan-800">ROI {region.index}</div>
              {(["x", "y", "rotation"] as const).map((field) => (
                <label key={field} className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>{field}</span>
                  <Input
                    type="number"
                    value={region[field]}
                    onChange={(event) => updateRegion(region.index, field, Number(event.target.value))}
                  />
                </label>
              ))}
              <div className="flex items-end">
                <div className="flex h-10 w-full items-center justify-center border border-slate-200 bg-white px-3 font-mono text-sm text-slate-700" title={t("configuration.fixedRoiSize")}>
                  {CONFIGURATION_ROI_WIDTH} × {CONFIGURATION_ROI_HEIGHT}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="self-end border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => deleteRegion(region.index)}
                aria-label={t("products.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
