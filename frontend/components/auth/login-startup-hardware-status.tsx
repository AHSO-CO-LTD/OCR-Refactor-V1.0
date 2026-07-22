"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  MinusCircle,
} from "lucide-react";
import type { DesktopStartupHardwareStage } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";

type Props = {
  stages: DesktopStartupHardwareStage[];
};

export function LoginStartupHardwareStatus({ stages }: Props) {
  const { t } = useI18n();

  return (
    <section className="mt-5 border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-sm font-semibold text-slate-950">
        {t("login.startupHardwareTitle")}
      </h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {t("login.startupHardwareHint")}
      </p>
      <div className="mt-3 grid gap-2">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className="flex min-h-11 items-center justify-between gap-3 border border-slate-200 bg-white px-3 py-2"
          >
            <span className="text-sm font-medium text-slate-800">
              {t(`login.startupStage.${stage.id}`)}
            </span>
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <StageIcon status={stage.status} />
              {t(`login.startupStatus.${stage.status}`)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StageIcon({
  status,
}: {
  status: DesktopStartupHardwareStage["status"];
}) {
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-cyan-700" />;
  }
  if (status === "done") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (status === "failed") {
    return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  }
  if (status === "skipped") {
    return <MinusCircle className="h-4 w-4 text-slate-400" />;
  }
  return <Circle className="h-4 w-4 text-slate-300" />;
}
