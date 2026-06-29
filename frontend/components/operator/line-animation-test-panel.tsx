"use client";

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FileImage,
  Play,
  RotateCcw,
  ScanLine,
  Square,
} from "lucide-react";
import { toast } from "sonner";
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
  grabCameraFrame,
  listProductProfiles,
  testInspectionImage,
  type ProductProfile,
  type RoiRegion,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  getRuntimeTestSettings,
  subscribeRuntimeTestSettings,
} from "@/lib/runtime-test-settings";
import { getAccessToken } from "@/lib/session";

type AnimationState = "UNKNOWN" | "CHECKING" | "WAITING_PLC" | "OK" | "NG";
type DetectionLayout = "SINGLE" | "THREE" | "ALL" | "RANDOM";
type DataSource = "api" | "sample";
type RuntimeFrame = {
  atMs: number;
  regions: RoiRegion[];
  statuses: Record<number, OperatorRoiStatus>;
  labels?: Record<number, string>;
};

const detectDelayMs = 300;
const inspectDelayMs = 2000;
const plcDoneHoldMs = 750;
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

function shuffleRegions(regions: RoiRegion[]) {
  return [...regions].sort(() => Math.random() - 0.5);
}

function pickDetectedRegions(layout: DetectionLayout, regions: RoiRegion[]) {
  if (regions.length === 0) {
    return [];
  }

  if (layout === "ALL") {
    return regions;
  }

  if (layout === "THREE") {
    return shuffleRegions(regions).slice(0, Math.min(3, regions.length));
  }

  if (layout === "RANDOM") {
    const count = Math.max(1, Math.ceil(Math.random() * regions.length));
    return shuffleRegions(regions).slice(0, count);
  }

  return shuffleRegions(regions).slice(0, 1);
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(bmp|gif|jpe?g|png|tif?f|webp)$/i.test(file.name);
}

