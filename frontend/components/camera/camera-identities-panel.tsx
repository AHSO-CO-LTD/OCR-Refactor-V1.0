"use client";

import { Camera, RefreshCcw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  listCameraIdentities,
  syncCameraIdentities,
  updateCameraIdentity,
  type CameraIdentity,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

export function CameraIdentitiesPanel() {
  const { apiError, t } = useI18n();
  const [identities, setIdentities] = useState<CameraIdentity[]>([]);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const setIdentityState = useCallback((nextIdentities: CameraIdentity[]) => {
    setIdentities(nextIdentities);
    setDraftNames(
      Object.fromEntries(
        nextIdentities.map((identity) => [identity.id, identity.displayName]),
      ),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentities() {
      const accessToken = getAccessToken();

      if (!accessToken) {
        toast.error(t("users.missingSession"));
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const response = await listCameraIdentities(accessToken);

        if (!cancelled) {
          setIdentityState(response.data);
        }
      } catch (cause) {
        if (!cancelled) {
          toast.error(
            formatApiError(cause, apiError, t, "cameraIdentity.loadError"),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadIdentities();

    return () => {
      cancelled = true;
    };
  }, [apiError, setIdentityState, t]);

  async function handleSync() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSyncing(true);
    const toastId = toast.loading(t("cameraIdentity.syncing"));

    try {
      const response = await syncCameraIdentities(accessToken);
      setIdentityState(response.data);
      toast.success(t("cameraIdentity.syncSuccess"), { id: toastId });
    } catch (cause) {
      toast.error(formatApiError(cause, apiError, t, "cameraIdentity.syncError"), {
        id: toastId,
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSave(identity: CameraIdentity) {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    const displayName = (draftNames[identity.id] ?? identity.displayName).trim();

    if (!displayName) {
      toast.warning(t("cameraIdentity.nameRequired"));
      return;
    }

    setSavingId(identity.id);
    const toastId = toast.loading(t("cameraIdentity.saving"));

    try {
      const response = await updateCameraIdentity(accessToken, identity.id, {
        active: true,
        displayName,
      });
      replaceIdentity(response.data);
      toast.success(t("cameraIdentity.saveSuccess"), { id: toastId });
    } catch (cause) {
      toast.error(formatApiError(cause, apiError, t, "cameraIdentity.saveError"), {
        id: toastId,
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleActive(identity: CameraIdentity) {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSavingId(identity.id);

    try {
      const response = await updateCameraIdentity(accessToken, identity.id, {
        active: identity.identified ? !identity.active : true,
      });
      replaceIdentity(response.data);
      toast.success(t("cameraIdentity.saveSuccess"));
    } catch (cause) {
      toast.error(formatApiError(cause, apiError, t, "cameraIdentity.saveError"));
    } finally {
      setSavingId(null);
    }
  }

  function replaceIdentity(nextIdentity: CameraIdentity) {
    setIdentities((current) =>
      current.map((identity) =>
        identity.id === nextIdentity.id ? nextIdentity : identity,
      ),
    );
    setDraftNames((current) => ({
      ...current,
      [nextIdentity.id]: nextIdentity.displayName,
    }));
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Camera className="h-5 w-5 text-cyan-700" aria-hidden="true" />
            {t("cameraIdentity.title")}
          </CardTitle>
          <CardDescription className="mt-1">
            {t("cameraIdentity.description")}
          </CardDescription>
        </div>
        <Button
          type="button"
          onClick={() => void handleSync()}
          disabled={syncing}
          className="h-10"
        >
          <RefreshCcw
            className={["h-4 w-4", syncing ? "animate-spin" : ""].join(" ")}
            aria-hidden="true"
          />
          {syncing ? t("cameraIdentity.syncing") : t("cameraIdentity.sync")}
        </Button>
      </CardHeader>
      <CardContent className="pt-5">
        {loading ? (
          <div className="border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            {t("common.loading")}
          </div>
        ) : identities.length === 0 ? (
          <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            {t("cameraIdentity.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[880px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.02em] text-slate-500">
                  <th className="px-3 py-3 font-semibold">
                    {t("cameraIdentity.name")}
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    {t("cameraIdentity.serial")}
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    {t("cameraIdentity.hardware")}
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    {t("cameraIdentity.lastSeen")}
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    {t("cameraIdentity.status")}
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {identities.map((identity) => (
                  <tr key={identity.id} className="border-b border-slate-200">
                    <td className="px-3 py-3">
                      <Input
                        value={draftNames[identity.id] ?? identity.displayName}
                        onChange={(event) =>
                          setDraftNames((current) => ({
                            ...current,
                            [identity.id]: event.target.value,
                          }))
                        }
                        disabled={savingId === identity.id}
                      />
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-800">
                      {identity.serial}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <div className="font-medium text-slate-900">
                        {identity.modelName ?? "-"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {[identity.vendor, identity.interfaceName]
                          .filter(Boolean)
                          .join(" / ") || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatDate(identity.lastSeenAt)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        className={
                          identity.status === "identified"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : identity.status === "unidentified"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }
                      >
                        {t(`cameraIdentity.status.${identity.status}`)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleToggleActive(identity)}
                          disabled={savingId === identity.id}
                        >
                          {identity.active && identity.identified
                            ? t("cameraIdentity.disable")
                            : t("cameraIdentity.identify")}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void handleSave(identity)}
                          disabled={savingId === identity.id}
                        >
                          <Save className="h-4 w-4" aria-hidden="true" />
                          {savingId === identity.id
                            ? t("cameraIdentity.saving")
                            : t("common.save")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatApiError(
  cause: unknown,
  apiError: (message: string, fallbackKey: string) => string,
  t: (key: string) => string,
  fallbackKey: string,
) {
  return cause instanceof ApiError
    ? apiError(cause.message, fallbackKey)
    : t(fallbackKey);
}
