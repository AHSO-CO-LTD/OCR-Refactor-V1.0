"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/system/error-screen";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({
  error,
  reset,
}: GlobalErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <I18nProvider>
          <ErrorScreen
            code="ERR"
            titleKey="error.globalTitle"
            descriptionKey="error.globalDescription"
            detail={error.digest ? `Digest: ${error.digest}` : undefined}
            reset={reset}
          />
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
