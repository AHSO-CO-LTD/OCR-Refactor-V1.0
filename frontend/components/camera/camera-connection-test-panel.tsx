"use client";

import { Cable, CheckCircle2, RefreshCcw, XCircle } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListboxSelect } from "@/components/ui/listbox-select";
import {
  ApiError,
  listCameraIdentities,
  testCameraIdentityConnection,
  type CameraIdentity,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type ConnectionResult = {
  cameraName: string;
  message: string;
  success: boolean;
};

type CameraConnectionTestPanelProps = {
  disabled?: boolean;
  onTestComplete?: () => void | Promise<void>;
};

export function CameraConnectionTestPanel({
  disabled = false,
  onTestComplete,
}: CameraConnectionTestPanelProps) {
  const { apiError, t } = useI18n();
  const [identities, setIdentities] = useState<CameraIdentity[]>([]);
  const [selectedIdentityId, setSelectedIdentityId] = useState("");
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const connectableIdentities = useMemo(
    () => identities.filter((identity) => identity.connectable),
    [identities],
  );

  const loadIdentities = useCallback(async (showFeedback = false) => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await listCameraIdentities(accessToken);
      setIdentities(response.data);
      setSelectedIdentityId((current) =>
        response.data.some((identity) => identity.id === current && identity.connectable)
          ? current
          : (response.data.find((identity) => identity.connectable)?.id ?? ""),
      );
      if (showFeedback) toast.success(t("cameraConnection.identitiesRefreshed"));
    } catch (cause) {
      const message = formatError(cause, apiError, t, "cameraIdentity.loadError");
      setResult({ cameraName: "", message, success: false });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [apiError, t]);
  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadIdentities();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadIdentities]);

  async function handleTestConnection() {
    const accessToken = getAccessToken();
    const identity = connectableIdentities.find(
      (item) => item.id === selectedIdentityId,
    );

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }
    if (!identity) {
      toast.warning(t("cameraConnection.selectFirst"));
      return;
    }

    setTesting(true);
    setResult(null);
    const toastId = toast.loading(
      t("cameraConnection.testing").replace("{camera}", identity.displayName),
    );

    try {
      await testCameraIdentityConnection(accessToken, identity.id);
      const message = t("cameraConnection.success").replace(
        "{camera}",
        identity.displayName,
      );
      setResult({ cameraName: identity.displayName, message, success: true });
      toast.success(message, { id: toastId });
    } catch (cause) {
      const message = formatError(
        cause,
        apiError,
        t,
        "cameraConnection.failed",
      );
      setResult({ cameraName: identity.displayName, message, success: false });
      toast.error(message, { id: toastId });
    } finally {
      setTesting(false);
      await onTestComplete?.();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cable className="h-5 w-5 text-cyan-700" aria-hidden="true" />
            {t("cameraConnection.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            {t("cameraConnection.description")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadIdentities(true)}
          disabled={loading || testing}
        >
          <RefreshCcw
            className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")}
            aria-hidden="true"
          />
          {t("common.refresh")}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 lg:grid-cols-[minmax(280px,1fr)_auto_minmax(280px,1fr)] lg:items-end">
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>{t("cameraConnection.identifiedCamera")}</span>
          <ListboxSelect
            value={selectedIdentityId}
            onChange={(identityId) => {
              setSelectedIdentityId(identityId);
              setResult(null);
            }}
            disabled={loading || testing || disabled || connectableIdentities.length === 0}
            emptyLabel={t("cameraConnection.noCamera")}
            options={connectableIdentities.map((identity) => ({
              description: [identity.modelName, identity.serial].filter(Boolean).join(" · "),
              label: identity.displayName,
              value: identity.id,
            }))}
          />
        </label>
        <Button
          type="button"
          className="h-11 min-w-40"
          onClick={() => void handleTestConnection()}
          disabled={loading || testing || disabled || !selectedIdentityId}
        >
          <Cable className="h-4 w-4" aria-hidden="true" />
          {testing ? t("cameraConnection.connecting") : t("cameraConnection.test")}
        </Button>
        <div
          className={[
            "flex min-h-11 items-center gap-2 border px-3 py-2 text-sm",
            result?.success
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : result
                ? "border-red-300 bg-red-50 text-red-800"
                : "border-slate-200 bg-slate-50 text-slate-500",
          ].join(" ")}
          role="status"
        >
          {result?.success ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          ) : result ? (
            <XCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <Cable className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <span>{result?.message ?? t("cameraConnection.notTested")}</span>
        </div>
      </CardContent>
    </Card>
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
