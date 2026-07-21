"use client";

import {
  Activity,
  Cable,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Power,
  RefreshCcw,
  Send,
  Unplug,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ApiError,
  connectPlc,
  disconnectPlc,
  executePlcCustomKey,
  pulsePlcError,
  setPlcCameraLight,
  setPlcCameraPower,
  setPlcOkResult,
  setPlcWaitingChecking,
  type PlcConfiguration,
  type PlcRuntimeStatus,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type PlcRuntimePanelProps = {
  config: PlcConfiguration | null;
  status: PlcRuntimeStatus | null;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onStatusChange: (status: PlcRuntimeStatus) => void;
};

export function PlcRuntimePanel({
  config,
  status,
  refreshing,
  onRefresh,
  onStatusChange,
}: PlcRuntimePanelProps) {
  const { apiError, t } = useI18n();
  const [action, setAction] = useState("");
  const connected = status?.connected === true;

  async function execute(
    actionKey: string,
    operation: (token: string) => Promise<{ data: PlcRuntimeStatus }>,
    successKey: string,
    errorKey = "plc.executeError",
  ) {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }
    setAction(actionKey);
    const toastId = toast.loading(t("plc.processing"));
    try {
      const response = await operation(accessToken);
      onStatusChange(response.data);
      toast.success(t(successKey), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, errorKey)
          : t(errorKey);
      toast.error(message, { id: toastId });
    } finally {
      setAction("");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-cyan-700" aria-hidden="true" />
            {t("plc.runtime")}
          </CardTitle>
          <p className="mt-1 text-sm text-slate-500">{t("plc.runtimeHint")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => void onRefresh()}
          disabled={refreshing || Boolean(action)}
        >
          <RefreshCcw
            className={["h-4 w-4", refreshing ? "animate-spin" : ""].join(" ")}
            aria-hidden="true"
          />
          {t("common.refresh")}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={statusBadgeClass(status)}>
              {statusLabel(status, t)}
            </Badge>
            <span className="text-sm text-slate-700">
              IP: <strong>{status?.host ?? config?.ipAddress ?? "-"}</strong>
            </span>
            <span className="text-sm text-slate-700">
              {t("plc.protocol")}:{" "}
              <strong>{protocolLabel(status?.protocol, t)}</strong>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {connected ? (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() =>
                  void execute(
                    "disconnect",
                    disconnectPlc,
                    "plc.disconnectSuccess",
                    "plc.disconnectError",
                  )
                }
                disabled={Boolean(action)}
              >
                <Unplug className="h-4 w-4" aria-hidden="true" />
                {t("plc.disconnect")}
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11"
                onClick={() =>
                  config
                    ? void execute(
                        "connect",
                        connectPlc,
                        "plc.connectSuccess",
                        "plc.connectError",
                      )
                    : toast.warning(t("plc.saveBeforeConnect"))
                }
                disabled={Boolean(action) || !config}
              >
                <Cable className="h-4 w-4" aria-hidden="true" />
                {action === "connect" ? t("plc.connecting") : t("plc.connect")}
              </Button>
            )}
          </div>
        </div>

        {status?.lastError ? (
          <p
            className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {status.lastError}
          </p>
        ) : null}

        <section aria-labelledby="plc-output-tests">
          <h3
            id="plc-output-tests"
            className="mb-3 font-semibold text-slate-900"
          >
            {t("plc.outputTests")}
          </h3>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <OutputControl
              icon={Power}
              label={t("plc.cameraPower")}
              value={status?.cameraPowerCommand}
              disabled={
                !connected ||
                Boolean(action) ||
                config?.cameraPowerAddress === null
              }
              onOff={() =>
                void execute(
                  "power-off",
                  (token) => setPlcCameraPower(token, false),
                  "plc.executeSuccess",
                )
              }
              onOn={() =>
                void execute(
                  "power-on",
                  (token) => setPlcCameraPower(token, true),
                  "plc.executeSuccess",
                )
              }
              t={t}
            />
            <OutputControl
              icon={Lightbulb}
              label={t("plc.cameraLight")}
              value={status?.cameraLightCommand}
              disabled={
                !connected ||
                Boolean(action) ||
                config?.cameraLightAddress === null
              }
              onOff={() =>
                void execute(
                  "light-off",
                  (token) => setPlcCameraLight(token, false),
                  "plc.executeSuccess",
                )
              }
              onOn={() =>
                void execute(
                  "light-on",
                  (token) => setPlcCameraLight(token, true),
                  "plc.executeSuccess",
                )
              }
              t={t}
            />
            <OutputControl
              icon={CheckCircle2}
              label={t("plc.okResult")}
              value={status?.okResultCommand}
              disabled={
                !connected ||
                Boolean(action) ||
                config?.okResultAddress === null
              }
              onOff={() =>
                void execute(
                  "ok-result-off",
                  (token) => setPlcOkResult(token, false),
                  "plc.executeSuccess",
                )
              }
              onOn={() =>
                void execute(
                  "ok-result-on",
                  (token) => setPlcOkResult(token, true),
                  "plc.executeSuccess",
                )
              }
              t={t}
            />
            <OutputControl
              icon={Clock3}
              label={t("plc.waitingChecking")}
              value={status?.waitingCheckingCommand}
              disabled={
                !connected ||
                Boolean(action) ||
                config?.waitingCheckingAddress === null
              }
              onOff={() =>
                void execute(
                  "waiting-checking-off",
                  (token) => setPlcWaitingChecking(token, false),
                  "plc.executeSuccess",
                )
              }
              onOn={() =>
                void execute(
                  "waiting-checking-on",
                  (token) => setPlcWaitingChecking(token, true),
                  "plc.executeSuccess",
                )
              }
              t={t}
            />
            <div className="flex min-h-28 flex-col justify-between gap-3 border border-slate-200 p-4">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <Send className="h-5 w-5 text-cyan-700" aria-hidden="true" />
                {t("plc.errorPulse")}
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() =>
                  void execute(
                    "error-pulse",
                    pulsePlcError,
                    "plc.executeSuccess",
                  )
                }
                disabled={
                  !connected ||
                  Boolean(action) ||
                  config?.errorPulseAddress === null
                }
              >
                {t("plc.sendPulse")}
              </Button>
            </div>
          </div>
        </section>

        {config?.customKeys.some(
          (key) => key.enabled && key.operation !== "watch_boolean",
        ) ? (
          <section aria-labelledby="plc-custom-tests">
            <h3
              id="plc-custom-tests"
              className="mb-3 font-semibold text-slate-900"
            >
              {t("plc.customKeys")}
            </h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {config.customKeys
                .filter(
                  (key) => key.enabled && key.operation !== "watch_boolean",
                )
                .map((key) => (
                  <div
                    key={key.id ?? key.name}
                    className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{key.name}</p>
                      <p className="text-xs text-slate-500">
                        {key.address} · {operationLabel(key.operation, t)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {key.operation === "write_boolean" ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            onClick={() =>
                              key.id &&
                              void execute(
                                `custom-${key.id}-off`,
                                (token) =>
                                  executePlcCustomKey(token, key.id!, false),
                                "plc.executeSuccess",
                              )
                            }
                            disabled={!connected || Boolean(action) || !key.id}
                          >
                            {t("plc.turnOff")}
                          </Button>
                          <Button
                            type="button"
                            className="h-11"
                            onClick={() =>
                              key.id &&
                              void execute(
                                `custom-${key.id}-on`,
                                (token) =>
                                  executePlcCustomKey(token, key.id!, true),
                                "plc.executeSuccess",
                              )
                            }
                            disabled={!connected || Boolean(action) || !key.id}
                          >
                            {t("plc.turnOn")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          className="h-11"
                          onClick={() =>
                            key.id &&
                            void execute(
                              `custom-${key.id}-pulse`,
                              (token) =>
                                executePlcCustomKey(token, key.id!, true),
                              "plc.executeSuccess",
                            )
                          }
                          disabled={!connected || Boolean(action) || !key.id}
                        >
                          {t("plc.sendPulse")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="plc-recent-signals">
          <h3
            id="plc-recent-signals"
            className="mb-3 font-semibold text-slate-900"
          >
            {t("plc.recentSignals")}
          </h3>
          {status?.recentEvents.length ? (
            <ol className="grid gap-2">
              {status.recentEvents.slice(0, 8).map((event, index) => (
                <li
                  key={`${event.at}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">
                    {event.key
                      ? signalLabel(event.key, t)
                      : statusLabelFromState(event.state, t)}
                    {typeof event.address === "number"
                      ? ` · M${event.address}`
                      : ""}
                    {typeof event.toolAddress === "number" &&
                    event.toolAddress !== event.address
                      ? ` (${t("plc.modbusCoil")} ${event.toolAddress})`
                      : ""}
                  </span>
                  <span className="text-xs text-slate-500">
                    {typeof event.value === "boolean"
                      ? event.value
                        ? "ON"
                        : "OFF"
                      : ""}{" "}
                    {formatEventTime(event.at)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              {t("plc.noSignals")}
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

type OutputControlProps = {
  icon: typeof Power;
  label: string;
  value: boolean | null | undefined;
  disabled: boolean;
  onOff: () => void;
  onOn: () => void;
  t: (key: string) => string;
};

function OutputControl({
  icon: Icon,
  label,
  value,
  disabled,
  onOff,
  onOn,
  t,
}: OutputControlProps) {
  return (
    <div className="flex min-h-28 flex-col justify-between gap-3 border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium text-slate-900">
          <Icon className="h-5 w-5 text-cyan-700" aria-hidden="true" />
          {label}
        </span>
        <Badge>{value === true ? "ON" : value === false ? "OFF" : "-"}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={onOff}
          disabled={disabled}
        >
          {t("plc.turnOff")}
        </Button>
        <Button
          type="button"
          className="h-11"
          onClick={onOn}
          disabled={disabled}
        >
          {t("plc.turnOn")}
        </Button>
      </div>
    </div>
  );
}

function protocolLabel(
  protocol: PlcRuntimeStatus["protocol"] | undefined,
  t: (key: string) => string,
) {
  if (protocol === "modbus_tcp") return t("plc.modbusTcp");
  if (protocol === "slmp") return t("plc.mitsubishiSlmp");
  return "-";
}

function statusLabel(
  status: PlcRuntimeStatus | null,
  t: (key: string) => string,
) {
  return statusLabelFromState(status?.state, t);
}

function statusLabelFromState(
  state: PlcRuntimeStatus["state"] | undefined,
  t: (key: string) => string,
) {
  const keys: Record<PlcRuntimeStatus["state"], string> = {
    not_configured: "plc.notConfigured",
    disconnected: "plc.disconnected",
    connecting: "plc.connecting",
    connected: "plc.connected",
    reconnecting: "plc.reconnecting",
    error: "plc.connectionError",
  };
  return t(state ? keys[state] : "plc.notConfigured");
}

function statusBadgeClass(status: PlcRuntimeStatus | null) {
  if (status?.state === "connected")
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status?.state === "error") return "border-red-300 bg-red-50 text-red-800";
  if (status?.state === "connecting" || status?.state === "reconnecting") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-slate-300 bg-white text-slate-700";
}

function operationLabel(
  operation: PlcConfiguration["customKeys"][number]["operation"],
  t: (key: string) => string,
) {
  if (operation === "watch_boolean") return t("plc.watchBoolean");
  if (operation === "write_boolean") return t("plc.writeBoolean");
  return t("plc.pulse");
}

function signalLabel(key: string, t: (key: string) => string) {
  const labels: Record<string, string> = {
    captureTrigger: t("plc.captureTrigger"),
    stopTrigger: t("plc.stopTrigger"),
    startTrigger: t("plc.startTrigger"),
    cameraPower: t("plc.cameraPower"),
    cameraLight: t("plc.cameraLight"),
    errorPulse: t("plc.errorPulse"),
    okResult: t("plc.okResult"),
    waitingChecking: t("plc.waitingChecking"),
  };
  return labels[key] ?? key;
}

function formatEventTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString();
}
