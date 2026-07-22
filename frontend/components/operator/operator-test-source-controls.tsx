"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef } from "react";
import { Camera, FileImage, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type OperatorTestSourceControlsProps = {
  batchDisabled: boolean;
  folderCount: number;
  folderName: string;
  imageDisabled: boolean;
  imageName: string;
  onClearFolder: () => void;
  onClearImage: () => void;
  onFolderChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onUseCamera: () => void;
};

const sourceButtonClassName =
  "operator-line-action-button h-14 min-w-0 justify-start border-[#1e293b] bg-[#9fc3eb] text-base font-semibold text-slate-950 hover:bg-[#8fb8e6] disabled:opacity-70";
const activeSourceButtonClassName =
  "border-emerald-800 bg-emerald-700 text-white hover:bg-emerald-800";
const clearButtonClassName =
  "operator-line-action-button h-14 border-[#1e293b] bg-[#d9e6f5] px-0 text-slate-700 hover:bg-[#c7d9ee] disabled:opacity-60";

export function OperatorTestSourceControls({
  batchDisabled,
  folderCount,
  folderName,
  imageDisabled,
  imageName,
  onClearFolder,
  onClearImage,
  onFolderChange,
  onImageChange,
  onUseCamera,
}: OperatorTestSourceControlsProps) {
  const { t } = useI18n();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const folderInput = folderInputRef.current;
    if (!folderInput) return;

    folderInput.setAttribute("webkitdirectory", "");
    folderInput.setAttribute("directory", "");
  }, []);

  return (
    <section
      className="operator-test-source-panel border border-[#86a8cf] bg-[#cfdff2] p-3"
      aria-labelledby="operator-test-source-title"
    >
      <div
        id="operator-test-source-title"
        className="mb-2 text-sm font-bold text-[#274d7d]"
      >
        {t("lineTest.testSources")}
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImageChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFolderChange}
      />

      <div className="operator-test-source-grid grid gap-2 min-[900px]:grid-cols-3">
        <Button
          type="button"
          variant="outline"
          aria-pressed={!imageName}
          disabled={imageDisabled}
          className={[
            sourceButtonClassName,
            !imageName ? activeSourceButtonClassName : "",
          ].join(" ")}
          onClick={onUseCamera}
        >
          <Camera className="h-5 w-5 shrink-0" />
          <span className="truncate">{t("lineTest.directCamera")}</span>
        </Button>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_48px] gap-2">
          <Button
            type="button"
            variant="outline"
            aria-pressed={Boolean(imageName)}
            disabled={imageDisabled}
            className={[
              sourceButtonClassName,
              imageName ? activeSourceButtonClassName : "",
            ].join(" ")}
            onClick={() => imageInputRef.current?.click()}
          >
            <FileImage className="h-5 w-5 shrink-0" />
            <span className="truncate">
              {imageName || t("lineAnimationTest.chooseImage")}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={t("lineTest.clearImage")}
            disabled={imageDisabled || !imageName}
            className={clearButtonClassName}
            onClick={onClearImage}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_48px] gap-2">
          <Button
            type="button"
            variant="outline"
            aria-pressed={folderCount > 0}
            disabled={batchDisabled}
            className={[
              sourceButtonClassName,
              folderCount > 0 ? activeSourceButtonClassName : "",
            ].join(" ")}
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderOpen className="h-5 w-5 shrink-0" />
            <span className="truncate">
              {folderName
                ? `${folderName} (${folderCount})`
                : t("lineTest.selectFolder")}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={t("lineTest.clearFolder")}
            disabled={batchDisabled || folderCount === 0}
            className={clearButtonClassName}
            onClick={onClearFolder}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
