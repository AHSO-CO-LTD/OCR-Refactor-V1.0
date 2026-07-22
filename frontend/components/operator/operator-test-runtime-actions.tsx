"use client";

import { Camera, Pause, Play, RotateCcw, Square, Video, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type OperatorTestRuntimeActionsProps = {
  animationState: "UNKNOWN" | "CHECKING" | "WAITING_PLC" | "OK" | "NG";
  batchPaused: boolean;
  batchTesting: boolean;
  canRunFolder: boolean;
  lineRunning: boolean;
  savingBatchReport: boolean;
  testingRealImage: boolean;
  onReset: () => void;
  onRunFolder: () => void;
  onRunOnce: () => void;
  onShowState: () => void;
  onStopBatch: () => void;
  onToggleBatchPause: () => void;
  onToggleContinuous: () => void;
};

const defaultButtonClassName =
  "operator-line-action-button h-14 border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 opacity-100 hover:bg-[#8fb8e6] disabled:opacity-70";
const activeButtonClassName =
  "operator-line-action-button h-14 border-emerald-800 bg-emerald-700 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-70";

export function OperatorTestRuntimeActions({
  animationState,
  batchPaused,
  batchTesting,
  canRunFolder,
  lineRunning,
  savingBatchReport,
  testingRealImage,
  onReset,
  onRunFolder,
  onRunOnce,
  onShowState,
  onStopBatch,
  onToggleBatchPause,
  onToggleContinuous,
}: OperatorTestRuntimeActionsProps) {
  const { t } = useI18n();
  const busy = testingRealImage || batchTesting || lineRunning;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        className={defaultButtonClassName}
        onClick={onRunOnce}
      >
        <Camera className="h-5 w-5" />
        {testingRealImage
          ? t("lineAnimationTest.realTesting")
          : t("lineAnimationTest.runOnce")}
      </Button>

      <Button
        type="button"
        variant="outline"
        aria-pressed={lineRunning}
        disabled={testingRealImage || batchTesting}
        className={lineRunning ? activeButtonClassName : defaultButtonClassName}
        onClick={onToggleContinuous}
      >
        {lineRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        {t(
          lineRunning
            ? "lineAnimationTest.checkingOff"
            : "lineAnimationTest.checkingOn",
        )}
      </Button>

      {batchTesting ? (
        <>
          <Button
            type="button"
            variant="outline"
            className={batchPaused ? defaultButtonClassName : activeButtonClassName}
            onClick={onToggleBatchPause}
          >
            {batchPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            {t(
              batchPaused
                ? "lineTest.resumeBatchTest"
                : "lineTest.pauseBatchTest",
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="operator-line-action-button h-14 border-red-700 bg-red-700 text-base font-semibold text-white hover:bg-red-800"
            onClick={onStopBatch}
          >
            <Square className="h-5 w-5" />
            {t("lineTest.stopBatchTest")}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={!canRunFolder || busy}
          className={defaultButtonClassName}
          onClick={onRunFolder}
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
        className={defaultButtonClassName}
        onClick={onShowState}
      >
        <Video className="h-5 w-5" />
        {t(`lineAnimationTest.state${animationState}`)}
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={batchTesting}
        className={defaultButtonClassName}
        onClick={onReset}
      >
        <RotateCcw className="h-5 w-5" />
        {t("operator.resetCounter")}
      </Button>
    </>
  );
}
