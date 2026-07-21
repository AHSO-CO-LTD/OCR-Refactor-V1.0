"use client";

import { Camera, RotateCcw, Settings2, Video, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type OperatorRuntimeActionsProps = {
  actionsLocked: boolean;
  controlsDisabled: boolean;
  controlUpdating: boolean;
  liveCameraEnabled: boolean;
  operationMode: "manual" | "auto";
  realtimeAiEnabled: boolean;
  runtimeControlsActive: boolean;
  scanRunning: boolean;
  onGrab: () => void;
  onLiveCameraToggle: () => void;
  onRealtimeAiToggle: () => void;
  onModeChange: (mode: "manual" | "auto") => void;
  onResetCounter: () => void;
};

const baseClassName =
  "operator-line-action-button h-14 border-[#1e293b] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70";
const enabledClassName =
  "border-emerald-800 bg-emerald-700 text-white hover:bg-emerald-800";
const defaultClassName = "bg-[#9fc3eb]";
const actionFlashDurationMs = 450;

export function OperatorRuntimeActions({
  actionsLocked,
  controlsDisabled,
  controlUpdating,
  liveCameraEnabled,
  operationMode,
  realtimeAiEnabled,
  runtimeControlsActive,
  scanRunning,
  onGrab,
  onLiveCameraToggle,
  onRealtimeAiToggle,
  onModeChange,
  onResetCounter,
}: OperatorRuntimeActionsProps) {
  const { t } = useI18n();
  const [flashingAction, setFlashingAction] = useState<
    "grab" | "reset" | null
  >(null);
  const flashTimerRef = useRef<number | null>(null);
  const sharedDisabled = actionsLocked || controlsDisabled || controlUpdating;
  const stateClassName = (active: boolean) =>
    [baseClassName, active ? enabledClassName : defaultClassName].join(" ");

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  function runWithFlash(action: "grab" | "reset", callback: () => void) {
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }

    setFlashingAction(action);
    flashTimerRef.current = window.setTimeout(() => {
      flashTimerRef.current = null;
      setFlashingAction(null);
    }, actionFlashDurationMs);
    callback();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={
          sharedDisabled ||
          scanRunning ||
          operationMode === "auto" ||
          (liveCameraEnabled && !realtimeAiEnabled)
        }
        className={stateClassName(flashingAction === "grab")}
        onClick={() => runWithFlash("grab", onGrab)}
      >
        <Camera className="h-5 w-5" />
        {scanRunning ? t("lineAnimationTest.realTesting") : t("operator.grab")}
      </Button>

      <Button
        type="button"
        variant="outline"
        aria-pressed={runtimeControlsActive && liveCameraEnabled}
        disabled={sharedDisabled}
        className={`${baseClassName} ${
          runtimeControlsActive && liveCameraEnabled
            ? enabledClassName
            : defaultClassName
        }`}
        onClick={onLiveCameraToggle}
      >
        <Video className="h-5 w-5" />
        {t("operator.liveCamera")}
      </Button>

      <Button
        type="button"
        variant="outline"
        aria-pressed={runtimeControlsActive && realtimeAiEnabled}
        disabled={sharedDisabled || scanRunning}
        className={stateClassName(
          runtimeControlsActive && realtimeAiEnabled,
        )}
        onClick={onRealtimeAiToggle}
      >
        <Zap className="h-5 w-5" />
        {t("operator.realTimeAi")}
      </Button>

      <Button
        type="button"
        variant="outline"
        aria-pressed={runtimeControlsActive && operationMode === "manual"}
        disabled={sharedDisabled}
        className={stateClassName(
          runtimeControlsActive && operationMode === "manual",
        )}
        onClick={() => onModeChange("manual")}
      >
        <Settings2 className="h-5 w-5" />
        {t("operator.manual")}
      </Button>

      <Button
        type="button"
        variant="outline"
        aria-pressed={runtimeControlsActive && operationMode === "auto"}
        disabled={sharedDisabled || scanRunning}
        className={stateClassName(
          runtimeControlsActive && operationMode === "auto",
        )}
        onClick={() => onModeChange("auto")}
      >
        <Settings2 className="h-5 w-5" />
        {t("operator.auto")}
      </Button>

      <Button
        type="button"
        variant="outline"
        className={stateClassName(flashingAction === "reset")}
        onClick={() => runWithFlash("reset", onResetCounter)}
      >
        <RotateCcw className="h-5 w-5" />
        {t("operator.resetCounter")}
      </Button>
    </>
  );
}
