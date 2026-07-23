"use client";

import { useI18n } from "@/lib/i18n";

type OperatorModeStatusProps = {
  active: boolean;
  operationMode: "manual" | "auto";
};

type OperatorAiStatusProps = {
  realtimeAiEnabled: boolean;
};

type OperatorLiveCameraStatusProps = {
  liveCameraEnabled: boolean;
};

type OperatorPlcStatusProps = {
  connected: boolean;
};

const statusBoxClassName =
  "operator-preview-runtime-status shrink-0 whitespace-nowrap border px-3 py-1.5 text-left text-sm leading-5 text-white";

export function OperatorModeStatus({
  active,
  operationMode,
}: OperatorModeStatusProps) {
  const { t } = useI18n();

  return (
    <div
      className={[
        statusBoxClassName,
        active
          ? "border-emerald-500 bg-emerald-700/95"
          : "border-white/20 bg-black/80",
      ].join(" ")}
      aria-live="polite"
    >
      <span
        className={[
          "font-medium",
          active ? "text-emerald-100" : "text-white/60",
        ].join(" ")}
      >
        {t("operator.currentMode")}:{" "}
      </span>
      <span className="font-bold">
        {active
          ? t(operationMode === "auto" ? "operator.auto" : "operator.manual")
          : t("operator.off")}
      </span>
    </div>
  );
}

export function OperatorAiStatus({
  realtimeAiEnabled,
}: OperatorAiStatusProps) {
  const { t } = useI18n();

  return (
    <div
      className={[
        statusBoxClassName,
        realtimeAiEnabled
          ? "border-emerald-500 bg-emerald-700/95"
          : "border-white/20 bg-black/80",
      ].join(" ")}
      aria-live="polite"
    >
      <span
        className={[
          "font-medium",
          realtimeAiEnabled ? "text-emerald-100" : "text-white/60",
        ].join(" ")}
      >
        {t("operator.aiStatus")}:{" "}
      </span>
      <span className="font-bold">
        {t(realtimeAiEnabled ? "operator.on" : "operator.off")}
      </span>
    </div>
  );
}

export function OperatorLiveCameraStatus({
  liveCameraEnabled,
}: OperatorLiveCameraStatusProps) {
  const { t } = useI18n();

  return (
    <div
      className={[
        "inline-flex items-center border px-2.5 py-1 text-xs font-semibold",
        liveCameraEnabled
          ? "border-emerald-500 bg-emerald-700/95 text-white"
          : "border-white/20 bg-black/80 text-white",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      {t("operator.liveCamera")}: {t(liveCameraEnabled ? "operator.on" : "operator.off")}
    </div>
  );
}

export function OperatorPlcStatus({ connected }: OperatorPlcStatusProps) {
  const { t } = useI18n();

  return (
    <div
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors text-white",
        connected
          ? "border-emerald-500 bg-emerald-700/95"
          : "border-red-400 bg-red-700/95",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      {t("operator.plc")}: {t(connected ? "operator.connected" : "operator.disconnected")}
    </div>
  );
}
