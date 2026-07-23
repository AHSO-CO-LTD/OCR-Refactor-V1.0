"use client";

import { useEffect } from "react";
import { MonitorX, Power, TriangleAlert } from "lucide-react";
import {
  ShutdownChecklist,
  type ShutdownChecklistItem,
} from "@/components/system/shutdown-checklist";
import { Button } from "@/components/ui/button";
import type { DesktopExitMode } from "@/lib/desktop";
import { cn } from "@/lib/utils";

type ExitModeOption = {
  description: string;
  label: string;
  mode: DesktopExitMode;
};

export function ExitAppDialog({
  cancelLabel,
  checklist,
  checklistTitle,
  confirmLabel,
  description,
  mode,
  modeTitle,
  open,
  options,
  title,
  onCancel,
  onConfirm,
  onModeChange,
}: {
  cancelLabel: string;
  checklist: ShutdownChecklistItem[];
  checklistTitle: string;
  confirmLabel: string;
  description: string;
  mode: DesktopExitMode;
  modeTitle: string;
  open: boolean;
  options: ExitModeOption[];
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  onModeChange: (mode: DesktopExitMode) => void;
}) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-6"
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-app-dialog-title"
        aria-describedby="exit-app-dialog-description"
        className="max-h-[calc(100dvh-3rem)] w-full max-w-2xl overflow-y-auto border border-slate-300 bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-200 p-5">
          <div className="border border-red-200 bg-red-50 p-2 text-red-700">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="exit-app-dialog-title" className="font-semibold">
              {title}
            </h2>
            <p
              id="exit-app-dialog-description"
              className="mt-1 text-sm leading-6 text-slate-600"
            >
              {description}
            </p>
          </div>
        </div>

        <div className="grid gap-5 p-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-900">
              {modeTitle}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((option) => {
                const selected = option.mode === mode;
                const Icon =
                  option.mode === "app-and-hardware" ? Power : MonitorX;

                return (
                  <label
                    key={option.mode}
                    className={cn(
                      "grid min-h-24 cursor-pointer grid-cols-[1.25rem_2rem_minmax(0,1fr)] items-start gap-3 border p-3",
                      selected
                        ? "border-cyan-500 bg-cyan-50"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="exit-mode"
                      value={option.mode}
                      checked={selected}
                      className="mt-1 h-5 w-5 accent-cyan-700"
                      onChange={() => onModeChange(option.mode)}
                    />
                    <span className="grid h-8 w-8 place-items-center border border-slate-300 bg-white text-slate-700">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-950">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              {checklistTitle}
            </h3>
            <ShutdownChecklist items={checklist} />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className="border-red-700 bg-red-700 text-white hover:bg-red-800"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
