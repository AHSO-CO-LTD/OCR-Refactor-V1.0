"use client";

import {
  CheckCircle2,
  CircleDot,
  FileImage,
  FolderOpen,
  Package,
  RotateCcw,
  Save,
  Send,
  Timer,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CameraPreviewTransformLayer } from "@/components/camera/camera-preview-image";
import { useConnectedCameraPreview } from "@/components/camera/use-connected-camera-preview";
import { OperatorRoiEditor } from "@/components/operator/operator-roi-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  createTestSessionReport,
  listProductProfiles,
  listTestSessionReports,
  testInspectionImage,
  type InspectionSlotState,
  type ProductProfile,
  type RoiRegion,
  type TestSessionReportListItem,
  type TestInspectionImageResult,
} from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type DataSource = "api" | "empty";
type RoiCropPreview = {
  slotIndex: number;
  roiImageBase64: string;
  rotatedImageBase64: string;
  imageBase64: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceRoiWidth: number;
  sourceRoiHeight: number;
  naturalImageWidth: number;
  naturalImageHeight: number;
  configuredImageWidth: number;
  configuredImageHeight: number;
  scaleX: number;
  scaleY: number;
  regionCenterX: number;
  regionCenterY: number;
  sourceCenterX: number;
  sourceCenterY: number;
  topLeftX: number;
  topLeftY: number;
  sourceTopLeftX: number;
  sourceTopLeftY: number;
  displayedImageWidth: number;
  displayedImageHeight: number;
  imageOffsetX: number;
  imageOffsetY: number;
  roiWidth: number;
  roiHeight: number;
  visualWidth: number;
  visualHeight: number;
  rotation: number;
  previewRotation: number;
  displayRotation: number;
  rotated: boolean;
};

type BatchTestReportRow = {
  fileName: string;
  relativePath: string;
  result: TestInspectionImageResult["result"] | "ERROR";
  success: boolean;
  cycleTimeMs: number | null;
  okSlots: number;
  ngSlots: number;
  errorMessage: string | null;
  originalImageBase64: string;
  slots: InspectionSlotState[];
};

