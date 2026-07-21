"use client";

import { RadioTower } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PlcConfigForm } from "@/components/plc/plc-config-form";
import { PlcRuntimePanel } from "@/components/plc/plc-runtime-panel";
import {
  ApiError,
  getPlcConfiguration,
  getPlcStatus,
  savePlcConfiguration,
  type PlcConfiguration,
  type PlcConfigurationPayload,
  type PlcRuntimeStatus,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const STATUS_REFRESH_MS = 5000;

export function PlcConfigurationPanel() {
  const { apiError, t } = useI18n();
  const [config, setConfig] = useState<PlcConfiguration | null>(null);
  const [status, setStatus] = useState<PlcRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshStatus = useCallback(async (showFeedback = false) => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      if (showFeedback) toast.error(t("users.missingSession"));
      return;
    }
    setRefreshing(true);
    try {
      const response = await getPlcStatus(accessToken);
      setStatus(response.data);
    } catch (cause) {
      if (showFeedback) {
        toast.error(formatError(cause, apiError, t, "plc.loadError"));
      }
    } finally {
      setRefreshing(false);
    }
  }, [apiError, t]);

  const load = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [configResponse, statusResponse] = await Promise.all([
        getPlcConfiguration(accessToken),
        getPlcStatus(accessToken),
      ]);
      setConfig(configResponse.data);
      setStatus(statusResponse.data);
    } catch (cause) {
      toast.error(formatError(cause, apiError, t, "plc.loadError"));
    } finally {
      setLoading(false);
    }
  }, [apiError, t]);

  useEffect(() => {
    const timerId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timerId);
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => void refreshStatus(), STATUS_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshStatus]);

  async function handleSave(payload: PlcConfigurationPayload) {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("plc.saving"));
    try {
      const response = await savePlcConfiguration(accessToken, payload);
      setConfig(response.data);
      await refreshStatus();
      toast.success(t("plc.saved"), { id: toastId });
    } catch (cause) {
      toast.error(formatError(cause, apiError, t, "plc.saveError"), {
        id: toastId,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-5" aria-labelledby="plc-configuration-title">
      <header className="border border-slate-200 bg-white p-5">
        <h2 id="plc-configuration-title" className="flex items-center gap-2 text-xl font-semibold text-slate-950">
          <RadioTower className="h-5 w-5 text-cyan-700" aria-hidden="true" />
          {t("plc.title")}
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-slate-500">{t("plc.description")}</p>
      </header>

      <PlcRuntimePanel
        config={config}
        status={status}
        refreshing={refreshing}
        onRefresh={() => refreshStatus(true)}
        onStatusChange={setStatus}
      />

      <PlcConfigForm
        key={config?.updatedAt ?? "empty-plc-config"}
        config={config}
        loading={loading || saving}
        onSave={handleSave}
      />
    </section>
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
