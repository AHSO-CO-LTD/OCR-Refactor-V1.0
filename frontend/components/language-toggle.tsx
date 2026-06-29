"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type LanguageToggleProps = {
  className?: string;
  fullWidth?: boolean;
};

export function LanguageToggle({
  className,
  fullWidth = false,
}: LanguageToggleProps) {
  const { language, setLanguage } = useI18n();

  return (
    <div
      className={cn(
        "flex h-9 border border-slate-300 bg-white text-xs font-semibold",
        fullWidth ? "w-full" : "",
        className,
      )}
    >
      <button
        onClick={() => setLanguage("vi")}
        className={[
          fullWidth ? "flex-1 transition" : "w-10 transition",
          language === "vi"
            ? "bg-slate-950 text-white"
            : "text-slate-600 hover:bg-slate-50",
        ].join(" ")}
        type="button"
      >
        VI
      </button>
      <button
        onClick={() => setLanguage("en")}
        className={[
          fullWidth ? "flex-1 transition" : "w-10 transition",
          language === "en"
            ? "bg-slate-950 text-white"
            : "text-slate-600 hover:bg-slate-50",
        ].join(" ")}
        type="button"
      >
        EN
      </button>
    </div>
  );
}
