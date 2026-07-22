"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  pulseMachineTestResult,
  updateMachineTestMode,
  updateMachineTestOutput,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const TEST_MODE_HEARTBEAT_MS = 3000;

export function usePlcTestOutputSession(active: boolean) {
  const { t } = useI18n();
  const [outputEnabled, setOutputEnabledState] = useState(false);
  const [outputUpdating, setOutputUpdating] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [clientId] = useState(createTestClientId);
  const outputEnabledRef = useRef(false);
  const sessionErrorShownRef = useRef(false);
  const translateRef = useRef(t);

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  const renewSession = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error(translateRef.current("users.missingSession"));
    }
    await updateMachineTestMode(accessToken, clientId, true);
    return accessToken;
  }, [clientId]);

  useEffect(() => {
    if (!active) {
      outputEnabledRef.current = false;
      return;
    }

    let mounted = true;

    async function heartbeat() {
      try {
        const accessToken = await renewSession();
        await updateMachineTestOutput(
          accessToken,
          clientId,
          outputEnabledRef.current,
        );
        if (!mounted) return;
        setSessionReady(true);
        if (sessionErrorShownRef.current) {
          sessionErrorShownRef.current = false;
          toast.success(translateRef.current("plcTestOutput.sessionRestored"));
        }
      } catch (cause) {
        if (!mounted) return;
        setSessionReady(false);
        outputEnabledRef.current = false;
        setOutputEnabledState(false);
        if (!sessionErrorShownRef.current) {
          sessionErrorShownRef.current = true;
          toast.error(
            cause instanceof Error
              ? cause.message
              : translateRef.current("plcTestOutput.sessionFailed"),
          );
        }
      }
    }

    void heartbeat();
    const intervalId = window.setInterval(
      () => void heartbeat(),
      TEST_MODE_HEARTBEAT_MS,
    );

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      outputEnabledRef.current = false;
      queueMicrotask(() => {
        setOutputEnabledState(false);
        setOutputUpdating(false);
        setSessionReady(false);
      });
      const accessToken = getAccessToken();
      if (accessToken) {
        void updateMachineTestMode(
          accessToken,
          clientId,
          false,
        ).catch(() => undefined);
      }
    };
  }, [active, clientId, renewSession]);

  const setOutputEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled && !sessionReady) {
        toast.warning(t("plcTestOutput.sessionNotReady"));
        return;
      }
      const previousEnabled = outputEnabledRef.current;
      outputEnabledRef.current = enabled;
      setOutputUpdating(true);
      try {
        const accessToken = await renewSession();
        await updateMachineTestOutput(accessToken, clientId, enabled);
        outputEnabledRef.current = enabled;
        setOutputEnabledState(enabled);
        toast.success(
          t(
            enabled
              ? "plcTestOutput.enabledNotice"
              : "plcTestOutput.disabledNotice",
          ),
        );
      } catch (cause) {
        outputEnabledRef.current = previousEnabled;
        toast.error(
          cause instanceof Error
            ? cause.message
            : t("plcTestOutput.outputUpdateFailed"),
        );
      } finally {
        setOutputUpdating(false);
      }
    },
    [clientId, renewSession, sessionReady, t],
  );

  const emitResultPulse = useCallback(
    async (result: "OK" | "NG" | "UNKNOWN") => {
      if (!outputEnabledRef.current || result === "UNKNOWN") return false;

      try {
        const accessToken = await renewSession();
        await pulseMachineTestResult(
          accessToken,
          clientId,
          result,
        );
        toast.success(
          t(
            result === "OK"
              ? "plcTestOutput.okPulseSent"
              : "plcTestOutput.ngPulseSent",
          ),
        );
        return true;
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : t("plcTestOutput.pulseFailed"),
        );
        return false;
      }
    },
    [clientId, renewSession, t],
  );

  return {
    emitResultPulse,
    outputEnabled: active && outputEnabled,
    outputUpdating: active && outputUpdating,
    sessionReady: active && sessionReady,
    setOutputEnabled,
  };
}

function createTestClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `plc-test-${crypto.randomUUID()}`;
  }
  return `plc-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
