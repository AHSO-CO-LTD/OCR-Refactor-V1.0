"use client";

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Camera,
  FolderOpen,
  FileImage,
  Pause,
  Play,
  Package,
  RotateCcw,
  ScanLine,
  Square,
  Video,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useConnectedCameraPreview } from "@/components/camera/use-connected-camera-preview";
import {
  OperatorRoiEditor,
  type OperatorRoiStatus,
} from "@/components/operator/operator-roi-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  createTestSessionReport,
  grabCameraFrame,
  listProductProfiles,
  testInspectionImage,
  type InspectionSlotState,
  type ProductProfile,
  type RoiRegion,
  type TestInspectionImageResult,
  type TestSessionImageResult,
} from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import {
  getRuntimeTestSettings,
  subscribeRuntimeTestSettings,
} from "@/lib/runtime-test-settings";
import { getAccessToken } from "@/lib/session";

type AnimationState = "UNKNOWN" | "CHECKING" | "WAITING_PLC" | "OK" | "NG";
type DataSource = "api" | "sample";
type RuntimeFrame = {
  atMs: number;
  regions: RoiRegion[];
  statuses: Record<number, OperatorRoiStatus>;
  labels?: Record<number, string>;
};
type AnimationBatchReportRow = {
  fileName: string;
  relativePath: string;
  result: TestSessionImageResult;
  cycleTimeMs: number | null;
  errorMessage: string | null;
  originalImageBase64: string;
  slots: InspectionSlotState[];
};
type AnimationBatchSummary = {
  reportId: string;
  folderName: string;
  totalImages: number;
  okImages: number;
  ngImages: number;
  unknownImages: number;
  errorImages: number;
};
type LineAnimationTestPanelProps = {
  layout?: "animation" | "operator-test";
};

const detectDelayMs = 300;
const plcDoneHoldMs = 750;
const resultHoldMs = 1200;
const runtimeFrameIntervalMs = 2800;

const sampleProducts: ProductProfile[] = [
  createSampleProduct({
    id: "line-animation-test-is35r",
    code: "IS-35R",
    name: "Metalcore IS-35R",
    modelPath: "IS35R_100_E35.pt",
    exposure: 3500,
    roiRegions: [
      { index: 1, x: 285, y: 245, width: 108, height: 162, rotation: 0 },
      { index: 2, x: 525, y: 245, width: 108, height: 162, rotation: 0 },
      { index: 3, x: 765, y: 245, width: 108, height: 162, rotation: 0 },
      { index: 4, x: 1005, y: 245, width: 108, height: 162, rotation: 0 },
      { index: 5, x: 1245, y: 245, width: 108, height: 162, rotation: 0 },
    ],
  }),
  createSampleProduct({
    id: "line-animation-test-sl37",
    code: "SL-37",
    name: "Metalcore SL-37",
    modelPath: "models/sl-37.onnx",
    exposure: 1200,
    roiRegions: [
      { index: 1, x: 282, y: 236, width: 104, height: 158, rotation: 0 },
      { index: 2, x: 520, y: 238, width: 104, height: 158, rotation: 0 },
      { index: 3, x: 760, y: 239, width: 104, height: 158, rotation: 0 },
      { index: 4, x: 1000, y: 238, width: 104, height: 158, rotation: 0 },
      { index: 5, x: 1238, y: 236, width: 104, height: 158, rotation: 0 },
    ],
  }),
];

