"use client";

import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  downloadProductImportTemplate,
  importProductProfiles,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type ProductBulkImportPanelProps = {
  onImported: () => Promise<void>;
};

export function ProductBulkImportPanel({
  onImported,
}: ProductBulkImportPanelProps) {
  const { apiError, language, t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<"template" | "import" | "">("");

  async function handleDownloadTemplate() {
    const token = getAccessToken();
    if (!token) {
      toast.error(t("users.missingSession"));
      return;
    }
    setBusy("template");
    const toastId = toast.loading(t("products.templateDownloading"));
    try {
      const blob = await downloadProductImportTemplate(token, language);
      downloadBlob(blob, "product-import-template.xlsx");
      toast.success(t("products.templateDownloaded"), { id: toastId });
    } catch (cause) {
      toast.error(formatError(cause, apiError, t), { id: toastId });
    } finally {
      setBusy("");
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      toast.warning(t("products.importXlsxOnly"));
      return;
    }
    const token = getAccessToken();
    if (!token) {
      toast.error(t("users.missingSession"));
      return;
    }
    setBusy("import");
    const toastId = toast.loading(t("products.importing"));
    try {
      const response = await importProductProfiles(token, file);
      await onImported();
      toast.success(
        formatMessage(t("products.importSuccess"), response.data),
        { id: toastId },
      );
    } catch (cause) {
      toast.error(formatError(cause, apiError, t), { id: toastId });
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-4">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-semibold text-slate-950">
          <FileSpreadsheet className="h-5 w-5 text-cyan-700" />
          {t("products.bulkImport")}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {t("products.bulkImportHint")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={Boolean(busy)}
          onClick={() => void handleDownloadTemplate()}
        >
          <Download className="h-4 w-4" />
          {t("products.downloadTemplate")}
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={Boolean(busy)}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {busy === "import" ? t("products.importing") : t("products.importXlsx")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label={t("products.importXlsx")}
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
    </section>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatError(
  cause: unknown,
  apiError: (message: string, fallbackKey: string) => string,
  t: (key: string) => string,
) {
  return cause instanceof ApiError
    ? apiError(cause.message, "products.importError")
    : t("products.importError");
}

function formatMessage(
  template: string,
  values: { totalCount: number; createdCount: number; updatedCount: number },
) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, String(value)),
    template,
  );
}
