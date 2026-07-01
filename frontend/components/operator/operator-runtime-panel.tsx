"use client";

import {
  Camera,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Video,
  Zap,
} from "lucide-react";
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useConnectedCameraPreview } from "@/components/camera/use-connected-camera-preview";
import {
  OperatorRoiEditor,
  type OperatorRoiStatus,
} from "@/components/operator/operator-roi-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  getCurrentInspection,
  listProductProfiles,
  startInspection,
  stopInspection,
  type CurrentInspectionState,
  type InspectionSlotState,
  type ProductProfile,
  type RoiRegion,
  updateProductBatchSize,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  saveOperatorStartupPreferences,
  selectOperatorStartupProduct,
} from "@/lib/operator-startup-preferences";
import {
  getRuntimeTestSettings,
  subscribeRuntimeTestSettings,
} from "@/lib/runtime-test-settings";
import { getAccessToken } from "@/lib/session";

type DataSource = "api" | "demo";
type AnimationState = "UNKNOWN" | "CHECKING" | "WAITING_PLC" | "OK" | "NG";
type RuntimeFrame = {
  atMs: number;
  regions: RoiRegion[];
  statuses: Record<number, OperatorRoiStatus>;
  labels?: Record<number, string>;
};

const detectDelayMs = 300;
const plcDoneHoldMs = 750;
const resultHoldMs = 1200;
const autoScanGapMs = 250;

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
    modelPath: "models/sl-37.onnx",
    rotateTestImageClockwise: false,
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

function getSlotLabel(slot: InspectionSlotState, fallback: string) {
  return slot.rawText?.trim() || slot.expectedText?.trim() || fallback;
}

