"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  loading = false,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [loading, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-6"
      role="presentation"
      onMouseDown={() => {
        if (!loading) {
          onCancel();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
        className="max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto border border-slate-200 bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-200 p-5">
          <div
            className={
              destructive
                ? "border border-red-200 bg-red-50 p-2 text-red-700"
                : "border border-cyan-200 bg-cyan-50 p-2 text-cyan-800"
            }
          >
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="confirm-modal-title" className="font-semibold">
              {title}
            </h2>
            <p
              id="confirm-modal-description"
              className="mt-1 text-sm leading-6 text-slate-600"
            >
              {description}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={
              destructive
                ? "border-red-700 bg-red-700 text-white hover:bg-red-800"
                : undefined
            }
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
