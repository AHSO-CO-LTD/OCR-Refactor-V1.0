"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Keyboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import { TextVirtualKeyboard } from "@/components/ui/text-virtual-keyboard";
import { cn } from "@/lib/utils";
import {
  applyVirtualKeyboardKey,
  inferKeyboardLayoutFromTarget,
  isVirtualKeyboardTarget,
  type VirtualKeyboardLayout,
  type VirtualKeyboardTarget,
} from "@/lib/virtual-keyboard";
import { useI18n } from "@/lib/i18n";

type OpenKeyboardOptions = {
  layout?: VirtualKeyboardLayout;
  open?: boolean;
};

type VirtualKeyboardContextValue = {
  closeKeyboard: () => void;
  isKeyboardOpen: boolean;
  openKeyboardForTarget: (
    target?: EventTarget | null,
    options?: OpenKeyboardOptions,
  ) => void;
};

const VirtualKeyboardContext =
  createContext<VirtualKeyboardContextValue | null>(null);

function supportsDecimalInput(target: VirtualKeyboardTarget | null) {
  if (!target) {
    return false;
  }

  if (target.inputMode === "decimal") {
    return true;
  }

  if (target.value.includes(".")) {
    return true;
  }

  const step = target.getAttribute("step");

  if (!step) {
    return false;
  }

  if (step === "any") {
    return true;
  }

  return !Number.isInteger(Number(step));
}

function supportsNegativeInput(target: VirtualKeyboardTarget | null) {
  if (!target) {
    return false;
  }

  if (target.value.startsWith("-")) {
    return true;
  }

  const min = target.getAttribute("min");

  if (!min) {
    return false;
  }

  return Number(min) < 0;
}

export function VirtualKeyboardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [layout, setLayout] = useState<VirtualKeyboardLayout>("english");
  const [activeTarget, setActiveTarget] = useState<VirtualKeyboardTarget | null>(
    null,
  );
  const [currentValue, setCurrentValue] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleFocusIn(event: FocusEvent) {
      if (isVirtualKeyboardTarget(event.target)) {
        setActiveTarget(event.target);
        setCurrentValue(event.target.value);
        setLayout(inferKeyboardLayoutFromTarget(event.target));
        setIsOpen(true);
        return;
      }

      if (panelRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (panelRef.current?.contains(event.target as Node)) {
        return;
      }

      if (isVirtualKeyboardTarget(event.target)) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    function handleInput(event: Event) {
      if (!isVirtualKeyboardTarget(event.target)) {
        return;
      }

      if (event.target !== activeTarget) {
        return;
      }

      setCurrentValue(event.target.value);
    }

    document.addEventListener("input", handleInput, true);
    return () => document.removeEventListener("input", handleInput, true);
  }, [activeTarget]);

  const resolveTarget = useCallback((target?: EventTarget | null) => {
    if (isVirtualKeyboardTarget(target)) {
      return target;
    }

    if (isVirtualKeyboardTarget(document.activeElement)) {
      return document.activeElement;
    }

    return null;
  }, []);

  const openKeyboardForTarget = useCallback((
    target?: EventTarget | null,
    options?: OpenKeyboardOptions,
  ) => {
    const resolvedTarget = resolveTarget(target);

    if (resolvedTarget) {
      setActiveTarget(resolvedTarget);
      setCurrentValue(resolvedTarget.value);
      setLayout(options?.layout ?? inferKeyboardLayoutFromTarget(resolvedTarget));
      resolvedTarget.focus();
    } else if (options?.layout) {
      setLayout(options.layout);
    }

    setIsOpen(options?.open ?? true);
  }, [resolveTarget]);

  const closeKeyboard = useCallback(() => {
    setIsOpen(false);
  }, []);

  function handleKeyPress(key: string) {
    if (!activeTarget) {
      return;
    }

    applyVirtualKeyboardKey(activeTarget, key);
    setCurrentValue(activeTarget.value);
  }

  const contextValue = useMemo<VirtualKeyboardContextValue>(
    () => ({
      closeKeyboard,
      isKeyboardOpen: isOpen,
      openKeyboardForTarget,
    }),
    [closeKeyboard, isOpen, openKeyboardForTarget],
  );

  return (
    <VirtualKeyboardContext.Provider value={contextValue}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <VirtualKeyboardPanel
              activeTarget={activeTarget}
              currentValue={currentValue}
              isOpen={isOpen}
              layout={layout}
              panelRef={panelRef}
              onClose={closeKeyboard}
              onKeyPress={handleKeyPress}
              onInputChange={setCurrentValue}
              onLayoutChange={setLayout}
              t={t}
            />,
            document.body,
          )
        : null}
    </VirtualKeyboardContext.Provider>
  );
}

