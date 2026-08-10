"use client";

import { Minus, Package, Plus, Save } from "lucide-react";
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { CameraConnectionOverlay } from "@/components/camera/camera-connection-overlay";
import { useConnectedCameraPreview } from "@/components/camera/use-connected-camera-preview";
import {
  OperatorRoiEditor,
  type OperatorRoiStatus,
} from "@/components/operator/operator-roi-editor";
import { OperatorRuntimeActions } from "@/components/operator/operator-runtime-actions";
import {
  OperatorAiStatus,
  OperatorLiveCameraStatus,
  OperatorModeStatus,
  OperatorPlcStatus,
} from "@/components/operator/operator-live-runtime-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  beginInspectionSession,
  getCurrentInspection,
  getMachineRuntimeFrame,
  getMachineRuntimeStatus,
  grabMachineFrame,
  listProductProfiles,
  startMachineOperation,
  stopMachineOperation,
  stopInspection,
  type CurrentInspectionState,
  type InspectionSlotState,
  type LineSessionEndReason,
  type MachineRuntimeStatus,
  type ProductProfile,
  type RoiRegion,
  updateProductBatchSize,
  updateMachineRuntimeControls,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getInspectionSlotDisplayText } from "@/lib/inspection-slot-display";
import {
  saveOperatorStartupPreferences,
  selectOperatorStartupProduct,
} from "@/lib/operator-startup-preferences";
import {
  getRuntimeTestSettings,
  subscribeRuntimeTestSettings,
} from "@/lib/runtime-test-settings";
import { getAccessToken, getStoredUser } from "@/lib/session";
import { useLineDisplaySettings } from "@/lib/use-line-display-settings";

type DataSource = "api" | "demo";
type AnimationState = "UNKNOWN" | "CHECKING" | "WAITING_PLC" | "OK" | "NG";

const plcDoneHoldMs = 750;
const resultHoldMs = 1200;

