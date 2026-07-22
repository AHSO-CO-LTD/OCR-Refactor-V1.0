"use client";

import { useEffect, useRef } from "react";
import {
  getMachineRuntimeStatus,
  getPlcStatus,
  type PlcRuntimeEvent,
} from "@/lib/api";
import { getAccessToken } from "@/lib/session";

const PLC_TRIGGER_POLL_INTERVAL_MS = 250;

type UsePlcCaptureTriggerOptions = {
  enabled: boolean;
  onTrigger: () => Promise<void> | void;
};

export function usePlcCaptureTrigger({
  enabled,
  onTrigger,
}: UsePlcCaptureTriggerOptions) {
  const onTriggerRef = useRef(onTrigger);

  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let requestRunning = false;
    let initialized = false;
    let lastSequence = 0;
    let legacyInitialized = false;
    let lastLegacyTriggerKey: string | null = null;
    const listeningStartedAt = Date.now();

    async function pollCaptureTrigger() {
      if (!active || requestRunning) return;
      const accessToken = getAccessToken();
      if (!accessToken) return;

      requestRunning = true;
      try {
        const response = await getMachineRuntimeStatus(accessToken);
        if (!active) return;

        const status = response.data;
        const captureTriggerSequence = Number(status.captureTriggerSequence);
        if (!Number.isFinite(captureTriggerSequence)) {
          const plcResponse = await getPlcStatus(accessToken);
          if (!active) return;
          const latestTrigger =
            plcResponse.data.recentEvents.find(isCaptureTrigger);
          const latestTriggerKey = latestTrigger
            ? eventKey(latestTrigger)
            : null;

          if (!legacyInitialized) {
            legacyInitialized = true;
            lastLegacyTriggerKey = latestTriggerKey;
            const triggerAt = latestTrigger
              ? Date.parse(latestTrigger.at)
              : Number.NaN;
            if (
              latestTrigger &&
              Number.isFinite(triggerAt) &&
              triggerAt >= listeningStartedAt
            ) {
              await onTriggerRef.current();
            }
            return;
          }

          if (!latestTriggerKey || latestTriggerKey === lastLegacyTriggerKey) {
            return;
          }
          lastLegacyTriggerKey = latestTriggerKey;
          await onTriggerRef.current();
          return;
        }

        if (!initialized) {
          initialized = true;
          lastSequence = captureTriggerSequence;
          const triggerAt = status.lastCaptureTriggerAt
            ? Date.parse(status.lastCaptureTriggerAt)
            : Number.NaN;
          if (
            captureTriggerSequence > 0 &&
            Number.isFinite(triggerAt) &&
            triggerAt >= listeningStartedAt
          ) {
            await onTriggerRef.current();
          }
          return;
        }

        if (captureTriggerSequence < lastSequence) {
          lastSequence = captureTriggerSequence;
          return;
        }
        if (captureTriggerSequence === lastSequence) return;
        lastSequence = captureTriggerSequence;
        await onTriggerRef.current();
      } catch {
        // The shared shell watchdog and PLC notice surface connectivity errors.
      } finally {
        requestRunning = false;
      }
    }

    const initialId = window.setTimeout(() => void pollCaptureTrigger(), 0);
    const intervalId = window.setInterval(
      () => void pollCaptureTrigger(),
      PLC_TRIGGER_POLL_INTERVAL_MS,
    );

    return () => {
      active = false;
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, [enabled]);
}

function isCaptureTrigger(event: PlcRuntimeEvent) {
  return (
    event.type === "signal" &&
    event.key === "captureTrigger" &&
    event.value === true
  );
}

function eventKey(event: PlcRuntimeEvent) {
  return [
    event.at,
    event.key ?? "",
    event.address ?? "",
    event.toolAddress ?? "",
    event.value === true ? "1" : "0",
  ].join(":");
}
