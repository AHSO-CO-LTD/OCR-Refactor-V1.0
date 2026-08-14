"use client";

import { Activity, Link2, RefreshCw, Save, ServerCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import { getAccessToken, getStoredUser } from "@/lib/session";
import { useDongilStatus } from "@/lib/use-dongil-status";
import { cn } from "@/lib/utils";

export function DongilServerSettingsPanel() {
  const { t } = useI18n();
  const { status, loading, error, refresh } = useDongilStatus();
  const [savedUrl, setSavedUrl] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const role = getStoredUser()?.role;
  const canManage = role === "dev" || role === "admin";

  useEffect(() => {
    if (!status?.serverUrl || savedUrl) return;
    setSavedUrl(status.serverUrl);
    setServerUrl(status.serverUrl);
  }, [savedUrl, status?.serverUrl]);

  const dirty = serverUrl.trim().replace(/\/+$/, "") !== savedUrl;
  const validUrl = useMemo(() => {
    try {
      const url = new URL(serverUrl.trim());
      return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
    } catch {
      return false;
    }
  }, [serverUrl]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  async function testConnection() {
    const bridge = getDesktopBridge();
    if (!bridge || !validUrl) return;
    setTesting(true);
    try {
      const response = await bridge.testDongilServer(serverUrl);
      toast.success(
        t("settings.dongilTestSuccess").replace(
          "{latency}",
          String(response.data?.latencyMs ?? 0),
        ),
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("settings.dongilTestFailed"));
    } finally {
      setTesting(false);
    }
  }

  async function saveAndConnect() {
    const bridge = getDesktopBridge();
    const accessToken = getAccessToken();
    if (!bridge || !accessToken || !validUrl || !canManage) return;
    setSaving(true);
    try {
      const response = await bridge.saveDongilSettings({ accessToken, serverUrl });
      setSavedUrl(response.serverUrl);
      setServerUrl(response.serverUrl);
      setConfirmOpen(false);
      await refresh();
      toast.success(t("settings.dongilSaved"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("settings.dongilSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const online = status?.state === "ONLINE" && status.socketConnected;
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="border border-cyan-200 bg-cyan-50 p-2 text-cyan-800">
              <ServerCog className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>{t("settings.dongilTitle")}</CardTitle>
              <CardDescription className="mt-1">{t("settings.dongilDescription")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-800">{t("settings.dongilUrl")}</span>
            <Input
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="http://192.168.3.4:3979"
              disabled={!canManage || saving}
              aria-invalid={serverUrl.length > 0 && !validUrl}
            />
            {serverUrl.length > 0 && !validUrl ? (
              <span className="text-sm text-red-700">{t("settings.dongilInvalidUrl")}</span>
            ) : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label={t("settings.dongilMachineId")} value={status?.machineId} />
            <ReadOnlyField label={t("settings.dongilMachineType")} value={status?.assignedMachineTypeCode ?? status?.machineTypeCode} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={!validUrl || testing} onClick={() => void testConnection()}>
              <Activity className={cn("h-4 w-4", testing && "animate-pulse")} aria-hidden="true" />
              {testing ? t("settings.dongilTesting") : t("settings.dongilTest")}
            </Button>
            {canManage ? (
              <Button type="button" disabled={!dirty || !validUrl || saving} onClick={() => setConfirmOpen(true)}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {t("settings.dongilSaveConnect")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t("settings.dongilStatus")}</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
              {t("common.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={cn("flex items-center gap-3 border p-3", online ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
            <Link2 className={cn("h-5 w-5", online ? "text-emerald-700" : "text-amber-700")} />
            <div>
              <div className="text-sm font-semibold">{status ? t(`settings.dongilState.${status.state}`) : t("common.loading")}</div>
              <div className="text-xs text-slate-600">{t("settings.dongilPending")}: {status?.pendingSyncCount ?? 0}</div>
            </div>
          </div>
          <StatusRow label={t("settings.dongilRuntime")} value={status?.operationalStatus} />
          <StatusRow label={t("settings.dongilLastConnected")} value={formatTimestamp(status?.lastConnectedAt)} />
          <StatusRow label={t("settings.dongilLastHeartbeat")} value={formatTimestamp(status?.lastHeartbeatAckAt)} />
          {status?.lastError?.message || error ? (
            <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{status?.lastError?.message ?? error}</p>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmModal
        open={confirmOpen}
        title={t("settings.dongilConfirmTitle")}
        description={t("settings.dongilConfirmDescription").replace("{url}", serverUrl)}
        confirmLabel={saving ? t("settings.dongilSaving") : t("settings.dongilSaveConnect")}
        cancelLabel={t("common.cancel")}
        loading={saving}
        onConfirm={() => void saveAndConnect()}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return <div className="border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">{value || "—"}</div></div>;
}

function StatusRow({ label, value }: { label: string; value?: string | null }) {
  return <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 text-sm"><span className="text-slate-500">{label}</span><span className="text-right font-semibold text-slate-900">{value || "—"}</span></div>;
}

function formatTimestamp(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}
