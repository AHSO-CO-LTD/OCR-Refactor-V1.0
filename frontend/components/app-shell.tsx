"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AccountMenu } from "@/components/account-menu";
import { BrandLogo } from "@/components/brand/brand-logo";
import { MachineRuntimeOverlay } from "@/components/plc/machine-runtime-overlay";
import { useDesktopLifecycle } from "@/components/system/desktop-lifecycle-provider";
import type { SessionUser, SystemLicenseState } from "@/lib/api";
import {
  connectCamera,
  disconnectCamera,
  getCameraStatus,
  getCurrentSession,
  listCameraDevices,
  listProductProfiles,
} from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import {
  getPostLoginRoute,
  isExpectedRuntimeCamera,
  selectOperatorStartupProduct,
} from "@/lib/operator-startup-preferences";
import {
  clearSession,
  getAccessToken,
  refreshSession,
} from "@/lib/session";
import { useLicenseWatchdog } from "@/lib/use-license-watchdog";

type AppShellProps = {
  children: ReactNode;
  titleKey?: TranslationKey;
  descriptionKey?: TranslationKey;
};

type NavGroupKey =
  | "navGroup.overview"
  | "navGroup.operation"
  | "navGroup.management"
  | "navGroup.configuration"
  | "navGroup.inspection";

const menuItems = [
  {
    labelKey: "nav.dashboard",
    href: "/dashboard",
    permission: "dashboard.view",
    groupKey: "navGroup.overview",
  },
  {
    labelKey: "nav.line",
    href: "/dashboard/line",
    permission: null,
    groupKey: "navGroup.operation",
  },
  {
    labelKey: "nav.lineTest",
    href: "/dashboard/line-test",
    permission: "inspection.test",
    groupKey: "navGroup.operation",
  },
  {
    labelKey: "nav.lineAnimationTest",
    href: "/dashboard/line-animation-test",
    permission: "inspection.test",
    groupKey: "navGroup.operation",
    hidden: true,
  },
  { labelKey: "nav.users", href: "/dashboard/users", permission: "user.manage", groupKey: "navGroup.management" },
  { labelKey: "nav.roles", href: "/dashboard/roles", permission: "role.manage", groupKey: "navGroup.management" },
  {
    labelKey: "nav.productCamera",
    href: "/dashboard/configuration",
    permission: ["product.manage", "roi.edit", "camera.manage", "camera.identity.manage"],
    groupKey: "navGroup.configuration",
  },
  {
    labelKey: "nav.plc",
    href: "/dashboard/configuration/plc",
    permission: "plc.manage",
    groupKey: "navGroup.configuration",
  },
  {
    labelKey: "nav.reports",
    href: "/dashboard/reports",
    permission: "report.view",
    groupKey: "navGroup.inspection",
  },
] satisfies Array<{
  labelKey: TranslationKey;
  href: string;
  permission: string | string[] | null;
  groupKey: NavGroupKey;
  hidden?: boolean;
}>;

const navGroups = [
  { labelKey: "navGroup.overview", groupKey: "navGroup.overview" },
  { labelKey: "navGroup.operation", groupKey: "navGroup.operation" },
  { labelKey: "navGroup.management", groupKey: "navGroup.management" },
  { labelKey: "navGroup.configuration", groupKey: "navGroup.configuration" },
  { labelKey: "navGroup.inspection", groupKey: "navGroup.inspection" },
] satisfies Array<{
  labelKey: TranslationKey;
  groupKey: NavGroupKey;
}>;