export function useVirtualKeyboard() {
  const context = useContext(VirtualKeyboardContext);

  if (!context) {
    throw new Error("useVirtualKeyboard must be used inside VirtualKeyboardProvider");
  }

  return context;
}

function VirtualKeyboardPanel({
  activeTarget,
  currentValue,
  isOpen,
  layout,
  panelRef,
  onClose,
  onKeyPress,
  onInputChange,
  onLayoutChange,
  t,
}: {
  activeTarget: VirtualKeyboardTarget | null;
  currentValue: string;
  isOpen: boolean;
  layout: VirtualKeyboardLayout;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onKeyPress: (key: string) => void;
  onInputChange: (value: string) => void;
  onLayoutChange: (layout: VirtualKeyboardLayout) => void;
  t: (key: string) => string;
}) {
  if (!isOpen) {
    return null;
  }

  const isNumericLayout = layout === "numeric";
  const targetLabel =
    activeTarget?.getAttribute("aria-label") ??
    activeTarget?.getAttribute("placeholder") ??
    activeTarget?.name ??
    t("vk.target");
  const allowDecimal = supportsDecimalInput(activeTarget);
  const allowNegative = supportsNegativeInput(activeTarget);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <div
        ref={panelRef}
        className="pointer-events-auto fixed border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]"
        style={{
          left: 8,
          right: 8,
          bottom: 8,
          width: "calc(100vw - 16px)",
          maxWidth: "calc(100vw - 16px)",
        }}
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <div
            className={
              isNumericLayout
                ? "flex items-center justify-between gap-3"
                : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            }
          >
            {isNumericLayout ? (
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-[0.04em] text-slate-500">
                  {targetLabel}
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold text-slate-950">
                  <Keyboard className="h-4 w-4" />
                  {t("vk.title")}
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">
                  {t("vk.target")}: {targetLabel}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {isNumericLayout ? null : (
                <>
                  <LayoutTab
                    active={false}
                    label={t("vk.numeric")}
                    onClick={() => onLayoutChange("numeric")}
                  />
                  <LayoutTab
                    active={layout === "english"}
                    label={t("vk.english")}
                    onClick={() => onLayoutChange("english")}
                  />
                </>
              )}
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
                {t("vk.close")}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="border border-cyan-200 bg-cyan-50 px-3 py-2">
            {isNumericLayout ? null : (
              <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-cyan-700">
                {targetLabel}
              </div>
            )}
            <div
              className={
                isNumericLayout
                  ? "min-h-7 break-all text-base text-slate-950"
                  : "mt-1 min-h-7 break-all text-sm text-slate-950"
              }
            >
              {currentValue || <span className="text-slate-400">{t("vk.empty")}</span>}
            </div>
          </div>

          {isNumericLayout ? (
            <NumericKeypad
              allowDecimal={allowDecimal}
              allowNegative={allowNegative}
              onKeyPress={onKeyPress}
              onClear={() => onKeyPress("__clear")}
              onBackspace={() => onKeyPress("__backspace")}
            />
          ) : (
            <TextVirtualKeyboard
              key={`${activeTarget?.name ?? activeTarget?.id ?? "virtual-text"}-${activeTarget?.type ?? "text"}`}
              currentValue={currentValue}
              onInputChange={onInputChange}
              target={activeTarget}
              t={t}
            />
          )}

          {layout !== "numeric" ? (
            <div className="border-t border-slate-200 pt-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-28 border-slate-300 px-4"
                onClick={() => onKeyPress("__clear")}
              >
                {t("common.clear")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LayoutTab({
  active,
  compact = false,
  label,
  onClick,
}: {
  active: boolean;
  compact?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "border px-3 py-1.5 text-sm font-medium transition",
        compact ? "px-2 py-1 text-xs" : "",
        active
          ? "border-cyan-600 bg-cyan-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
