"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  FileImage,
  Pause,
  Play,
  Package,
  RotateCcw,
  ScanLine,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { CameraConnectionOverlay } from "@/components/camera/camera-connection-overlay";
import { useConnectedCameraPreview } from "@/components/camera/use-connected-camera-preview";
import { usePlcCaptureTrigger } from "@/components/plc/use-plc-capture-trigger";
import { PlcFolderTriggerToggle } from "@/components/plc/plc-folder-trigger-toggle";
import { PlcTestOutputToggle } from "@/components/plc/plc-test-output-toggle";
import { usePlcTestOutputSession } from "@/components/plc/use-plc-test-output-session";
import {
  OperatorAiStatus,
  OperatorLiveCameraStatus,
  OperatorModeStatus,
  OperatorPlcStatus,
} from "@/components/operator/operator-live-runtime-status";
import { OperatorRuntimeActions } from "@/components/operator/operator-runtime-actions";
import {
  OperatorRoiEditor,
  type OperatorRoiStatus,
} from "@/components/operator/operator-roi-editor";
import { OperatorTestRuntimeActions } from "@/components/operator/operator-test-runtime-actions";
import { OperatorTestRuntimeStatus } from "@/components/operator/operator-test-runtime-status";
import { OperatorTestSourceControls } from "@/components/operator/operator-test-source-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  createTestSessionReport,
  getMachineRuntimeStatus,
  grabCameraFrame,
  listProductProfiles,
  testInspectionImage,
  updateMachineRuntimeControls,
  type InspectionSlotState,
  type MachineRuntimeStatus,
  type ProductProfile,
  type RoiRegion,
  type TestInspectionImageResult,
  type TestSessionImageResult,
} from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import {
  cameraFrameToDataUrl,
  cropProductRois,
  readImageFileAsDataUrl,
  type RoiCropImage,
} from "@/lib/inspection-test-image";
import { getInspectionSlotDisplayText } from "@/lib/inspection-slot-display";
import {
  getRuntimeTestSettings,
  subscribeRuntimeTestSettings,
} from "@/lib/runtime-test-settings";
import { getAccessToken, getStoredUser } from "@/lib/session";
import { useLineDisplaySettings } from "@/lib/use-line-display-settings";

type AnimationState = "UNKNOWN" | "CHECKING" | "WAITING_PLC" | "OK" | "NG";
type DataSource = "api" | "sample";
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
type LatestTestResultDetails = {
  source: "camera" | "image" | "folder";
  fileName: string;
  relativePath: string;
  productCode: string;
  expectedText: string;
  result: TestSessionImageResult;
  cycleTimeMs: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  errorMessage: string | null;
  testedAt: string;
  slots: InspectionSlotState[];
  roiImages: RoiCropImage[];
};
type PendingTestDetection = {
  id: number;
  details: LatestTestResultDetails;
  inspection: TestInspectionImageResult | null;
  regions: RoiRegion[];
};
type LineAnimationTestPanelProps = {
  layout?: "animation" | "operator-test";
};

function getInspectionSlotFingerprint(slot: InspectionSlotState | undefined) {
  if (!slot) return "missing";

  return [
    slot.result,
    slot.rawText ?? "",
    (slot.rows ?? []).join("\u001f"),
    slot.errorMessage ?? "",
  ].join("\u001e");
}

function isKnownInspectionSlot(
  slot: InspectionSlotState | undefined,
): slot is InspectionSlotState & { result: "OK" | "NG" } {
  return slot?.result === "OK" || slot?.result === "NG";
}

function getVisibleRoiIndexes(statuses: Record<number, OperatorRoiStatus>) {
  return Object.entries(statuses)
    .filter(([, value]) =>
      value === "OK" || value === "NG" || value === "CHECKING",
    )
    .map(([index]) => Number(index));
}

function resolvePendingRoiAnimationState(
  statuses: Record<number, OperatorRoiStatus>,
): AnimationState {
  const values = Object.values(statuses);

  if (values.some((value) => value === "CHECKING")) return "CHECKING";
  return values.length > 0 ? "WAITING_PLC" : "UNKNOWN";
}