const cameraRuntimePathPrefixes = [
  "/dashboard/line",
  "/dashboard/line-test",
  "/dashboard/line-animation-test",
  "/dashboard/camera",
  "/dashboard/camera-identities",
  "/dashboard/camera-debug",
  "/dashboard/products",
  "/dashboard/configuration",
];

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { requestExit, requestRestart } = useDesktopLifecycle();
  const adminNavRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAdminGroup, setSelectedAdminGroup] = useState<NavGroupKey | null>(null);
  const handleLicenseLost = useCallback(
    (license: SystemLicenseState) => {
      silentlyDisconnectCamera(getAccessToken());
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
  const isConfigurationPage = pathname === "/dashboard/configuration";

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    getCurrentSessionWithTimeout(token)
      .then((response) => {
        const nextUser = response.data.user;
        refreshSession(token, nextUser);
        setUser(nextUser);
      })
      .catch(() => {
        clearSession();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [pathname, router]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const token = getAccessToken();

    if (!token) {
      return;
    }

    if (requiresCameraRuntime(pathname)) {
      if (shouldPrimeCameraRuntime(user)) {
        silentlyPrimeCameraRuntime(token);
      }
      return;
    }

    silentlyDisconnectCamera(token);
  }, [pathname, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const currentMenuItem = findMenuItemForPath(pathname);

    if (!currentMenuItem || canAccessMenuItem(currentMenuItem, user)) {
      return;
    }

    toast.error(t("apiError.Missing required permission"));
    router.replace(getPostLoginRoute(user));
  }, [pathname, router, t, user]);

  function handleLogout() {
    const token = getAccessToken();

    silentlyDisconnectCamera(token);
    clearSession();
    router.replace("/login");
  }

  const visibleMenuItems = menuItems.filter(
    (item) => !item.hidden && user && canAccessMenuItem(item, user),
  );
  const canManageDesktopSettings = true;
  const usesSidebar = user?.role === "dev" || user?.role === "admin";
  const showNavbar = !usesSidebar && visibleMenuItems.length > 1;
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
          <div className="grid min-h-12 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 min-[1180px]:grid-cols-[auto_minmax(0,1fr)_auto]">
            <div className="col-start-1 row-start-1 flex min-w-0 shrink-0 items-center">
              <BrandLogo
                className="h-auto w-[clamp(120px,18vw,200px)] max-w-full"
                priority
                variant="factory"
              />
            </div>
            {usesSidebar ? (
              <div
                ref={adminNavRef}
                className="col-span-2 col-start-1 row-start-2 min-w-0 min-[1180px]:col-span-1 min-[1180px]:col-start-2 min-[1180px]:row-start-1"
              >
                <div className="overflow-x-auto">
                  <nav className="flex min-w-max items-center gap-2 sm:justify-center">
                    {visibleAdminGroups.map((group) => {
                      const active = group.groupKey === matchedAdminGroup?.groupKey;
                      const opened = group.groupKey === selectedAdminGroup;

                      if (group.items.length === 1) {
                        const item = group.items[0];
                        return (
                          <Link
                            key={group.groupKey}
                            href={item.href}
                            onClick={() => setSelectedAdminGroup(null)}
                            className={[
                              "flex h-9 items-center border px-3 text-sm font-medium transition",
                              active
                                ? "border-cyan-200 bg-cyan-50 text-cyan-900"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                            ].join(" ")}
                          >
                            {t(group.labelKey)}
                          </Link>
                        );
                      }

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
            ) : showNavbar ? (
              <div className="col-span-2 col-start-1 row-start-2 min-w-0 overflow-x-auto min-[1180px]:col-span-1 min-[1180px]:col-start-2 min-[1180px]:row-start-1">
                <div className="flex min-w-max items-center gap-2 px-0 sm:justify-center">
                  {navLinks}
                </div>
              </div>
            ) : null}
            <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-end text-sm min-[1180px]:col-start-3">
              <AccountMenu
                canManageDesktopSettings={canManageDesktopSettings}
                donglePresent={license?.licensed === true && license.donglePresent === true}
                onExitApp={requestExit}
                onLogout={handleLogout}
                onRestartApp={requestRestart}
                user={user}
              />
            </div>
          </div>
        </header>

        {usesSidebar ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <section
                className={[
                  "min-h-0 min-w-0 flex-1 overflow-x-hidden",
                  isOperatorLinePage
                    ? "overflow-y-hidden p-2 sm:p-3 xl:p-4"
                    : "overflow-y-auto p-3 sm:p-4 lg:p-5 xl:p-6",
                  isConfigurationPage ? "[scrollbar-gutter:stable]" : "",
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
                "min-h-0 min-w-0 flex-1 overflow-x-hidden",
                isOperatorLinePage
                  ? "overflow-y-hidden p-2 sm:p-3 xl:p-4"
                  : "overflow-y-auto p-3 sm:p-4 lg:p-6",
                isConfigurationPage ? "[scrollbar-gutter:stable]" : "",
              ].join(" ")}
            >
              {children}
            </section>
          </div>
        )}
        <MachineRuntimeOverlay
          enabled={
            user?.isDev === true ||
            user?.permissions.includes("plc.manage") === true ||
            user?.permissions.includes("plc.operate") === true
          }
        />
      </div>
    </main>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  if (href === "/dashboard/configuration") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function shouldPrimeCameraRuntime(user: SessionUser) {
  return (
    user.isDev ||
    user.permissions.includes("camera.manage") ||
    user.permissions.includes("inspection.start") ||
    user.permissions.includes("inspection.test")
  );
}

function findMenuItemForPath(pathname: string) {
  return menuItems.find((item) => isActivePath(pathname, item.href));
}

function canAccessMenuItem(
  item: (typeof menuItems)[number],
  user: SessionUser,
) {
  const permissionAllowed =
    item.permission === null ||
    user.isDev ||
    (Array.isArray(item.permission)
      ? item.permission.some((permission) => user.permissions.includes(permission))
      : user.permissions.includes(item.permission));

  return permissionAllowed;
}

function requiresCameraRuntime(pathname: string) {
  if (pathname === "/dashboard/configuration/plc") {
    return false;
  }

  return cameraRuntimePathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function silentlyDisconnectCamera(accessToken: string | null | undefined) {
  if (!accessToken) {
    return;
  }

  void disconnectCamera(accessToken).catch(() => undefined);
}

function silentlyPrimeCameraRuntime(accessToken: string | null | undefined) {
  if (!accessToken) {
    return;
  }

  void primeCameraRuntime(accessToken).catch(() => undefined);
}

async function primeCameraRuntime(accessToken: string) {
  const [statusResponse, , productsResponse] = await Promise.all([
    getCameraStatus(accessToken),
    listCameraDevices(accessToken),
    listProductProfiles(accessToken),
  ]);
  const startupProduct = selectOperatorStartupProduct(productsResponse.data);

  if (!startupProduct) {
    return statusResponse.data.connected
      ? ("alreadyConnected" as const)
      : ("noProduct" as const);
  }

  if (
    statusResponse.data.connected &&
    isExpectedRuntimeCamera(
      statusResponse.data.device_name,
      startupProduct.camera.deviceName,
    )
  ) {
    return "alreadyConnected" as const;
  }

  const connectedStatus = await connectCamera(accessToken, startupProduct.camera);

  return connectedStatus.data.connected
    ? ("connected" as const)
    : ("notConnected" as const);
}

function getCurrentSessionWithTimeout(accessToken: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  return getCurrentSession(accessToken, { signal: controller.signal }).finally(
    () => window.clearTimeout(timeoutId),
  );
}