const demoProducts: ProductProfile[] = [
  {
    id: "demo-sl-37",
    code: "SL-37",
    name: "Metalcore SL-37",
    defaultNumber: 150,
    batchSize: 150,
    exposure: 1200,
    thresholdAccept: 85,
    thresholdMns: 70,
    rowThreshold: 20,
    ocrAcceptedVariants: [],
    modelPath: "models/sl-37.onnx",
    rotateTestImageClockwise: true,
    active: true,
    camera: {
      sourceType: "demo",
      deviceName: "demo-camera",
      exposure: 1200,
      imageWidth: 1500,
      imageHeight: 500,
      offsetX: 0,
      offsetY: 0,
      zoomFactor: 1,
      previewPanX: 0,
      previewPanY: 0,
      previewRotation: 0,
    },
    roiRegions: [
      { index: 1, x: 283, y: 237, width: 105, height: 161, rotation: 0 },
      { index: 2, x: 525, y: 237, width: 105, height: 161, rotation: 0 },
      { index: 3, x: 759, y: 237, width: 105, height: 161, rotation: 0 },
      { index: 4, x: 1001, y: 237, width: 105, height: 161, rotation: 0 },
      { index: 5, x: 1229, y: 235, width: 105, height: 161, rotation: 0 },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toCameraImageSource(imageBase64: string) {
  return imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;
}

function getSlotFingerprint(slot: InspectionSlotState | undefined) {
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

function resolveLiveRoiAnimationState(
  statuses: Record<number, OperatorRoiStatus>,
): AnimationState {
  const values = Object.values(statuses);

  if (values.some((value) => value === "CHECKING")) return "CHECKING";
  return values.length > 0 ? "WAITING_PLC" : "UNKNOWN";
}

export function OperatorRuntimePanel() {
  const { apiError, t } = useI18n();
  const operatorActionButtonsLocked = getStoredUser()?.role === "operator";
  const timersRef = useRef<number[]>([]);
  const batchEditorRef = useRef<HTMLDivElement | null>(null);
  const currentJobIdRef = useRef("");
  const autoRunRef = useRef(false);
  const scanRunningRef = useRef(false);
  const lastPlcInspectionSequenceRef = useRef(0);
  const lastLiveInspectionSequenceRef = useRef(0);
  const lastCameraFrameSequenceRef = useRef(0);
  const runtimeDefaultsAppliedRef = useRef(false);
  const operationStartupProductRef = useRef("");
  const liveRoiFingerprintsRef = useRef<Record<number, string>>({});
  const liveRoiStatusesRef = useRef<Record<number, OperatorRoiStatus>>({});
  const liveRoiLabelsRef = useRef<Record<number, string>>({});
  const liveRoiAnimationDeadlineRef = useRef(0);
  const plcInspectionHandlerRef = useRef<
    (status: MachineRuntimeStatus) => Promise<void>
  >(async () => undefined);
  const liveInspectionHandlerRef = useRef<
    (status: MachineRuntimeStatus) => void
  >(() => undefined);
  const [products, setProducts] = useState<ProductProfile[]>(demoProducts);
  const [selectedProductId, setSelectedProductId] = useState(
    demoProducts[0].id,
  );
  const [dataSource, setDataSource] = useState<DataSource>("demo");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [okCount, setOkCount] = useState(0);
  const [ngCount, setNgCount] = useState(0);
  const [batchCount, setBatchCount] = useState(0);
  const [batchQuantity, setBatchQuantity] = useState(0);
  const [scanCount, setScanCount] = useState(0);
  const [batchSize, setBatchSize] = useState(demoProducts[0].defaultNumber);
  const [batchDraft, setBatchDraft] = useState(
    String(demoProducts[0].batchSize),
  );
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [changingProduct, setChangingProduct] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [machineRuntimeState, setMachineRuntimeState] =
    useState<MachineRuntimeStatus["state"]>("inactive");
  const [machineIdleReason, setMachineIdleReason] =
    useState<MachineRuntimeStatus["idleReason"]>(null);
  const [machineStopCountdownSeconds, setMachineStopCountdownSeconds] =
    useState<number | null>(null);
  const [plcConnected, setPlcConnected] = useState(false);
  const [operationMode, setOperationMode] = useState<"manual" | "auto">(
    "auto",
  );
  const [liveCameraEnabled, setLiveCameraEnabled] = useState(true);
  const [realtimeAiEnabled, setRealtimeAiEnabled] = useState(true);
  const [controlUpdating, setControlUpdating] = useState(false);
  const [capturedPreviewImageSrc, setCapturedPreviewImageSrc] = useState("");
  const [animationState, setAnimationState] =
    useState<AnimationState>("UNKNOWN");
  const [activeRoiIndexes, setActiveRoiIndexes] = useState<number[]>([]);
  const [roiStatuses, setRoiStatuses] = useState<
    Record<number, OperatorRoiStatus>
  >({});
  const [roiDetectedTextLabels, setRoiDetectedTextLabels] = useState<
    Record<number, string>
  >({});
  const [runtimeSettings, setRuntimeSettings] = useState(() =>
    getRuntimeTestSettings(),
  );
  const { showNgRecognizedText } = useLineDisplaySettings();

  const runtimeControlsActive = ![
    "stopping",
    "idle_machine_stop",
    "idle_capture_timeout",
    "resuming",
    "waiting_camera",
    "restart_required",
    "error",
  ].includes(machineRuntimeState);
  const effectiveLiveCameraEnabled =
    runtimeControlsActive && liveCameraEnabled;
  const effectiveRealtimeAiEnabled =
    runtimeControlsActive && realtimeAiEnabled;
  const cameraRecoveryInProgress = [
    "resuming",
    "waiting_camera",
    "restart_required",
    "error",
  ].includes(machineRuntimeState);
  const previewStreamEnabled =
    liveCameraEnabled &&
    !["stopping", "idle_machine_stop", "idle_capture_timeout"].includes(
      machineRuntimeState,
    );
  const machineStopActive =
    machineIdleReason === "machine_stop" &&
    ["stopping", "idle_machine_stop"].includes(machineRuntimeState);

  useEffect(() => {
    if (!keypadOpen) {
      return;
    }

    function handleOutsidePointerDown(event: PointerEvent) {
      if (!batchEditorRef.current?.contains(event.target as Node)) {
        setKeypadOpen(false);
      }
    }

    window.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [keypadOpen]);

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
        const currentInspection = await getCurrentInspection(accessToken)
          .then((currentResponse) => currentResponse.data)
          .catch(() => null);

        if (!cancelled && activeProducts.length > 0) {
          const runningProduct = currentInspection
            ? activeProducts.find(
                (product) => product.id === currentInspection.productId,
              )
            : null;
          const startupProduct =
            runningProduct ??
            selectOperatorStartupProduct(activeProducts) ??
            activeProducts[0];

          setProducts(activeProducts);
          setSelectedProductId(startupProduct.id);
          if (currentInspection && runningProduct) {
            currentJobIdRef.current = currentInspection.jobId;
            setBatchSize(currentInspection.batchSize || 1);
            setBatchDraft(String(currentInspection.batchSize || 1));
            setBatchQuantity(currentInspection.quantity);
            setScanCount(currentInspection.count);
            setBatchCount(currentInspection.batch);
            setOkCount(currentInspection.okCount);
            setNgCount(currentInspection.ngCount);
          } else {
            setBatchSize(startupProduct.batchSize || 1);
            setBatchDraft(String(startupProduct.batchSize || 1));
          }
          setDataSource("api");
        }
      } catch {
        if (!cancelled) {
          setProducts(demoProducts);
          setSelectedProductId(demoProducts[0].id);
          setBatchSize(demoProducts[0].batchSize);
          setBatchDraft(String(demoProducts[0].batchSize));
          setDataSource("demo");
          toast.warning(t("operator.productsFallback"));
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
    return subscribeRuntimeTestSettings(() => {
      setRuntimeSettings(getRuntimeTestSettings());
    });
  }, []);

  useEffect(() => {
    return () => {
      autoRunRef.current = false;
      clearTimers();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncCurrentInspection() {
      const accessToken = getAccessToken();

      if (!accessToken || dataSource !== "api") {
        return;
      }

      try {
        const response = await getCurrentInspection(accessToken);
        const currentInspection = response.data;

        if (
          !cancelled &&
          currentInspection &&
          currentInspection.productId === selectedProductId
        ) {
          currentJobIdRef.current = currentInspection.jobId;
          setBatchSize(currentInspection.batchSize || 1);
          setBatchDraft(String(currentInspection.batchSize || 1));
          setBatchQuantity(currentInspection.quantity);
          setScanCount(currentInspection.count);
          setBatchCount(currentInspection.batch);
          setOkCount(currentInspection.okCount);
          setNgCount(currentInspection.ngCount);
        }
      } catch {
        if (!cancelled) {
          currentJobIdRef.current = "";
        }
      }
    }

    void syncCurrentInspection();

    return () => {
      cancelled = true;
    };
  }, [dataSource, selectedProductId]);

  const selectedProduct = useMemo(
    () =>
      products.find((product) => product.id === selectedProductId) ??
      products[0] ??
      demoProducts[0],
    [products, selectedProductId],
  );

  useEffect(() => {
    if (
      dataSource !== "api" ||
      loadingProducts ||
      !selectedProductId ||
      operationStartupProductRef.current === selectedProductId
    ) {
      return;
    }

    operationStartupProductRef.current = selectedProductId;

    async function startOperationOnEntry() {
      const accessToken = getAccessToken();
      if (!accessToken) {
        toast.error(t("users.missingSession"));
        return;
      }

      try {
        const inspection = await beginInspectionSession(
          accessToken,
          selectedProductId,
        );
        const currentRuntime = await getMachineRuntimeStatus(accessToken);
        const runtime = [
          "error",
          "idle_capture_timeout",
          "idle_machine_stop",
          "restart_required",
          "resuming",
          "stopping",
          "waiting_camera",
        ].includes(currentRuntime.data.state)
          ? currentRuntime
          : await startMachineOperation(accessToken);
        const machineIsRunning = runtime.data.state === "running";

        currentJobIdRef.current = inspection.data.jobId;
        setBatchSize(inspection.data.batchSize || 1);
        setBatchDraft(String(inspection.data.batchSize || 1));
        setBatchQuantity(inspection.data.quantity);
        setScanCount(inspection.data.count);
        setBatchCount(inspection.data.batch);
        setOkCount(inspection.data.okCount);
        setNgCount(inspection.data.ngCount);
        autoRunRef.current = machineIsRunning;
        setAutoRunning(machineIsRunning);
        setMachineRuntimeState(runtime.data.state);
        applyRuntimeControls(runtime.data);
      } catch (cause) {
        toast.error(
          cause instanceof ApiError
            ? cause.message
            : t("lineAnimationTest.realTestFailed"),
        );
      }
    }

    void startOperationOnEntry();
  }, [dataSource, loadingProducts, selectedProductId, t]);
  const activeRegions = useMemo(
    () =>
      selectedProduct.roiRegions.filter((region) =>
        activeRoiIndexes.includes(region.index),
      ),
    [activeRoiIndexes, selectedProduct.roiRegions],
  );
  const visibleRoiRegions = useMemo(() => {
    return activeRegions;
  }, [activeRegions]);
  const displayProduct = useMemo(() => {
    const productWithVisibleRois = {
      ...selectedProduct,
      roiRegions: visibleRoiRegions,
    };

    if (selectedProduct.camera.deviceName !== "demo-camera") {
      return productWithVisibleRois;
    }

    return {
      ...productWithVisibleRois,
      camera: {
        ...productWithVisibleRois.camera,
        deviceName: t("operator.demoCamera"),
      },
    };
  }, [selectedProduct, t, visibleRoiRegions]);
  const {
    imageSrc: livePreviewImageSrc,
    connected: livePreviewConnected,
    connectionStatus: livePreviewConnectionStatus,
    reconnect: reconnectLivePreview,
    runtimeDeviceName: livePreviewRuntimeDeviceName,
  } = useConnectedCameraPreview(
    selectedProduct.camera.deviceName,
    dataSource === "api",
    dataSource === "api" ? selectedProduct.camera : undefined,
    previewStreamEnabled,
  );

  const safeBatchSize = Math.max(1, Number(batchSize) || 1);
  const inspectionResultDelayMs = runtimeSettings.inspectionResultDelayMs;
  const overlayResult =
    animationState === "OK" || animationState === "NG" ? animationState : null;
  const runtimeActionsDisabled = loadingProducts || dataSource !== "api";
  const previewImageSrc = effectiveLiveCameraEnabled
    ? livePreviewImageSrc
    : capturedPreviewImageSrc || livePreviewImageSrc;

  useEffect(() => {
    if (dataSource !== "api" || loadingProducts) {
      return;
    }

    saveOperatorStartupPreferences(
      selectedProduct,
      livePreviewConnected ? livePreviewRuntimeDeviceName : "",
    );
  }, [
    dataSource,
    livePreviewConnected,
    livePreviewRuntimeDeviceName,
    loadingProducts,
    selectedProduct,
  ]);

  function clearTimers() {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];
  }

  function resetAnimationState() {
    clearTimers();
    liveRoiAnimationDeadlineRef.current = 0;
    liveRoiFingerprintsRef.current = {};
    liveRoiStatusesRef.current = {};
    liveRoiLabelsRef.current = {};
    setAnimationState("UNKNOWN");
    setActiveRoiIndexes([]);
    setRoiStatuses({});
    setRoiDetectedTextLabels({});
  }

  function applyInspectionCounters(inspection: CurrentInspectionState) {
    setBatchSize(inspection.batchSize || safeBatchSize);
    setBatchDraft(String(inspection.batchSize || safeBatchSize));
    setBatchQuantity(inspection.quantity);
    setScanCount(inspection.count);
    setBatchCount(inspection.batch);
    setOkCount(inspection.okCount);
    setNgCount(inspection.ngCount);
  }

  function handleRoiChange(newRois: typeof selectedProduct.roiRegions) {
    setProducts((current) =>
      current.map((product) =>
        product.id === selectedProductId
          ? { ...product, roiRegions: newRois }
          : product,
      ),
    );
  }

  async function resetCounters(showToast = true) {
    autoRunRef.current = false;
    setAutoRunning(false);
    scanRunningRef.current = false;
    setScanRunning(false);
    await stopCurrentInspection({ showToast: false });
    setOkCount(0);
    setNgCount(0);
    setBatchCount(0);
    setBatchQuantity(0);
    setScanCount(0);
    resetAnimationState();

    if (showToast) {
      toast.success(t("operator.resetDone"));
    }
  }

  async function handleProductChange(nextProductId: string) {
    if (
      nextProductId === selectedProductId ||
      changingProduct ||
      scanRunningRef.current
    ) {
      return;
    }

    const wasAutoRunning = autoRunRef.current || autoRunning;
    setChangingProduct(true);
    autoRunRef.current = false;
    setAutoRunning(false);

    try {
      if (currentJobIdRef.current) {
        await stopCurrentInspection({
          endReason: "product_change",
          showToast: false,
          stopMachine: !wasAutoRunning,
        });
      }

      if (wasAutoRunning) {
        operationStartupProductRef.current = nextProductId;
      }
      setSelectedProductId(nextProductId);
      const nextProduct =
        products.find((product) => product.id === nextProductId) ??
        demoProducts[0];
      setBatchSize(nextProduct.batchSize || 1);
      setBatchDraft(String(nextProduct.batchSize || 1));
      setKeypadOpen(false);
      setOkCount(0);
      setNgCount(0);
      setBatchCount(0);
      setBatchQuantity(0);
      setScanCount(0);
      resetAnimationState();

      if (wasAutoRunning) {
        toast.info(t("operator.productChangedSessionRestarted"));
        void ensureMachineOperation(nextProduct);
      }
    } finally {
      setChangingProduct(false);
    }
  }

  function adjustBatchDraft(delta: number) {
    setBatchDraft((current) =>
      String(Math.max(1, (Number(current) || safeBatchSize) + delta)),
    );
  }

  function appendBatchDigit(digit: string) {
    setBatchDraft((current) => {
      const next = current === "0" ? digit : `${current}${digit}`;
      return String(Math.max(0, Number(next) || 0));
    });
  }

  function handleBatchDraftChange(value: string) {
    const digitsOnly = value.replace(/\D/g, "");
    setBatchDraft(digitsOnly.length > 0 ? digitsOnly : "0");
  }

  function handleBatchDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveBatchSize();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setKeypadOpen(false);
    }
  }

  function removeBatchDigit() {
    setBatchDraft((current) => {
      const next = current.slice(0, -1);
      return next.length > 0 ? next : "0";
    });
  }

  async function saveBatchSize() {
    const accessToken = getAccessToken();
    const nextBatchSize = Math.max(1, Number(batchDraft) || 1);

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSavingBatch(true);

    try {
      const response = await updateProductBatchSize(
        accessToken,
        selectedProductId,
        nextBatchSize,
      );

      setBatchSize(response.data.batchSize);
      setBatchDraft(String(response.data.batchSize));
      setProducts((current) =>
        current.map((product) =>
          product.id === selectedProductId
            ? { ...product, batchSize: response.data.batchSize }
            : product,
        ),
      );
      if (scanCount >= response.data.batchSize) {
        const batchIncrement = Math.floor(scanCount / response.data.batchSize);
        const remainder = scanCount % response.data.batchSize;

        setBatchCount((current) => current + batchIncrement);
        setScanCount(remainder);
      }
      setKeypadOpen(false);
      toast.success(t("operator.packSizeSaved"));
    } catch {
      toast.error(t("products.saveError"));
    } finally {
      setSavingBatch(false);
    }
  }

  function validateRuntimeInputs(productOverride?: ProductProfile) {
    const accessToken = getAccessToken();
    const runtimeProduct = productOverride ?? selectedProduct;

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return null;
    }

    if (dataSource !== "api") {
      toast.warning(t("lineAnimationTest.realProfileRequired"));
      return null;
    }

    if (!runtimeProduct.modelPath) {
      toast.warning(t("lineTest.modelRequired"));
      return null;
    }

    if (runtimeProduct.roiRegions.length === 0) {
      toast.warning(t("lineAnimationTest.noRoi"));
      return null;
    }

    return { accessToken, product: runtimeProduct };
  }

  function buildAnimationResult(inspection: CurrentInspectionState) {
    const regionByIndex = new Map(
      selectedProduct.roiRegions.map((region) => [region.index, region]),
    );
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

        return [
          region.index,
          slot
            ? getInspectionSlotDisplayText(
              slot,
              selectedProduct.code,
              finalStatuses[region.index],
              { showNgRecognizedText },
            )
            : selectedProduct.code,
        ];
      }),
    ) as Record<number, string>;

    return {
      regions: animationRegions,
      finalStatuses,
      finalLabels,
    };
  }

  function resolveVisibleInspectionResult(inspection: CurrentInspectionState) {
    const animation = buildAnimationResult(inspection);

    if (animation.regions.length === 0) {
      return "UNKNOWN";
    }

    return Object.values(animation.finalStatuses).some(
      (status) => status === "NG",
    )
      ? "NG"
      : "OK";
  }

  async function playLatchedInspectionResult(
    inspection: CurrentInspectionState,
  ) {
    const remainingAnimationMs = Math.max(
      0,
      liveRoiAnimationDeadlineRef.current - Date.now(),
    );
    if (remainingAnimationMs > 0) {
      await wait(remainingAnimationMs);
    }
    clearTimers();
    liveRoiAnimationDeadlineRef.current = 0;
    const animation = buildAnimationResult(inspection);
    const finalResult = resolveVisibleInspectionResult(inspection);

    liveRoiStatusesRef.current = { ...animation.finalStatuses };
    liveRoiLabelsRef.current = { ...animation.finalLabels };
    setActiveRoiIndexes(animation.regions.map((region) => region.index));
    setRoiStatuses({ ...animation.finalStatuses });
    setRoiDetectedTextLabels({ ...animation.finalLabels });
    setAnimationState("WAITING_PLC");
    await wait(plcDoneHoldMs);
    setAnimationState(finalResult);
    applyInspectionCounters(inspection);
    await wait(resultHoldMs);
    if (autoRunRef.current) setAnimationState("WAITING_PLC");
    return true;
  }

  async function ensureMachineOperation(productOverride?: ProductProfile) {
    const validated = validateRuntimeInputs(productOverride);
    if (!validated) return null;

    try {
      const inspection = await beginInspectionSession(
        validated.accessToken,
        validated.product.id,
      );
      const runtime = await startMachineOperation(validated.accessToken);
      currentJobIdRef.current = inspection.data.jobId;
      applyInspectionCounters(inspection.data);
      autoRunRef.current = true;
      setAutoRunning(true);
      setMachineRuntimeState(runtime.data.state);
      return validated;
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "lineAnimationTest.realTestFailed")
          : t("lineAnimationTest.realTestFailed");
      toast.error(message);
      return null;
    }
  }

  const syncCapturedRuntimeFrame = useCallback(
    async (accessToken: string, sequence: number) => {
      if (sequence <= lastCameraFrameSequenceRef.current) return;
      const response = await getMachineRuntimeFrame(accessToken);
      const payload = response.data;

      if (!payload || payload.sequence <= lastCameraFrameSequenceRef.current) {
        return;
      }

      lastCameraFrameSequenceRef.current = payload.sequence;
      if (payload.frame.productId !== selectedProductId) return;
      setCapturedPreviewImageSrc(
        toCameraImageSource(payload.frame.imageBase64),
      );
    },
    [selectedProductId],
  );

  async function handleManualGrab() {
    if (
      scanRunningRef.current ||
      operationMode !== "manual" ||
      (liveCameraEnabled && !realtimeAiEnabled)
    ) {
      return;
    }

    const validated = await ensureMachineOperation();
    if (!validated) return;

    scanRunningRef.current = true;
    setScanRunning(true);
    if (realtimeAiEnabled) setAnimationState("CHECKING");

    try {
      const response = await grabMachineFrame(validated.accessToken);
      await syncCapturedRuntimeFrame(
        validated.accessToken,
        response.data.cameraFrameSequence,
      );

      if (response.data.action === "latched" && response.data.inspection) {
        await playLatchedInspectionResult(response.data.inspection);
        const result = resolveVisibleInspectionResult(response.data.inspection);
        toast.success(t(`lineAnimationTest.state${result}`));
      } else if (response.data.action === "captured") {
        toast.success(t("operator.frameCaptured"));
      } else if (response.data.action === "unknown") {
        setAnimationState("UNKNOWN");
      }
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "lineAnimationTest.realTestFailed")
          : t("lineAnimationTest.realTestFailed");
      toast.error(message);
    } finally {
      scanRunningRef.current = false;
      setScanRunning(false);
    }
  }

  function applyRuntimeControls(status: MachineRuntimeStatus) {
    setMachineIdleReason(status.idleReason);
    setMachineStopCountdownSeconds(status.stopCountdownSeconds);
    if (status.operationMode === "manual" || status.operationMode === "auto") {
      setOperationMode(status.operationMode);
    }
    if (typeof status.liveCameraEnabled === "boolean") {
      setLiveCameraEnabled(status.liveCameraEnabled);
    }
    if (typeof status.realtimeAiEnabled === "boolean") {
      setRealtimeAiEnabled(status.realtimeAiEnabled);
    }
  }

  async function changeOperationMode(nextMode: "manual" | "auto") {
    if (controlUpdating || operationMode === nextMode) return;
    const validated =
      nextMode === "auto"
        ? await ensureMachineOperation()
        : validateRuntimeInputs();
    if (!validated) return;

    setControlUpdating(true);
    try {
      const response = await updateMachineRuntimeControls(
        validated.accessToken,
        { mode: nextMode },
      );
      applyRuntimeControls(response.data);
      toast.success(
        t(nextMode === "auto" ? "operator.autoEnabled" : "operator.manualEnabled"),
      );
    } catch (cause) {
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : t("lineAnimationTest.realTestFailed"),
      );
    } finally {
      setControlUpdating(false);
    }
  }

  async function toggleLiveCamera() {
    if (controlUpdating) return;
    const validated = validateRuntimeInputs();
    if (!validated) return;
    const nextEnabled = !liveCameraEnabled;

    setControlUpdating(true);
    try {
      const response = await updateMachineRuntimeControls(
        validated.accessToken,
        { liveCameraEnabled: nextEnabled },
      );
      applyRuntimeControls(response.data);
      toast.success(
        t(nextEnabled ? "operator.liveEnabled" : "operator.liveDisabled"),
      );
    } catch (cause) {
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : t("lineAnimationTest.realTestFailed"),
      );
    } finally {
      setControlUpdating(false);
    }
  }

  async function toggleRealtimeAi() {
    if (controlUpdating) return;
    const nextEnabled = !realtimeAiEnabled;
    const validated = nextEnabled
      ? await ensureMachineOperation()
      : validateRuntimeInputs();
    if (!validated) return;

    setControlUpdating(true);
    try {
      const response = await updateMachineRuntimeControls(
        validated.accessToken,
        { realtimeAiEnabled: nextEnabled },
      );
      applyRuntimeControls(response.data);
      if (!nextEnabled) resetAnimationState();
      toast.success(
        t(nextEnabled ? "operator.aiEnabled" : "operator.aiDisabled"),
      );
    } catch (cause) {
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : t("lineAnimationTest.realTestFailed"),
      );
    } finally {
      setControlUpdating(false);
    }
  }

  async function stopCurrentInspection({
    endReason = "line_stop",
    showToast = true,
    stopMachine = true,
  }: {
    endReason?: LineSessionEndReason;
    showToast?: boolean;
    stopMachine?: boolean;
  } = {}) {
    const accessToken = getAccessToken();
    const jobId = currentJobIdRef.current;

    autoRunRef.current = false;
    setAutoRunning(false);

    if (!accessToken || !jobId) {
      if (accessToken && stopMachine) {
        await stopMachineOperation(accessToken).catch(() => undefined);
      }
      if (showToast) {
        toast.success(t("operator.runStopped"));
      }
      return;
    }

    try {
      const response = await stopInspection(accessToken, jobId, endReason);
      if (stopMachine) {
        await stopMachineOperation(accessToken).catch(() => undefined);
      }
      currentJobIdRef.current = "";

      if (showToast) {
        toast.success(t("operator.runStopped"));
      }

      if (response.data.resultSaveError) {
        toast.warning(
          apiError(
            response.data.resultSaveError,
            "settings.lineResultSaveError",
          ),
        );
      }
    } catch (cause) {
      const message =
        cause instanceof ApiError ? cause.message : t("operator.runStopped");
      toast.error(message);
    }
  }

  plcInspectionHandlerRef.current = async (status) => {
    const inspection = status.lastPlcInspection;
    if (
      status.lastPlcInspectionSequence < lastPlcInspectionSequenceRef.current
    ) {
      lastPlcInspectionSequenceRef.current = status.lastPlcInspectionSequence;
    }
    if (
      !inspection ||
      inspection.productId !== selectedProductId ||
      status.lastPlcInspectionSequence <= lastPlcInspectionSequenceRef.current
    ) {
      return;
    }
    lastPlcInspectionSequenceRef.current = status.lastPlcInspectionSequence;
    currentJobIdRef.current = inspection.jobId;
    await playLatchedInspectionResult(inspection);
  };

  liveInspectionHandlerRef.current = (status) => {
    const inspection = status.latestLiveInspection;
    if (
      status.state === "running" &&
      inspection?.productId === selectedProductId
    ) {
      currentJobIdRef.current = inspection.jobId;
      if (!autoRunRef.current) {
        autoRunRef.current = true;
        setAutoRunning(true);
      }
    }
    if (
      status.liveInspectionSequence < lastLiveInspectionSequenceRef.current
    ) {
      lastLiveInspectionSequenceRef.current = status.liveInspectionSequence;
    }
    if (
      !inspection ||
      inspection.productId !== selectedProductId ||
      status.liveInspectionSequence <= lastLiveInspectionSequenceRef.current
    ) {
      return;
    }

    lastLiveInspectionSequenceRef.current = status.liveInspectionSequence;
    const slotByIndex = new Map(
      inspection.slots
        .filter((slot) => typeof slot.slotIndex === "number")
        .map((slot) => [slot.slotIndex as number, slot]),
    );
    const nextFingerprints: Record<number, string> = {};
    const nextStatuses = { ...liveRoiStatusesRef.current };
    const nextLabels = { ...liveRoiLabelsRef.current };
    const changedRegions = selectedProduct.roiRegions.filter((region) => {
      const slot = slotByIndex.get(region.index);
      const fingerprint = getSlotFingerprint(slot);
      nextFingerprints[region.index] = fingerprint;
      return liveRoiFingerprintsRef.current[region.index] !== fingerprint;
    });

    liveRoiFingerprintsRef.current = nextFingerprints;
    if (changedRegions.length === 0) return;

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
        selectedProduct.code,
        slot.result,
        { showNgRecognizedText },
      );
      return true;
    });
    liveRoiStatusesRef.current = nextStatuses;
    liveRoiLabelsRef.current = nextLabels;
    setAnimationState(resolveLiveRoiAnimationState(nextStatuses));
    setActiveRoiIndexes(getVisibleRoiIndexes(nextStatuses));
    setRoiStatuses({ ...nextStatuses });
    setRoiDetectedTextLabels({ ...nextLabels });

    if (knownChangedRegions.length === 0) return;

    liveRoiAnimationDeadlineRef.current =
      Date.now() + inspectionResultDelayMs;
    const expectedFingerprints = { ...nextFingerprints };
    const resultTimer = window.setTimeout(() => {
      const finalStatuses = { ...liveRoiStatusesRef.current };
      const finalLabels = { ...liveRoiLabelsRef.current };

      knownChangedRegions.forEach((region) => {
        if (
          liveRoiFingerprintsRef.current[region.index] !==
          expectedFingerprints[region.index]
        ) {
          return;
        }
        const slot = slotByIndex.get(region.index);
        if (slot?.result === "OK" || slot?.result === "NG") {
          finalStatuses[region.index] = slot.result;
          finalLabels[region.index] = getInspectionSlotDisplayText(
            slot,
            selectedProduct.code,
            slot.result,
            { showNgRecognizedText },
          );
        } else {
          delete finalStatuses[region.index];
          delete finalLabels[region.index];
        }
      });

      liveRoiStatusesRef.current = finalStatuses;
      liveRoiLabelsRef.current = finalLabels;
      setActiveRoiIndexes(getVisibleRoiIndexes(finalStatuses));
      setRoiStatuses({ ...finalStatuses });
      setRoiDetectedTextLabels({ ...finalLabels });
      setAnimationState(resolveLiveRoiAnimationState(finalStatuses));
      if (Date.now() >= liveRoiAnimationDeadlineRef.current) {
        liveRoiAnimationDeadlineRef.current = 0;
      }
    }, inspectionResultDelayMs);
    timersRef.current.push(resultTimer);
  };

  useEffect(() => {
    if (dataSource !== "api") return;
    let active = true;
    let requestRunning = false;

    async function pollMachineRuntime() {
      if (requestRunning) return;
      const accessToken = getAccessToken();
      if (!accessToken) return;
      requestRunning = true;
      try {
        const response = runtimeDefaultsAppliedRef.current
          ? await getMachineRuntimeStatus(accessToken)
          : await updateMachineRuntimeControls(accessToken, {
              mode: "auto",
              realtimeAiEnabled: true,
            });
        if (!active) return;
        runtimeDefaultsAppliedRef.current = true;
        const status = response.data;
        setPlcConnected(!status.plcOffline);
        const machineIsRunning = status.state === "running";
        autoRunRef.current = machineIsRunning;
        setAutoRunning(machineIsRunning);
        setMachineRuntimeState(status.state);
        applyRuntimeControls(status);
        if (
          status.liveCameraEnabled === false &&
          typeof status.cameraFrameSequence === "number"
        ) {
          await syncCapturedRuntimeFrame(
            accessToken,
            status.cameraFrameSequence,
          );
        }
        if (!["inactive", "running"].includes(status.state)) {
          scanRunningRef.current = false;
          setScanRunning(false);
          clearTimers();
        }
        liveInspectionHandlerRef.current(status);
        await plcInspectionHandlerRef.current(status);
      } catch {
        if (active) setPlcConnected(false);
        // The shared shell watchdog surfaces backend connectivity errors.
      } finally {
        requestRunning = false;
      }
    }

    const initialId = window.setTimeout(() => void pollMachineRuntime(), 0);
    const intervalId = window.setInterval(() => void pollMachineRuntime(), 500);
    return () => {
      active = false;
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, [dataSource, selectedProductId, syncCapturedRuntimeFrame]);

  const actionButtons = (
    <OperatorRuntimeActions
      actionsLocked={operatorActionButtonsLocked}
      controlsDisabled={runtimeActionsDisabled}
      controlUpdating={controlUpdating}
      liveCameraEnabled={liveCameraEnabled}
      operationMode={operationMode}
      realtimeAiEnabled={realtimeAiEnabled}
      runtimeControlsActive={runtimeControlsActive}
      scanRunning={scanRunning}
      onGrab={() => void handleManualGrab()}
      onLiveCameraToggle={() => void toggleLiveCamera()}
      onRealtimeAiToggle={() => void toggleRealtimeAi()}
      onModeChange={(mode) => void changeOperationMode(mode)}
      onResetCounter={() => void resetCounters(true)}
    />
  );

  return (
    <div className="operator-line-runtime grid min-h-full min-w-0 grid-rows-[auto_auto_auto] gap-3">
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
                  value={selectedProduct.id}
                  portalled
                  viewportFittedMenu
                  disabled={loadingProducts || scanRunning || changingProduct}
                  className="operator-line-form-control h-12 border-[#9db7d8] bg-white px-4 text-xl font-semibold"
                  menuListClassName="py-1"
                  optionClassName="min-h-11 items-center border-b border-[#c9d6e5] px-4 py-2 last:border-b-0 active:bg-slate-200"
                  optionLabelClassName="text-xl font-semibold"
                  activeOptionClassName="border-[#8ab6df] bg-[#d5eaff] text-[#123f73] shadow-[inset_4px_0_0_#1670b9] hover:bg-[#c5e1ff]"
                  onChange={(event) =>
                    void handleProductChange(event.target.value)
                  }
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="operator-line-product-field grid gap-2">
                <label className="text-sm font-semibold text-[#274d7d]">
                  {t("operator.packSize")}
                </label>
                <div
                  ref={batchEditorRef}
                  className="operator-line-pack-editor relative grid gap-2"
                >
                  <div className="operator-line-pack-row grid grid-cols-[56px_minmax(0,1fr)_56px] gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="operator-line-form-control h-12 border-[#9db7d8] bg-white text-slate-950 hover:bg-slate-50"
                      onClick={() => adjustBatchDraft(-1)}
                    >
                      <Minus className="h-5 w-5" />
                    </Button>
                    <Input
                      type="text"
                      inputMode="numeric"
                      data-virtual-keyboard="off"
                      value={batchDraft}
                      className="operator-line-form-control h-12 border-[#9db7d8] bg-white text-center text-lg font-semibold"
                      onFocus={() => setKeypadOpen(true)}
                      onClick={() => setKeypadOpen(true)}
                      onChange={(event) =>
                        handleBatchDraftChange(event.target.value)
                      }
                      onKeyDown={handleBatchDraftKeyDown}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="operator-line-form-control h-12 border-[#9db7d8] bg-white text-slate-950 hover:bg-slate-50"
                      onClick={() => adjustBatchDraft(1)}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    className="operator-line-form-control operator-line-save-button h-12 border-[#274d7d] bg-[#274d7d] text-base text-white hover:bg-[#1f3d64]"
                    disabled={savingBatch || autoRunning || scanRunning}
                    onClick={() => void saveBatchSize()}
                  >
                    <Save className="h-4 w-4" />
                    {savingBatch
                      ? t("operator.savingPackSize")
                      : t("operator.savePackSize")}
                  </Button>
                  {keypadOpen ? (
                    <div className="absolute left-0 right-0 top-full z-30 mt-2 grid gap-2 rounded-sm border border-[#9db7d8] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
                      <NumericKeypad
                        onKeyPress={appendBatchDigit}
                        onClear={() => setBatchDraft("0")}
                        onBackspace={removeBatchDigit}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="operator-line-stats-shell grid gap-3 min-[860px]:grid-cols-[minmax(0,1fr)_280px]">
            <div className="operator-line-stats-grid grid gap-3 min-[760px]:grid-cols-2">
              <InfoTile
                label={t("operator.currentProduct")}
                value={selectedProduct.code}
                className="operator-line-info-tile border-[#f0a53b] bg-white text-slate-950"
              />
              <InfoTile
                label={t("operator.quantity")}
                value={batchQuantity}
                className="operator-line-info-tile border-[#f0a53b] bg-white text-slate-950"
              />
              <InfoTile
                label={t("operator.count")}
                value={scanCount}
                className="operator-line-info-tile border-[#f0a53b] bg-white text-slate-950"
              />
              <InfoTile
                label={t("operator.batch")}
                value={batchCount}
                className="operator-line-info-tile border-[#f0a53b] bg-white text-slate-950"
              />
            </div>

            <div className="operator-line-status-grid grid gap-3 min-[520px]:grid-cols-2 min-[860px]:grid-cols-1">
              <InfoTile
                label={t("operator.ok")}
                value={okCount}
                className="operator-line-info-tile border-[#0f9f47] bg-[#15b455] text-white"
                valueClassName="operator-line-okng-value text-6xl min-[860px]:text-7xl"
              />
              <InfoTile
                label={t("operator.ng")}
                value={ngCount}
                className="operator-line-info-tile border-[#d92d20] bg-[#ef3e36] text-white"
                valueClassName="operator-line-okng-value text-6xl min-[860px]:text-7xl"
              />
            </div>
          </div>

          <div className="operator-line-top-actions rounded-sm border border-[#9db7d8] bg-[#d9e6f5] p-4">
            <div className="operator-line-top-action-grid grid gap-2">
              {actionButtons}
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
              onChange={handleRoiChange}
              overlayResult={overlayResult}
              machineStopCountdownSeconds={machineStopCountdownSeconds}
              machineStopOverlay={machineStopActive}
              okCount={okCount}
              ngCount={ngCount}
              roiStatuses={roiStatuses}
              roiDetectedTextLabels={roiDetectedTextLabels}
              roiCheckingLabel={t("lineAnimationTest.checkingBand")}
              roiTextAnimationMs={inspectionResultDelayMs}
              interactive={false}
              previewImageSrc={previewImageSrc}
              cameraDisplayName={
                livePreviewRuntimeDeviceName || selectedProduct.camera.deviceName
              }
              showClock
              clockLeadingContent={
                <OperatorModeStatus
                  active={runtimeControlsActive}
                  operationMode={operationMode}
                />
              }
              clockTrailingContent={
                <OperatorAiStatus
                  realtimeAiEnabled={effectiveRealtimeAiEnabled}
                />
              }
              footerLeadingContent={
                <OperatorPlcStatus connected={plcConnected} />
              }
              footerTrailingContent={
                <OperatorLiveCameraStatus
                  liveCameraEnabled={effectiveLiveCameraEnabled}
                />
              }
              connectionOverlay={
                !machineStopActive && dataSource === "api" ? (
                  <CameraConnectionOverlay
                    status={livePreviewConnectionStatus}
                    deviceName={
                      livePreviewRuntimeDeviceName ||
                      selectedProduct.camera.deviceName
                    }
                    onReconnect={reconnectLivePreview}
                    showReconnectWhileConnecting={cameraRecoveryInProgress}
                  />
                ) : undefined
              }
            />
          </div>
        </div>
      </Card>

      <div className="operator-line-footer-actions grid shrink-0 gap-2 min-[980px]:grid-cols-6">
        {actionButtons}
      </div>
    </div>
  );
}

function InfoTile({
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
