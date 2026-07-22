"use client";

import { ChangeEvent, useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";

type ModelPathFieldProps = {
  value: string;
  disabled?: boolean;
  showHint?: boolean;
  onChange: (value: string) => void;
};

export function ModelPathField({
  value,
  disabled = false,
  showHint = true,
  onChange,
}: ModelPathFieldProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleBrowse() {
    const desktop = getDesktopBridge();

    if (desktop) {
      try {
        const result = await desktop.selectModelFile();
        if (result.canceled || !result.filePath) return;
        onChange(result.filePath);
        toast.success(t("products.modelFileSelected"));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("error.globalDescription"),
        );
      }
      return;
    }

    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const nativePath = (file as File & { path?: string }).path?.trim();
    const inputValue = event.target.value.trim();
    const browserValue =
      inputValue && !/fakepath/i.test(inputValue) ? inputValue : file.name;

    onChange(nativePath || browserValue);
    toast.success(t("products.modelFileSelected"));
    if (!nativePath) toast.warning(t("products.modelPathBrowserFallback"));
    event.target.value = "";
  }

  function handleClear() {
    onChange("");
    toast.success(t("products.modelFileCleared"));
  }

  return (
    <label className="block text-sm font-medium text-slate-700">
      {t("products.modelPath")}
      <div className="mt-2 flex flex-col gap-2 min-[900px]:flex-row">
        <Input
          value={value}
          inputMode="text"
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 flex-1 text-base"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".onnx,.pt,.pth,.engine,.xml,.bin,.trt,.tflite,.pb"
          className="hidden"
          disabled={disabled}
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          className="h-12 px-4 text-base"
          disabled={disabled}
          onClick={() => void handleBrowse()}
        >
          {t("products.browseModel")}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="outline"
            className="h-12 px-4 text-base"
            disabled={disabled}
            onClick={handleClear}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("products.clearModelPath")}
          </Button>
        ) : null}
      </div>
      {showHint ? (
        <p className="mt-2 text-xs text-slate-500">
          {t("products.modelPathHint")}
        </p>
      ) : null}
    </label>
  );
}
