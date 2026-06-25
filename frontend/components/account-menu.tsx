"use client";

import Link from "next/link";
import { ChevronDown, LogOut, Power, Settings, Usb } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type AccountMenuProps = {
  canManageDesktopSettings: boolean;
  donglePresent: boolean;
  onExitApp: () => void | Promise<void>;
  onLogout: () => void;
  user: SessionUser;
};

export function AccountMenu({
  canManageDesktopSettings,
  donglePresent,
  onExitApp,
  onLogout,
  user,
}: AccountMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const roleLabel = t(`role.${user.role}`);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        className="h-auto min-w-[210px] justify-between gap-3 px-3 py-1.5 text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center border",
            donglePresent
              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : "border-rose-200 bg-rose-50 text-rose-600",
          )}
          title={
            donglePresent ? t("dashboard.donglePresent") : t("dashboard.dongleMissing")
          }
        >
          <Usb className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-950">
            {user.username}
          </span>
          <span className="block truncate text-xs font-medium text-slate-500">
            {roleLabel}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-500 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </Button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("session.accountMenu")}
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 border border-slate-200 bg-white p-1 shadow-sm"
        >
          <div className="border-b border-slate-200 px-3 py-3">
            <div className="text-xs font-medium text-slate-500">
              {t("settings.tabLanguage")}
            </div>
            <LanguageToggle className="mt-2" fullWidth />
          </div>

          {canManageDesktopSettings ? (
            <Link
              href="/dashboard/settings"
              role="menuitem"
              className="flex h-10 items-center gap-3 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              <Settings className="h-4 w-4" />
              {t("nav.settings")}
            </Link>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center gap-3 px-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => {
              setOpen(false);
              void onExitApp();
            }}
          >
            <Power className="h-4 w-4" />
            {t("settings.exitApp")}
          </button>

          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center gap-3 px-3 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut className="h-4 w-4" />
            {t("session.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