const plcDoneHoldMs = 750;
const resultHoldMs = 1200;
const runtimeFrameIntervalMs = 2800;
const folderImagePresentationHoldMs = 120;
const folderAnimationSettleMs = 120;

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
  return (
    file.type.startsWith("image/") ||
    /\.(bmp|gif|jpe?g|png|tif?f|webp)$/i.test(file.name)
  );
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
  const lineTickBusyRef = useRef(false);
  const plcTriggerBusyRef = useRef(false);
  const pendingDetectionRef = useRef<PendingTestDetection | null>(null);
  const pendingDetectionSequenceRef = useRef(0);
  const animatedRoiFingerprintsRef = useRef<Record<number, string>>({});
  const animatedErrorFingerprintRef = useRef<string | null>(null);
  const testRoiStatusesRef = useRef<Record<number, OperatorRoiStatus>>({});
  const testRoiLabelsRef = useRef<Record<number, string>>({});
  const testSessionGenerationRef = useRef(0);
  const lineRunningRef = useRef(false);
  const batchTestingRef = useRef(false);
  const batchPausedRef = useRef(false);
  const batchLatchResolverRef = useRef<
    ((latched: boolean) => void) | null
  >(null);
  const folderWaitForPlcRef = useRef(true);
  const totalCountRef = useRef(0);
  const batchCountRef = useRef(0);
  const batchQuantityRef = useRef(0);
  const [products, setProducts] = useState<ProductProfile[]>(sampleProducts);
  const [selectedProductId, setSelectedProductId] = useState(
    sampleProducts[0].id,
  );
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
  const [batchPaused, setBatchPaused] = useState(false);
  const [folderWaitForPlc, setFolderWaitForPlc] = useState(true);
  const [savingBatchReport, setSavingBatchReport] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [selectedImageBase64, setSelectedImageBase64] = useState("");
  const [selectedImageName, setSelectedImageName] = useState("");
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchFolderName, setBatchFolderName] = useState("");
  const [batchSummary, setBatchSummary] =
    useState<AnimationBatchSummary | null>(null);
  const [latestTestResult, setLatestTestResult] =
    useState<LatestTestResultDetails | null>(null);
  const [latestProcessingTimeMs, setLatestProcessingTimeMs] = useState<
    number | null
  >(null);
  const [testOperationMode, setTestOperationMode] = useState<"manual" | "auto">(
    "auto",
  );
  const [testLiveCameraEnabled, setTestLiveCameraEnabled] = useState(true);
  const [testRealtimeAiEnabled, setTestRealtimeAiEnabled] = useState(true);
  const [testMachineRuntimeState, setTestMachineRuntimeState] =
    useState<MachineRuntimeStatus["state"]>("running");
  const [plcConnected, setPlcConnected] = useState(false);
  const [testControlUpdating, setTestControlUpdating] = useState(false);
  const [runtimeCapturedImageSrc, setRuntimeCapturedImageSrc] = useState("");
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [runtimeSettings, setRuntimeSettings] = useState(() =>
    getRuntimeTestSettings(),
  );
  const { showNgRecognizedText } = useLineDisplaySettings();
  const {
    emitResultPulse: emitPlcTestResultPulse,
    outputEnabled: plcTestOutputEnabled,
    outputUpdating: plcTestOutputUpdating,
    sessionReady: plcTestSessionReady,
    setOutputEnabled: setPlcTestOutputEnabled,
  } = usePlcTestOutputSession(
    layout === "operator-test" && dataSource === "api",
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
        const activeProducts = response.data.filter(
          (product) => product.active,
        );

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
      testSessionGenerationRef.current += 1;
      cancelBatchTestRef.current = true;
      batchLatchResolverRef.current?.(false);
      batchLatchResolverRef.current = null;
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
    if (!folderInput) return;

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
  const testRuntimeControlsActive = ![
    "stopping",
    "idle_machine_stop",
    "idle_capture_timeout",
    "resuming",
    "waiting_camera",
    "restart_required",
    "error",
  ].includes(testMachineRuntimeState);
  const testOperationActionsLocked = getStoredUser()?.role === "operator";
  const testRuntimeActionsDisabled = loadingProducts || dataSource !== "api";
  const {
    imageSrc: livePreviewImageSrc,
    connected: livePreviewConnected,
    connectionStatus: livePreviewConnectionStatus,
    fps: livePreviewFps,
    matchesExpectedCamera: livePreviewMatchesExpectedCamera,
    reconnect: reconnectLivePreview,
    runtimeDeviceName: livePreviewRuntimeDeviceName,
  } = useConnectedCameraPreview(
    product.camera.deviceName,
    layout === "operator-test" && dataSource === "api",
    layout === "operator-test" && dataSource === "api"
      ? product.camera
      : undefined,
    layout !== "operator-test" ||
      (testRuntimeControlsActive && testLiveCameraEnabled),
  );
  const operatorPreviewImageSrc =
    selectedImageUrl || runtimeCapturedImageSrc || livePreviewImageSrc;

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

  usePlcCaptureTrigger({
    enabled:
      layout === "operator-test" &&
      dataSource === "api" &&
      plcTestSessionReady,
    onTrigger: handlePlcCaptureTrigger,
  });

  useEffect(() => {
    if (layout !== "operator-test" || dataSource !== "api") return;

    let active = true;
    let requestRunning = false;

    async function pollMachineRuntime() {
      if (requestRunning) return;
      const accessToken = getAccessToken();
      if (!accessToken) return;

      requestRunning = true;
      try {
        const response = await getMachineRuntimeStatus(accessToken);
        if (!active) return;
        setPlcConnected(!response.data.plcOffline);
        if (response.data.idleReason !== "machine_stop") {
          setTestMachineRuntimeState(response.data.state);
          applyTestRuntimeControls(response.data);
        }
      } catch {
        if (active) setPlcConnected(false);
        // The shared application watchdog surfaces backend connectivity errors.
      } finally {
        requestRunning = false;
      }
    }

    const initialId = window.setTimeout(() => void pollMachineRuntime(), 0);
    const intervalId = window.setInterval(
      () => void pollMachineRuntime(),
      500,
    );

    return () => {
      active = false;
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, [dataSource, layout]);

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
    testSessionGenerationRef.current += 1;
    cancelBatchTestRef.current = true;
    batchPausedRef.current = false;
    setBatchPaused(false);
    batchLatchResolverRef.current?.(false);
    batchLatchResolverRef.current = null;
    pendingDetectionRef.current = null;
    animatedRoiFingerprintsRef.current = {};
    animatedErrorFingerprintRef.current = null;
    testRoiStatusesRef.current = {};
    testRoiLabelsRef.current = {};
    lineRunningRef.current = false;
    batchTestingRef.current = false;
    stopLineInterval();
    clearTimers();
    setLineRunning(false);
    setAnimationState("UNKNOWN");
    setRoiStatuses({});
    setRoiDetectedTextLabels({});
    setActiveRoiIndexes([]);
    setOkCount(0);
    setNgCount(0);
    resetProductionCounters();
    setBatchProgress(null);
    setLatestTestResult(null);
    setLatestProcessingTimeMs(null);

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

    const imageBase64 = await readImageFileAsDataUrl(file);
    resetScenario(false);
    setSelectedImageUrl(URL.createObjectURL(file));
    setSelectedImageBase64(imageBase64);
    setSelectedImageName(file.name);
    event.target.value = "";
    toast.success(t("lineTest.imageReady"));
    void prepareTestDetection({
      imageBase64,
      fileName: file.name,
      relativePath: file.name,
      source: "image",
      showLoadingToast: true,
    });
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
    const folderName =
      firstPath.split("/")[0] || t("lineTest.batchFolderUnknown");

    setBatchFiles(nextFiles);
    setBatchFolderName(folderName);
    setBatchSummary(null);
    setLatestTestResult(null);
    setBatchProgress(null);
    resetScenario(false);
    event.target.value = "";
    toast.success(
      formatMessage(t("lineTest.folderReady"), {
        count: nextFiles.length,
      }),
    );
  }

  function clearSelectedImage(showToast = true) {
    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
    }

    setSelectedImageUrl("");
    setSelectedImageBase64("");
    setSelectedImageName("");
    pendingDetectionRef.current = null;
    animatedRoiFingerprintsRef.current = {};
    animatedErrorFingerprintRef.current = null;
    testRoiStatusesRef.current = {};
    testRoiLabelsRef.current = {};
    setLatestTestResult(null);
    setLatestProcessingTimeMs(null);
    setActiveRoiIndexes([]);
    setRoiStatuses({});
    setRoiDetectedTextLabels({});
    setAnimationState("UNKNOWN");
    if (showToast) {
      toast.info(t("lineTest.imageCleared"));
    }
  }

  function useLiveCameraSource() {
    clearSelectedImage(false);
    toast.success(t("lineTest.cameraSourceSelected"));
  }

  function clearSelectedFolder() {
    cancelBatchTestRef.current = true;
    batchPausedRef.current = false;
    setBatchPaused(false);
    batchLatchResolverRef.current?.(false);
    batchLatchResolverRef.current = null;
    pendingDetectionRef.current = null;
    animatedRoiFingerprintsRef.current = {};
    animatedErrorFingerprintRef.current = null;
    testRoiStatusesRef.current = {};
    testRoiLabelsRef.current = {};
    setBatchFiles([]);
    setBatchFolderName("");
    setBatchSummary(null);
    setBatchProgress(null);
    toast.info(t("lineTest.folderCleared"));
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

    if (layout === "operator-test" && !plcTestSessionReady) {
      toast.warning(t("plcTestOutput.sessionNotReady"));
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

  function applyTestRuntimeControls(status: MachineRuntimeStatus) {
    if (status.operationMode === "manual" || status.operationMode === "auto") {
      setTestOperationMode(status.operationMode);
    }
    if (typeof status.liveCameraEnabled === "boolean") {
      setTestLiveCameraEnabled(status.liveCameraEnabled);
      if (status.liveCameraEnabled) {
        setRuntimeCapturedImageSrc("");
      }
    }
    if (typeof status.realtimeAiEnabled === "boolean") {
      setTestRealtimeAiEnabled(status.realtimeAiEnabled);
    }
  }

  async function updateTestRuntimeControls(
    controls: Partial<{
      mode: "manual" | "auto";
      liveCameraEnabled: boolean;
      realtimeAiEnabled: boolean;
    }>,
    successMessageKey: string,
  ) {
    if (testControlUpdating) return;

    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }
    if (dataSource !== "api") {
      toast.warning(t("lineAnimationTest.realProfileRequired"));
      return;
    }

    if (controls.liveCameraEnabled === false) {
      setRuntimeCapturedImageSrc(livePreviewImageSrc);
    }

    setTestControlUpdating(true);
    try {
      const response = await updateMachineRuntimeControls(
        accessToken,
        controls,
      );
      if (response.data.idleReason !== "machine_stop") {
        setTestMachineRuntimeState(response.data.state);
        applyTestRuntimeControls(response.data);
      }
      if (controls.liveCameraEnabled === true) {
        setRuntimeCapturedImageSrc("");
      }
      if (controls.realtimeAiEnabled === false) {
        clearTimers();
        pendingDetectionRef.current = null;
        setAnimationState("UNKNOWN");
        setActiveRoiIndexes([]);
        setRoiStatuses({});
        setRoiDetectedTextLabels({});
      }
      toast.success(t(successMessageKey));
    } catch (cause) {
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : t("lineAnimationTest.realTestFailed"),
      );
    } finally {
      setTestControlUpdating(false);
    }
  }

  async function runTestOperationGrab() {
    if (
      testingRealImage ||
      testOperationMode !== "manual" ||
      (testLiveCameraEnabled && !testRealtimeAiEnabled)
    ) {
      return;
    }

    if (testLiveCameraEnabled) {
      await handlePlcCaptureTrigger();
      return;
    }

    const validated = validateRealTestInputs();
    if (!validated) return;

    setTestingRealImage(true);
    if (testRealtimeAiEnabled) setAnimationState("CHECKING");

    try {
      const frameBase64 = await grabLineFrameBase64(validated.accessToken);
      clearSelectedImage(false);
      setRuntimeCapturedImageSrc(frameBase64);

      if (!testRealtimeAiEnabled) {
        toast.success(t("operator.frameCaptured"));
        return;
      }

      const pending = await detectTestImage({
        accessToken: validated.accessToken,
        fileName: t("operator.liveCamera"),
        imageBase64: frameBase64,
        relativePath: t("operator.liveCamera"),
        source: "camera",
        testProduct: validated.product,
      });
      setLatestProcessingTimeMs(pending.details.cycleTimeMs);
      pendingDetectionRef.current = pending;
      await commitPendingDetection(pending);
      pendingDetectionRef.current = null;

      if (pending.inspection) {
        toast.success(t(`lineAnimationTest.state${pending.inspection.result}`));
      } else {
        toast.error(
          pending.details.errorMessage ?? t("lineAnimationTest.realTestFailed"),
        );
      }
    } catch (cause) {
      setAnimationState("UNKNOWN");
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : t("lineAnimationTest.realTestFailed"),
      );
    } finally {
      setTestingRealImage(false);
    }
  }

  function buildAnimationResult(
    inspection: TestInspectionImageResult,
    regions: RoiRegion[],
  ) {
    const regionByIndex = new Map(
      regions.map((region) => [region.index, region]),
    );
    const animationSlots = inspection.slots.filter(
      (slot) => slot.result === "OK" || slot.result === "NG",
    );
    const animationRegions = animationSlots
      .map((slot) =>
        typeof slot.slotIndex === "number"
          ? regionByIndex.get(slot.slotIndex)
          : null,
      )
      .filter((region): region is RoiRegion => Boolean(region));
    const finalStatuses = Object.fromEntries(
      animationRegions.map((region) => {
        const slot = animationSlots.find(
          (item) => item.slotIndex === region.index,
        );
        return [region.index, slot?.result === "OK" ? "OK" : "NG"];
      }),
    ) as Record<number, OperatorRoiStatus>;
    const finalLabels = Object.fromEntries(
      animationRegions.map((region) => {
        const slot = animationSlots.find(
          (item) => item.slotIndex === region.index,
        );
        const detectedText = getInspectionSlotDisplayText(
          slot,
          inspection.productCode,
          finalStatuses[region.index],
          { showNgRecognizedText },
        );
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

    return {
      crops,
      inspection: response.data,
    };
  }

  function showDetectionWaitingForLatch(
    pending: PendingTestDetection,
    forceAnimation = true,
  ) {
    if (!pending.inspection) {
      const errorFingerprint = `ERROR:${pending.details.errorMessage ?? ""}`;
      if (
        !forceAnimation &&
        errorFingerprint === animatedErrorFingerprintRef.current
      ) {
        return false;
      }

      animatedErrorFingerprintRef.current = errorFingerprint;
      animatedRoiFingerprintsRef.current = {};
      clearTimers();
      testRoiStatusesRef.current = {};
      testRoiLabelsRef.current = {};
      setAnimationState("CHECKING");
      setActiveRoiIndexes([]);
      setRoiStatuses({});
      setRoiDetectedTextLabels({});
      const errorTimer = window.setTimeout(() => {
        setAnimationState("WAITING_PLC");
      }, inspectionResultDelayMs);
      timersRef.current.push(errorTimer);
      return true;
    }

    animatedErrorFingerprintRef.current = null;
    const inspection = pending.inspection;
    const slotByIndex = new Map(
      inspection.slots
        .filter((slot) => typeof slot.slotIndex === "number")
        .map((slot) => [slot.slotIndex as number, slot]),
    );
    const nextFingerprints: Record<number, string> = {};
    const nextStatuses = forceAnimation
      ? {}
      : { ...testRoiStatusesRef.current };
    const nextLabels = forceAnimation ? {} : { ...testRoiLabelsRef.current };
    const changedRegions = pending.regions.filter((region) => {
      const slot = slotByIndex.get(region.index);
      const fingerprint = getInspectionSlotFingerprint(slot);
      nextFingerprints[region.index] = fingerprint;
      return (
        forceAnimation ||
        animatedRoiFingerprintsRef.current[region.index] !== fingerprint
      );
    });

    animatedRoiFingerprintsRef.current = nextFingerprints;
    if (changedRegions.length === 0) return false;
    if (forceAnimation) clearTimers();

    const knownChangedRegions = changedRegions.filter((region) => {
      const slot = slotByIndex.get(region.index);

      if (!isKnownInspectionSlot(slot)) {
        delete nextStatuses[region.index];
        delete nextLabels[region.index];
        return false;
      }

      nextStatuses[region.index] = "CHECKING";
      nextLabels[region.index] = getInspectionSlotDisplayText(
        slot,
        inspection.productCode,
        slot.result,
        { showNgRecognizedText },
      );
      return true;
    });
    testRoiStatusesRef.current = nextStatuses;
    testRoiLabelsRef.current = nextLabels;

    setAnimationState(resolvePendingRoiAnimationState(nextStatuses));
    setActiveRoiIndexes(getVisibleRoiIndexes(nextStatuses));
    setRoiStatuses({ ...nextStatuses });
    setRoiDetectedTextLabels({ ...nextLabels });
    if (knownChangedRegions.length === 0) return true;

    const expectedFingerprints = { ...nextFingerprints };
    const resultTimer = window.setTimeout(() => {
      const finalStatuses = { ...testRoiStatusesRef.current };
      const finalLabels = { ...testRoiLabelsRef.current };

      knownChangedRegions.forEach((region) => {
        if (
          animatedRoiFingerprintsRef.current[region.index] !==
          expectedFingerprints[region.index]
        ) {
          return;
        }

        const slot = slotByIndex.get(region.index);
        if (slot?.result === "OK" || slot?.result === "NG") {
          finalStatuses[region.index] = slot.result;
          finalLabels[region.index] = getInspectionSlotDisplayText(
            slot,
            inspection.productCode,
            slot.result,
            { showNgRecognizedText },
          );
        } else {
          delete finalStatuses[region.index];
          delete finalLabels[region.index];
        }
      });

      testRoiStatusesRef.current = finalStatuses;
      testRoiLabelsRef.current = finalLabels;
      setActiveRoiIndexes(getVisibleRoiIndexes(finalStatuses));
      setRoiStatuses({ ...finalStatuses });
      setRoiDetectedTextLabels({ ...finalLabels });
      setAnimationState(resolvePendingRoiAnimationState(finalStatuses));
    }, inspectionResultDelayMs);
    timersRef.current.push(resultTimer);
    return true;
  }

  async function commitPendingDetection(
    pending: PendingTestDetection,
    options: { plcLatched?: boolean } = {},
  ) {
    clearTimers();
    if (options.plcLatched !== false) {
      setAnimationState("WAITING_PLC");
      await wait(plcDoneHoldMs);
    }

    if (!pending.inspection) {
      setAnimationState("NG");
      setOkCount(0);
      setNgCount(1);
      setLatestTestResult(pending.details);
      await wait(resultHoldMs);
      return;
    }

    const animation = buildAnimationResult(
      pending.inspection,
      pending.regions,
    );
    const finalCounts = countStatuses(animation.finalStatuses);
    const finalState =
      pending.inspection.result === "OK"
        ? "OK"
        : pending.inspection.result === "UNKNOWN"
          ? "UNKNOWN"
          : "NG";

    setActiveRoiIndexes(animation.regions.map((region) => region.index));
    testRoiStatusesRef.current = { ...animation.finalStatuses };
    testRoiLabelsRef.current = { ...animation.finalLabels };
    setRoiStatuses(animation.finalStatuses);
    setRoiDetectedTextLabels(animation.finalLabels);
    setAnimationState(finalState);
    setOkCount(finalCounts.ok);
    setNgCount(finalCounts.ng);
    addProductionCount(Object.keys(animation.finalStatuses).length);
    setLatestTestResult(pending.details);
    await emitPlcTestResultPulse(pending.inspection.result);
    await wait(resultHoldMs);
  }

  async function detectTestImage({
    accessToken,
    fileName,
    imageBase64,
    relativePath,
    source,
    testProduct,
  }: {
    accessToken: string;
    fileName: string;
    imageBase64: string;
    relativePath: string;
    source: LatestTestResultDetails["source"];
    testProduct: ProductProfile;
  }): Promise<PendingTestDetection> {
    const id = ++pendingDetectionSequenceRef.current;

    try {
      const { crops, inspection } = await runInspectionForImage(
        accessToken,
        imageBase64,
        testProduct,
      );
      return {
        id,
        inspection,
        regions: testProduct.roiRegions,
        details: buildLatestTestResult({
          inspection,
          roiImages: crops,
          source,
          fileName,
          relativePath,
        }),
      };
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "lineAnimationTest.realTestFailed")
          : t("lineAnimationTest.realTestFailed");
      return {
        id,
        inspection: null,
        regions: testProduct.roiRegions,
        details: buildLatestErrorResult({
          source,
          fileName,
          relativePath,
          message,
          productCode: testProduct.code,
        }),
      };
    }
  }

  async function prepareTestDetection({
    fileName,
    imageBase64,
    relativePath,
    showLoadingToast = false,
    source,
  }: {
    fileName: string;
    imageBase64: string;
    relativePath: string;
    showLoadingToast?: boolean;
    source: LatestTestResultDetails["source"];
  }) {
    const validated = validateRealTestInputs();
    if (!validated || testingRealImage) return null;
    const generation = testSessionGenerationRef.current;

    setTestingRealImage(true);
    const toastId = showLoadingToast
      ? toast.loading(t("lineAnimationTest.realTesting"))
      : undefined;
    const pending = await detectTestImage({
      accessToken: validated.accessToken,
      fileName,
      imageBase64,
      relativePath,
      source,
      testProduct: validated.product,
    });
    if (generation !== testSessionGenerationRef.current) {
      setTestingRealImage(false);
      if (toastId !== undefined) toast.dismiss(toastId);
      return null;
    }
    setLatestProcessingTimeMs(pending.details.cycleTimeMs);
    pendingDetectionRef.current = pending;
    showDetectionWaitingForLatch(pending);
    setTestingRealImage(false);

    if (pending.inspection) {
      if (toastId !== undefined) {
        toast.success(t("lineTest.plcTriggerListening"), { id: toastId });
      }
    } else {
      toast.error(
        pending.details.errorMessage ?? t("lineAnimationTest.realTestFailed"),
        { id: toastId },
      );
    }
    return pending;
  }

  function waitForBatchLatch() {
    return new Promise<boolean>((resolve) => {
      batchLatchResolverRef.current = resolve;
    });
  }

  async function waitUntilBatchResumed() {
    while (batchPausedRef.current && !cancelBatchTestRef.current) {
      await wait(50);
    }
  }

  async function waitForFolderCyclePhase(
    generation: number,
    durationMs: number,
  ) {
    const deadline = Date.now() + durationMs;

    while (Date.now() < deadline) {
      if (
        cancelBatchTestRef.current ||
        generation !== testSessionGenerationRef.current
      ) {
        return false;
      }

      await wait(Math.min(50, Math.max(1, deadline - Date.now())));
    }

    return (
      !cancelBatchTestRef.current &&
      generation === testSessionGenerationRef.current
    );
  }

  function resetFolderImagePresentation() {
    clearTimers();
    pendingDetectionRef.current = null;
    testRoiStatusesRef.current = {};
    testRoiLabelsRef.current = {};
    setAnimationState("UNKNOWN");
    setActiveRoiIndexes([]);
    setRoiStatuses({});
    setRoiDetectedTextLabels({});
  }

  function runLineContinuously() {
    const validated = validateRealTestInputs();

    if (!validated) {
      return;
    }

    stopLineInterval();
    clearTimers();
    const generation = ++testSessionGenerationRef.current;
    lineRunningRef.current = true;
    pendingDetectionRef.current = null;
    animatedRoiFingerprintsRef.current = {};
    animatedErrorFingerprintRef.current = null;
    testRoiStatusesRef.current = {};
    testRoiLabelsRef.current = {};
    setLineRunning(true);
    setLatestTestResult(null);
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
        if (generation !== testSessionGenerationRef.current) return;
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
        if (generation !== testSessionGenerationRef.current) return;
        setLatestProcessingTimeMs(response.data.cycleTimeMs);
        const pending: PendingTestDetection = {
          id: ++pendingDetectionSequenceRef.current,
          inspection: response.data,
          regions: product.roiRegions,
          details: buildLatestTestResult({
            inspection: response.data,
            roiImages: crops,
            source: selectedImageBase64 ? "image" : "camera",
            fileName: selectedImageName || t("operator.liveCamera"),
            relativePath: selectedImageName || t("operator.liveCamera"),
          }),
        };
        pendingDetectionRef.current = pending;
        if (!plcTriggerBusyRef.current) {
          showDetectionWaitingForLatch(pending, false);
        }
      } catch (cause) {
        if (generation !== testSessionGenerationRef.current) return;
        setLatestProcessingTimeMs(null);
        const message =
          cause instanceof ApiError
            ? apiError(cause.message, "lineAnimationTest.realTestFailed")
            : t("lineAnimationTest.realTestFailed");
        const pending: PendingTestDetection = {
          id: ++pendingDetectionSequenceRef.current,
          inspection: null,
          regions: product.roiRegions,
          details: buildLatestErrorResult({
            source: selectedImageBase64 ? "image" : "camera",
            fileName: selectedImageName || t("operator.liveCamera"),
            relativePath: selectedImageName || t("operator.liveCamera"),
            message,
            productCode: product.code,
          }),
        };
        pendingDetectionRef.current = pending;
        if (!plcTriggerBusyRef.current) {
          showDetectionWaitingForLatch(pending, false);
        }
        toast.error(message);
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
    testSessionGenerationRef.current += 1;
    lineRunningRef.current = false;
    stopLineInterval();
    clearTimers();
    setLineRunning(false);
    toast.success(t("lineAnimationTest.lineFinished"));
  }

  async function handlePlcCaptureTrigger() {
    if (plcTriggerBusyRef.current) {
      toast.warning(t("lineTest.plcTriggerBusy"));
      return;
    }

    if (batchTestingRef.current) {
      if (!folderWaitForPlcRef.current) {
        return;
      }

      if (
        batchPausedRef.current ||
        !pendingDetectionRef.current ||
        !batchLatchResolverRef.current
      ) {
        toast.warning(t("lineTest.plcTriggerBusy"));
        return;
      }
      const resolveLatch = batchLatchResolverRef.current;
      batchLatchResolverRef.current = null;
      resolveLatch(true);
      return;
    }

    const pending = pendingDetectionRef.current;
    if (!pending) {
      toast.warning(t("lineTest.noPendingDetection"));
      return;
    }

    plcTriggerBusyRef.current = true;
    try {
      await commitPendingDetection(pending);
      if (!lineRunningRef.current && pendingDetectionRef.current?.id === pending.id) {
        pendingDetectionRef.current = null;
      }
      toast.success(t("lineTest.plcLatchCommitted"));
    } finally {
      plcTriggerBusyRef.current = false;
      const latestPending = pendingDetectionRef.current;
      if (
        lineRunningRef.current &&
        latestPending &&
        latestPending.id !== pending.id
      ) {
        const animated = showDetectionWaitingForLatch(latestPending, false);
        if (!animated) setAnimationState("WAITING_PLC");
      } else if (lineRunningRef.current) {
        setAnimationState("WAITING_PLC");
      }
    }
  }

  async function runRealImageTest() {
    const validated = validateRealTestInputs();

    if (!validated) {
      return;
    }

    setTestingRealImage(true);
    const generation = testSessionGenerationRef.current;
    const toastId = toast.loading(t("lineAnimationTest.realTesting"));

    try {
      const imageToTestBase64 = selectedImageBase64
        ? selectedImageBase64
        : await grabLineFrameBase64(validated.accessToken);
      const testFileName = selectedImageName || t("operator.liveCamera");
      const pending = await detectTestImage({
        accessToken: validated.accessToken,
        fileName: testFileName,
        imageBase64: imageToTestBase64,
        relativePath: testFileName,
        source: selectedImageBase64 ? "image" : "camera",
        testProduct: validated.product,
      });
      if (generation !== testSessionGenerationRef.current) {
        toast.dismiss(toastId);
        return;
      }
      setLatestProcessingTimeMs(pending.details.cycleTimeMs);
      pendingDetectionRef.current = pending;
      showDetectionWaitingForLatch(pending);
      if (pending.inspection) {
        toast.success(t("lineTest.plcTriggerListening"), { id: toastId });
      } else {
        toast.error(
          pending.details.errorMessage ?? t("lineAnimationTest.realTestFailed"),
          { id: toastId },
        );
      }
    } finally {
      setTestingRealImage(false);
    }
  }

  function toggleBatchPause() {
    const paused = !batchPausedRef.current;
    batchPausedRef.current = paused;
    setBatchPaused(paused);
    toast.info(
      paused
        ? t("lineTest.batchPaused")
        : t("lineTest.batchResumed"),
    );
  }

  function stopBatchTest() {
    testSessionGenerationRef.current += 1;
    cancelBatchTestRef.current = true;
    batchPausedRef.current = false;
    setBatchPaused(false);
    batchLatchResolverRef.current?.(false);
    batchLatchResolverRef.current = null;
    toast.info(t("lineAnimationTest.batchCancelled"));
  }

  function updateFolderPlcTrigger(enabled: boolean) {
    folderWaitForPlcRef.current = enabled;
    setFolderWaitForPlc(enabled);
    toast.success(
      t(
        enabled
          ? "lineTest.folderPlcTriggerEnabledNotice"
          : "lineTest.folderPlcTriggerDisabledNotice",
      ),
    );
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
    const generation = ++testSessionGenerationRef.current;
    lineRunningRef.current = false;
    batchTestingRef.current = true;
    pendingDetectionRef.current = null;
    setLineRunning(false);
    setBatchTesting(true);
    batchPausedRef.current = false;
    setBatchPaused(false);
    setBatchSummary(null);
    setLatestTestResult(null);
    setBatchProgress(null);
    resetProductionCounters();
    cancelBatchTestRef.current = false;
    const toastId = toast.loading(t("lineAnimationTest.batchTesting"));

    try {
      const rows: AnimationBatchReportRow[] = [];

      for (const [index, file] of batchFiles.entries()) {
        await waitUntilBatchResumed();
        if (cancelBatchTestRef.current) {
          break;
        }

        resetFolderImagePresentation();
        setBatchProgress({
          current: index + 1,
          total: batchFiles.length,
          fileName: file.name,
        });

        const imageUrl = URL.createObjectURL(file);
        setSelectedImageUrl(imageUrl);
        setSelectedImageName(file.name);
        const currentImageBase64 = await readImageFileAsDataUrl(file);
        setSelectedImageBase64(currentImageBase64);
        if (
          !(await waitForFolderCyclePhase(
            generation,
            folderImagePresentationHoldMs,
          ))
        ) {
          break;
        }
        const relativePath = file.webkitRelativePath || file.name;
        const pending = await detectTestImage({
          accessToken: validated.accessToken,
          fileName: file.name,
          imageBase64: currentImageBase64,
          relativePath,
          source: "folder",
          testProduct: validated.product,
        });
        if (generation !== testSessionGenerationRef.current) {
          break;
        }
        setLatestProcessingTimeMs(pending.details.cycleTimeMs);
        const reportImageBase64 = await compressImageForReport(
          currentImageBase64,
        ).catch(() => "");
        pendingDetectionRef.current = pending;
        showDetectionWaitingForLatch(pending);

        if (cancelBatchTestRef.current) {
          break;
        }

        const animationCompleted = waitForFolderCyclePhase(
          generation,
          inspectionResultDelayMs + folderAnimationSettleMs,
        );

        if (folderWaitForPlcRef.current) {
          const [latched, animationFinished] = await Promise.all([
            waitForBatchLatch(),
            animationCompleted,
          ]);
          if (
            !latched ||
            !animationFinished ||
            cancelBatchTestRef.current
          ) {
            break;
          }
        } else if (!(await animationCompleted)) {
          break;
        }

        await commitPendingDetection(pending, {
          plcLatched: folderWaitForPlcRef.current,
        });
        if (pending.inspection) {
          rows.push({
            fileName: file.name,
            relativePath,
            result: pending.inspection.result,
            cycleTimeMs: pending.inspection.cycleTimeMs,
            errorMessage: pending.inspection.error,
            originalImageBase64: reportImageBase64,
            slots: pending.inspection.slots,
          });
        } else {
          rows.push({
            fileName: file.name,
            relativePath,
            result: "ERROR",
            cycleTimeMs: null,
            errorMessage: pending.details.errorMessage,
            originalImageBase64: reportImageBase64,
            slots: [],
          });
        }
        if (pendingDetectionRef.current?.id === pending.id) {
          pendingDetectionRef.current = null;
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
      batchLatchResolverRef.current = null;
      pendingDetectionRef.current = null;
      batchPausedRef.current = false;
      batchTestingRef.current = false;
      setBatchTesting(false);
      setBatchPaused(false);
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
          rows: slot.rows ?? [],
          result: slot.result,
          errorMessage: slot.errorMessage,
          toolDebugImageBase64: slot.toolDebugImageBase64,
        })),
      })),
    });
  }

  function buildBatchSummary(
    rows: AnimationBatchReportRow[],
    reportId: string,
  ) {
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

  function buildLatestTestResult({
    fileName,
    inspection,
    relativePath,
    roiImages,
    source,
  }: {
    fileName: string;
    inspection: TestInspectionImageResult;
    relativePath: string;
    roiImages: RoiCropImage[];
    source: LatestTestResultDetails["source"];
  }): LatestTestResultDetails {
    return {
      source,
      fileName,
      relativePath,
      productCode: inspection.productCode,
      expectedText: inspection.expectedText,
      result: inspection.result,
      cycleTimeMs: inspection.cycleTimeMs,
      imageWidth: inspection.imageWidth,
      imageHeight: inspection.imageHeight,
      errorMessage: inspection.error,
      testedAt: new Date().toISOString(),
      slots: inspection.slots,
      roiImages,
    };
  }

  function buildLatestErrorResult({
    fileName,
    message,
    productCode,
    relativePath,
    source,
  }: {
    fileName: string;
    message: string;
    productCode: string;
    relativePath: string;
    source: LatestTestResultDetails["source"];
  }): LatestTestResultDetails {
    return {
      source,
      fileName,
      relativePath,
      productCode,
      expectedText: "",
      result: "ERROR",
      cycleTimeMs: null,
      imageWidth: null,
      imageHeight: null,
      errorMessage: message,
      testedAt: new Date().toISOString(),
      slots: [],
      roiImages: [],
    };
  }

  if (layout === "operator-test") {
    const operatorRuntimeActionButtons = (
      <OperatorRuntimeActions
        actionsLocked={testOperationActionsLocked}
        controlsDisabled={testRuntimeActionsDisabled}
        controlUpdating={testControlUpdating}
        liveCameraEnabled={testLiveCameraEnabled}
        operationMode={testOperationMode}
        realtimeAiEnabled={testRealtimeAiEnabled}
        runtimeControlsActive={testRuntimeControlsActive}
        scanRunning={testingRealImage}
        onGrab={() => void runTestOperationGrab()}
        onLiveCameraToggle={() =>
          void updateTestRuntimeControls(
            { liveCameraEnabled: !testLiveCameraEnabled },
            testLiveCameraEnabled
              ? "operator.liveDisabled"
              : "operator.liveEnabled",
          )
        }
        onRealtimeAiToggle={() =>
          void updateTestRuntimeControls(
            { realtimeAiEnabled: !testRealtimeAiEnabled },
            testRealtimeAiEnabled
              ? "operator.aiDisabled"
              : "operator.aiEnabled",
          )
        }
        onModeChange={(mode) => {
          if (mode === testOperationMode) return;
          void updateTestRuntimeControls(
            { mode },
            mode === "auto"
              ? "operator.autoEnabled"
              : "operator.manualEnabled",
          );
        }}
        onResetCounter={() => resetScenario()}
      />
    );
    const operatorTestActionButtons = (
      <OperatorTestRuntimeActions
        animationState={animationState}
        batchPaused={batchPaused}
        batchTesting={batchTesting}
        canRunFolder={batchFiles.length > 0}
        lineRunning={lineRunning}
        savingBatchReport={savingBatchReport}
        testingRealImage={testingRealImage}
        onReset={() => resetScenario()}
        onRunFolder={() => void runBatchFolderTest()}
        onRunOnce={() => void runRealImageTest()}
        onShowState={() =>
          toast.info(
            selectedImageName
              ? selectedImageName
              : livePreviewConnected && livePreviewMatchesExpectedCamera
                ? t("operator.cameraOn")
                : t("operator.cameraOff"),
          )
        }
        onStopBatch={stopBatchTest}
        onToggleBatchPause={toggleBatchPause}
        onToggleContinuous={
          lineRunning ? finishLineSession : runLineContinuously
        }
      />
    );

    return (
      <div className="grid min-w-0 gap-4 pb-4">
        <div className="operator-test-runtime grid min-w-0 gap-3">
          <Card className="operator-line-top-card border-[#86a8cf] bg-[#cfdff2] shadow-none">
            <CardContent className="operator-line-top-content grid gap-4 p-4 min-[980px]:grid-cols-[340px_minmax(0,1fr)]">
              <div className="operator-line-product-box rounded-sm border border-[#9db7d8] bg-[#d9e6f5] p-4">
                <div className="operator-line-product-header mb-3 flex items-center justify-between gap-3">
                  <CardTitle className="operator-line-product-title flex items-center gap-2 text-xl font-bold text-slate-950">
                    <Package className="h-5 w-5 text-[#274d7d]" />
                    {t("operator.productToday")}
                  </CardTitle>
                </div>

                <div className="operator-line-product-form grid gap-3">
                  <div className="operator-line-product-field grid gap-2">
                    <label className="text-sm font-semibold text-[#274d7d]">
                      {t("products.code")}
                    </label>
                    <Select
                      aria-label={t("products.code")}
                      value={selectedProductId}
                      portalled
                      disabled={loadingProducts || isBusy}
                      className="operator-line-form-control h-11 border-[#9db7d8] bg-white text-base"
                      onChange={(event) =>
                        handleProductChange(event.target.value)
                      }
                    >
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="border border-[#9db7d8] bg-white px-3 py-2">
                      <div className="text-xs font-semibold text-[#274d7d]">
                        {t("lineTest.currentSource")}
                      </div>
                      <div className="mt-1 truncate text-sm font-bold text-slate-950">
                        {selectedImageName
                          ? t("lineTest.sourceImage")
                          : t("lineTest.sourceCamera")}
                      </div>
                    </div>
                    <div className="border border-[#9db7d8] bg-white px-3 py-2">
                      <div className="text-xs font-semibold text-[#274d7d]">
                        {t("lineTest.configuredRois")}
                      </div>
                      <div className="mt-1 text-sm font-bold tabular-nums text-slate-950">
                        {product.roiRegions.length}
                      </div>
                    </div>
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
                  cameraDisplayName={
                    livePreviewRuntimeDeviceName || product.camera.deviceName
                  }
                  showClock
                  clockLeadingContent={
                    <div className="flex items-center gap-2">
                      <OperatorTestRuntimeStatus
                        active={
                          testRuntimeControlsActive &&
                          testLiveCameraEnabled &&
                          livePreviewConnected &&
                          livePreviewMatchesExpectedCamera
                        }
                        label={t("camera.liveFps")}
                        value={`${livePreviewFps.toFixed(1)} FPS`}
                      />
                      <OperatorModeStatus
                        active={testRuntimeControlsActive}
                        operationMode={testOperationMode}
                      />
                    </div>
                  }
                  clockTrailingContent={
                    <div className="flex items-center gap-2">
                      <OperatorAiStatus
                        realtimeAiEnabled={
                          testRuntimeControlsActive && testRealtimeAiEnabled
                        }
                      />
                      <OperatorTestRuntimeStatus
                        active={latestProcessingTimeMs !== null}
                        label={t("lineTest.processingTime")}
                        value={
                          latestProcessingTimeMs === null
                            ? "-"
                            : `${Math.round(latestProcessingTimeMs)} ms`
                        }
                      />
                    </div>
                  }
                  footerLeadingContent={
                    <OperatorPlcStatus connected={plcConnected} />
                  }
                  footerTrailingContent={
                    <OperatorLiveCameraStatus
                      liveCameraEnabled={
                        testRuntimeControlsActive &&
                        testLiveCameraEnabled &&
                        livePreviewConnected &&
                        livePreviewMatchesExpectedCamera
                      }
                    />
                  }
                  connectionOverlay={
                    dataSource === "api" && !selectedImageUrl ? (
                      <CameraConnectionOverlay
                        status={livePreviewConnectionStatus}
                        deviceName={
                          livePreviewRuntimeDeviceName || product.camera.deviceName
                        }
                        onReconnect={reconnectLivePreview}
                      />
                    ) : undefined
                  }
                />
              </div>
            </div>
          </Card>

          <div className="operator-test-operation-actions grid shrink-0 gap-2">
            {operatorRuntimeActionButtons}
          </div>

          <OperatorTestSourceControls
            batchDisabled={batchTesting}
            folderCount={batchFiles.length}
            folderName={batchFolderName}
            imageDisabled={isBusy}
            imageName={selectedImageName}
            onClearFolder={clearSelectedFolder}
            onClearImage={() => clearSelectedImage()}
            onFolderChange={handleFolderChange}
            onImageChange={handleImageChange}
            onUseCamera={useLiveCameraSource}
          />

          <div className="grid gap-2 border border-[#9db7d8] bg-[#d9e6f5] p-2 min-[980px]:grid-cols-2">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <PlcTestOutputToggle
                disabled={!plcTestSessionReady || plcTestOutputUpdating || isBusy}
                enabled={plcTestOutputEnabled}
                onChange={setPlcTestOutputEnabled}
              />
              <span className="min-w-0 flex-1 text-xs font-medium text-[#274d7d]">
                {t(
                  plcTestOutputEnabled
                    ? "plcTestOutput.hintEnabled"
                    : "plcTestOutput.hintDisabled",
                )}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <PlcFolderTriggerToggle
                disabled={isBusy}
                enabled={folderWaitForPlc}
                onChange={updateFolderPlcTrigger}
              />
              <span className="min-w-0 flex-1 text-xs font-medium text-[#274d7d]">
                {t(
                  folderWaitForPlc
                    ? "lineTest.folderPlcTriggerHintEnabled"
                    : "lineTest.folderPlcTriggerHintDisabled",
                )}
              </span>
            </div>
          </div>

          <div className="operator-test-action-row grid shrink-0 gap-2">
            {operatorTestActionButtons}
          </div>
        </div>

        <LatestTestResultCard result={latestTestResult} t={t} />
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
                  portalled
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
                  disabled={isBusy}
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
                  ? t("lineAnimationTest.plcOptional")
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
              disabled={
                batchTesting || (!lineRunning && activeRoiIndexes.length === 0)
              }
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
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={toggleBatchPause}
                >
                  {batchPaused ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                  {batchPaused
                    ? t("lineTest.resumeBatchTest")
                    : t("lineTest.pauseBatchTest")}
                </Button>
                <Button
                  type="button"
                  className="border-red-700 bg-red-700 text-white hover:bg-red-800"
                  onClick={stopBatchTest}
                >
                  <Square className="h-4 w-4" />
                  {t("lineTest.stopBatchTest")}
                </Button>
              </>
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
              <MetricTile
                label={t("operator.ok")}
                value={batchSummary.okImages}
              />
              <MetricTile
                label={t("operator.ng")}
                value={batchSummary.ngImages}
              />
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

      <LatestTestResultCard result={latestTestResult} t={t} />
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold uppercase text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

function LatestTestResultCard({
  result,
  t,
}: {
  result: LatestTestResultDetails | null;
  t: (key: string) => string;
}) {
  const roiImageBySlot = new Map(
    (result?.roiImages ?? []).map((image) => [
      image.slotIndex,
      image.imageBase64,
    ]),
  );
  const visibleSlots = result?.slots ?? [];

  return (
    <Card className="border-[#86a8cf] bg-white shadow-none">
      <CardContent className="grid gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-lg font-bold text-slate-950">
            <FileImage className="h-5 w-5 text-[#274d7d]" />
            {t("lineTest.latestResultDetails")}
          </div>
          {result ? (
            <div className="flex flex-wrap gap-2">
              <Badge className={getResultBadgeClass(result.result)}>
                {result.result}
              </Badge>
              <Badge className="border-slate-200 bg-slate-50 text-slate-700">
                {result.source === "folder"
                  ? t("lineTest.sourceFolder")
                  : result.source === "camera"
                    ? t("lineTest.sourceCamera")
                    : t("lineTest.sourceImage")}
              </Badge>
            </div>
          ) : null}
        </div>

        {result ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetailTile
                label={t("lineTest.batchImage")}
                value={result.fileName}
              />
              <DetailTile
                label={t("operator.currentProduct")}
                value={result.productCode}
              />
              <DetailTile
                label={t("lineTest.cycleTime")}
                value={
                  result.cycleTimeMs == null
                    ? "-"
                    : `${Math.round(result.cycleTimeMs)} ms`
                }
              />
              <DetailTile
                label={t("lineTest.imageSize")}
                value={
                  result.imageWidth && result.imageHeight
                    ? `${result.imageWidth} x ${result.imageHeight}`
                    : "-"
                }
              />
            </div>

            <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div className="border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-950">
                  {t("lineTest.relativePath")}:
                </span>{" "}
                {result.relativePath || "-"}
              </div>
              <div className="border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-950">
                  {t("lineTest.testedAt")}:
                </span>{" "}
                {formatDateTime(result.testedAt)}
              </div>
              <div className="border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-950">
                  {t("dashboard.expectedText")}:
                </span>{" "}
                {result.expectedText || "-"}
              </div>
              <div className="border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-950">
                  {t("lineTest.error")}:
                </span>{" "}
                {result.errorMessage || "-"}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {visibleSlots.length > 0 ? (
                visibleSlots.map((slot, index) => {
                  const slotIndex =
                    typeof slot.slotIndex === "number" ? slot.slotIndex : null;
                  const roiImage =
                    slotIndex == null
                      ? ""
                      : (roiImageBySlot.get(slotIndex) ?? "");

                  return (
                    <div
                      key={`roi-image-${slot.slotIndex ?? "unknown"}-${index}`}
                      className="border border-slate-200 bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
                        <div className="truncate text-sm font-bold text-slate-950">
                          {slot.slotLabel ??
                            `${t("lineTest.roiSlot")} ${slot.slotIndex ?? "-"}`}
                        </div>
                        <Badge className={getResultBadgeClass(slot.result)}>
                          {slot.result}
                        </Badge>
                      </div>
                      <div className="flex aspect-[4/3] items-center justify-center bg-slate-950 p-2">
                        {roiImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={`${t("lineTest.roiCropImage")} ${
                              slot.slotIndex ?? index + 1
                            }`}
                            className="max-h-full max-w-full object-contain"
                            src={roiImage}
                          />
                        ) : (
                          <div className="text-xs font-medium text-slate-400">
                            {t("lineTest.noRoiCropImage")}
                          </div>
                        )}
                      </div>
                      <div className="grid gap-1 px-3 py-2 text-xs text-slate-700">
                        <div>
                          <span className="font-semibold text-slate-950">
                            {t("dashboard.expectedText")}:
                          </span>{" "}
                          {slot.expectedText || "-"}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-950">
                            {t("dashboard.rawText")}:
                          </span>{" "}
                          {slot.rawText || "-"}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-950">
                            {t("lineTest.error")}:
                          </span>{" "}
                          {slot.errorMessage || "-"}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500 sm:col-span-2 xl:col-span-5">
                  {t("lineTest.emptyResult")}
                </div>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200">
              <table className="min-w-[760px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("lineTest.roiSlot")}
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("lineTest.result")}
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("dashboard.expectedText")}
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("dashboard.rawText")}
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      {t("lineTest.error")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSlots.length > 0 ? (
                    visibleSlots.map((slot, index) => (
                      <tr
                        key={`${slot.slotIndex ?? "unknown"}-${index}`}
                        className="odd:bg-white even:bg-slate-50"
                      >
                        <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-950">
                          {slot.slotLabel ??
                            `${t("lineTest.roiSlot")} ${slot.slotIndex ?? "-"}`}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          <Badge className={getResultBadgeClass(slot.result)}>
                            {slot.result}
                          </Badge>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-slate-700">
                          {slot.expectedText || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-slate-700">
                          {slot.rawText || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-slate-700">
                          {slot.errorMessage || "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-3 py-6 text-center text-slate-500"
                        colSpan={5}
                      >
                        {t("lineTest.emptyResult")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="border border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-500">
            {t("lineTest.emptyResult")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase text-slate-500">
        {label}
      </div>
      <div className="mt-2 truncate text-lg font-bold text-slate-950">
        {value || "-"}
      </div>
    </div>
  );
}

function getResultBadgeClass(result: string) {
  if (result === "OK") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (result === "NG" || result === "ERROR") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
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
      <div className="text-sm font-semibold uppercase tracking-normal">
        {label}
      </div>
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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return date.toLocaleString("vi-VN", {
    hour12: false,
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

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load selected image"));
    image.src = src;
  });
}

async function grabLineFrameBase64(accessToken: string) {
  const frame = await grabCameraFrame(accessToken);

  if (!frame.success || !frame.image_base64) {
    throw new Error("Cannot grab line frame");
  }

  return cameraFrameToDataUrl(frame);
}
