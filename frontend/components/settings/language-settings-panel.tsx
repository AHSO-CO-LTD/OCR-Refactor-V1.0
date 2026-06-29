"use client";

import { Languages } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export function LanguageSettingsPanel() {
  const { language, t } = useI18n();

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("settings.languageTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-slate-200 bg-white text-slate-700">
                <Languages className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-950">
                  {t("settings.languageSelector")}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {t("settings.languageDescription")}
                </div>
              </div>
            </div>
            <LanguageToggle className="mt-4" fullWidth />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("settings.currentState")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-5 text-sm">
          <StateRow
            label={t("settings.languageCurrent")}
            value={
              language === "vi"
                ? t("settings.languageVietnamese")
                : t("settings.languageEnglish")
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-950">{value}</span>
    </div>
  );
}