export function OperatorRuntimePanel() {
  const { t } = useI18n();
  const timersRef = useRef<number[]>([]);
  const currentJobIdRef = useRef("");
  const autoRunRef = useRef(false);
  const scanRunningRef = useRef(false);
  const [products, setProducts] = useState<ProductProfile[]>(demoProducts);
  const [selectedProductId, setSelectedProductId] = useState(demoProducts[0].id);
  const [dataSource, setDataSource] = useState<DataSource>("demo");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [okCount, setOkCount] = useState(0);
  const [ngCount, setNgCount] = useState(0);
  const [batchCount, setBatchCount] = useState(0);
  const [batchQuantity, setBatchQuantity] = useState(0);
  const [scanCount, setScanCount] = useState(0);
  const [batchSize, setBatchSize] = useState(demoProducts[0].defaultNumber);
  const [batchDraft, setBatchDraft] = useState(String(demoProducts[0].batchSize));
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
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
          const startupProduct =
            selectOperatorStartupProduct(activeProducts) ?? activeProducts[0];

          setProducts(activeProducts);
          setSelectedProductId(startupProduct.id);
          setBatchSize(startupProduct.batchSize || 1);
          setBatchDraft(String(startupProduct.batchSize || 1));
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
    runtimeDeviceName: livePreviewRuntimeDeviceName,
  } = useConnectedCameraPreview(
    selectedProduct.camera.deviceName,
    dataSource === "api",
    dataSource === "api" ? selectedProduct.camera : undefined,
  );

  const safeBatchSize = Math.max(1, Number(batchSize) || 1);
  const inspectionResultDelayMs = runtimeSettings.inspectionResultDelayMs;
  const overlayResult =
    animationState === "OK" || animationState === "NG" ? animationState : null;
  const runtimeActionsDisabled = loadingProducts || dataSource !== "api";

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
    await stopCurrentInspection(false);
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

  function handleProductChange(nextProductId: string) {
    void stopCurrentInspection(false);
    autoRunRef.current = false;
    setAutoRunning(false);
    setSelectedProductId(nextProductId);
    const nextProduct =
      products.find((product) => product.id === nextProductId) ?? demoProducts[0];
    setBatchSize(nextProduct.batchSize || 1);
    setBatchDraft(String(nextProduct.batchSize || 1));
    setKeypadOpen(false);
    setOkCount(0);
    setNgCount(0);
    setBatchCount(0);
    setBatchQuantity(0);
    setScanCount(0);
    resetAnimationState();
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

  function validateRuntimeInputs() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return null;
    }

    if (dataSource !== "api") {
      toast.warning(t("lineAnimationTest.realProfileRequired"));
      return null;
    }

    if (!selectedProduct.modelPath) {
      toast.warning(t("lineTest.modelRequired"));
      return null;
    }

    if (selectedProduct.roiRegions.length === 0) {
      toast.warning(t("lineAnimationTest.noRoi"));
      return null;
    }

    return { accessToken, product: selectedProduct };
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
          slot ? getSlotLabel(slot, finalStatuses[region.index]) : selectedProduct.code,
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

    return Object.values(animation.finalStatuses).some((status) => status === "NG")
      ? "NG"
      : "OK";
  }

  function scheduleRuntimeFrames(
    frames: RuntimeFrame[],
    finalState: "OK" | "NG",
    inspection: CurrentInspectionState,
  ) {
    clearTimers();

    if (frames.length === 0) {
      return false;
    }

    const visibleIndexes = new Set<number>();
    const sessionStatuses: Record<number, OperatorRoiStatus> = {};
    const sessionLabels: Record<number, string> = Object.fromEntries(
      frames.flatMap((frame) =>
        frame.regions.map((region) => [
          region.index,
          frame.labels?.[region.index] ?? selectedProduct.code,
        ]),
      ),
    );

    setAnimationState("UNKNOWN");
    setRoiStatuses({});
    setRoiDetectedTextLabels(sessionLabels);
    setActiveRoiIndexes([]);

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

        frame.regions.forEach((region) => {
          const finalStatus = frame.statuses[region.index] ?? "NG";
          const finalLabel = frame.labels?.[region.index];

          visibleIndexes.add(region.index);
          sessionStatuses[region.index] = "CHECKING";
          sessionLabels[region.index] =
            finalLabel ?? sessionLabels[region.index] ?? selectedProduct.code;

          const resultTimer = window.setTimeout(() => {
            sessionStatuses[region.index] = finalStatus;

            if (finalLabel) {
              sessionLabels[region.index] = finalLabel;
            }

            setRoiStatuses({ ...sessionStatuses });
            setRoiDetectedTextLabels({ ...sessionLabels });
          }, inspectionResultDelayMs);

          timersRef.current.push(resultTimer);
        });

        setAnimationState("CHECKING");
        setActiveRoiIndexes(Array.from(visibleIndexes));
        setRoiStatuses({ ...sessionStatuses });
        setRoiDetectedTextLabels({ ...sessionLabels });
      }, frame.atMs);

      timersRef.current.push(frameTimer);
    });

    const lastFrameEndAt =
      Math.max(...frames.map((frame) => frame.atMs)) + inspectionResultDelayMs;
    const waitPlcTimer = window.setTimeout(() => {
      setAnimationState("WAITING_PLC");
    }, lastFrameEndAt);
    const plcDoneTimer = window.setTimeout(() => {
      setAnimationState(finalState);
      applyInspectionCounters(inspection);
    }, lastFrameEndAt + plcDoneHoldMs);

    timersRef.current.push(waitPlcTimer, plcDoneTimer);
    return true;
  }

  async function playRuntimeFrames(
    frames: RuntimeFrame[],
    finalState: "OK" | "NG",
    inspection: CurrentInspectionState,
  ) {
    const scheduled = scheduleRuntimeFrames(frames, finalState, inspection);

    if (!scheduled) {
      return false;
    }

    const lastFrameAt = Math.max(...frames.map((frame) => frame.atMs));
    await wait(
      lastFrameAt + inspectionResultDelayMs + plcDoneHoldMs + resultHoldMs,
    );
    return true;
  }

  async function playRejectedInspectionResult(
    finalState: "UNKNOWN" | "NG",
    inspection: CurrentInspectionState | null,
  ) {
    clearTimers();
    setAnimationState("CHECKING");
    setActiveRoiIndexes([]);
    setRoiStatuses({});
    setRoiDetectedTextLabels({});

    await wait(inspectionResultDelayMs);
    setAnimationState(finalState);
    setActiveRoiIndexes([]);
    setRoiStatuses({});
    setRoiDetectedTextLabels({});

    if (inspection) {
      applyInspectionCounters(inspection);
    }

    await wait(resultHoldMs);
    return true;
  }

  async function playInspectionResult(inspection: CurrentInspectionState) {
    const animation = buildAnimationResult(inspection);

    if (animation.regions.length === 0) {
      return playRejectedInspectionResult("UNKNOWN", inspection);
    }

    const finalResult = resolveVisibleInspectionResult(inspection);

    return playRuntimeFrames(
      [
        {
          atMs: detectDelayMs,
          regions: animation.regions,
          statuses: animation.finalStatuses,
          labels: animation.finalLabels,
        },
      ],
      finalResult === "OK" ? "OK" : "NG",
      inspection,
    );
  }

  async function runInspectionScan(showToast = false) {
    const validated = validateRuntimeInputs();

    if (!validated || scanRunningRef.current) {
      return false;
    }

    scanRunningRef.current = true;
    setScanRunning(true);
    setAnimationState("CHECKING");
    setActiveRoiIndexes([]);
    setRoiStatuses({});
    setRoiDetectedTextLabels({});

    try {
      const response = await startInspection(
        validated.accessToken,
        validated.product.id,
      );
      currentJobIdRef.current = response.data.jobId;
      await playInspectionResult(response.data);

      if (showToast) {
        const result = resolveVisibleInspectionResult(response.data);
        toast.success(t(`lineAnimationTest.state${result}`));
      }

      return true;
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : t("lineAnimationTest.realTestFailed");
      await playRejectedInspectionResult("NG", null);
      toast.error(message);
      return false;
    } finally {
      scanRunningRef.current = false;
      setScanRunning(false);
    }
  }

  async function runAutoLoop() {
    while (autoRunRef.current) {
      const scanCompleted = await runInspectionScan(false);

      if (!scanCompleted || !autoRunRef.current) {
        break;
      }

      await wait(autoScanGapMs);
    }

    autoRunRef.current = false;
    setAutoRunning(false);
  }

  function startAutoInspection() {
    if (autoRunRef.current || scanRunningRef.current) {
      return;
    }

    const validated = validateRuntimeInputs();

    if (!validated) {
      return;
    }

    autoRunRef.current = true;
    setAutoRunning(true);
    toast.success(t("operator.runStarted"));
    void runAutoLoop();
  }

  async function stopCurrentInspection(showToast = true) {
    const accessToken = getAccessToken();
    const jobId = currentJobIdRef.current;

    autoRunRef.current = false;
    setAutoRunning(false);

    if (!accessToken || !jobId) {
      if (showToast) {
        toast.success(t("operator.runStopped"));
      }
      return;
    }

    try {
      await stopInspection(accessToken, jobId);
      currentJobIdRef.current = "";

      if (showToast) {
        toast.success(t("operator.runStopped"));
      }
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : t("operator.runStopped");
      toast.error(message);
    }
  }

  const actionButtons = (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={runtimeActionsDisabled || scanRunning || autoRunning}
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70"
        onClick={() => void runInspectionScan(true)}
      >
        <Camera className="h-5 w-5" />
        {scanRunning ? t("lineAnimationTest.realTesting") : t("operator.grab")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6]"
        onClick={() =>
          toast.info(
            livePreviewConnected ? t("operator.cameraOn") : t("operator.cameraOff"),
          )
        }
      >
        <Video className="h-5 w-5" />
        {t("operator.liveCamera")}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={runtimeActionsDisabled || scanRunning}
        className={[
          "operator-line-action-button h-14 border-[#1e293b] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70",
          autoRunning ? "bg-[#6fa3d9]" : "bg-[#9fc3eb]",
        ].join(" ")}
        onClick={() =>
          autoRunning
            ? void stopCurrentInspection(true)
            : startAutoInspection()
        }
      >
        <Zap className="h-5 w-5" />
        {autoRunning ? t("operator.stopLine") : t("operator.realTimeAi")}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!autoRunning}
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70"
        onClick={() => void stopCurrentInspection(true)}
      >
        <Settings2 className="h-5 w-5" />
        {t("operator.manual")}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={runtimeActionsDisabled || autoRunning || scanRunning}
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70"
        onClick={startAutoInspection}
      >
        <Settings2 className="h-5 w-5" />
        {t("operator.auto")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 hover:bg-[#8fb8e6]"
        onClick={() => void resetCounters(true)}
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
                  value={selectedProduct.id}
                  disabled={loadingProducts || autoRunning || scanRunning}
                  className="h-11 border-[#9db7d8] bg-white text-base"
                  onChange={(event) => handleProductChange(event.target.value)}
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code} - {product.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-[#274d7d]">
                  {t("operator.packSize")}
                </label>
                <div className="relative grid gap-2">
                  <div className="grid grid-cols-[56px_minmax(0,1fr)_56px] gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 border-[#9db7d8] bg-white text-slate-950 hover:bg-slate-50"
                      onClick={() => adjustBatchDraft(-1)}
                    >
                      <Minus className="h-5 w-5" />
                    </Button>
                    <Input
                      type="text"
                      inputMode="numeric"
                      data-virtual-keyboard="off"
                      value={batchDraft}
                      className="h-12 border-[#9db7d8] bg-white text-center text-lg font-semibold"
                      onFocus={() => setKeypadOpen(true)}
                      onClick={() => setKeypadOpen((current) => !current)}
                      onChange={(event) => handleBatchDraftChange(event.target.value)}
                      onKeyDown={handleBatchDraftKeyDown}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 border-[#9db7d8] bg-white text-slate-950 hover:bg-slate-50"
                      onClick={() => adjustBatchDraft(1)}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    className="h-12 border-[#274d7d] bg-[#274d7d] text-base text-white hover:bg-[#1f3d64]"
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
            <div className="grid gap-2">
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
              okCount={okCount}
              ngCount={ngCount}
              roiStatuses={roiStatuses}
              roiDetectedTextLabels={roiDetectedTextLabels}
              roiCheckingLabel={t("lineAnimationTest.checkingBand")}
              roiTextAnimationMs={inspectionResultDelayMs}
              interactive={false}
              previewImageSrc={livePreviewImageSrc}
              showClock
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
