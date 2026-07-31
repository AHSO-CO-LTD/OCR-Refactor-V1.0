"use client";

import {
  Cable,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Power,
  Radio,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  disablePlcSimulator,
  emitPlcSimulatorSignal,
  enablePlcSimulator,
  getPlcConfiguration,
  getPlcStatus,
  heartbeatPlcSimulator,
  type PlcConfiguration,
  type PlcRuntimeEvent,
  type PlcRuntimeStatus,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  getOrCreatePlcSimulatorSession,
  updatePlcSimulatorSession,
} from "@/lib/plc-simulator-session";
import { getAccessToken } from "@/lib/session";

const STATUS_POLL_MS = 500;
const HEARTBEAT_MS = 5_000;

export function DevPlcSimulator({ userId }: { userId: string }) {
  const { apiError, t } = useI18n();
  const clientIdRef = useRef("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PlcRuntimeStatus | null>(null);
  const [config, setConfig] = useState<PlcConfiguration | null>(null);
  const [ownsLease, setOwnsLease] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [action, setAction] = useState("");
  const [eventsClearedAt, setEventsClearedAt] = useState(0);
  const simulatorActive = status?.simulatorActive === true;

  const refresh = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    const [statusResponse, configResponse] = await Promise.all([
      getPlcStatus(accessToken),
      getPlcConfiguration(accessToken),
    ]);
    setStatus(statusResponse.data);
    setConfig(configResponse.data);
    if (!statusResponse.data.simulatorActive) {
      setOwnsLease(false);
      updatePlcSimulatorSession(userId, { active: false });
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const session = getOrCreatePlcSimulatorSession(userId);
    clientIdRef.current = session.clientId;

    async function restoreSession() {
      await Promise.resolve();
      if (cancelled) return;
      setOpen(session.open);

      const accessToken = getAccessToken();
      if (!accessToken) {
        if (!cancelled) setSessionReady(true);
        return;
      }

      if (session.active) {
        try {
          const response = await heartbeatPlcSimulator(
            accessToken,
            session.clientId,
          );
          if (!cancelled) {
            setStatus(response.data);
            setOwnsLease(true);
          }
        } catch {
          updatePlcSimulatorSession(userId, { active: false });
          if (!cancelled) {
            setOwnsLease(false);
            await refresh().catch(() => undefined);
          }
        }
      } else {
        await refresh().catch(() => undefined);
      }

      if (!cancelled) setSessionReady(true);
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (!open && !ownsLease) return;
    const initialTimer = window.setTimeout(() => {
      void refresh().catch(() => undefined);
    }, 0);
    const interval = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, STATUS_POLL_MS);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [open, ownsLease, refresh]);

  useEffect(() => {
    if (!ownsLease) return;
    const heartbeat = async () => {
      const accessToken = getAccessToken();
      if (!accessToken) {
        setOwnsLease(false);
        return;
      }
      try {
        const response = await heartbeatPlcSimulator(
          accessToken,
          clientIdRef.current,
        );
        setStatus(response.data);
      } catch {
        setOwnsLease(false);
      }
    };
    const interval = window.setInterval(() => void heartbeat(), HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [ownsLease]);

  async function handleEnable() {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setAction("enable");
    const toastId = toast.loading(t("plcSimulator.enabling"));
    try {
      const response = await enablePlcSimulator(
        accessToken,
        clientIdRef.current,
      );
      setStatus(response.data);
      setOwnsLease(true);
      updatePlcSimulatorSession(userId, { active: true });
      toast.success(t("plcSimulator.enabled"), { id: toastId });
    } catch (cause) {
      toast.error(
        formatError(
          cause,
          apiError,
          t,
          "plcSimulator.enableError",
        ),
        { id: toastId },
      );
    } finally {
      setAction("");
    }
  }

  async function handleDisable() {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setAction("disable");
    const toastId = toast.loading(t("plcSimulator.disabling"));
    try {
      const response = await disablePlcSimulator(
        accessToken,
        clientIdRef.current,
      );
      setStatus(response.data);
      setOwnsLease(false);
      updatePlcSimulatorSession(userId, { active: false });
      toast.success(t("plcSimulator.disabled"), { id: toastId });
    } catch (cause) {
      toast.error(
        formatError(
          cause,
          apiError,
          t,
          "plcSimulator.disableError",
        ),
        { id: toastId },
      );
    } finally {
      setAction("");
    }
  }

  async function handleSignal(key: string) {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setAction(`signal:${key}`);
    try {
      const response = await emitPlcSimulatorSignal(
        accessToken,
        clientIdRef.current,
        key,
      );
      setStatus(response.data);
      toast.success(
        t("plcSimulator.signalSent").replace("{signal}", signalLabel(key, t)),
      );
    } catch (cause) {
      toast.error(
        formatError(
          cause,
          apiError,
          t,
          "plcSimulator.signalError",
        ),
      );
    } finally {
      setAction("");
    }
  }

  const inputs = useMemo(
    () => [
      { key: "startTrigger", label: t("plc.startTrigger") },
      { key: "stopTrigger", label: t("plc.stopTrigger") },
      { key: "captureTrigger", label: t("plc.captureTrigger") },
      ...(config?.customKeys ?? [])
        .filter((key) => key.enabled && key.operation === "watch_boolean")
        .map((key) => ({ key: key.name, label: key.name })),
    ],
    [config, t],
  );
  const visibleEvents = (status?.recentEvents ?? []).filter(
    (event) => Date.parse(event.at) > eventsClearedAt,
  );

  return (
    <div className="fixed bottom-5 right-5 z-[80] flex flex-col items-end gap-3">
      {open ? (
        <section
          className="flex max-h-[min(720px,calc(100dvh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col border border-slate-300 bg-white text-slate-950 shadow-xl"
          aria-label={t("plcSimulator.title")}
        >
          <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
            <Radio className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t("plcSimulator.title")}</div>
              <div className="text-xs text-slate-300">
                {simulatorActive
                  ? t("plcSimulator.active")
                  : t("plcSimulator.inactive")}
              </div>
            </div>
            <Badge
              className={
                simulatorActive
                  ? "border-emerald-400 bg-emerald-950 text-emerald-200"
                  : "border-slate-500 bg-slate-900 text-slate-300"
              }
            >
              SIM
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => {
                setOpen(false);
                updatePlcSimulatorSession(userId, { open: false });
              }}
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </header>

          <div className="grid min-h-0 gap-4 overflow-y-auto p-4">
            <div className="flex flex-wrap gap-2">
              {simulatorActive && ownsLease ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => void handleDisable()}
                  disabled={Boolean(action)}
                >
                  <CircleStop className="h-4 w-4" aria-hidden="true" />
                  {action === "disable"
                    ? t("plcSimulator.disabling")
                    : t("plcSimulator.disable")}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-11 flex-1"
                  onClick={() => void handleEnable()}
                  disabled={Boolean(action) || !config}
                >
                  <Power className="h-4 w-4" aria-hidden="true" />
                  {action === "enable"
                    ? t("plcSimulator.enabling")
                    : t("plcSimulator.enable")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => void refresh()}
                disabled={Boolean(action)}
              >
                <Cable className="h-4 w-4" aria-hidden="true" />
                {t("common.refresh")}
              </Button>
            </div>

            {!config ? (
              <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {t("plcSimulator.configRequired")}
              </p>
            ) : null}

            <section className="grid gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  {t("plcSimulator.plcToApp")}
                </h3>
                <ChevronDown
                  className="h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {inputs.map((input) => (
                  <Button
                    key={input.key}
                    type="button"
                    variant="outline"
                    className="h-12 justify-start"
                    disabled={
                      !simulatorActive ||
                      !ownsLease ||
                      Boolean(action)
                    }
                    onClick={() => void handleSignal(input.key)}
                  >
                    <ScanLine className="h-4 w-4" aria-hidden="true" />
                    <span className="truncate">{input.label}</span>
                  </Button>
                ))}
              </div>
            </section>

            <section className="grid gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  {t("plcSimulator.appToPlc")}
                </h3>
                <ChevronUp
                  className="h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <OutputIndicator
                  label={t("plc.cameraPower")}
                  value={status?.cameraPowerCommand}
                />
                <OutputIndicator
                  label={t("plc.cameraLight")}
                  value={status?.cameraLightCommand}
                />
                <OutputIndicator
                  label={t("plc.waitingChecking")}
                  value={status?.waitingCheckingCommand}
                />
              </div>
            </section>

            <section className="grid min-h-0 gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  {t("plcSimulator.timeline")}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEventsClearedAt(Date.now())}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {t("plcSimulator.clear")}
                </Button>
              </div>
              <div className="max-h-52 overflow-y-auto border border-slate-200">
                {visibleEvents.length > 0 ? (
                  <ul className="divide-y divide-slate-200">
                    {visibleEvents.slice(0, 30).map((event, index) => (
                      <SimulatorEventRow
                        key={
                          event.id ??
                          `${event.at}:${event.type}:${event.key ?? "event"}:${event.value ?? "none"}:${index}`
                        }
                        event={event}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="p-4 text-center text-sm text-slate-500">
                    {t("plcSimulator.noEvents")}
                  </p>
                )}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      <Button
        type="button"
        size="icon"
        className={[
          "h-14 w-14 rounded-full border-2 shadow-lg",
          simulatorActive
            ? "border-emerald-300 bg-emerald-700 hover:bg-emerald-800"
            : "border-slate-300 bg-slate-950 hover:bg-slate-800",
        ].join(" ")}
        onClick={() =>
          setOpen((current) => {
            const next = !current;
            updatePlcSimulatorSession(userId, { open: next });
            return next;
          })
        }
        disabled={!sessionReady}
        aria-label={t("plcSimulator.open")}
        title={t("plcSimulator.open")}
      >
        <Radio className="h-6 w-6" aria-hidden="true" />
      </Button>
    </div>
  );
}

function OutputIndicator({
  label,
  value,
}: {
  label: string;
  value?: boolean | null;
}) {
  return (
    <div className="grid min-h-20 place-items-center border border-slate-200 bg-slate-50 p-2 text-center">
      <span
        className={[
          "h-3 w-3 rounded-full border",
          value
            ? "border-emerald-500 bg-emerald-500"
            : "border-slate-400 bg-slate-200",
        ].join(" ")}
        aria-hidden="true"
      />
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </div>
  );
}

function SimulatorEventRow({ event }: { event: PlcRuntimeEvent }) {
  const direction = event.type === "signal" ? "PLC → APP" : "APP → PLC";
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 text-xs">
      <span className="font-mono text-slate-500">
        {new Date(event.at).toLocaleTimeString()}
      </span>
      <span className="truncate font-medium text-slate-800">
        {event.key ?? event.state ?? event.type}
      </span>
      <span
        className={
          event.value === true
            ? "font-semibold text-emerald-700"
            : event.value === false
              ? "font-semibold text-slate-500"
              : "text-cyan-700"
        }
      >
        {event.value === undefined ? direction : event.value ? "ON" : "OFF"}
      </span>
    </li>
  );
}

function formatError(
  cause: unknown,
  apiError: (message: string, fallbackKey: string) => string,
  t: (key: string) => string,
  fallbackKey: string,
) {
  return cause instanceof ApiError
    ? apiError(cause.message, fallbackKey)
    : t(fallbackKey);
}

function signalLabel(key: string, t: (key: string) => string) {
  if (key === "startTrigger") return t("plc.startTrigger");
  if (key === "stopTrigger") return t("plc.stopTrigger");
  if (key === "captureTrigger") return t("plc.captureTrigger");
  return key;
}
