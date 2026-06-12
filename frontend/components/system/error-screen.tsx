"use client";

import Link from "next/link";
import { AlertTriangle, Home, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type ErrorScreenProps = {
  code: string;
  titleKey: string;
  descriptionKey: string;
  detail?: string;
  reset?: () => void;
};

export function ErrorScreen({
  code,
  titleKey,
  descriptionKey,
  detail,
  reset,
}: ErrorScreenProps) {
  const { t } = useI18n();

  function handleReport() {
    toast.info(t("error.reported"));
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 px-4 py-8 text-slate-950">
      <section className="w-full max-w-3xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
            {t("app.brand")}
          </div>
          <div className="mt-1 text-lg font-semibold">{t("app.line")}</div>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[160px_minmax(0,1fr)] md:p-7">
          <div className="flex h-36 items-center justify-center border border-slate-200 bg-slate-50">
            <div className="text-center">
              <AlertTriangle
                className="mx-auto h-8 w-8 text-cyan-800"
                aria-hidden="true"
              />
              <div className="mt-3 font-mono text-3xl font-semibold">
                {code}
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              {t(descriptionKey)}
            </p>

            {detail ? (
              <div className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {detail}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {reset ? (
                <Button type="button" onClick={reset}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {t("error.retry")}
                </Button>
              ) : null}
              <Button asChild variant={reset ? "outline" : "default"}>
                <Link href="/dashboard">
                  <Home className="h-4 w-4" aria-hidden="true" />
                  {t("error.backHome")}
                </Link>
              </Button>
              <Button type="button" variant="outline" onClick={handleReport}>
                <Send className="h-4 w-4" aria-hidden="true" />
                {t("error.report")}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
