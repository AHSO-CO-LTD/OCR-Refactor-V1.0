"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AccountMenu } from "@/components/account-menu";
import type { RoleCode, SessionUser, SystemLicenseState } from "@/lib/api";
import { getCameraStatus, getCurrentSession, listCameraDevices } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import {
  clearSession,
  getAccessToken,
  saveSession,
} from "@/lib/session";
import { getDesktopBridge } from "@/lib/desktop";
import { useLicenseWatchdog } from "@/lib/use-license-watchdog";

type AppShellProps = {
  children: ReactNode;
  titleKey?: TranslationKey;
  descriptionKey?: TranslationKey;
};

type NavGroupKey =
  | "navGroup.overview"
  | "navGroup.management"
  | "navGroup.configuration"
  | "navGroup.inspection";

const menuItems = [
  { labelKey: "nav.dashboard", href: "/dashboard", permission: null, groupKey: "navGroup.overview" },
  { labelKey: "nav.line", href: "/dashboard/line", permission: null, groupKey: "navGroup.overview" },
  {
    labelKey: "nav.lineTest",
    href: "/dashboard/line-test",
    permission: null,
    groupKey: "navGroup.overview",
    allowedRoles: ["dev", "admin", "engineer"] as RoleCode[],
  },
  { labelKey: "nav.users", href: "/dashboard/users", permission: "user.manage", groupKey: "navGroup.management" },
  { labelKey: "nav.roles", href: "/dashboard/roles", permission: "role.manage", groupKey: "navGroup.management" },
  {
    labelKey: "nav.products",
    href: "/dashboard/products",
    permission: "product.manage",
    groupKey: "navGroup.configuration",
  },
  { labelKey: "nav.camera", href: "/dashboard/camera", permission: "camera.manage", groupKey: "navGroup.configuration" },
  {
    labelKey: "nav.cameraDebug",
    href: "/dashboard/camera-debug",
    permission: "camera.manage",
    groupKey: "navGroup.configuration",
  },
  { labelKey: "nav.roi", href: "/dashboard/roi", permission: "roi.edit", groupKey: "navGroup.configuration" },
  { labelKey: "nav.history", href: "/dashboard/history", permission: "history.view", groupKey: "navGroup.inspection" },
  {
    labelKey: "nav.reports",
    href: "/dashboard/reports",
    permission: "report.view",
    groupKey: "navGroup.inspection",
    allowedRoles: ["dev", "admin", "engineer"] as RoleCode[],
  },
] satisfies Array<{
  labelKey: TranslationKey;
  href: string;
  permission: string | null;
  groupKey: NavGroupKey;
  allowedRoles?: RoleCode[];
}>;

