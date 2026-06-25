"use client";

import {
  Camera,
  CheckCircle2,
  CircleDot,
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
import { OperatorRoiEditor } from "@/components/operator/operator-roi-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  listProductProfiles,
  type ProductProfile,
  updateProductBatchSize,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";
import { getResultSoundLevel, getSoundSettings } from "@/lib/sound-settings";

type ResultState = "OK" | "NG";
type DataSource = "api" | "demo";

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

function playInspectionSound(result: ResultState) {
  const AudioContextClass =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const soundSettings = getSoundSettings();
  const level = getResultSoundLevel(soundSettings, result);

  if (level <= 0) {
    return;
  }

  const context = new AudioContextClass();

  const playBurst = (
    startAt: number,
    frequency: number,
    duration: number,
    oscillatorType: OscillatorType,
    volume: number,
  ) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = oscillatorType;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  };

  if (result === "OK") {
    playBurst(context.currentTime, 880, 0.18, "sine", 0.16 * level);
    window.setTimeout(() => void context.close(), 320);
    return;
  }

  playBurst(context.currentTime, 150, 0.18, "sawtooth", 0.2 * level);
  playBurst(context.currentTime + 0.24, 120, 0.22, "sawtooth", 0.2 * level);
  window.setTimeout(() => void context.close(), 620);
}

export function OperatorRuntimePanel() {
  const { t } = useI18n();
  const overlayTimeoutRef = useRef<number | null>(null);
  const batchCountRef = useRef(0);
  const batchQuantityRef = useRef(0);
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
  const [overlayResult, setOverlayResult] = useState<ResultState | null>(null);

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
          setBatchSize(activeProducts[0].batchSize || 1);
          setBatchDraft(String(activeProducts[0].batchSize || 1));
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
    return () => {
      if (overlayTimeoutRef.current) {
        window.clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  const selectedProduct = useMemo(
    () =>
      products.find((product) => product.id === selectedProductId) ??
      products[0] ??
      demoProducts[0],
    [products, selectedProductId],
  );
  const displayProduct =
    selectedProduct.camera.deviceName === "demo-camera"
      ? {
          ...selectedProduct,
          camera: {
            ...selectedProduct.camera,
            deviceName: t("operator.demoCamera"),
          },
        }
      : selectedProduct;
  const {
    imageSrc: livePreviewImageSrc,
  } = useConnectedCameraPreview(selectedProduct.camera.deviceName);

  const roiCount = displayProduct.roiRegions.length;
  const safeBatchSize = Math.max(1, Number(batchSize) || 1);

  function handleRoiChange(newRois: typeof selectedProduct.roiRegions) {
    setProducts((current) =>
      current.map((product) =>
        product.id === selectedProductId
          ? { ...product, roiRegions: newRois }
          : product,
      ),
    );
  }

  function resetCounters(showToast = true) {
    setOkCount(0);
    setNgCount(0);
    batchCountRef.current = 0;
    batchQuantityRef.current = 0;
    setBatchCount(0);
    setBatchQuantity(0);
    setScanCount(0);

    if (showToast) {
      toast.success(t("operator.resetDone"));
    }
  }

  function handleProductChange(nextProductId: string) {
    setSelectedProductId(nextProductId);
    const nextProduct =
      products.find((product) => product.id === nextProductId) ?? demoProducts[0];
    setBatchSize(nextProduct.batchSize || 1);
    setBatchDraft(String(nextProduct.batchSize || 1));
    setKeypadOpen(false);
    resetCounters(false);
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
      const nextBatchQuantity = batchQuantityRef.current;

      if (nextBatchQuantity >= response.data.batchSize) {
        const batchIncrement = Math.floor(
          nextBatchQuantity / response.data.batchSize,
        );
        const remainder = nextBatchQuantity % response.data.batchSize;

        batchCountRef.current += batchIncrement;
        batchQuantityRef.current = remainder;
        setBatchCount(batchCountRef.current);
        setBatchQuantity(remainder);
      }
      setKeypadOpen(false);
      toast.success(t("operator.packSizeSaved"));
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? t("products.saveError")
          : t("products.saveError");
      toast.error(message);
    } finally {
      setSavingBatch(false);
    }
  }

  function triggerResult(result: ResultState) {
    const countIncrement = roiCount;
    const nextBatchQuantity = batchQuantityRef.current + countIncrement;
    const batchIncrement = Math.floor(nextBatchQuantity / safeBatchSize);
    const remainder = nextBatchQuantity % safeBatchSize;

    setOverlayResult(result);
    setScanCount(countIncrement);

    if (result === "OK") {
      setOkCount((current) => current + countIncrement);
    } else {
      setNgCount((current) => current + countIncrement);
    }

    batchCountRef.current += batchIncrement;
    batchQuantityRef.current = remainder;
    setBatchCount(batchCountRef.current);
    setBatchQuantity(remainder);

    try {
      playInspectionSound(result);
    } catch {
      toast.warning(t("operator.soundBlocked"));
    }

    if (overlayTimeoutRef.current) {
      window.clearTimeout(overlayTimeoutRef.current);
    }

    overlayTimeoutRef.current = window.setTimeout(
      () => setOverlayResult(null),
      result === "OK" ? 900 : 1250,
    );
  }

  const actionButtons = (
    <>
      <Button
        type="button"
        variant="outline"
        disabled
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100"
      >
        <Camera className="h-5 w-5" />
        {t("operator.grab")}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100"
      >
        <Video className="h-5 w-5" />
        {t("operator.liveCamera")}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100"
      >
        <Zap className="h-5 w-5" />
        {t("operator.realTimeAi")}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100"
      >
        <Settings2 className="h-5 w-5" />
        {t("operator.manual")}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100"
      >
        <Settings2 className="h-5 w-5" />
        {t("operator.auto")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 hover:bg-[#8fb8e6]"
        onClick={() => resetCounters(true)}
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
                  disabled={loadingProducts}
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
                    disabled={savingBatch}
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
              interactive={false}
              previewImageSrc={livePreviewImageSrc}
              showClock
              topRightControls={
                <>
                  <Button
                    type="button"
                    className="border-[#23a24d] bg-[#17b74f] text-white hover:bg-[#11923f]"
                    onClick={() => triggerResult("OK")}
                  >
                    <CheckCircle2 className="h-4 w-4 text-white" />
                    {t("operator.triggerOk")}
                  </Button>
                  <Button
                    type="button"
                    className="border-[#c43b30] bg-[#e53935] text-white hover:bg-[#c62828]"
                    onClick={() => triggerResult("NG")}
                  >
                    <CircleDot className="h-4 w-4 text-white" />
                    {t("operator.triggerNg")}
                  </Button>
                </>
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