export function LineAnimationTestPanel() {
  const { t, apiError } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const lineIntervalRef = useRef<number | null>(null);
  const lineVisibleIndexesRef = useRef<Set<number>>(new Set());
  const lineStatusesRef = useRef<Record<number, OperatorRoiStatus>>({});
  const lineLabelsRef = useRef<Record<number, string>>({});
  const lineTickBusyRef = useRef(false);
  const [products, setProducts] = useState<ProductProfile[]>(sampleProducts);
  const [selectedProductId, setSelectedProductId] = useState(sampleProducts[0].id);
  const [dataSource, setDataSource] = useState<DataSource>("sample");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [detectionLayout, setDetectionLayout] =
    useState<DetectionLayout>("ALL");
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
  const [lineRunning, setLineRunning] = useState(false);
  const [testingRealImage, setTestingRealImage] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [selectedImageBase64, setSelectedImageBase64] = useState("");
  const [selectedImageName, setSelectedImageName] = useState("");
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
    setQuantity(0);

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
    setQuantity(0);

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
          const resultAt = detectAt + inspectDelayMs;
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
      ) + inspectDelayMs;
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
      setQuantity(Object.keys(sessionStatuses).length);
    }, plcDoneAt);

    timersRef.current.push(waitPlcTimer, plcDoneTimer);
    return true;
  }

  function scheduleSessionAnimation(
    detectedRegions: RoiRegion[],
    finalStatuses: Record<number, OperatorRoiStatus>,
    finalLabels: Record<number, string> = {},
  ) {
    return scheduleRuntimeFrames([
      {
        atMs: detectDelayMs,
        regions: detectedRegions,
        statuses: finalStatuses,
        labels: finalLabels,
      },
    ]);
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
        }, inspectDelayMs);

        timersRef.current.push(resultTimer);
        return;
      }

      if (currentStatus === "NG" && nextStatus === "OK") {
        const resultTimer = window.setTimeout(() => {
          statuses[region.index] = "OK";
          labels[region.index] = nextLabel;
          setRoiStatuses({ ...statuses });
          setRoiDetectedTextLabels({ ...labels });
        }, inspectDelayMs);

        timersRef.current.push(resultTimer);
      }
    });

    setAnimationState(startedChecking ? "CHECKING" : "WAITING_PLC");
    setActiveRoiIndexes(Array.from(visibleIndexes));
    setRoiStatuses({ ...statuses });
    setRoiDetectedTextLabels({ ...labels });
  }

  function runLineContinuously() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    if (dataSource !== "api") {
      toast.warning(t("lineAnimationTest.realProfileRequired"));
      return;
    }

    if (!product.modelPath) {
      toast.warning(t("lineTest.modelRequired"));
      return;
    }

    stopLineInterval();
    clearTimers();
    clearLineSessionRefs();
    setLineRunning(true);
    setOkCount(0);
    setNgCount(0);
    setQuantity(0);
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
          : await grabLineFrameBase64(accessToken);
        const testProduct = {
          ...product,
          roiRegions: product.roiRegions,
        };
        const crops = await cropProductRois(frameBase64, testProduct);
        const response = await testInspectionImage(
          accessToken,
          product.id,
          crops.map((crop) => ({
            slotIndex: crop.slotIndex,
            imageBase64: crop.imageBase64,
          })),
          product.roiRegions,
        );
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
    setQuantity(finalIndexes.length);
    setAnimationState(finalIndexes.length > 0 ? finalState : "UNKNOWN");
    toast.success(t("lineAnimationTest.lineFinished"));
  }

  async function runRealImageTest() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    if (dataSource !== "api") {
      toast.warning(t("lineAnimationTest.realProfileRequired"));
      return;
    }

    if (!product.modelPath) {
      toast.warning(t("lineTest.modelRequired"));
      return;
    }

    if (!selectedImageBase64) {
      toast.warning(t("lineTest.selectImageFirst"));
      return;
    }

    const detectedRegions = pickDetectedRegions(detectionLayout, product.roiRegions);

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
        accessToken,
        product.id,
        crops.map((crop) => ({
          slotIndex: crop.slotIndex,
          imageBase64: crop.imageBase64,
        })),
        detectedRegions,
      );
      const detectedResultRegions = detectedRegions.filter((region) => {
        const slot = response.data.slots.find(
          (item) => item.slotIndex === region.index,
        );
        return slot?.result === "OK" || slot?.result === "NG";
      });
      const finalStatuses = Object.fromEntries(
        detectedResultRegions.map((region) => {
          const slot = response.data.slots.find(
            (item) => item.slotIndex === region.index,
          );
          return [
            region.index,
            slot?.result === "OK" ? "OK" : "NG",
          ];
        }),
      ) as Record<number, OperatorRoiStatus>;
      const finalLabels = Object.fromEntries(
        detectedResultRegions.map((region) => {
          const slot = response.data.slots.find(
            (item) => item.slotIndex === region.index,
          );
          const detectedText =
            slot?.rawText?.trim() || slot?.expectedText?.trim() || slot?.result;
          return [region.index, detectedText || finalStatuses[region.index]];
        }),
      ) as Record<number, string>;

      scheduleSessionAnimation(detectedResultRegions, finalStatuses, finalLabels);
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

  return (
    <div className="grid h-full min-h-0 gap-4">
      <Card className="border-[#86a8cf] bg-white shadow-none">
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5 text-cyan-700" />
            {t("lineAnimationTest.panelTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 min-[1080px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3">
            <div className="grid gap-3 min-[720px]:grid-cols-3">
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
                  {t("lineAnimationTest.detectLayout")}
                </label>
                <Select
                  aria-label={t("lineAnimationTest.detectLayout")}
                  value={detectionLayout}
                  className="h-11 border-slate-300 bg-white text-base"
                  onChange={(event) => {
                    setDetectionLayout(event.target.value as DetectionLayout);
                    resetScenario(false);
                  }}
                >
                  <option value="SINGLE">
                    {t("lineAnimationTest.detectLayoutSingle")}
                  </option>
                  <option value="THREE">
                    {t("lineAnimationTest.detectLayoutThree")}
                  </option>
                  <option value="ALL">
                    {t("lineAnimationTest.detectLayoutAll")}
                  </option>
                  <option value="RANDOM">
                    {t("lineAnimationTest.detectLayoutRandom")}
                  </option>
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
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 justify-start border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
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
                  {t("lineAnimationTest.roiResultDelay")}
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
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile label={t("operator.quantity")} value={quantity} />
              <MetricTile label={t("operator.ok")} value={okCount} />
              <MetricTile label={t("operator.ng")} value={ngCount} />
            </div>
          </div>

          <div className="grid gap-2">
            <Button
              type="button"
              onClick={runLineContinuously}
              disabled={lineRunning}
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
              disabled={!lineRunning && activeRoiIndexes.length === 0}
              className="border-slate-300 text-slate-800 hover:bg-slate-50"
              onClick={finishLineSession}
            >
              <Square className="h-4 w-4" />
              {t("lineAnimationTest.finishSession")}
            </Button>
            <Button
              type="button"
              onClick={() => void runRealImageTest()}
              disabled={testingRealImage}
              className="border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-800"
            >
              <FileImage className="h-4 w-4" />
              {testingRealImage
                ? t("lineAnimationTest.realTesting")
                : t("lineAnimationTest.runReal")}
            </Button>
            <Button type="button" variant="outline" onClick={() => resetScenario()}>
              <RotateCcw className="h-4 w-4" />
              {t("lineAnimationTest.reset")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 overflow-hidden border-[#86a8cf] bg-[#9fc3eb] shadow-none">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-[#86a8cf] px-4 py-3 text-center text-3xl font-bold text-[#2270c6]">
            {t("lineAnimationTest.previewTitle")}
          </div>
          <div className="min-h-0 flex-1 p-4">
            <OperatorRoiEditor
              product={displayProduct}
              onChange={() => undefined}
              overlayResult={overlayResult}
              okCount={okCount}
              ngCount={ngCount}
              roiStatuses={roiStatuses}
              roiDetectedTextLabels={roiDetectedTextLabels}
              roiCheckingLabel={t("lineAnimationTest.checkingBand")}
              interactive={false}
              previewImageSrc={selectedImageUrl}
              showClock
            />
          </div>
        </div>
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
