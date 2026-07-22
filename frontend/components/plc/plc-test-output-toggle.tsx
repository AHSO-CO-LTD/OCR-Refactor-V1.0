"use client";

import { Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type PlcTestOutputToggleProps = {
  disabled?: boolean;
  enabled: boolean;
  onChange: (enabled: boolean) => void | Promise<void>;
};

export function PlcTestOutputToggle({
  disabled = false,
  enabled,
  onChange,
}: PlcTestOutputToggleProps) {
  const { t } = useI18n();
  const Icon = enabled ? Zap : ZapOff;

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      aria-pressed={enabled}
      className={[
        "h-11 min-w-44 border-slate-400 px-4",
        enabled
          ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
          : "bg-white text-slate-800 hover:bg-slate-100",
      ].join(" ")}
      onClick={() => void onChange(!enabled)}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {t(enabled ? "plcTestOutput.enabled" : "plcTestOutput.disabled")}
    </Button>
  );
}