const navGroups = [
  { labelKey: "navGroup.overview", groupKey: "navGroup.overview" },
  { labelKey: "navGroup.management", groupKey: "navGroup.management" },
  { labelKey: "navGroup.configuration", groupKey: "navGroup.configuration" },
  { labelKey: "navGroup.inspection", groupKey: "navGroup.inspection" },
] satisfies Array<{
  labelKey: TranslationKey;
  groupKey: NavGroupKey;
}>;

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const adminNavRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAdminGroup, setSelectedAdminGroup] = useState<NavGroupKey | null>(null);
  const handleLicenseLost = useCallback(
    (license: SystemLicenseState) => {
      clearSession();
      toast.error(license.message || t("session.licenseLost"));
      router.replace("/login");
    },
    [router, t],
  );
  const { license } = useLicenseWatchdog({
    enabled: Boolean(user),
    onLicenseLost: handleLicenseLost,
  });
  const isOperatorLinePage = pathname === "/dashboard/line";

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    getCurrentSession(token)
      .then((response) => {
        const nextUser = response.data.user;
        saveSession(token, nextUser);
        setUser(nextUser);

        if (shouldPrimeCameraRuntime(nextUser)) {
          void primeCameraRuntime(token);
        }
      })
      .catch(() => {
        clearSession();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  async function handleExitApp() {
    const bridge = getDesktopBridge();

    if (!bridge) {
      toast.warning(t("settings.desktopOnly"));
      return;
    }

    toast.loading(t("settings.exiting"));
    await bridge.exitApp();
  }

  const visibleMenuItems = menuItems.filter(
    (item) =>
      (!item.allowedRoles || (user ? item.allowedRoles.includes(user.role) : false)) &&
      (
        item.permission === null ||
        user?.isDev ||
        user?.permissions.includes(item.permission)
      ),
  );
  const canManageDesktopSettings = true;
  const usesSidebar = user?.role === "dev" || user?.role === "admin";
  const visibleAdminGroups = navGroups
    .map((group) => ({
      ...group,
      items: visibleMenuItems.filter((item) => item.groupKey === group.groupKey),
    }))
    .filter((group) => group.items.length > 0);
  const matchedAdminGroup =
    visibleAdminGroups.find((group) =>
      group.items.some((item) => isActivePath(pathname, item.href)),
    ) ?? null;
  const selectedAdminGroupKey =
    selectedAdminGroup &&
    visibleAdminGroups.some((group) => group.groupKey === selectedAdminGroup)
      ? selectedAdminGroup
      : null;
  const openedAdminGroup =
    visibleAdminGroups.find((group) => group.groupKey === selectedAdminGroupKey) ??
    null;

  useEffect(() => {
    if (!usesSidebar || !selectedAdminGroup) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!adminNavRef.current?.contains(event.target as Node)) {
        setSelectedAdminGroup(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedAdminGroup(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [selectedAdminGroup, usesSidebar]);

  if (loading && !user) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </main>
    );
  }

  if (!user) {
    return null;
  }

  const navLinks = (
    <nav
      className={
        usesSidebar
          ? "space-y-1"
          : "flex min-w-max items-center gap-2 lg:min-w-0 lg:flex-wrap"
      }
    >
      {visibleMenuItems.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "flex h-9 items-center border px-3 text-left text-sm font-medium transition",
              usesSidebar ? "w-full" : "w-auto",
              active
                ? "border-cyan-200 bg-cyan-50 text-cyan-900"
                : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50",
            ].join(" ")}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <main className="flex h-[100dvh] overflow-hidden bg-slate-100 text-slate-950">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 shrink-0 border-b border-slate-200 bg-white px-4 py-2 sm:px-5 lg:px-6">
          <div className="flex min-h-12 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                {t("app.brand")}
              </div>
              <div className="truncate text-lg font-semibold">{t("app.line")}</div>
            </div>
            {usesSidebar ? (
              <div ref={adminNavRef} className="min-w-0 flex-1">
                <div className="overflow-x-auto">
                  <nav className="flex min-w-max items-center gap-2 sm:justify-center">
                    {visibleAdminGroups.map((group) => {
                      const active = group.groupKey === matchedAdminGroup?.groupKey;
                      const opened = group.groupKey === selectedAdminGroup;

                      return (
                        <button
                          key={group.groupKey}
                          type="button"
                          onClick={() =>
                            setSelectedAdminGroup((current) =>
                              current === group.groupKey ? null : group.groupKey,
                            )
                          }
                          className={[
                            "flex h-9 items-center border px-3 text-sm font-medium transition",
                            opened || active
                              ? "border-cyan-200 bg-cyan-50 text-cyan-900"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {t(group.labelKey)}
                        </button>
                      );
                    })}
                  </nav>
                </div>

                {openedAdminGroup ? (
                  <div className="absolute inset-x-0 top-full border-t border-slate-200 bg-white px-4 py-2 shadow-sm sm:px-5 lg:px-6">
                    <nav className="flex min-w-max items-center gap-2 overflow-x-auto sm:justify-center">
                      {openedAdminGroup.items.map((item) => {
                        const active = isActivePath(pathname, item.href);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setSelectedAdminGroup(null)}
                            className={[
                              "flex h-9 items-center border px-3 text-left text-sm font-medium transition",
                              active
                                ? "border-cyan-200 bg-cyan-50 text-cyan-900"
                                : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50",
                            ].join(" ")}
                          >
                            {t(item.labelKey)}
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="min-w-0 flex-1 overflow-x-auto">
                <div className="flex min-w-max items-center gap-2 px-0 sm:justify-center">
                  {navLinks}
                </div>
              </div>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm sm:justify-end lg:gap-4">
              <AccountMenu
                canManageDesktopSettings={canManageDesktopSettings}
                donglePresent={license?.licensed === true && license.donglePresent === true}
                onExitApp={handleExitApp}
                onLogout={handleLogout}
                user={user}
              />
            </div>
          </div>
        </header>

        {usesSidebar ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-col">
              <section
                className={[
                  "min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 sm:p-5 lg:p-5 xl:p-6",
                  isOperatorLinePage ? "overflow-y-hidden" : "overflow-y-auto",
                ].join(" ")}
              >
                {children}
              </section>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <section
              className={[
                "min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 sm:p-5 lg:p-6",
                isOperatorLinePage ? "overflow-y-hidden" : "overflow-y-auto",
              ].join(" ")}
            >
              {children}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function shouldPrimeCameraRuntime(user: SessionUser) {
  return (
    user.isDev ||
    user.permissions.includes("camera.manage") ||
    user.permissions.includes("inspection.start")
  );
}

async function primeCameraRuntime(accessToken: string) {
  await Promise.allSettled([
    getCameraStatus(accessToken),
    listCameraDevices(accessToken),
  ]);
}
