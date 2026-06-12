"use client";

import { useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, setLanguage } = useI18n();

  return (
    <div className="flex h-9 border border-slate-300 bg-white text-xs font-semibold">
      <button
        onClick={() => setLanguage("vi")}
        className={[
          "w-10 transition",
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
          "w-10 transition",
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

