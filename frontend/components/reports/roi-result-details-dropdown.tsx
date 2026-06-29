"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type RoiResultDetailItem = {
  key: string;
  title: string;
  result: string;
  expectedText: string;
  rawText: string;
  errorMessage: string;
};

export function RoiResultDetailsDropdown({
  items,
  emptyText,
  summary,
  viewLabel,
  hideLabel,
  resultLabel,
  expectedTextLabel,
  rawTextLabel,
  errorLabel,
}: {
  items: RoiResultDetailItem[];
  emptyText: string;
  summary?: string | null;
  viewLabel: string;
  hideLabel: string;
  resultLabel: string;
  expectedTextLabel: string;
  rawTextLabel: string;
  errorLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-slate-200 bg-white px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-600">{summary ?? emptyText}</div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {open ? hideLabel : viewLabel}
        </Button>
      </div>

      {open ? (
        items.length > 0 ? (
          <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.key}
                className="border border-slate-200 bg-slate-50 px-2 py-2"
              >
                <div className="font-semibold text-slate-900">{item.title}</div>
                <div>
                  {resultLabel}: {item.result}
                </div>
                <div>
                  {expectedTextLabel}: {item.expectedText}
                </div>
                <div>
                  {rawTextLabel}: {item.rawText}
                </div>
                <div>
                  {errorLabel}: {item.errorMessage}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-xs text-slate-500">{emptyText}</div>
        )
      ) : null}
    </div>
  );
}
