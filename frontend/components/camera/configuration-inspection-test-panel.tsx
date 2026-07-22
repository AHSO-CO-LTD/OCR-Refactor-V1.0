"use client";

import { Camera, FileImage, Play, Settings2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { toast } from "sonner";
import { usePlcCaptureTrigger } from "@/components/plc/use-plc-capture-trigger";
import { PlcTestOutputToggle } from "@/components/plc/plc-test-output-toggle";
import { usePlcTestOutputSession } from "@/components/plc/use-plc-test-output-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  grabCameraFrame,
  testInspectionImage,
  type CameraFrame,
  type ProductProfile,
  type TestInspectionImageResult,
} from "@/lib/api";
import {
  cameraFrameToDataUrl,
  cropProductRois,
  readImageFileAsDataUrl,
} from "@/lib/inspection-test-image";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type TestMode = "manual" | "auto";
type TestSource = "camera" | "image";

export type ConfigurationTestPreview = {
  frame: CameraFrame | null;
  imageSource: string;
  source: TestSource;
  sourceLabel: string;
};

type ConfigurationInspectionTestPanelProps = {
  connected: boolean;
  disabled: boolean;
  hasUnsavedChanges: boolean;
  onPreviewChange: (preview: ConfigurationTestPreview | null) => void;
  onResultChange: (result: TestInspectionImageResult | null) => void;
  onRunningChange: (running: boolean) => void;
  product: ProductProfile | null;
};

