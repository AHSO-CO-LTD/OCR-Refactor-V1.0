"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ListboxOption = {
  description?: string;
  label: string;
  value: string;
};

type ListboxSelectProps = {
  ariaInvalid?: boolean;
  ariaLabel?: string;
  containerClassName?: string;
  disabled?: boolean;
  emptyLabel?: string;
  id?: string;
  onChange: (value: string) => void;
  options: ListboxOption[];
  placeholder?: string;
  title?: string;
  triggerClassName?: string;
  value: string;
};

export function ListboxSelect({
  ariaInvalid = false,
  ariaLabel,
  containerClassName,
  disabled = false,
  emptyLabel,
  id,
  onChange,
  options,
  placeholder,
  title,
  triggerClassName,
  value,
}: ListboxSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, []);

  return (
    <div ref={rootRef} className={cn("relative", containerClassName)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        title={title}
        data-invalid={ariaInvalid ? "true" : undefined}
        className={cn(
          "flex h-11 w-full items-center justify-between border border-slate-300 bg-white px-3 text-left text-sm text-slate-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
          ariaInvalid ? "border-red-300 focus:border-red-500 focus:ring-red-100" : "",
          open ? "border-cyan-600 ring-2 ring-cyan-100" : "",
          triggerClassName,
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">
          {selectedOption?.label ?? emptyLabel ?? placeholder ?? ""}
        </span>
        <ChevronDown
          className={cn(
            "ml-3 h-4 w-4 shrink-0 text-slate-500 transition",
            open ? "rotate-180" : "",
          )}
        />
      </button>

      {open ? (
        <div className="mt-2 border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">
                {emptyLabel ?? placeholder ?? ""}
              </div>
            ) : (
              options.map((option) => {
                const active = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition hover:bg-slate-100",
                      active ? "bg-slate-100 text-slate-950" : "text-slate-700",
                    )}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {active ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
