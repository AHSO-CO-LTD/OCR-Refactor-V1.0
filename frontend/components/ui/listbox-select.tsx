"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
  portalled?: boolean;
  title?: string;
  triggerClassName?: string;
  value: string;
};

type PortalPosition = {
  bottom?: number;
  left: number;
  maxHeight: number;
  top?: number;
  width: number;
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
  portalled = false,
  title,
  triggerClassName,
  value,
}: ListboxSelectProps) {
  const [open, setOpen] = useState(false);
  const [portalPosition, setPortalPosition] =
    useState<PortalPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const closeListbox = useCallback(() => {
    setOpen(false);
    setPortalPosition(null);
  }, []);

  const updatePortalPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const viewportPadding = 8;
    const menuGap = 8;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = Math.max(
      0,
      window.innerHeight - rect.bottom - menuGap - viewportPadding,
    );
    const spaceAbove = Math.max(
      0,
      rect.top - menuGap - viewportPadding,
    );
    const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
    const availableHeight = openAbove ? spaceAbove : spaceBelow;
    const width = Math.min(
      rect.width,
      Math.max(0, window.innerWidth - viewportPadding * 2),
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );

    setPortalPosition({
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + menuGap }
        : { top: rect.bottom + menuGap }),
      left,
      maxHeight: Math.max(48, Math.min(256, availableHeight)),
      width,
    });
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }

      closeListbox();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeListbox();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeListbox]);

  useEffect(() => {
    if (!open || !portalled) return;

    window.addEventListener("resize", updatePortalPosition);
    window.addEventListener("scroll", updatePortalPosition, true);
    return () => {
      window.removeEventListener("resize", updatePortalPosition);
      window.removeEventListener("scroll", updatePortalPosition, true);
    };
  }, [open, portalled, updatePortalPosition]);

  const menu = open ? (
    <div
      ref={menuRef}
      data-listbox-portal={portalled ? "true" : undefined}
      className={cn(
        "border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.12)]",
        portalled
          ? "fixed z-[100]"
          : "absolute inset-x-0 top-full z-50 mt-2",
      )}
      style={
        portalled && portalPosition
          ? ({
              bottom: portalPosition.bottom,
              left: portalPosition.left,
              top: portalPosition.top,
              width: portalPosition.width,
            } satisfies CSSProperties)
          : undefined
      }
    >
      <div
        className="max-h-64 overflow-y-auto py-1"
        style={
          portalled && portalPosition
            ? { maxHeight: portalPosition.maxHeight }
            : undefined
        }
        role="listbox"
      >
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
                  closeListbox();
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
  ) : null;

  return (
    <div ref={rootRef} className={cn("relative", containerClassName)}>
      <button
        ref={triggerRef}
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
        onClick={() => {
          if (open) {
            closeListbox();
            return;
          }

          if (portalled) {
            updatePortalPosition();
          }
          setOpen(true);
        }}
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

      {open && portalled && portalPosition && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : !portalled
          ? menu
          : null}
    </div>
  );
}
