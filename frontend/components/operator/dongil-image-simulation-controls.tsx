"use client";

import { Send, Upload } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type DongilImageSimulationControlsProps = {
  disabled: boolean;
  submitting: boolean;
  onSubmit: (file: File) => Promise<void>;
};

export function DongilImageSimulationControls({
  disabled,
  submitting,
  onSubmit,
}: DongilImageSimulationControlsProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  return (
    <section className="mt-2 grid gap-2 border border-dashed border-amber-600 bg-amber-50 p-2">
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-amber-900">
        {t("operator.dongilSimulationTitle")}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/bmp,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || submitting}
        className="h-12 justify-start border-amber-700 bg-white text-left text-sm text-slate-950 hover:bg-amber-100"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-5 w-5 shrink-0" />
        <span className="truncate">
          {selectedFile?.name || t("operator.dongilChooseImage")}
        </span>
      </Button>
      <Button
        type="button"
        disabled={disabled || submitting || !selectedFile}
        className="h-12 border-amber-900 bg-amber-800 text-sm text-white hover:bg-amber-900"
        onClick={() => selectedFile && void onSubmit(selectedFile)}
      >
        <Send className="h-5 w-5" />
        {submitting
          ? t("operator.dongilSendingImage")
          : t("operator.dongilSendImage")}
      </Button>
    </section>
  );
}