export function ConfigurationInspectionTestPanel({
  connected,
  disabled,
  hasUnsavedChanges,
  onPreviewChange,
  onResultChange,
  onRunningChange,
  product,
}: ConfigurationInspectionTestPanelProps) {
  const { apiError, t } = useI18n();
  const [mode, setMode] = useState<TestMode>("manual");
  const [source, setSource] = useState<TestSource>("camera");
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState("");
  const [selectedImageName, setSelectedImageName] = useState("");
  const [latestResult, setLatestResult] =
    useState<TestInspectionImageResult | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    emitResultPulse: emitPlcTestResultPulse,
    outputEnabled: plcTestOutputEnabled,
    outputUpdating: plcTestOutputUpdating,
    sessionReady: plcTestSessionReady,
    setOutputEnabled: setPlcTestOutputEnabled,
  } = usePlcTestOutputSession(true);

  const productReady = Boolean(
    product?.modelPath && product.roiRegions.length > 0,
  );
  const sourceReady =
    source === "camera" ? connected : Boolean(selectedImageDataUrl);
  const testReady =
    Boolean(product) &&
    productReady &&
    sourceReady &&
    plcTestSessionReady &&
    !disabled &&
    !hasUnsavedChanges;

  useEffect(() => {
    return () => onRunningChange(false);
  }, [onRunningChange]);

  usePlcCaptureTrigger({
    enabled: mode === "auto" && testReady && plcTestSessionReady,
    onTrigger: () => runTest("plc"),
  });

  function setTestRunning(nextRunning: boolean) {
    runningRef.current = nextRunning;
    setRunning(nextRunning);
    onRunningChange(nextRunning);
  }

  function selectMode(nextMode: TestMode) {
    if (mode === nextMode) return;
    setMode(nextMode);

    if (nextMode === "auto") {
      if (hasUnsavedChanges) {
        toast.warning(t("configuration.test.saveBeforeTest"));
      } else {
        toast.success(t("configuration.test.autoEnabled"));
      }
      return;
    }

    toast.success(t("configuration.test.manualEnabled"));
  }

  function selectCameraSource() {
    setSource("camera");
    setLatestResult(null);
    onPreviewChange(null);
    onResultChange(null);
    toast.success(t("configuration.test.cameraSelected"));
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const imageSource = await readImageFileAsDataUrl(file);
      setSource("image");
      setSelectedImageDataUrl(imageSource);
      setSelectedImageName(file.name);
      setLatestResult(null);
      onResultChange(null);
      onPreviewChange({
        frame: null,
        imageSource,
        source: "image",
        sourceLabel: file.name,
      });
      toast.success(t("configuration.test.imageSelected"));
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : t("configuration.test.imageReadError"),
      );
    }
  }

  async function runTest(trigger: "manual" | "plc") {
    if (runningRef.current) {
      if (trigger === "manual") {
        toast.warning(t("configuration.test.busy"));
      }
      return;
    }

    if (trigger === "manual" && mode !== "manual") return;
    if (!plcTestSessionReady) {
      toast.warning(t("plcTestOutput.sessionNotReady"));
      return;
    }
    if (!product) {
      toast.warning(t("camera.selectProductFirst"));
      return;
    }
    if (hasUnsavedChanges) {
      toast.warning(t("configuration.test.saveBeforeTest"));
      return;
    }
    if (!product.modelPath) {
      toast.warning(t("lineTest.modelRequired"));
      return;
    }
    if (product.roiRegions.length === 0) {
      toast.warning(t("lineAnimationTest.noRoi"));
      return;
    }
    if (source === "camera" && !connected) {
      toast.warning(t("configuration.test.cameraRequired"));
      return;
    }
    if (source === "image" && !selectedImageDataUrl) {
      toast.warning(t("configuration.test.imageRequired"));
      return;
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setTestRunning(true);
    setLatestResult(null);
    onResultChange(null);
    const toastId = toast.loading(
      trigger === "plc"
        ? t("configuration.test.plcTriggered")
        : t("configuration.test.running"),
    );

    try {
      let imageSource = selectedImageDataUrl;

      if (source === "camera") {
        const capturedFrame = await grabCameraFrame(accessToken);
        if (!capturedFrame.success || !capturedFrame.image_base64) {
          throw new Error(t("camera.grabError"));
        }
        imageSource = cameraFrameToDataUrl(capturedFrame);
        onPreviewChange({
          frame: capturedFrame,
          imageSource,
          source: "camera",
          sourceLabel: product.camera.deviceName || t("operator.liveCamera"),
        });
      } else {
        onPreviewChange({
          frame: null,
          imageSource,
          source: "image",
          sourceLabel: selectedImageName,
        });
      }

      const crops = await cropProductRois(imageSource, product);
      const response = await testInspectionImage(
        accessToken,
        product.id,
        crops.map((crop) => ({
          slotIndex: crop.slotIndex,
          imageBase64: crop.imageBase64,
        })),
        product.roiRegions,
      );

      setLatestResult(response.data);
      onResultChange(response.data);
      await emitPlcTestResultPulse(response.data.result);
      toast.success(t("configuration.test.completed"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "configuration.test.failed")
          : cause instanceof Error
            ? cause.message
            : t("configuration.test.failed");
      toast.error(message, { id: toastId });
    } finally {
      setTestRunning(false);
    }
  }

  const status = testStatus({
    hasUnsavedChanges,
    latestResult,
    mode,
    sessionReady: plcTestSessionReady,
    running,
    sourceReady,
    t,
  });

  return (
    <section
      className="border-t border-slate-200 bg-slate-50 p-3"
      aria-label={t("configuration.test.title")}
    >
      <div className="grid gap-3 sm:grid-cols-2 min-[1050px]:grid-cols-[auto_auto_minmax(220px,1fr)_auto] min-[1050px]:items-center">
        <div className="grid grid-cols-2 border border-slate-300 bg-white p-1">
          <ModeButton
            active={mode === "manual"}
            label={t("operator.manual")}
            onClick={() => selectMode("manual")}
          />
          <ModeButton
            active={mode === "auto"}
            label={t("operator.auto")}
            onClick={() => selectMode("auto")}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            aria-pressed={source === "camera"}
            className={sourceButtonClassName(source === "camera")}
            onClick={selectCameraSource}
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            {t("configuration.test.realCamera")}
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={source === "image"}
            className={sourceButtonClassName(source === "image")}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileImage className="h-4 w-4" aria-hidden="true" />
            {selectedImageName || t("configuration.test.chooseImage")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleImageChange(event)}
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <PlcTestOutputToggle
            disabled={!plcTestSessionReady || plcTestOutputUpdating || running}
            enabled={plcTestOutputEnabled}
            onChange={setPlcTestOutputEnabled}
          />
          <Badge className={status.className}>{status.label}</Badge>
          {latestResult ? (
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-600">
              {t("lineTest.processingTime")}: {latestResult.cycleTimeMs.toFixed(0)} ms
            </span>
          ) : null}
          <span className="text-xs text-slate-500">
            {t("configuration.test.isolatedHint")} {t(
              plcTestOutputEnabled
                ? "plcTestOutput.hintEnabled"
                : "plcTestOutput.hintDisabled",
            )}
          </span>
        </div>

        <Button
          type="button"
          disabled={mode === "auto" || !testReady || running}
          className="h-11 min-w-40"
          onClick={() => void runTest("manual")}
        >
          {mode === "auto" ? (
            <Settings2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          {running
            ? t("configuration.test.running")
            : mode === "auto"
              ? t("configuration.test.waitingPlc")
              : t("configuration.test.runOnce")}
        </Button>
      </div>

      {hasUnsavedChanges ? (
        <div
          className="mt-3 border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
          role="status"
        >
          {t("configuration.test.saveBeforeTest")}
        </div>
      ) : null}
    </section>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={[
        "flex min-h-10 min-w-28 items-center justify-center gap-2 px-4 text-sm font-semibold transition active:translate-y-px",
        active
          ? "bg-emerald-700 text-white"
          : "bg-white text-slate-600 hover:bg-slate-100",
      ].join(" ")}
      onClick={onClick}
    >
      <Settings2 className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function sourceButtonClassName(active: boolean) {
  return [
    "h-11 min-w-36 overflow-hidden px-3 text-sm",
    active
      ? "border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-800"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
  ].join(" ");
}

function testStatus({
  hasUnsavedChanges,
  latestResult,
  mode,
  sessionReady,
  running,
  sourceReady,
  t,
}: {
  hasUnsavedChanges: boolean;
  latestResult: TestInspectionImageResult | null;
  mode: TestMode;
  sessionReady: boolean;
  running: boolean;
  sourceReady: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (running) {
    return {
      className: "border-amber-300 bg-amber-50 text-amber-800",
      label: t("configuration.test.running"),
    };
  }
  if (hasUnsavedChanges) {
    return {
      className: "border-amber-300 bg-amber-50 text-amber-800",
      label: t("configuration.test.unsaved"),
    };
  }
  if (!sessionReady) {
    return {
      className: "border-cyan-300 bg-cyan-50 text-cyan-800",
      label: t("plcTestOutput.sessionPreparing"),
    };
  }
  if (latestResult) {
    return resultStatus(latestResult.result);
  }
  if (!sourceReady) {
    return {
      className: "border-slate-300 bg-white text-slate-600",
      label: t("configuration.test.selectSource"),
    };
  }
  if (mode === "auto") {
    return {
      className: "border-cyan-300 bg-cyan-50 text-cyan-800",
      label: t("configuration.test.waitingPlc"),
    };
  }
  return {
    className: "border-slate-300 bg-white text-slate-600",
    label: t("configuration.test.ready"),
  };
}

function resultStatus(result: TestInspectionImageResult["result"]) {
  if (result === "OK") {
    return {
      className: "border-emerald-300 bg-emerald-50 text-emerald-800",
      label: "OK",
    };
  }
  if (result === "NG") {
    return {
      className: "border-red-300 bg-red-50 text-red-800",
      label: "NG",
    };
  }
  return {
    className: "border-slate-300 bg-white text-slate-700",
    label: "UNKNOWN",
  };
}