function createSampleProduct({
  id,
  code,
  name,
  modelPath,
  exposure,
  roiRegions,
}: {
  id: string;
  code: string;
  name: string;
  modelPath: string;
  exposure: number;
  roiRegions: RoiRegion[];
}): ProductProfile {
  return {
    id,
    code,
    name,
    defaultNumber: 100,
    batchSize: 100,
    exposure,
    thresholdAccept: 0.5,
    thresholdMns: 0.5,
    rowThreshold: 20,
    modelPath,
    rotateTestImageClockwise: true,
    active: true,
    camera: {
      sourceType: "demo",
      deviceName: `${code} animation camera`,
      exposure,
      imageWidth: 1500,
      imageHeight: 500,
      offsetX: 0,
      offsetY: 0,
      zoomFactor: 1,
      previewPanX: 0,
      previewPanY: 0,
      previewRotation: 0,
    },
    roiRegions,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function countStatuses(statuses: Record<number, OperatorRoiStatus>) {
  return Object.values(statuses).reduce(
    (totals, status) => {
      if (status === "OK") {
        totals.ok += 1;
      }

      if (status === "NG") {
        totals.ng += 1;
      }

      return totals;
    },
    { ok: 0, ng: 0 },
  );
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(bmp|gif|jpe?g|png|tif?f|webp)$/i.test(file.name);
}

export function LineAnimationTestPanel({
  layout = "animation",
}: LineAnimationTestPanelProps = {}) {
  const { t, apiError } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const cancelBatchTestRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const lineIntervalRef = useRef<number | null>(null);
  const lineVisibleIndexesRef = useRef<Set<number>>(new Set());
  const lineStatusesRef = useRef<Record<number, OperatorRoiStatus>>({});
  const lineLabelsRef = useRef<Record<number, string>>({});
  const lineTickBusyRef = useRef(false);
  const totalCountRef = useRef(0);
  const batchCountRef = useRef(0);
  const batchQuantityRef = useRef(0);
  const [products, setProducts] = useState<ProductProfile[]>(sampleProducts);
  const [selectedProductId, setSelectedProductId] = useState(sampleProducts[0].id);
  const [dataSource, setDataSource] = useState<DataSource>("sample");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [animationState, setAnimationState] =
    useState<AnimationState>("UNKNOWN");
  const [roiStatuses, setRoiStatuses] = useState<
    Record<number, OperatorRoiStatus>
  >({});
  const [roiDetectedTextLabels, setRoiDetectedTextLabels] = useState<
    Record<number, string>
  >({});
  const [activeRoiIndexes, setActiveRoiIndexes] = useState<number[]>([]);
  const [okCount, setOkCount] = useState(0);
  const [ngCount, setNgCount] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [count, setCount] = useState(0);
  const [batch, setBatch] = useState(0);
  const [lineRunning, setLineRunning] = useState(false);
  const [testingRealImage, setTestingRealImage] = useState(false);
  const [batchTesting, setBatchTesting] = useState(false);
  const [savingBatchReport, setSavingBatchReport] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [selectedImageBase64, setSelectedImageBase64] = useState("");
  const [selectedImageName, setSelectedImageName] = useState("");
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchFolderName, setBatchFolderName] = useState("");
  const [batchSummary, setBatchSummary] = useState<AnimationBatchSummary | null>(
    null,
  );
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [runtimeSettings, setRuntimeSettings] = useState(() =>
    getRuntimeTestSettings(),
  );

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

        if (!cancelled && activeProducts.length > 0) {
          setProducts(activeProducts);
          setSelectedProductId(activeProducts[0].id);
          setDataSource("api");
        }
      } catch {
        if (!cancelled) {
          setProducts(sampleProducts);
          setSelectedProductId(sampleProducts[0].id);
          setDataSource("sample");
          toast.warning(t("lineAnimationTest.productProfilesFallback"));
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
    const unsubscribe = subscribeRuntimeTestSettings(() => {
      setRuntimeSettings(getRuntimeTestSettings());
    });

    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      stopLineInterval();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
      }
    };
  }, [selectedImageUrl]);

  useEffect(() => {
    const folderInput = folderInputRef.current;

    if (!folderInput) {
      return;
    }

    folderInput.setAttribute("webkitdirectory", "");
    folderInput.setAttribute("directory", "");
  }, []);

  const product = useMemo(
    () =>
      products.find((sample) => sample.id === selectedProductId) ??
      products[0] ??
      sampleProducts[0],
    [products, selectedProductId],
  );

  const activeRegions = useMemo(
    () =>
      product.roiRegions.filter((region) =>
        activeRoiIndexes.includes(region.index),
      ),
    [activeRoiIndexes, product.roiRegions],
  );

  const displayProduct = useMemo(
    () => ({ ...product, roiRegions: activeRegions }),
    [activeRegions, product],
  );
  const {
    imageSrc: livePreviewImageSrc,
    connected: livePreviewConnected,
    matchesExpectedCamera: livePreviewMatchesExpectedCamera,
  } = useConnectedCameraPreview(
    product.camera.deviceName,
    layout === "operator-test",
  );
  const operatorPreviewImageSrc = selectedImageUrl || livePreviewImageSrc;

  const overlayResult =
    animationState === "OK" || animationState === "NG" ? animationState : null;
  const stateClassName =
    animationState === "OK"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : animationState === "NG"
        ? "border-red-200 bg-red-50 text-red-700"
        : animationState === "CHECKING"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : animationState === "WAITING_PLC"
            ? "border-cyan-200 bg-cyan-50 text-cyan-700"
            : "border-slate-200 bg-slate-50 text-slate-600";
  const isBusy = testingRealImage || batchTesting || lineRunning;
  const inspectionResultDelayMs = runtimeSettings.inspectionResultDelayMs;

  function clearTimers() {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];
  }

  function stopLineInterval() {
    if (lineIntervalRef.current !== null) {
      window.clearInterval(lineIntervalRef.current);
      lineIntervalRef.current = null;
    }
    lineTickBusyRef.current = false;
  }

  function clearLineSessionRefs() {
    lineVisibleIndexesRef.current = new Set();
    lineStatusesRef.current = {};
    lineLabelsRef.current = {};
  }

  function resetProductionCounters() {
    totalCountRef.current = 0;
    batchCountRef.current = 0;
    batchQuantityRef.current = 0;
    setQuantity(0);
    setCount(0);
    setBatch(0);
  }

  function addProductionCount(amount: number) {
    const safeAmount = Math.max(0, Math.trunc(amount));

    if (safeAmount <= 0) {
      return;
    }

    const safeBatchSize = Math.max(1, product.batchSize || 1);
    const nextQuantity = batchQuantityRef.current + safeAmount;
    const batchIncrement = Math.floor(nextQuantity / safeBatchSize);
    const remainder = nextQuantity % safeBatchSize;

    totalCountRef.current += safeAmount;
    batchCountRef.current += batchIncrement;
    batchQuantityRef.current = remainder;
    setCount(totalCountRef.current);
    setBatch(batchCountRef.current);
    setQuantity(remainder);
  }

  function resetScenario(showToast = true) {
    stopLineInterval();
    clearTimers();
    clearLineSessionRefs();
    setLineRunning(false);
    setAnimationState("UNKNOWN");
    setRoiStatuses({});
    setRoiDetectedTextLabels({});
    setActiveRoiIndexes([]);
    setOkCount(0);
    setNgCount(0);
    resetProductionCounters();
    setBatchProgress(null);

    if (showToast) {
      toast.info(t("lineAnimationTest.resetDone"));
    }
  }

  function handleProductChange(nextProductId: string) {
    setSelectedProductId(nextProductId);
    resetScenario(false);
    toast.info(t("lineAnimationTest.productChanged"));
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!isImageFile(file)) {
      toast.warning(t("lineTest.selectImageOnly"));
      event.target.value = "";
      return;
    }

    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
    }

    setSelectedImageUrl(URL.createObjectURL(file));
    setSelectedImageBase64(await readFileAsDataUrl(file));
    setSelectedImageName(file.name);
    resetScenario(false);
    event.target.value = "";
    toast.success(t("lineTest.imageReady"));
  }

  function handleFolderChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []).filter((file) =>
      isImageFile(file),
    );

    if (nextFiles.length === 0) {
      setBatchFiles([]);
      setBatchFolderName("");
      setBatchSummary(null);
      toast.warning(t("lineTest.selectFolderFirst"));
      return;
    }

    const firstPath = nextFiles[0]?.webkitRelativePath ?? "";
    const folderName = firstPath.split("/")[0] || t("lineTest.batchFolderUnknown");

    setBatchFiles(nextFiles);
    setBatchFolderName(folderName);
    setBatchSummary(null);
    setBatchProgress(null);
    resetScenario(false);
    event.target.value = "";
    toast.success(
      formatMessage(t("lineTest.folderReady"), {
        count: nextFiles.length,
      }),
    );
  }

  function validateRealTestInputs() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return null;
    }

    if (dataSource !== "api") {
      toast.warning(t("lineAnimationTest.realProfileRequired"));
      return null;
    }

    if (!product.modelPath) {
      toast.warning(t("lineTest.modelRequired"));
      return null;
    }

    if (product.roiRegions.length === 0) {
      toast.warning(t("lineAnimationTest.noRoi"));
      return null;
    }

    return {
      accessToken,
      product,
    };
  }

  function scheduleRuntimeFrames(frames: RuntimeFrame[]) {
    clearTimers();

    if (frames.length === 0) {
      toast.warning(t("lineAnimationTest.noRoi"));
      return false;
    }

    const visibleIndexes = new Set<number>();
    const sessionStatuses: Record<number, OperatorRoiStatus> = {};
    const sessionLabels: Record<number, string> = Object.fromEntries(
      frames.flatMap((frame) =>
        frame.regions.map((region) => [
          region.index,
          frame.labels?.[region.index] ?? product.code,
        ]),
      ),
    );

    setAnimationState("UNKNOWN");
    setRoiStatuses({});
    setRoiDetectedTextLabels(sessionLabels);
    setActiveRoiIndexes([]);
    setOkCount(0);
    setNgCount(0);

    frames.forEach((frame) => {
      const frameIndexes = new Set(frame.regions.map((region) => region.index));
      const frameTimer = window.setTimeout(() => {
        Array.from(visibleIndexes).forEach((index) => {
          if (!frameIndexes.has(index)) {
            visibleIndexes.delete(index);
            delete sessionStatuses[index];
            delete sessionLabels[index];
          }
        });

        let startedChecking = false;

        frame.regions.forEach((region) => {
          const detectAt = frame.atMs;
          const resultAt = detectAt + inspectionResultDelayMs;
          const finalStatus = frame.statuses[region.index] ?? "NG";
          const finalLabel = frame.labels?.[region.index];
          const currentStatus = sessionStatuses[region.index];

          visibleIndexes.add(region.index);

          if (!currentStatus || currentStatus === "CHECKING") {
            startedChecking = true;
            sessionStatuses[region.index] = "CHECKING";
            sessionLabels[region.index] =
              finalLabel ?? sessionLabels[region.index] ?? product.code;

            const resultTimer = window.setTimeout(() => {
              sessionStatuses[region.index] = finalStatus;

              if (finalLabel) {
                sessionLabels[region.index] = finalLabel;
              }

              setRoiStatuses({ ...sessionStatuses });
              setRoiDetectedTextLabels({ ...sessionLabels });
            }, resultAt - frame.atMs);

            timersRef.current.push(resultTimer);
            return;
          }

          if (currentStatus === "NG" && finalStatus === "OK") {
            const resultTimer = window.setTimeout(() => {
              sessionStatuses[region.index] = "OK";

              if (finalLabel) {
                sessionLabels[region.index] = finalLabel;
              }

              setRoiStatuses({ ...sessionStatuses });
              setRoiDetectedTextLabels({ ...sessionLabels });
            }, resultAt - frame.atMs);

            timersRef.current.push(resultTimer);
            return;
          }

          if (currentStatus === "NG" && finalStatus === "NG" && finalLabel) {
            sessionLabels[region.index] = finalLabel;
          }
        });

        setAnimationState(startedChecking ? "CHECKING" : "WAITING_PLC");
        setActiveRoiIndexes(Array.from(visibleIndexes));
        setRoiStatuses({ ...sessionStatuses });
        setRoiDetectedTextLabels({ ...sessionLabels });
      }, frame.atMs);

      timersRef.current.push(frameTimer);
    });

    const lastFrameEndAt =
      Math.max(
        ...frames.map(
          (frame) =>
            frame.atMs,
        ),
      ) + inspectionResultDelayMs;
    const plcDoneAt = lastFrameEndAt + plcDoneHoldMs;

    const waitPlcTimer = window.setTimeout(() => {
      setAnimationState("WAITING_PLC");
    }, lastFrameEndAt);

    const plcDoneTimer = window.setTimeout(() => {
      const finalCounts = countStatuses(sessionStatuses);
      const finalState = finalCounts.ng > 0 ? "NG" : "OK";

      setAnimationState(finalState);
      setOkCount(finalCounts.ok);
      setNgCount(finalCounts.ng);
      addProductionCount(Object.keys(sessionStatuses).length);
    }, plcDoneAt);

    timersRef.current.push(waitPlcTimer, plcDoneTimer);
    return true;
  }

  async function playRuntimeFrames(frames: RuntimeFrame[]) {
    const scheduled = scheduleRuntimeFrames(frames);

    if (!scheduled) {
      return false;
    }

    const lastFrameAt = Math.max(...frames.map((frame) => frame.atMs));
    await wait(
      lastFrameAt + inspectionResultDelayMs + plcDoneHoldMs + resultHoldMs,
    );
    return true;
  }

  function buildAnimationResult(
    inspection: TestInspectionImageResult,
    regions: RoiRegion[],
  ) {
    const regionByIndex = new Map(regions.map((region) => [region.index, region]));
    const animationRegions = inspection.slots
      .filter((slot) => slot.result === "OK" || slot.result === "NG")
      .map((slot) =>
        typeof slot.slotIndex === "number"
          ? regionByIndex.get(slot.slotIndex)
          : null,
      )
      .filter((region): region is RoiRegion => Boolean(region));
    const finalStatuses = Object.fromEntries(
      animationRegions.map((region) => {
        const slot = inspection.slots.find(
          (item) => item.slotIndex === region.index,
        );
        return [region.index, slot?.result === "OK" ? "OK" : "NG"];
      }),
    ) as Record<number, OperatorRoiStatus>;
    const finalLabels = Object.fromEntries(
      animationRegions.map((region) => {
        const slot = inspection.slots.find(
          (item) => item.slotIndex === region.index,
        );
        const detectedText =
          slot?.rawText?.trim() || slot?.expectedText?.trim() || slot?.result;
        return [region.index, detectedText || finalStatuses[region.index]];
      }),
    ) as Record<number, string>;

    return {
      regions: animationRegions,
      finalStatuses,
      finalLabels,
    };
  }

  async function runInspectionForImage(
    accessToken: string,
    imageToTestBase64: string,
    testProduct: ProductProfile,
  ) {
    const crops = await cropProductRois(imageToTestBase64, testProduct);
    const response = await testInspectionImage(
      accessToken,
      testProduct.id,
      crops.map((crop) => ({
        slotIndex: crop.slotIndex,
        imageBase64: crop.imageBase64,
      })),
      testProduct.roiRegions,
    );

    return response.data;
  }

  async function playInspectionResult(
    inspection: TestInspectionImageResult,
    regions: RoiRegion[],
  ) {
    const animation = buildAnimationResult(inspection, regions);

    if (inspection.result === "UNKNOWN" || animation.regions.length === 0) {
      return playRejectedInspectionResult(inspection.result);
    }

    return playRuntimeFrames([
      {
        atMs: detectDelayMs,
        regions: animation.regions,
        statuses: animation.finalStatuses,
        labels: animation.finalLabels,
      },
    ]);
  }

  async function playRejectedInspectionResult(
    result: TestInspectionImageResult["result"] | "ERROR",
  ) {
    clearTimers();
    setAnimationState("CHECKING");
    setActiveRoiIndexes([]);
    setRoiStatuses({});
    setRoiDetectedTextLabels({});
    setOkCount(0);
    setNgCount(result === "NG" || result === "ERROR" ? 1 : 0);

    await wait(inspectionResultDelayMs);
    setAnimationState(result === "UNKNOWN" ? "UNKNOWN" : "NG");
    setActiveRoiIndexes([]);
    setRoiStatuses({});
    setRoiDetectedTextLabels({});

    await wait(resultHoldMs);
    return true;
  }

  function applyContinuousLineFrame(
    regions: RoiRegion[],
    frameStatuses: Record<number, OperatorRoiStatus>,
    frameLabels: Record<number, string>,
  ) {

    const nextFrameIndexes = new Set(regions.map((region) => region.index));
    const visibleIndexes = lineVisibleIndexesRef.current;
    const statuses = lineStatusesRef.current;
    const labels = lineLabelsRef.current;
    let startedChecking = false;

    Array.from(visibleIndexes).forEach((index) => {
      if (!nextFrameIndexes.has(index)) {
        visibleIndexes.delete(index);
        delete statuses[index];
        delete labels[index];
      }
    });

    regions.forEach((region) => {
      const nextStatus = frameStatuses[region.index] ?? "NG";
      const nextLabel = frameLabels[region.index] ?? product.code;
      const currentStatus = statuses[region.index];

      visibleIndexes.add(region.index);
      labels[region.index] = labels[region.index] ?? nextLabel;

      if (!currentStatus || currentStatus === "CHECKING") {
        startedChecking = true;
        statuses[region.index] = "CHECKING";

        const resultTimer = window.setTimeout(() => {
          statuses[region.index] = nextStatus;
          labels[region.index] = nextLabel;
          setRoiStatuses({ ...statuses });
          setRoiDetectedTextLabels({ ...labels });
        }, inspectionResultDelayMs);

        timersRef.current.push(resultTimer);
        return;
      }

      if (currentStatus === "NG" && nextStatus === "OK") {
        const resultTimer = window.setTimeout(() => {
          statuses[region.index] = "OK";
          labels[region.index] = nextLabel;
          setRoiStatuses({ ...statuses });
          setRoiDetectedTextLabels({ ...labels });
        }, inspectionResultDelayMs);

        timersRef.current.push(resultTimer);
      }
    });

    setAnimationState(startedChecking ? "CHECKING" : "WAITING_PLC");
    setActiveRoiIndexes(Array.from(visibleIndexes));
    setRoiStatuses({ ...statuses });
    setRoiDetectedTextLabels({ ...labels });
  }

  function runLineContinuously() {
    const validated = validateRealTestInputs();

    if (!validated) {
      return;
    }

    stopLineInterval();
    clearTimers();
    clearLineSessionRefs();
    setLineRunning(true);
    setOkCount(0);
    setNgCount(0);
    resetProductionCounters();
    setAnimationState("UNKNOWN");
    setRoiStatuses({});
    setRoiDetectedTextLabels({});
    setActiveRoiIndexes([]);

    const tick = async () => {
      if (lineTickBusyRef.current) {
        return;
      }

      lineTickBusyRef.current = true;

      try {
        const frameBase64 = selectedImageBase64
          ? selectedImageBase64
          : await grabLineFrameBase64(validated.accessToken);
        const testProduct = {
          ...product,
          roiRegions: product.roiRegions,
        };
        const crops = await cropProductRois(frameBase64, testProduct);
        const response = await testInspectionImage(
          validated.accessToken,
          product.id,
          crops.map((crop) => ({
            slotIndex: crop.slotIndex,
            imageBase64: crop.imageBase64,
          })),
          product.roiRegions,
        );
        if (response.data.result === "UNKNOWN") {
          clearLineSessionRefs();
          setActiveRoiIndexes([]);
          setRoiStatuses({});
          setRoiDetectedTextLabels({});
          setOkCount(0);
          setNgCount(0);
          setAnimationState("UNKNOWN");
          return;
        }

        const detectedRegions = product.roiRegions.filter((region) => {
          const slot = response.data.slots.find(
            (item) => item.slotIndex === region.index,
          );
          return slot?.result === "OK" || slot?.result === "NG";
        });
        const frameStatuses = Object.fromEntries(
          detectedRegions.map((region) => {
            const slot = response.data.slots.find(
              (item) => item.slotIndex === region.index,
            );
            return [region.index, slot?.result === "OK" ? "OK" : "NG"];
          }),
        ) as Record<number, OperatorRoiStatus>;
        const frameLabels = Object.fromEntries(
          detectedRegions.map((region) => {
            const slot = response.data.slots.find(
              (item) => item.slotIndex === region.index,
            );
            const detectedText =
              slot?.rawText?.trim() || slot?.expectedText?.trim() || slot?.result;
            return [region.index, detectedText || product.code];
          }),
        ) as Record<number, string>;

        applyContinuousLineFrame(detectedRegions, frameStatuses, frameLabels);
        addProductionCount(detectedRegions.length);
      } catch (cause) {
        const message =
          cause instanceof ApiError
            ? apiError(cause.message, "lineAnimationTest.realTestFailed")
            : t("lineAnimationTest.realTestFailed");
        toast.error(message);
        stopLineInterval();
        setLineRunning(false);
      } finally {
        lineTickBusyRef.current = false;
      }
    };

    void tick();
    lineIntervalRef.current = window.setInterval(
      () => void tick(),
      runtimeFrameIntervalMs,
    );
    toast.success(t("lineAnimationTest.lineStarted"));
  }

  function finishLineSession() {
    stopLineInterval();
    clearTimers();
    setLineRunning(false);

    const finalStatuses = Object.fromEntries(
      Object.entries(lineStatusesRef.current).filter(
        ([, status]) => status === "OK" || status === "NG",
      ),
    ) as Record<number, OperatorRoiStatus>;
    const finalCounts = countStatuses(finalStatuses);
    const finalState = finalCounts.ng > 0 ? "NG" : "OK";
    const finalIndexes = Object.keys(finalStatuses).map(Number);

    lineStatusesRef.current = finalStatuses;
    lineVisibleIndexesRef.current = new Set(finalIndexes);
    setActiveRoiIndexes(finalIndexes);
    setRoiStatuses({ ...finalStatuses });
    setRoiDetectedTextLabels({ ...lineLabelsRef.current });
    setOkCount(finalCounts.ok);
    setNgCount(finalCounts.ng);
    setAnimationState(finalIndexes.length > 0 ? finalState : "UNKNOWN");
    toast.success(t("lineAnimationTest.lineFinished"));
  }

  async function runRealImageTest() {
    const validated = validateRealTestInputs();

    if (!validated) {
      return;
    }

    if (!selectedImageBase64) {
      toast.warning(t("lineTest.selectImageFirst"));
      return;
    }

    const detectedRegions = product.roiRegions;

    if (detectedRegions.length === 0) {
      toast.warning(t("lineAnimationTest.noRoi"));
      return;
    }

    setTestingRealImage(true);
    const toastId = toast.loading(t("lineAnimationTest.realTesting"));

    try {
      const testProduct = {
        ...product,
        roiRegions: detectedRegions,
      };
      const crops = await cropProductRois(selectedImageBase64, testProduct);
      const response = await testInspectionImage(
        validated.accessToken,
        product.id,
        crops.map((crop) => ({
          slotIndex: crop.slotIndex,
          imageBase64: crop.imageBase64,
        })),
        detectedRegions,
      );
      await playInspectionResult(response.data, detectedRegions);
      toast.success(t("lineAnimationTest.realScenarioStarted"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "lineAnimationTest.realTestFailed")
          : t("lineAnimationTest.realTestFailed");
      toast.error(message, { id: toastId });
    } finally {
      setTestingRealImage(false);
    }
  }

  async function runBatchFolderTest() {
    const validated = validateRealTestInputs();

    if (!validated) {
      return;
    }

    if (batchFiles.length === 0) {
      toast.warning(t("lineTest.selectFolderFirst"));
      return;
    }

    stopLineInterval();
    clearTimers();
    clearLineSessionRefs();
    setLineRunning(false);
    setBatchTesting(true);
    setBatchSummary(null);
    setBatchProgress(null);
    resetProductionCounters();
    cancelBatchTestRef.current = false;
    const toastId = toast.loading(t("lineAnimationTest.batchTesting"));

    try {
      const rows: AnimationBatchReportRow[] = [];

      for (const [index, file] of batchFiles.entries()) {
        if (cancelBatchTestRef.current) {
          break;
        }

        setBatchProgress({
          current: index + 1,
          total: batchFiles.length,
          fileName: file.name,
        });

        const imageUrl = URL.createObjectURL(file);
        let currentImageBase64 = "";

        setSelectedImageUrl(imageUrl);
        setSelectedImageName(file.name);

        try {
          currentImageBase64 = await readFileAsDataUrl(file);
          setSelectedImageBase64(currentImageBase64);
          const inspection = await runInspectionForImage(
            validated.accessToken,
            currentImageBase64,
            validated.product,
          );
          const reportImageBase64 = await compressImageForReport(
            currentImageBase64,
          );

          await playInspectionResult(inspection, validated.product.roiRegions);

          rows.push({
            fileName: file.name,
            relativePath: file.webkitRelativePath || file.name,
            result: inspection.result,
            cycleTimeMs: inspection.cycleTimeMs,
            errorMessage: inspection.error,
            originalImageBase64: reportImageBase64,
            slots: inspection.slots,
          });
        } catch (cause) {
          const message =
            cause instanceof ApiError
              ? apiError(cause.message, "lineAnimationTest.realTestFailed")
              : t("lineAnimationTest.realTestFailed");
          const reportImageBase64 = currentImageBase64
            ? await compressImageForReport(currentImageBase64).catch(() => "")
            : "";

          await playRejectedInspectionResult("ERROR");

          rows.push({
            fileName: file.name,
            relativePath: file.webkitRelativePath || file.name,
            result: "ERROR",
            cycleTimeMs: null,
            errorMessage: message,
            originalImageBase64: reportImageBase64,
            slots: [],
          });
        }
      }

      if (rows.length === 0) {
        toast.warning(t("lineAnimationTest.batchCancelled"), { id: toastId });
        return;
      }

      setSavingBatchReport(true);
      const response = await saveAnimationBatchReport(rows, validated);
      const summary = buildBatchSummary(rows, response.data.id);
      setBatchSummary(summary);
      toast.success(
        formatMessage(t("lineAnimationTest.batchCompletedSaved"), {
          count: rows.length,
          reportId: response.data.id,
        }),
        { id: toastId },
      );
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "lineTest.batchTestFailed")
          : t("lineTest.batchTestFailed");
      toast.error(message, { id: toastId });
    } finally {
      setBatchTesting(false);
      setSavingBatchReport(false);
      setBatchProgress(null);
    }
  }

  async function saveAnimationBatchReport(
    rows: AnimationBatchReportRow[],
    validated: NonNullable<ReturnType<typeof validateRealTestInputs>>,
  ) {
    const desktop = getDesktopBridge();
    const testStorageSettings = desktop
      ? await desktop.getTestStorageSettings().catch(() => null)
      : null;
    const failedImages = rows.filter((row) => row.result !== "OK");

    return createTestSessionReport(validated.accessToken, {
      productId: validated.product.id,
      saveFolderPath: testStorageSettings?.testImageSaveFolderPath ?? undefined,
      folderName: batchFolderName || undefined,
      totalImages: rows.length,
      okImages: rows.filter((row) => row.result === "OK").length,
      ngImages: rows.filter((row) => row.result === "NG").length,
      unknownImages: rows.filter((row) => row.result === "UNKNOWN").length,
      errorImages: rows.filter((row) => row.result === "ERROR").length,
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
          toolDebugImageBase64: slot.toolDebugImageBase64,
        })),
      })),
    });
  }

  function buildBatchSummary(rows: AnimationBatchReportRow[], reportId: string) {
    return {
      reportId,
      folderName: batchFolderName || t("lineTest.batchFolderUnknown"),
      totalImages: rows.length,
      okImages: rows.filter((row) => row.result === "OK").length,
      ngImages: rows.filter((row) => row.result === "NG").length,
      unknownImages: rows.filter((row) => row.result === "UNKNOWN").length,
      errorImages: rows.filter((row) => row.result === "ERROR").length,
    };
  }

  if (layout === "operator-test") {
    const operatorTestActionButtons = (
      <>
        <Button
          type="button"
          variant="outline"
          disabled={batchTesting}
          className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileImage className="h-5 w-5" />
          <span className="truncate">
            {selectedImageName || t("lineAnimationTest.chooseImage")}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={batchTesting}
          className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70"
          onClick={() => folderInputRef.current?.click()}
        >
          <FolderOpen className="h-5 w-5" />
          <span className="truncate">
            {batchFolderName
              ? formatMessage(t("lineTest.folderSelected"), {
                  folder: batchFolderName,
                  count: batchFiles.length,
                })
              : t("lineTest.selectFolder")}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isBusy || !selectedImageBase64}
          className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70"
          onClick={() => void runRealImageTest()}
        >
          <Camera className="h-5 w-5" />
          {testingRealImage
            ? t("lineAnimationTest.realTesting")
            : t("lineAnimationTest.runReal")}
        </Button>
        {batchTesting ? (
          <Button
            type="button"
            variant="outline"
            className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6]"
            onClick={() => {
              cancelBatchTestRef.current = true;
            }}
          >
            <Pause className="h-5 w-5" />
            {t("lineTest.stopBatchTest")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={isBusy || batchFiles.length === 0}
            className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70"
            onClick={() => void runBatchFolderTest()}
          >
            <Zap className="h-5 w-5" />
            {savingBatchReport
              ? t("lineTest.batchReportSaving")
              : t("lineAnimationTest.runFolder")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6]"
          onClick={() =>
            toast.info(
              selectedImageName
                ? selectedImageName
                : livePreviewConnected && livePreviewMatchesExpectedCamera
                  ? t("operator.cameraOn")
                  : t("operator.cameraOff"),
            )
          }
        >
          <Video className="h-5 w-5" />
          {t(`lineAnimationTest.state${animationState}`)}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={batchTesting}
          className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 hover:bg-[#8fb8e6] disabled:opacity-70"
          onClick={() => resetScenario()}
        >
          <RotateCcw className="h-5 w-5" />
          {t("operator.resetCounter")}
        </Button>
      </>
    );

    return (
      <div className="grid h-full min-w-0 min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
        <Card className="operator-line-top-card border-[#86a8cf] bg-[#cfdff2] shadow-none">
          <CardContent className="operator-line-top-content grid gap-4 p-4 min-[980px]:grid-cols-[340px_minmax(0,1fr)]">
            <div className="operator-line-product-box rounded-sm border border-[#9db7d8] bg-[#d9e6f5] p-4">
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
                    : t("operator.sourceDemo")}
                </Badge>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[#274d7d]">
                    {t("products.code")}
                  </label>
                  <Select
                    aria-label={t("products.code")}
                    value={selectedProductId}
                    disabled={loadingProducts || isBusy}
                    className="h-11 border-[#9db7d8] bg-white text-base"
                    onChange={(event) => handleProductChange(event.target.value)}
                  >
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} - {item.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[#274d7d]">
                    {t("lineAnimationTest.testImage")}
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 justify-start border-[#9db7d8] bg-white text-slate-700 hover:bg-slate-50"
                    disabled={batchTesting}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileImage className="h-4 w-4" />
                    <span className="truncate">
                      {selectedImageName || t("lineAnimationTest.chooseImage")}
                    </span>
                  </Button>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[#274d7d]">
                    {t("lineTest.selectFolder")}
                  </label>
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
                    className="h-11 justify-start border-[#9db7d8] bg-white text-slate-700 hover:bg-slate-50"
                    disabled={batchTesting}
                    onClick={() => folderInputRef.current?.click()}
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span className="truncate">
                      {batchFolderName
                        ? formatMessage(t("lineTest.folderSelected"), {
                            folder: batchFolderName,
                            count: batchFiles.length,
                          })
                        : t("lineTest.selectFolder")}
                    </span>
                  </Button>
                </div>

                {batchSummary ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                      {formatMessage(t("lineTest.batchReportId"), {
                        reportId: batchSummary.reportId,
                      })}
                    </Badge>
                    <Badge className="border-slate-200 bg-white text-slate-700">
                      {batchSummary.folderName}
                    </Badge>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="operator-line-stats-shell grid gap-3 min-[860px]:grid-cols-[minmax(0,1fr)_280px]">
              <div className="operator-line-stats-grid grid gap-3 min-[760px]:grid-cols-2">
                <OperatorMetricTile
                  label={t("operator.currentProduct")}
                  value={product.code}
                  className="operator-line-info-tile border-[#f0a53b] bg-white text-slate-950"
                />
                <OperatorMetricTile
                  label={t("operator.quantity")}
                  value={quantity}
                  className="operator-line-info-tile border-[#f0a53b] bg-white text-slate-950"
                />
                <OperatorMetricTile
                  label={t("operator.count")}
                  value={count}
                  className="operator-line-info-tile border-[#f0a53b] bg-white text-slate-950"
                />
                <OperatorMetricTile
                  label={t("operator.batch")}
                  value={batch}
                  className="operator-line-info-tile border-[#f0a53b] bg-white text-slate-950"
                />
              </div>

              <div className="operator-line-status-grid grid gap-3 min-[520px]:grid-cols-2 min-[860px]:grid-cols-1">
                <OperatorMetricTile
                  label={t("operator.ok")}
                  value={okCount}
                  className="operator-line-info-tile border-[#0f9f47] bg-[#15b455] text-white"
                  valueClassName="operator-line-okng-value text-6xl min-[860px]:text-7xl"
                />
                <OperatorMetricTile
                  label={t("operator.ng")}
                  value={ngCount}
                  className="operator-line-info-tile border-[#d92d20] bg-[#ef3e36] text-white"
                  valueClassName="operator-line-okng-value text-6xl min-[860px]:text-7xl"
                />
              </div>
            </div>

            <div className="operator-line-top-actions rounded-sm border border-[#9db7d8] bg-[#d9e6f5] p-4">
              <div className="grid gap-2">
                {operatorTestActionButtons}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="operator-line-preview-card flex min-h-0 overflow-hidden border-[#86a8cf] bg-[#9fc3eb] shadow-none">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="operator-line-preview-heading shrink-0 border-b border-[#86a8cf] px-4 py-3 text-center text-3xl font-bold text-[#2270c6]">
              {t("operator.referenceImage")}
            </div>
            <div className="operator-line-preview-body min-h-0 flex-1 p-4">
              <OperatorRoiEditor
                product={displayProduct}
                onChange={() => undefined}
                overlayResult={overlayResult}
                okCount={okCount}
                ngCount={ngCount}
                roiStatuses={roiStatuses}
                roiDetectedTextLabels={roiDetectedTextLabels}
                roiCheckingLabel={t("lineAnimationTest.checkingBand")}
                roiTextAnimationMs={inspectionResultDelayMs}
                interactive={false}
                previewImageSrc={operatorPreviewImageSrc}
                showClock
              />
            </div>
          </div>
        </Card>

        <div className="operator-line-footer-actions grid shrink-0 gap-2 min-[980px]:grid-cols-6">
          {operatorTestActionButtons}
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 pb-4">
      <Card className="border-[#86a8cf] bg-white shadow-none">
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5 text-cyan-700" />
            {t("lineAnimationTest.panelTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 min-[1080px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3">
            <div className="grid gap-3 min-[720px]:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-600">
                  {t("lineAnimationTest.sampleProduct")}
                </label>
                <Select
                  aria-label={t("lineAnimationTest.sampleProduct")}
                  value={selectedProductId}
                  disabled={loadingProducts}
                  className="h-11 border-slate-300 bg-white text-base"
                  onChange={(event) => handleProductChange(event.target.value)}
                >
                  {products.map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sample.code} - {sample.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-600">
                  {t("lineAnimationTest.testImage")}
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
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
                  className="h-11 justify-start border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  disabled={batchTesting}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileImage className="h-4 w-4" />
                  <span className="truncate">
                    {selectedImageName || t("lineAnimationTest.chooseImage")}
                  </span>
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {animationState !== "UNKNOWN" ? (
                <Badge className={stateClassName}>
                  {t(`lineAnimationTest.state${animationState}`)}
                </Badge>
              ) : null}
              <Badge
                className={
                  dataSource === "api"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }
              >
                {dataSource === "api"
                  ? t("lineAnimationTest.realProfiles")
                  : t("lineAnimationTest.sampleProfiles")}
              </Badge>
              <Badge className="border-cyan-200 bg-cyan-50 text-cyan-700">
                {runtimeSettings.ignorePlcInDev
                  ? t("lineAnimationTest.plcIgnored")
                  : t("lineAnimationTest.plcRequired")}
              </Badge>
              {animationState === "CHECKING" ? (
                <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                  {formatMessage(t("lineAnimationTest.roiResultDelay"), {
                    seconds: (inspectionResultDelayMs / 1000).toFixed(1),
                  })}
                </Badge>
              ) : null}
              {animationState === "WAITING_PLC" ? (
                <Badge className="border-cyan-200 bg-cyan-50 text-cyan-700">
                  {t("lineAnimationTest.waitingPlcDone")}
                </Badge>
              ) : null}
              {activeRoiIndexes.length > 0 ? (
                <Badge className="border-slate-200 bg-slate-50 text-slate-700">
                  {t("lineAnimationTest.currentSlots")}:{" "}
                  {activeRoiIndexes.join(", ")}
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
            </div>

            <div className="grid gap-3 sm:grid-cols-2 min-[960px]:grid-cols-5">
              <MetricTile label={t("operator.quantity")} value={quantity} />
              <MetricTile label={t("operator.count")} value={count} />
              <MetricTile label={t("operator.batch")} value={batch} />
              <MetricTile label={t("operator.ok")} value={okCount} />
              <MetricTile label={t("operator.ng")} value={ngCount} />
            </div>
          </div>

          <div className="grid gap-2">
            <Button
              type="button"
              onClick={runLineContinuously}
              disabled={isBusy}
              className="border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
            >
              <Play className="h-4 w-4" />
              {lineRunning
                ? t("lineAnimationTest.lineRunning")
                : t("lineAnimationTest.runLine")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={batchTesting || (!lineRunning && activeRoiIndexes.length === 0)}
              className="border-slate-300 text-slate-800 hover:bg-slate-50"
              onClick={finishLineSession}
            >
              <Square className="h-4 w-4" />
              {t("lineAnimationTest.finishSession")}
            </Button>
            <Button
              type="button"
              onClick={() => void runRealImageTest()}
              disabled={isBusy}
              className="border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-800"
            >
              <FileImage className="h-4 w-4" />
              {testingRealImage
                ? t("lineAnimationTest.realTesting")
                : t("lineAnimationTest.runReal")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start border-slate-300 text-slate-800 hover:bg-slate-50"
              disabled={batchTesting}
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderOpen className="h-4 w-4" />
              <span className="truncate">
                {batchFolderName
                  ? formatMessage(t("lineTest.folderSelected"), {
                      folder: batchFolderName,
                      count: batchFiles.length,
                    })
                  : t("lineTest.selectFolder")}
              </span>
            </Button>
            {batchTesting ? (
              <Button
                type="button"
                className="border-red-700 bg-red-700 text-white hover:bg-red-800"
                onClick={() => {
                  cancelBatchTestRef.current = true;
                }}
              >
                <Pause className="h-4 w-4" />
                {t("lineTest.stopBatchTest")}
              </Button>
            ) : (
              <Button
                type="button"
                className="border-[#274d7d] bg-[#274d7d] text-white hover:bg-[#1f3d64]"
                disabled={isBusy || batchFiles.length === 0}
                onClick={() => void runBatchFolderTest()}
              >
                <FolderOpen className="h-4 w-4" />
                {savingBatchReport
                  ? t("lineTest.batchReportSaving")
                  : t("lineAnimationTest.runFolder")}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={batchTesting}
              onClick={() => resetScenario()}
            >
              <RotateCcw className="h-4 w-4" />
              {t("lineAnimationTest.reset")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#86a8cf] bg-[#9fc3eb] shadow-none">
        <div className="flex flex-col">
          <div className="shrink-0 border-b border-[#86a8cf] px-4 py-3 text-center text-3xl font-bold text-[#2270c6]">
            {t("lineAnimationTest.previewTitle")}
          </div>
          <div className="p-4">
            <OperatorRoiEditor
              product={displayProduct}
              onChange={() => undefined}
              overlayResult={overlayResult}
              okCount={okCount}
              ngCount={ngCount}
              roiStatuses={roiStatuses}
              roiDetectedTextLabels={roiDetectedTextLabels}
              roiCheckingLabel={t("lineAnimationTest.checkingBand")}
              roiTextAnimationMs={inspectionResultDelayMs}
              interactive={false}
              previewImageSrc={selectedImageUrl}
              showClock
            />
          </div>
        </div>
      </Card>

      <Card className="border-[#86a8cf] bg-white shadow-none">
        <CardContent className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <FolderOpen className="h-5 w-5 text-[#274d7d]" />
              {t("lineAnimationTest.batchSummary")}
            </div>
            {batchSummary?.reportId ? (
              <Badge className="border-[#9db7d8] bg-[#edf5ff] text-[#274d7d]">
                {formatMessage(t("lineTest.batchReportId"), {
                  reportId: batchSummary.reportId,
                })}
              </Badge>
            ) : null}
            {batchSummary?.folderName ? (
              <Badge className="border-slate-200 bg-slate-50 text-slate-700">
                {batchSummary.folderName}
              </Badge>
            ) : null}
          </div>

          {batchSummary ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricTile
                label={t("lineTest.batchTotal")}
                value={batchSummary.totalImages}
              />
              <MetricTile label={t("operator.ok")} value={batchSummary.okImages} />
              <MetricTile label={t("operator.ng")} value={batchSummary.ngImages} />
              <MetricTile
                label={t("lineAnimationTest.unknown")}
                value={batchSummary.unknownImages}
              />
              <MetricTile
                label={t("lineTest.error")}
                value={batchSummary.errorImages}
              />
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500">
              {t("lineAnimationTest.batchSummaryEmpty")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

function OperatorMetricTile({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: string | number;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={["rounded-sm border-2 p-5", className].join(" ")}>
      <div className="text-sm font-semibold uppercase tracking-normal">{label}</div>
      <div
        className={[
          "mt-3 truncate text-4xl font-bold leading-none",
          valueClassName ?? "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
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

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

async function grabLineFrameBase64(accessToken: string) {
  const frame = await grabCameraFrame(accessToken);

  if (!frame.success || !frame.image_base64) {
    throw new Error("Cannot grab line frame");
  }

  const mimeType =
    frame.encode_format === ".png" || frame.encode_format === "png"
      ? "image/png"
      : "image/jpeg";

  return frame.image_base64.startsWith("data:image/")
    ? frame.image_base64
    : `data:${mimeType};base64,${frame.image_base64}`;
}

async function cropProductRois(imageBase64: string, product: ProductProfile) {
  const image = await loadImage(imageBase64);
  const rotateCanvas = document.createElement("canvas");
  const rotateContext = rotateCanvas.getContext("2d");

  if (!rotateContext) {
    throw new Error("Cannot create image crop context");
  }

  const configuredWidth = Math.max(
    1,
    product.camera.imageWidth || image.naturalWidth,
  );
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

  return product.roiRegions.map((region) => {
    const sourceCenterX = (region.x - imageMapping.offsetX) * imageMapping.scaleX;
    const sourceCenterY = (region.y - imageMapping.offsetY) * imageMapping.scaleY;
    const sourceWidth = Math.max(
      1,
      Math.round(region.width * imageMapping.scaleX),
    );
    const sourceHeight = Math.max(
      1,
      Math.round(region.height * imageMapping.scaleY),
    );
    const sourceTopLeftX = sourceCenterX - sourceWidth / 2;
    const sourceTopLeftY = sourceCenterY - sourceHeight / 2;
    const rotationSteps = product.rotateTestImageClockwise ? 1 : 0;
    const normalizedRotationSteps = ((rotationSteps % 4) + 4) % 4;
    const cropCanvas = document.createElement("canvas");
    const cropContext = cropCanvas.getContext("2d");

    if (!cropContext) {
      throw new Error("Cannot create ROI crop context");
    }

    cropCanvas.width = sourceWidth;
    cropCanvas.height = sourceHeight;
    cropContext.drawImage(image, -sourceTopLeftX, -sourceTopLeftY);

    rotateCanvas.width = sourceWidth;
    rotateCanvas.height = sourceHeight;
    rotateContext.clearRect(0, 0, rotateCanvas.width, rotateCanvas.height);
    rotateContext.save();
    rotateContext.translate(rotateCanvas.width / 2, rotateCanvas.height / 2);
    rotateContext.rotate((normalizedRotationSteps * Math.PI) / 2);
    const rotatedWidth =
      normalizedRotationSteps % 2 === 1 ? cropCanvas.height : cropCanvas.width;
    const rotatedHeight =
      normalizedRotationSteps % 2 === 1 ? cropCanvas.width : cropCanvas.height;
    const fitScale = Math.min(
      rotateCanvas.width / Math.max(1, rotatedWidth),
      rotateCanvas.height / Math.max(1, rotatedHeight),
    );
    rotateContext.scale(fitScale, fitScale);
    rotateContext.drawImage(
      cropCanvas,
      -cropCanvas.width / 2,
      -cropCanvas.height / 2,
      cropCanvas.width,
      cropCanvas.height,
    );
    rotateContext.restore();

    return {
      slotIndex: region.index,
      imageBase64: rotateCanvas.toDataURL("image/jpeg", 0.88),
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
    offsetX,
    offsetY,
    scaleX: imageWidth / displayedWidth,
    scaleY: imageHeight / displayedHeight,
  };
}
