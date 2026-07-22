"use client";

import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import { useAppUpdate } from "@/components/update/app-update-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export function AppUpdatePanel() {
  const { t } = useI18n();
  const { checkForUpdates, desktopAvailable, downloadUpdate, state } = useAppUpdate();
  const checking = state.status === "checking";
  const available = state.status === "available";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("update.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {!desktopAvailable ? (
            <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t("update.desktopOnly")}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCell label={t("update.currentVersion")} value={`v${state.currentVersion}`} />
            <InfoCell
              label={t("update.latestVersion")}
              value={state.details.version ? `v${state.details.version}` : t("update.notChecked")}
            />
          </div>

          <div className="border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">{t("update.releaseNotes")}</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
              {state.details.releaseNotes || t("update.noReleaseNotes")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void checkForUpdates()} disabled={checking}>
              <RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {checking ? t("update.checking") : t("update.check")}
            </Button>
            {available ? (
              <Button onClick={() => void downloadUpdate()}>
                <Download className="h-4 w-4" />
                {t("update.updateNow")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-cyan-800" />
            {t("update.safetyTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <ul className="space-y-3 text-sm leading-6 text-slate-600">
            <li>{t("update.safetyBackup")}</li>
            <li>{t("update.safetyShutdown")}</li>
            <li>{t("update.safetyRollback")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