export function LineTestPanel() {
  const { t, apiError } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [dataSource, setDataSource] = useState<DataSource>("empty");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [imageBase64, setImageBase64] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [testing, setTesting] = useState(false);
  const [batchTesting, setBatchTesting] = useState(false);
  const [savingBatchReport, setSavingBatchReport] = useState(false);
  const [result, setResult] = useState<TestInspectionImageResult | null>(null);
  const [cropPreviews, setCropPreviews] = useState<RoiCropPreview[]>([]);
  const [roiDraft, setRoiDraft] = useState<RoiRegion[]>([]);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchFolderName, setBatchFolderName] = useState("");
  const [batchReport, setBatchReport] = useState<BatchTestReportRow[]>([]);
  const [savedBatchReportId, setSavedBatchReportId] = useState("");
  const [savedSessions, setSavedSessions] = useState<TestSessionReportListItem[]>([]);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoadingProducts(true);
      const accessToken = getAccessToken();

      if (!accessToken) {
        setLoadingProducts(false);
        return;
      }

      try {
        const response = await listProductProfiles(accessToken);
        const activeProducts = response.data.filter((product) => product.active);

        if (!cancelled) {
          setProducts(activeProducts);
          setSelectedProductId(activeProducts[0]?.id ?? "");
          setRoiDraft(cloneRoiRegions(activeProducts[0]?.roiRegions ?? []));
          setDataSource(activeProducts.length > 0 ? "api" : "empty");
        }
      } catch {
        if (!cancelled) {
          setProducts([]);
          setSelectedProductId("");
          setDataSource("empty");
          toast.error(t("lineTest.productsLoadError"));
        }
      } finally {
        if (!cancelled) {
          setLoadingProducts(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    const folderInput = folderInputRef.current;

    if (!folderInput) {
      return;
    }

    folderInput.setAttribute("webkitdirectory", "");
    folderInput.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    void loadSavedSessions();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );
  const testProduct = useMemo(
    () =>
      selectedProduct
        ? {
            ...selectedProduct,
            camera: { ...selectedProduct.camera },
            roiRegions: roiDraft,
          }
        : null,
    [roiDraft, selectedProduct],
  );

  const { imageSrc: livePreviewImageSrc } = useConnectedCameraPreview(
    selectedProduct?.camera.deviceName,
  );
  const previewImageSrc = imagePreviewUrl || livePreviewImageSrc;
  const totalSlots = result?.slots.length ?? testProduct?.roiRegions.length ?? 0;
  const okSlots =
    result?.slots.filter((slot) => slot.result === "OK").length ?? 0;
  const ngSlots =
    result?.slots.filter((slot) => slot.result === "NG").length ?? 0;
  const isBusy = testing || batchTesting;
  const toolDebugImagesBySlot = useMemo(() => {
    const images = new Map<number, string>();

    result?.slots.forEach((slot) => {
      if (
        typeof slot.slotIndex === "number" &&
        slot.toolDebugImageBase64
      ) {
        images.set(slot.slotIndex, slot.toolDebugImageBase64);
      }
    });

    return images;
  }, [result]);
  const batchOkCount = batchReport.filter((row) => row.result === "OK").length;
  const batchNgCount = batchReport.filter((row) => row.result === "NG").length;
  const batchErrorCount = batchReport.filter((row) => row.result === "ERROR").length;

  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    const nextProduct = products.find((product) => product.id === productId);
    setRoiDraft(cloneRoiRegions(nextProduct?.roiRegions ?? []));
    setResult(null);
    setCropPreviews([]);
  }

  function handleRoiChange(newRois: RoiRegion[]) {
    setRoiDraft(cloneRoiRegions(newRois));
    setResult(null);
    setCropPreviews([]);
  }

  function resetRoiDraft() {
    if (!selectedProduct) {
      return;
    }

    setRoiDraft(cloneRoiRegions(selectedProduct.roiRegions));
    setResult(null);
    setCropPreviews([]);
    toast.success(t("lineTest.roiReset"));
  }

  async function loadSavedSessions() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      return;
    }

    try {
      const response = await listTestSessionReports(accessToken, 10);
      setSavedSessions(response.data);
    } catch {
      // Keep the current test flow usable even when report history cannot load.
    }
  }

  function syncRoiToPortraitShape() {
    if (!testProduct) {
      return;
    }

    const nextRois = roiDraft.map((region) =>
      region.width > region.height
        ? { ...region, width: region.height, height: region.width }
        : region,
    );
    const changed = nextRois.some(
      (region, index) =>
        region.width !== roiDraft[index]?.width ||
        region.height !== roiDraft[index]?.height,
    );

    if (!changed) {
      toast.info(t("lineTest.roiShapeAlreadySynced"));
      return;
    }

    setRoiDraft(nextRois);
    setResult(null);
    setCropPreviews([]);
    toast.success(t("lineTest.roiShapeSynced"));
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.warning(t("lineTest.selectImageOnly"));
      return;
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    setImageName(file.name);
    setResult(null);
    setCropPreviews([]);
    setImagePreviewUrl(URL.createObjectURL(file));
    setImageBase64(await readFileAsDataUrl(file));
    event.target.value = "";
    toast.success(t("lineTest.imageReady"));
  }

  function handleFolderChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []).filter((file) =>
      isSupportedImageFile(file),
    );

    if (nextFiles.length === 0) {
      setBatchFiles([]);
      setBatchFolderName("");
      toast.warning(t("lineTest.selectFolderFirst"));
      return;
    }

    const firstPath = nextFiles[0]?.webkitRelativePath ?? "";
    const folderName = firstPath.split("/")[0] || t("lineTest.batchFolderUnknown");

    setBatchFiles(nextFiles);
    setBatchFolderName(folderName);
    setBatchReport([]);
    setSavedBatchReportId("");
    setBatchProgress(null);
    event.target.value = "";
    toast.success(
      formatMessage(t("lineTest.folderReady"), {
        count: nextFiles.length,
      }),
    );
  }

  function validateTestInputs() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return null;
    }

    if (!selectedProduct || !testProduct) {
      toast.warning(t("lineTest.selectProductFirst"));
      return null;
    }

    if (!selectedProduct.modelPath) {
      toast.warning(t("lineTest.modelRequired"));
      return null;
    }

    if (testProduct.roiRegions.length === 0) {
      toast.warning(t("lineTest.roiRequired"));
      return null;
    }

    return {
      accessToken,
      selectedProduct,
      testProduct,
    };
  }

  async function runInspectionForImage(
    accessToken: string,
    product: ProductProfile,
    imageToTestBase64: string,
  ) {
    const crops = await cropProductRois(imageToTestBase64, product);
    const response = await testInspectionImage(
      accessToken,
      product.id,
      crops.map(({ slotIndex, imageBase64: cropImageBase64 }) => ({
        slotIndex,
        imageBase64: cropImageBase64,
      })),
      product.roiRegions,
    );

    return {
      crops,
      data: response.data,
    };
  }

  async function transmitImage() {
    const validated = validateTestInputs();

    if (!validated) {
      return;
    }

    if (!imageBase64) {
      toast.warning(t("lineTest.selectImageFirst"));
      return;
    }

    const toastId = toast.loading(t("lineTest.transmitting"));
    setTesting(true);

    try {
      const { crops, data } = await runInspectionForImage(
        validated.accessToken,
        validated.testProduct,
        imageBase64,
      );
      setCropPreviews(crops);
      setResult(data);

      if (data.success && data.result === "OK") {
        toast.success(t("lineTest.testPassed"), { id: toastId });
      } else if (data.success) {
        toast.warning(t("lineTest.testReturnedNg"), { id: toastId });
      } else {
        toast.error(data.error || t("lineTest.testFailed"), {
          id: toastId,
        });
      }
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "lineTest.testFailed")
          : t("lineTest.testFailed");
      toast.error(message, { id: toastId });
    } finally {
      setTesting(false);
    }
  }

  async function runBatchTest() {
    const validated = validateTestInputs();

    if (!validated) {
      return;
    }

    if (batchFiles.length === 0) {
      toast.warning(t("lineTest.selectFolderFirst"));
      return;
    }

    const toastId = toast.loading(t("lineTest.batchTesting"));
    setBatchTesting(true);
    setBatchReport([]);
    setSavedBatchReportId("");

    try {
      const rows: BatchTestReportRow[] = [];

      for (const [index, file] of batchFiles.entries()) {
        setBatchProgress({
          current: index + 1,
          total: batchFiles.length,
          fileName: file.name,
        });

        let currentImageBase64 = "";

        try {
          currentImageBase64 = await readFileAsDataUrl(file);
          const { crops, data } = await runInspectionForImage(
            validated.accessToken,
            validated.testProduct,
            currentImageBase64,
          );
          const reportImageBase64 = await compressImageForReport(
            currentImageBase64,
          );

          setImageBase64(currentImageBase64);
          setImageName(file.name);
          setResult(data);
          setCropPreviews(crops);

          rows.push({
            fileName: file.name,
            relativePath: file.webkitRelativePath || file.name,
            result: data.result,
            success: data.success,
            cycleTimeMs: data.cycleTimeMs,
            okSlots: countSlotsByResult(data.slots, "OK"),
            ngSlots: countSlotsByResult(data.slots, "NG"),
            errorMessage: data.error,
            originalImageBase64: reportImageBase64,
            slots: data.slots,
          });
        } catch (cause) {
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "lineTest.testFailed")
              : t("lineTest.testFailed");

          rows.push({
            fileName: file.name,
            relativePath: file.webkitRelativePath || file.name,
            result: "ERROR",
            success: false,
            cycleTimeMs: null,
            okSlots: 0,
            ngSlots: 0,
            errorMessage: message,
            originalImageBase64: currentImageBase64
              ? await compressImageForReport(currentImageBase64).catch(() => "")
              : "",
            slots: [],
          });
        }

        setBatchReport([...rows]);
      }

      try {
        const saveResponse = await saveBatchReport(rows, validated);
        setSavedBatchReportId(saveResponse.data.id);

        toast.success(
          formatMessage(t("lineTest.batchCompletedSaved"), {
            count: rows.length,
            reportId: saveResponse.data.id,
          }),
          { id: toastId },
        );
      } catch (cause) {
        const message =
          cause instanceof ApiError
            ? `${t("lineTest.batchReportSaveFailed")} (${cause.message})`
            : t("lineTest.batchReportSaveFailed");
        toast.error(message, { id: toastId });
      }
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "lineTest.batchTestFailed")
          : t("lineTest.batchTestFailed");
      toast.error(message, { id: toastId });
    } finally {
      setBatchTesting(false);
      setBatchProgress(null);
    }
  }

  async function saveBatchReport(
    rows: BatchTestReportRow[],
    validatedInput?: ReturnType<typeof validateTestInputs>,
  ) {
    const validated = validatedInput ?? validateTestInputs();

    if (!validated) {
      throw new Error("Missing validation context");
    }

    if (rows.length === 0) {
      throw new Error("No batch report rows to save");
    }

    setSavingBatchReport(true);

    try {
      const okImageCount = rows.filter((row) => row.result === "OK").length;
      const ngImageCount = rows.filter((row) => row.result === "NG").length;
      const unknownImageCount = rows.filter(
        (row) => row.result === "UNKNOWN",
      ).length;
      const errorImageCount = rows.filter((row) => row.result === "ERROR").length;
      const failedImages = rows.filter((row) => row.result !== "OK");
      const desktop = getDesktopBridge();
      const testStorageSettings = desktop
        ? await desktop.getTestStorageSettings().catch(() => null)
        : null;

      const response = await createTestSessionReport(validated.accessToken, {
        productId: validated.selectedProduct.id,
        saveFolderPath:
          testStorageSettings?.testImageSaveFolderPath ?? undefined,
        folderName: batchFolderName || undefined,
        totalImages: rows.length,
        okImages: okImageCount,
        ngImages: ngImageCount,
        unknownImages: unknownImageCount,
        errorImages: errorImageCount,
        failedImages: failedImages.map((row) => ({
          fileName: row.fileName,
          relativePath: row.relativePath,
          result: row.result,
          cycleTimeMs: row.cycleTimeMs,
          errorMessage: row.errorMessage,
          originalImageBase64: row.originalImageBase64,
          roiResults: row.slots.map((slot) => ({
            slotIndex: slot.slotIndex,
            slotLabel: slot.slotLabel,
            expectedText: slot.expectedText,
            rawText: slot.rawText,
            result: slot.result,
            errorMessage: slot.errorMessage,
          })),
        })),
      });

      setSavedBatchReportId(response.data.id);
      await loadSavedSessions();
      return response;
    } finally {
      setSavingBatchReport(false);
    }
  }

  async function handleManualSaveBatchReport() {
    if (batchReport.length === 0) {
      toast.warning(t("lineTest.batchReportNothingToSave"));
      return;
    }

    const toastId = toast.loading(t("lineTest.batchReportSaving"));

    try {
      const response = await saveBatchReport(batchReport);
      toast.success(
        formatMessage(t("lineTest.batchReportSaved"), {
          reportId: response.data.id,
        }),
        { id: toastId },
      );
    } catch (cause) {
      if (
        cause instanceof Error &&
        cause.message === "No batch report rows to save"
      ) {
        toast.warning(t("lineTest.batchReportNothingToSave"), { id: toastId });
        return;
      }

      if (
        cause instanceof Error &&
        cause.message === "Missing validation context"
      ) {
        toast.error(t("lineTest.batchReportSaveFailed"), { id: toastId });
        return;
      }

      const message =
        cause instanceof ApiError
          ? `${t("lineTest.batchReportSaveFailed")} (${cause.message})`
          : t("lineTest.batchReportSaveFailed");
      toast.error(message, { id: toastId });
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      <Card className="border-[#86a8cf] bg-[#cfdff2] shadow-none">
        <CardContent className="grid gap-4 p-4 min-[980px]:grid-cols-[340px_minmax(0,1fr)]">
          <div className="rounded-sm border border-[#9db7d8] bg-[#d9e6f5] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-950">
                <Package className="h-5 w-5 text-[#274d7d]" />
                {t("operator.productToday")}
              </CardTitle>
              <Badge
                className={
                  dataSource === "api"
                    ? "border-[#8bb96d] bg-[#eef8e2] text-[#355f13]"
                    : "border-[#d9a04f] bg-[#fff1d8] text-[#8a4b00]"
                }
              >
                {dataSource === "api"
                  ? t("operator.sourceApi")
                  : t("lineTest.noProduct")}
              </Badge>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-[#274d7d]">
                  {t("products.code")}
                </label>
                <Select
                  aria-label={t("products.code")}
                  value={selectedProduct?.id ?? ""}
                  disabled={loadingProducts || products.length === 0}
                  className="h-11 border-[#9db7d8] bg-white text-base"
                  onChange={(event) => handleProductChange(event.target.value)}
                >
                  {products.length === 0 ? (
                    <option value="">{t("lineTest.noProduct")}</option>
                  ) : null}
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code} - {product.name}
                    </option>
                  ))}
                </Select>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleFileChange(event)}
              />
              <input
                ref={folderInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFolderChange}
              />
              <Button
                type="button"
                variant="outline"
                className="h-12 border-[#274d7d] bg-white text-base text-[#274d7d] hover:bg-slate-50"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileImage className="h-5 w-5" />
                {t("lineTest.selectImage")}
              </Button>
              <Button
                type="button"
                className="h-12 border-[#274d7d] bg-[#274d7d] text-base text-white hover:bg-[#1f3d64]"
                disabled={isBusy}
                onClick={() => void transmitImage()}
              >
                <Send className="h-5 w-5" />
                {testing ? t("lineTest.transmitting") : t("lineTest.transmitImage")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 border-[#274d7d] bg-white text-base text-[#274d7d] hover:bg-slate-50"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen className="h-5 w-5" />
                {t("lineTest.selectFolder")}
              </Button>
              <Button
                type="button"
                className="h-12 border-[#274d7d] bg-[#274d7d] text-base text-white hover:bg-[#1f3d64]"
                disabled={isBusy || batchFiles.length === 0}
                onClick={() => void runBatchTest()}
              >
                <FolderOpen className="h-5 w-5" />
                {batchTesting ? t("lineTest.batchTesting") : t("lineTest.batchTest")}
              </Button>
              <div className="min-h-5 truncate text-sm font-medium text-slate-700">
                {imageName || t("lineTest.noImageSelected")}
              </div>
              <div className="min-h-5 truncate text-sm font-medium text-slate-700">
                {batchFolderName
                  ? formatMessage(t("lineTest.folderSelected"), {
                      folder: batchFolderName,
                      count: batchFiles.length,
                    })
                  : t("lineTest.noFolderSelected")}
              </div>
            </div>
          </div>

          <div className="grid gap-3 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
            <InfoTile
              label={t("operator.currentProduct")}
              value={selectedProduct?.code ?? "-"}
              className="border-[#f0a53b] bg-white text-slate-950"
            />
            <InfoTile
              label={t("lineTest.result")}
              value={result?.result ?? "-"}
              className={
                result?.result === "OK"
                  ? "border-[#0f9f47] bg-[#15b455] text-white"
                  : result?.result === "NG"
                    ? "border-[#d92d20] bg-[#ef3e36] text-white"
                    : "border-[#f0a53b] bg-white text-slate-950"
              }
            />
            <InfoTile
              label={t("operator.ok")}
              value={okSlots}
              className="border-[#0f9f47] bg-[#15b455] text-white"
            />
            <InfoTile
              label={t("operator.ng")}
              value={ngSlots}
              className="border-[#d92d20] bg-[#ef3e36] text-white"
            />
            <InfoTile
              label={t("lineTest.totalSlots")}
              value={totalSlots}
              className="border-[#f0a53b] bg-white text-slate-950"
            />
            <InfoTile
              label={t("lineTest.cycleTime")}
              value={result ? `${result.cycleTimeMs} ms` : "-"}
              className="border-[#f0a53b] bg-white text-slate-950"
            />
            <InfoTile
              label={t("lineTest.imageSize")}
              value={
                result ? `${result.imageWidth} x ${result.imageHeight}` : "-"
              }
              className="border-[#f0a53b] bg-white text-slate-950"
            />
            <InfoTile
              label={t("dashboard.expectedText")}
              value={result?.expectedText ?? selectedProduct?.code ?? "-"}
              className="border-[#f0a53b] bg-white text-slate-950"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-[#86a8cf] bg-[#9fc3eb] shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#86a8cf] px-4 py-3">
          <div className="text-3xl font-bold text-[#2270c6]">
            {t("lineTest.referenceImage")}
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#274d7d]">
            <Timer className="h-4 w-4" />
            {result ? `${result.cycleTimeMs} ms` : t("lineTest.waiting")}
          </div>
        </div>
        <div className="p-4">
          {testProduct ? (
            <OperatorRoiEditor
              product={testProduct}
              onChange={handleRoiChange}
              overlayResult={result?.result === "UNKNOWN" ? null : result?.result ?? null}
              okCount={okSlots}
              ngCount={ngSlots}
              interactive
              previewImageSrc={previewImageSrc}
              topRightControls={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50"
                    onClick={resetRoiDraft}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("lineTest.resetRoi")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50"
                    onClick={syncRoiToPortraitShape}
                  >
                    {t("lineTest.syncRoiShape")}
                  </Button>
                  <Button
                    type="button"
                    className="border-[#274d7d] bg-[#274d7d] text-white hover:bg-[#1f3d64]"
                    disabled={isBusy}
                    onClick={() => void transmitImage()}
                  >
                    <Send className="h-4 w-4" />
                    {t("lineTest.transmitImage")}
                  </Button>
                </>
              }
            />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center border border-[#86a8cf] bg-white text-sm font-semibold text-slate-600">
              {t("lineTest.noProduct")}
            </div>
          )}
        </div>
      </Card>

      <Card className="border-[#86a8cf] bg-white shadow-none">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <FolderOpen className="h-5 w-5 text-[#274d7d]" />
              {t("lineTest.batchReport")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {savedBatchReportId ? (
                <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                  {formatMessage(t("lineTest.batchReportId"), {
                    reportId: savedBatchReportId,
                  })}
                </Badge>
              ) : null}
              {batchProgress ? (
                <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                  {formatMessage(t("lineTest.batchProgress"), {
                    current: batchProgress.current,
                    total: batchProgress.total,
                    file: batchProgress.fileName,
                  })}
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="border-[#274d7d] bg-white text-[#274d7d] hover:bg-slate-50"
                disabled={batchReport.length === 0 || batchTesting || savingBatchReport}
                onClick={() => void handleManualSaveBatchReport()}
              >
                <Save className="h-4 w-4" />
                {savingBatchReport
                  ? t("lineTest.batchReportSaving")
                  : t("lineTest.batchReportSave")}
              </Button>
            </div>
          </div>

          {batchReport.length > 0 ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <InfoTile
                  label={t("lineTest.batchTotal")}
                  value={batchReport.length}
                  className="border-[#f0a53b] bg-white text-slate-950"
                />
                <InfoTile
                  label={t("operator.ok")}
                  value={batchOkCount}
                  className="border-[#0f9f47] bg-[#15b455] text-white"
                />
                <InfoTile
                  label={t("operator.ng")}
                  value={batchNgCount}
                  className="border-[#d92d20] bg-[#ef3e36] text-white"
                />
                <InfoTile
                  label={t("lineTest.error")}
                  value={batchErrorCount}
                  className="border-slate-400 bg-slate-700 text-white"
                />
              </div>

              <div className="overflow-x-auto border border-slate-200">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2">
                        {t("lineTest.batchImage")}
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2">
                        {t("lineTest.result")}
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2">
                        {t("operator.ok")}
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2">
                        {t("operator.ng")}
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2">
                        {t("lineTest.cycleTime")}
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2">
                        {t("lineTest.error")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchReport.map((row) => (
                      <tr key={row.relativePath}>
                        <td className="border-b border-slate-100 px-3 py-2 font-medium text-slate-700">
                          {row.relativePath}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          <Badge
                            className={
                              row.result === "OK"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : row.result === "NG"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-slate-200 bg-slate-100 text-slate-700"
                            }
                          >
                            {row.result}
                          </Badge>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          {row.okSlots}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          {row.ngSlots}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          {row.cycleTimeMs !== null ? `${row.cycleTimeMs} ms` : "-"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-slate-600">
                          {row.errorMessage ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500">
              {t("lineTest.batchReportEmpty")}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#86a8cf] bg-white shadow-none">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-950">
            <FolderOpen className="h-5 w-5 text-[#274d7d]" />
            {t("lineTest.savedSessions")}
          </div>

          {savedSessions.length > 0 ? (
            <div className="grid gap-3">
              {savedSessions.map((session) => (
                <div key={session.id} className="border border-slate-200 bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-950">
                        {session.productCode}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatMessage(t("lineTest.batchReportId"), {
                          reportId: session.id,
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                        {formatDateTime(session.createdAt)}
                      </Badge>
                      <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                        {formatMessage(t("lineTest.savedSessionSummary"), {
                          total: session.totalImages,
                          failed: session.failedImages.length,
                        })}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid gap-2 p-3">
                    {session.failedImages.length > 0 ? (
                      session.failedImages.map((image) => (
                        <div key={image.id} className="border border-slate-200 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-sm">
                            <div className="font-medium text-slate-950">
                              {image.relativePath}
                            </div>
                            <Badge
                              className={
                                image.result === "NG"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-slate-200 bg-slate-100 text-slate-700"
                              }
                            >
                              {image.result}
                            </Badge>
                          </div>
                          <div className="grid gap-2 px-3 py-2 text-xs text-slate-600">
                            {image.roiResults.map((roi, index) => (
                              <div
                                key={`${image.id}-${roi.slotIndex ?? index}`}
                                className="border border-slate-100 bg-slate-50 px-2 py-2"
                              >
                                <div className="font-semibold text-slate-800">
                                  {roi.slotLabel ?? `${t("lineTest.roiSlot")} ${roi.slotIndex ?? "-"}`}
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
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500">
                        {t("lineTest.savedSessionNoFailures")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500">
              {t("lineTest.savedSessionsEmpty")}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#86a8cf] bg-white shadow-none">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <FileImage className="h-5 w-5 text-[#274d7d]" />
              {t("lineTest.cropPreview")}
            </div>
            <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
              {selectedProduct?.rotateTestImageClockwise
                ? t("lineTest.cropRotated")
                : t("lineTest.cropNotRotated")}
            </Badge>
          </div>
          {cropPreviews.length > 0 ? (
            <div className="grid gap-3">
              {cropPreviews.map((crop) => (
                <div
                  key={crop.slotIndex}
                  className="overflow-hidden border border-slate-200 bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                    <span>{`${t("lineTest.roiSlot")} ${crop.slotIndex}`}</span>
                    <span className="text-slate-500">
                      {crop.rotated
                        ? t("lineTest.cropRotatedShort")
                        : t("lineTest.cropOriginalShort")}
                    </span>
                  </div>
                  <div className="grid gap-2 bg-slate-950 p-2 sm:grid-cols-2 xl:grid-cols-4">
                    <DebugImageTile
                      title={t("lineTest.debugRoiCrop")}
                      src={crop.roiImageBase64}
                    />
                    <DebugImageTile
                      title={t("lineTest.debugAfterRotate")}
                      src={crop.rotatedImageBase64}
                    />
                    <DebugImageTile
                      title={t("lineTest.debugBeforeTool")}
                      src={crop.imageBase64}
                    />
                    <DebugImageTile
                      title={t("lineTest.debugAfterTool")}
                      src={toolDebugImagesBySlot.get(crop.slotIndex) ?? ""}
                      emptyText={t("lineTest.debugAfterToolEmpty")}
                    />
                  </div>
                  <div className="grid gap-1 px-3 py-2 text-xs text-slate-600">
                    <DebugMetricBar
                      metrics={[
                        {
                          label: t("lineTest.debugCenter"),
                          value: `${crop.regionCenterX}, ${crop.regionCenterY}`,
                        },
                        {
                          label: t("lineTest.debugTopLeft"),
                          value: `${crop.topLeftX}, ${crop.topLeftY}`,
                        },
                        {
                          label: t("lineTest.debugRoiSize"),
                          value: `${crop.roiWidth} x ${crop.roiHeight}`,
                        },
                        {
                          label: t("lineTest.debugVisualSize"),
                          value: `${crop.visualWidth} x ${crop.visualHeight}`,
                        },
                        {
                          label: t("lineTest.debugRotation"),
                          value: `${formatNumber(crop.rotation)} + ${formatNumber(crop.previewRotation)} = ${formatNumber(crop.displayRotation)}deg`,
                        },
                      ]}
                    />
                    <DebugMetricBar
                      metrics={[
                        {
                          label: t("lineTest.debugSourceCenter"),
                          value: `${formatNumber(crop.sourceCenterX)}, ${formatNumber(crop.sourceCenterY)}`,
                        },
                        {
                          label: t("lineTest.debugSourceTopLeft"),
                          value: `${formatNumber(crop.sourceTopLeftX)}, ${formatNumber(crop.sourceTopLeftY)}`,
                        },
                        {
                          label: t("lineTest.debugScale"),
                          value: `${formatNumber(crop.scaleX, 4)} x ${formatNumber(crop.scaleY, 4)}`,
                        },
                        {
                          label: t("lineTest.debugConfiguredImage"),
                          value: `${crop.configuredImageWidth} x ${crop.configuredImageHeight}`,
                        },
                        {
                          label: t("lineTest.debugNaturalImage"),
                          value: `${crop.naturalImageWidth} x ${crop.naturalImageHeight}`,
                        },
                        {
                          label: t("lineTest.debugDisplayedImage"),
                          value: `${formatNumber(crop.displayedImageWidth)} x ${formatNumber(crop.displayedImageHeight)}`,
                        },
                        {
                          label: t("lineTest.debugImageOffset"),
                          value: `${formatNumber(crop.imageOffsetX)}, ${formatNumber(crop.imageOffsetY)}`,
                        },
                      ]}
                    />
                    <div>
                      {t("lineTest.cropSize")}: {crop.width} x {crop.height}
                    </div>
                    <div>
                      {t("lineTest.sourceSize")}: {crop.sourceWidth} x{" "}
                      {crop.sourceHeight}
                      {" / "}
                      {t("lineTest.debugRoiSize")}: {crop.sourceRoiWidth} x{" "}
                      {crop.sourceRoiHeight}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500">
              {t("lineTest.cropPreviewEmpty")}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#86a8cf] bg-white shadow-none">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-950">
            {result?.result === "OK" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <CircleDot className="h-5 w-5 text-slate-500" />
            )}
            {t("lineTest.slotResults")}
          </div>
          {result ? (
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("dashboard.latestSlots")}
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("dashboard.expectedText")}
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("dashboard.rawText")}
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("lineTest.result")}
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("lineTest.error")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.slots.map((slot) => (
                    <tr key={slot.slotLabel ?? slot.slotIndex}>
                      <td className="border-b border-slate-100 px-3 py-2 font-semibold">
                        {slot.slotLabel}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        {slot.expectedText}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        {slot.rawText ?? "-"}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        <Badge
                          className={
                            slot.result === "OK"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }
                        >
                          {slot.result}
                        </Badge>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 text-slate-600">
                        {slot.errorMessage ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500">
              {t("lineTest.emptyResult")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DebugMetricBar({
  metrics,
}: {
  metrics: { label: string; value: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {metrics.map((metric) => (
        <span
          key={`${metric.label}-${metric.value}`}
          className="border border-[#9db7d8] bg-white px-2 py-1 font-mono text-[11px] font-semibold text-[#274d7d]"
        >
          {metric.label}: {metric.value}
        </span>
      ))}
    </div>
  );
}

function InfoTile({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={["rounded-sm border-2 p-5", className].join(" ")}>
      <div className="text-sm font-semibold uppercase tracking-normal">{label}</div>
      <div className="mt-3 truncate text-3xl font-bold leading-none">{value}</div>
    </div>
  );
}

function DebugImageTile({
  title,
  src,
  emptyText = "-",
}: {
  title: string;
  src: string;
  emptyText?: string;
}) {
  return (
    <div className="min-w-0 bg-slate-900">
      <div className="truncate border-b border-white/10 px-2 py-1 text-[11px] font-semibold uppercase text-slate-300">
        {title}
      </div>
      <div className="flex aspect-[4/3] items-center justify-center p-2">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={title}
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="px-2 text-center text-xs font-medium text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function countSlotsByResult(
  slots: InspectionSlotState[],
  result: InspectionSlotState["result"],
) {
  return slots.filter((slot) => slot.result === result).length;
}

function isSupportedImageFile(file: File) {
  if (file.type.startsWith("image/")) {
    return true;
  }

  return /\.(bmp|gif|jpe?g|png|tif?f|webp)$/i.test(file.name);
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function compressImageForReport(
  imageBase64: string,
  options: { maxWidth?: number; quality?: number } = {},
) {
  if (!imageBase64.startsWith("data:image/")) {
    return imageBase64;
  }

  const image = await loadImage(imageBase64);
  const maxWidth = options.maxWidth ?? 1600;
  const quality = options.quality ?? 0.82;
  const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth));
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return imageBase64;
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL("image/jpeg", quality);
}

function cloneRoiRegions(regions: RoiRegion[]) {
  return regions.map((region) => ({ ...region }));
}

async function cropProductRois(imageBase64: string, product: ProductProfile) {
  const image = await loadImage(imageBase64);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Cannot create image crop context");
  }

  const configuredWidth = Math.max(1, product.camera.imageWidth || image.naturalWidth);
  const configuredHeight = Math.max(
    1,
    product.camera.imageHeight || image.naturalHeight,
  );
  const imageMapping = getContainedImageMapping({
    frameWidth: configuredWidth,
    frameHeight: configuredHeight,
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
  });

  return product.roiRegions.slice(0, 5).map((region) => {
    const sourceCenterX = (region.x - imageMapping.offsetX) * imageMapping.scaleX;
    const sourceCenterY = (region.y - imageMapping.offsetY) * imageMapping.scaleY;
    const sourceRoiWidth = Math.max(
      1,
      Math.round(region.width * imageMapping.scaleX),
    );
    const sourceRoiHeight = Math.max(
      1,
      Math.round(region.height * imageMapping.scaleY),
    );
    const topLeftX = Math.round(region.x - region.width / 2);
    const topLeftY = Math.round(region.y - region.height / 2);
    const displayRotation = normalizeSignedRotation(
      region.rotation + product.camera.previewRotation,
    );
    const visualSize = {
      width: region.width,
      height: region.height,
    };
    const sourceWidth = sourceRoiWidth;
    const sourceHeight = sourceRoiHeight;
    const sourceTopLeftX = sourceCenterX - sourceWidth / 2;
    const sourceTopLeftY = sourceCenterY - sourceHeight / 2;
    const testRotationSteps = product.rotateTestImageClockwise ? 1 : 0;
    const normalizedRotationSteps = ((testRotationSteps % 4) + 4) % 4;
    const cropCanvas = document.createElement("canvas");
    const cropContext = cropCanvas.getContext("2d");

    if (!cropContext) {
      throw new Error("Cannot create ROI crop context");
    }

    cropCanvas.width = sourceWidth;
    cropCanvas.height = sourceHeight;
    cropContext.save();
    cropContext.drawImage(image, -sourceTopLeftX, -sourceTopLeftY);
    cropContext.restore();
    const roiImageBase64 = cropCanvas.toDataURL("image/jpeg", 0.88);

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((normalizedRotationSteps * Math.PI) / 2);
    const rotatedWidth =
      normalizedRotationSteps % 2 === 1 ? cropCanvas.height : cropCanvas.width;
    const rotatedHeight =
      normalizedRotationSteps % 2 === 1 ? cropCanvas.width : cropCanvas.height;
    const fitScale = Math.min(
      canvas.width / Math.max(1, rotatedWidth),
      canvas.height / Math.max(1, rotatedHeight),
    );
    context.scale(fitScale, fitScale);
    context.drawImage(
      cropCanvas,
      -cropCanvas.width / 2,
      -cropCanvas.height / 2,
      cropCanvas.width,
      cropCanvas.height,
    );
    context.restore();
    const rotatedImageBase64 = canvas.toDataURL("image/jpeg", 0.88);

    return {
      slotIndex: region.index,
      roiImageBase64,
      rotatedImageBase64,
      imageBase64: rotatedImageBase64,
      width: canvas.width,
      height: canvas.height,
      sourceWidth,
      sourceHeight,
      sourceRoiWidth,
      sourceRoiHeight,
      naturalImageWidth: image.naturalWidth,
      naturalImageHeight: image.naturalHeight,
      configuredImageWidth: configuredWidth,
      configuredImageHeight: configuredHeight,
      scaleX: imageMapping.scaleX,
      scaleY: imageMapping.scaleY,
      regionCenterX: region.x,
      regionCenterY: region.y,
      sourceCenterX,
      sourceCenterY,
      topLeftX,
      topLeftY,
      sourceTopLeftX,
      sourceTopLeftY,
      displayedImageWidth: imageMapping.displayedWidth,
      displayedImageHeight: imageMapping.displayedHeight,
      imageOffsetX: imageMapping.offsetX,
      imageOffsetY: imageMapping.offsetY,
      roiWidth: region.width,
      roiHeight: region.height,
      visualWidth: visualSize.width,
      visualHeight: visualSize.height,
      rotation: region.rotation,
      previewRotation: product.camera.previewRotation,
      displayRotation,
      rotated: normalizedRotationSteps !== 0,
    };
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load selected image"));
    image.src = src;
  });
}

function normalizeSignedRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function getContainedImageMapping({
  frameHeight,
  frameWidth,
  imageHeight,
  imageWidth,
}: {
  frameHeight: number;
  frameWidth: number;
  imageHeight: number;
  imageWidth: number;
}) {
  const containScale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const displayedWidth = imageWidth * containScale;
  const displayedHeight = imageHeight * containScale;
  const offsetX = (frameWidth - displayedWidth) / 2;
  const offsetY = (frameHeight - displayedHeight) / 2;

  return {
    displayedWidth,
    displayedHeight,
    offsetX,
    offsetY,
    scaleX: imageWidth / displayedWidth,
    scaleY: imageHeight / displayedHeight,
  };
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
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
