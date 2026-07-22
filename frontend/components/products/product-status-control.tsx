"use client";

import { CheckCircle2, CircleOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type ProductStatusControlProps = {
  active: boolean;
  disabled?: boolean;
  onChange: (active: boolean) => void;
};

export function ProductStatusControl({
  active,
  disabled = false,
  onChange,
}: ProductStatusControlProps) {
  const { t } = useI18n();

  return (
    <section className="border border-slate-200 p-4">
      <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950">
            {t("products.groupStatus")}
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {active
              ? t("products.statusActiveHint")
              : t("products.statusInactiveHint")}
          </p>
        </div>
        <span
          className={
            active
              ? "inline-flex h-8 shrink-0 items-center border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
              : "inline-flex h-8 shrink-0 items-center border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-700"
          }
        >
          {active ? t("products.active") : t("products.inactive")}
        </span>
      </div>

      <div
        role="group"
        aria-label={t("products.status")}
        className="mt-4 grid gap-2 sm:grid-cols-2"
      >
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-pressed={active}
          onClick={() => onChange(true)}
          className={[
            "h-12 justify-start px-4 text-base",
            active
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {t("products.setActive")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-pressed={!active}
          onClick={() => onChange(false)}
          className={[
            "h-12 justify-start px-4 text-base",
            !active
              ? "border-slate-400 bg-slate-100 text-slate-950 hover:bg-slate-100"
              : "border-amber-200 bg-white text-amber-800 hover:bg-amber-50",
          ].join(" ")}
        >
          <CircleOff className="h-4 w-4" aria-hidden="true" />
          {t("products.setInactive")}
        </Button>
      </div>
    </section>
  );
}
