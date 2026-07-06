"use client";

import { ExternalLink, Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";

const visibleLogLimit = 300;

export function TerminalSettingsPanel() {
  const { t } = useI18n();
  const bridge = getDesktopBridge();
  const isDesktop = Boolean(bridge);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(bridge));
  const [opening, setOpening] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!bridge) {
      return;
    }

    let mounted = true;

    bridge
      .getTerminalLogs()
      .then((messages) => {
        if (mounted) {
          setLogs(keepLatestLogs(messages));
        }
      })
      .catch(() => {
        if (mounted) {
          toast.error(t("settings.terminalLoadError"));
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    const unsubscribe = bridge.onTerminalLog((message) => {
      setLogs((current) => keepLatestLogs([...current, message]));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [bridge, t]);

  useEffect(() => {
    const logNode = logRef.current;

    if (!logNode) {
      return;
    }

    logNode.scrollTop = logNode.scrollHeight;
  }, [logs]);

  async function handleOpenTerminalWindow() {
    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    setOpening(true);
    const toastId = toast.loading(t("settings.terminalOpening"));

    try {
      await bridge.openTerminalWindow();
      toast.success(t("settings.terminalOpened"), { id: toastId });
    } catch {
      toast.error(t("settings.terminalOpenError"), { id: toastId });
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-5 w-5 text-cyan-700" />
            {t("settings.terminalTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {!isDesktop ? (
            <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t("settings.desktopOnly")}
            </div>
          ) : null}

          <div className="border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {t("settings.terminalDescription")}
          </div>

          <Button
            type="button"
            onClick={handleOpenTerminalWindow}
            disabled={opening}
          >
            <ExternalLink className="h-4 w-4" />
            {opening ? t("settings.terminalOpening") : t("settings.terminalOpen")}
          </Button>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-950">
                {t("settings.terminalLogs")}
              </div>
              <div className="border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                {formatCount(t("settings.terminalLogCount"), logs.length)}
              </div>
            </div>
            <pre
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-label={t("settings.terminalLogs")}
              className="h-[420px] overflow-auto border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"
            >
              {loading
                ? t("common.loading")
                : logs.length > 0
                  ? logs.join("\n")
                  : t("settings.terminalEmpty")}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("settings.currentState")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-5 text-sm">
          <StateRow
            label={t("settings.runtime")}
            value={isDesktop ? t("settings.electron") : t("settings.browser")}
          />
          <StateRow
            label={t("settings.terminalShortcut")}
            value="F12 x5"
          />
          <StateRow
            label={t("settings.terminalStartup")}
            value={t("settings.terminalManualOnly")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function keepLatestLogs(logs: string[]) {
  return logs.slice(-visibleLogLimit);
}

function formatCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-950">{value}</span>
    </div>
  );
}
