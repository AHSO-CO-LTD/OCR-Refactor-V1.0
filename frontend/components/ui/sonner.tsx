"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast:
            "border shadow-sm data-[type=success]:!border-emerald-300 data-[type=success]:!bg-emerald-50 data-[type=success]:!text-emerald-950 data-[type=error]:!border-red-300 data-[type=error]:!bg-red-50 data-[type=error]:!text-red-950 data-[type=warning]:!border-amber-300 data-[type=warning]:!bg-amber-50 data-[type=warning]:!text-amber-950 data-[type=loading]:!border-cyan-300 data-[type=loading]:!bg-cyan-50 data-[type=loading]:!text-cyan-950",
          success: "!border-emerald-300 !bg-emerald-50 !text-emerald-950",
          error: "!border-red-300 !bg-red-50 !text-red-950",
          warning: "!border-amber-300 !bg-amber-50 !text-amber-950",
          loading: "!border-cyan-300 !bg-cyan-50 !text-cyan-950",
          closeButton:
            "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        },
      }}
    />
  );
}
