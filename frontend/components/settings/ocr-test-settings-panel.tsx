"use client";

import { FolderOpen, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  bulkUpdateProductOcrTestSettings,
  listProductProfiles,
  type ProductProfile,
} from "@/lib/api";
import {
  defaultDesktopTestStorageSettings,
  getDesktopBridge,
  type DesktopTestStorageSettings,
} from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type ApplyScope = "all" | "selected";

export function OcrTestSettingsPanel() {
  const { t, apiError } = useI18n();
  const bridge = getDesktopBridge();
  const isDesktop = Boolean(bridge);
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStorage, setSavingStorage] = useState(false);
  const [applyScope, setApplyScope] = useState<ApplyScope>("all");
  const [rotateEnabled, setRotateEnabled] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [storageSettings, setStorageSettings] = useState<DesktopTestStorageSettings>(
    defaultDesktopTestStorageSettings,
  );

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

        if (!cancelled) {
          setProducts(response.data);
        }
      } catch (cause) {
        if (!cancelled) {
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "settings.ocrTestLoadError")
              : t("settings.ocrTestLoadError");
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

  useEffect(() => {
    if (!bridge) {
      return;
    }

    bridge
      .getTestStorageSettings()
      .then((nextSettings) => setStorageSettings(nextSettings))
      .catch(() => toast.error(t("settings.ocrTestStorageLoadError")))
  }, [bridge, t]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.includes(product.id)),
    [products, selectedProductIds],
  );
  const selectedWithRotate = selectedProducts.filter(
    (product) => product.rotateTestImageClockwise,
  ).length;
  const totalWithRotate = products.filter(
    (product) => product.rotateTestImageClockwise,
  ).length;

  function toggleSelectedProduct(productId: string, checked: boolean) {
    setSelectedProductIds((current) =>
      checked
        ? [...current, productId]
        : current.filter((item) => item !== productId),
    );
  }

  async function handlePickFolder() {
    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    try {
      const result = await bridge.selectFolder();

      if (result.canceled || !result.folderPath) {
        return;
      }

      setStorageSettings({ testImageSaveFolderPath: result.folderPath });
    } catch {
      toast.error(t("settings.ocrTestStorageLoadError"));
    }
  }

  async function handleSaveStorage() {
    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    setSavingStorage(true);
    const toastId = toast.loading(t("settings.ocrTestStorageSaving"));

    try {
      const nextSettings = await bridge.saveTestStorageSettings(storageSettings);
      setStorageSettings(nextSettings);
      toast.success(t("settings.ocrTestStorageSaved"), { id: toastId });
    } catch {
      toast.error(t("settings.ocrTestStorageSaveError"), { id: toastId });
    } finally {
      setSavingStorage(false);
    }
  }

  async function handleSave() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    if (applyScope === "selected" && selectedProductIds.length === 0) {
      toast.warning(t("settings.ocrTestSelectProducts"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("settings.ocrTestSaving"));

    try {
      const response = await bulkUpdateProductOcrTestSettings(accessToken, {
        rotateTestImageClockwise: rotateEnabled,
        applyToAll: applyScope === "all",
        productIds: applyScope === "selected" ? selectedProductIds : undefined,
      });

      const targetIds = new Set(selectedProductIds);
      setProducts((current) =>
        current.map((product) =>
          applyScope === "all" || targetIds.has(product.id)
            ? { ...product, rotateTestImageClockwise: rotateEnabled }
            : product,
        ),
      );
      toast.success(
        formatMessage(t("settings.ocrTestSaved"), {
          count: response.data.updatedCount,
        }),
        { id: toastId },
      );
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "settings.ocrTestSaveError")
          : t("settings.ocrTestSaveError");
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
            <CardTitle className="text-lg">{t("settings.ocrTestTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <p className="text-sm text-slate-600">
              {t("settings.ocrTestDescription")}
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <ScopeTile
                active={applyScope === "all"}
                label={t("settings.ocrTestApplyAll")}
                description={t("settings.ocrTestApplyAllHint")}
                onClick={() => setApplyScope("all")}
              />
              <ScopeTile
                active={applyScope === "selected"}
                label={t("settings.ocrTestApplySelected")}
                description={t("settings.ocrTestApplySelectedHint")}
                onClick={() => setApplyScope("selected")}
              />
            </div>

            <label className="flex min-h-14 items-center gap-3 border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                className="h-5 w-5 accent-cyan-700"
                checked={rotateEnabled}
                onChange={(event) => setRotateEnabled(event.target.checked)}
              />
              <div className="min-w-0">
                <div className="font-semibold text-slate-950">
                  {t("settings.ocrTestRotateLabel")}
                </div>
                <div className="text-sm text-slate-500">
                  {t("settings.ocrTestRotateHint")}
                </div>
              </div>
            </label>

            {applyScope === "selected" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-950">
                    {t("settings.ocrTestProducts")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-300 bg-white"
                      onClick={() => setSelectedProductIds(products.map((product) => product.id))}
                    >
                      {t("settings.ocrTestSelectAll")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-300 bg-white"
                      onClick={() => setSelectedProductIds([])}
                    >
                      {t("settings.ocrTestClearSelection")}
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
                    {loading
                      ? t("settings.ocrTestLoading")
                      : t("settings.ocrTestNoProducts")}
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
              {saving ? t("settings.ocrTestSaving") : t("settings.ocrTestSave")}
            </Button>

            <div className="border-t border-slate-200 pt-5">
              <div className="space-y-2">
                <div className="text-base font-semibold text-slate-950">
                  {t("settings.ocrTestStorageTitle")}
                </div>
                <p className="text-sm text-slate-600">
                  {t("settings.ocrTestStorageDescription")}
                </p>
              </div>

              {!isDesktop ? (
                <div className="mt-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {t("settings.desktopOnly")}
                </div>
              ) : null}

              <div className="mt-4 grid gap-4">
                <label className="block text-sm font-medium text-slate-700">
                  {t("settings.ocrTestStorageFolder")}
                  <Input
                    readOnly
                    value={
                      storageSettings.testImageSaveFolderPath ??
                      t("settings.ocrTestStorageEmpty")
                    }
                    className="mt-2"
                  />
                  <span className="mt-2 block text-xs text-slate-500">
                    {t("settings.ocrTestStorageFolderHint")}
                  </span>
                </label>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-300 bg-white"
                    onClick={() => void handlePickFolder()}
                    disabled={!isDesktop || savingStorage}
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t("settings.ocrTestStoragePick")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-300 bg-white"
                    onClick={() =>
                      setStorageSettings({ testImageSaveFolderPath: null })
                    }
                    disabled={!isDesktop || savingStorage}
                  >
                    {t("settings.ocrTestStorageClear")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleSaveStorage()}
                    disabled={!isDesktop || savingStorage}
                  >
                    <Save className="h-4 w-4" />
                    {savingStorage
                      ? t("settings.ocrTestStorageSaving")
                      : t("settings.ocrTestStorageSave")}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg">{t("settings.currentState")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-5 text-sm">
            <StateRow
              label={t("settings.ocrTestApplyMode")}
              value={
                applyScope === "all"
                  ? t("settings.ocrTestApplyAll")
                  : t("settings.ocrTestApplySelected")
              }
            />
            <StateRow
              label={t("settings.ocrTestRotateState")}
              value={
                rotateEnabled
                  ? t("settings.ocrTestStateOn")
                  : t("settings.ocrTestStateOff")
              }
            />
            <StateRow
              label={t("settings.ocrTestSelectedCount")}
              value={String(selectedProductIds.length)}
            />
            <StateRow
              label={t("settings.ocrTestSelectedEnabled")}
              value={String(selectedWithRotate)}
            />
            <StateRow
              label={t("settings.ocrTestEnabledTotal")}
              value={`${totalWithRotate}/${products.length}`}
            />
            <StateRow
              label={t("settings.ocrTestStorageState")}
              value={
                storageSettings.testImageSaveFolderPath ??
                t("settings.ocrTestStorageEmpty")
              }
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

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-950">{value}</span>
    </div>
  );
}

