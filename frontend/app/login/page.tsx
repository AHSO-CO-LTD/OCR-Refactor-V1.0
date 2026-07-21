"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LoginSystemStatus,
  type LoginGateStatus,
} from "@/components/auth/login-system-status";
import { LoginStartupHardwareStatus } from "@/components/auth/login-startup-hardware-status";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useVirtualKeyboard } from "@/components/ui/virtual-keyboard";
import {
  ApiError,
  disconnectCamera,
  getSetupStatus,
  login,
  restoreRememberedSession,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  getOperatorStartupPreferences,
  getPostLoginRoute,
} from "@/lib/operator-startup-preferences";
import {
  getDesktopBridge,
  type DesktopStartupHardwareStage,
} from "@/lib/desktop";
import {
  clearSession,
  getRememberedAccessToken,
  saveSession,
} from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { apiError, t } = useI18n();
  const { isKeyboardOpen } = useVirtualKeyboard();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(false);
  const [setupState, setSetupState] = useState<
    "checking" | "ready" | "required"
  >("checking");
  const [gateStatus, setGateStatus] = useState<LoginGateStatus>({
    checking: true,
    apiConnected: false,
    licenseReady: false,
  });
  const [startupMode, setStartupMode] = useState<
    "system" | "autoLogin" | "hardware" | "manual"
  >("system");
  const [startupHardwareStages, setStartupHardwareStages] = useState(
    createPendingStartupHardwareStages,
  );
  const startupAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    getSetupStatus()
      .then((response) => {
        if (cancelled) return;
        if (response.data.requiresAdminSetup) {
          setSetupState("required");
          router.replace("/setup");
          return;
        }
        setSetupState("ready");
      })
      .catch(() => {
        if (!cancelled) setSetupState("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (
      gateStatus.checking ||
      !gateStatus.apiConnected ||
      !gateStatus.licenseReady ||
      setupState !== "ready" ||
      startupAttemptedRef.current
    ) {
      if (!gateStatus.checking && !gateStatus.licenseReady) {
        const timerId = window.setTimeout(() => setStartupMode("manual"), 0);
        return () => window.clearTimeout(timerId);
      }
      return;
    }

    startupAttemptedRef.current = true;
    let cancelled = false;

    async function runStartupFlow() {
      const rememberedToken = getRememberedAccessToken();

      if (rememberedToken) {
        setStartupMode("autoLogin");
        try {
          const response = await getCurrentSessionWithTimeout(rememberedToken);
          if (cancelled) return;
          saveSession(rememberedToken, response.data.user, { remember: true });
          router.replace(getPostLoginRoute(response.data.user));
          return;
        } catch {
          if (cancelled) return;
          silentlyDisconnectCamera(rememberedToken);
          clearSession();
        }
      }

      if (cancelled) return;
      const bridge = getDesktopBridge();
      if (!bridge) {
        setStartupMode("manual");
        return;
      }

      setStartupMode("hardware");
      setStartupHardwareStages(createPendingStartupHardwareStages());
      const unsubscribe = bridge.onStartupHardwareStatus((nextStage) => {
        if (cancelled) return;
        setStartupHardwareStages((current) =>
          current.map((stage) =>
            stage.id === nextStage.id ? nextStage : stage,
          ),
        );
      });

      try {
        const preferences = getOperatorStartupPreferences();
        const result = await bridge.prepareStartupHardware(
          preferences?.productId,
        );
        if (!cancelled) setStartupHardwareStages(result.stages);
      } catch {
        if (!cancelled) {
          setStartupHardwareStages((current) =>
            current.map((stage) =>
              stage.status === "running"
                ? { ...stage, status: "failed" }
                : stage.status === "pending"
                  ? { ...stage, status: "skipped" }
                  : stage,
            ),
          );
        }
      } finally {
        unsubscribe();
        if (!cancelled) setStartupMode("manual");
      }
    }

    void runStartupFlow();
    return () => {
      cancelled = true;
    };
  }, [
    gateStatus.apiConnected,
    gateStatus.checking,
    gateStatus.licenseReady,
    router,
    setupState,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!gateStatus.licenseReady) {
      const message = t("login.blocked");
      setError(message);
      toast.error(message);
      return;
    }

    setLoading(true);

    try {
      const response = await login(username, password);
      saveSession(response.data.accessToken, response.data.user, {
        remember: rememberLogin,
      });
      toast.success(t("auth.loginSuccess"));
      router.replace(getPostLoginRoute(response.data.user));
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "auth.connectionError")
          : t("auth.connectionError");

      toast.error(message);

      if (cause instanceof ApiError) {
        setError(message);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className={[
        "flex min-h-[100dvh] justify-center bg-slate-100 p-4 text-[var(--foreground)] transition-all duration-200 sm:p-6",
        isKeyboardOpen ? "items-start pt-6 sm:pt-8" : "items-center",
      ].join(" ")}
    >
      <section
        className={[
          "w-full max-w-md transition-transform duration-200",
          isKeyboardOpen ? "translate-y-0" : "",
        ].join(" ")}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            {t("app.brand")}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            OCR Metal Core Washing
          </h1>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">
                    {t("auth.signIn")}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {t("auth.subtitle")}
                  </p>
                </div>
                <LanguageToggle />
              </div>
            </CardHeader>

            <CardContent>
              <LoginSystemStatus onChange={setGateStatus} />

              {startupMode === "autoLogin" ? (
                <div className="mt-5 border border-cyan-200 bg-cyan-50 px-3 py-3 text-sm font-medium text-cyan-900">
                  {t("login.autoLoginChecking")}
                </div>
              ) : null}

              {startupMode === "hardware" ? (
                <LoginStartupHardwareStatus stages={startupHardwareStages} />
              ) : null}

              {startupMode === "manual" ? (
                <>
                  <label className="mt-5 block text-sm font-medium text-slate-700">
                    {t("auth.username")}
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="mt-2 h-11 w-full border border-slate-300 px-3 text-slate-950 outline-none transition focus:border-cyan-600"
                      autoComplete="username"
                    />
                  </label>

                  <label className="mt-5 block text-sm font-medium text-slate-700">
                    {t("auth.password")}
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-2 h-11 w-full border border-slate-300 px-3 text-slate-950 outline-none transition focus:border-cyan-600"
                      type="password"
                      autoComplete="current-password"
                    />
                  </label>

                  <label className="mt-5 flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
                    <input
                      checked={rememberLogin}
                      onChange={(event) =>
                        setRememberLogin(event.target.checked)
                      }
                      className="h-5 w-5 border border-slate-300 accent-cyan-700"
                      type="checkbox"
                    />
                    <span>{t("auth.rememberLogin")}</span>
                  </label>
                </>
              ) : null}

              {error ? (
                <div className="mt-5 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {startupMode === "manual" ? (
                <Button
                  disabled={
                    loading || gateStatus.checking || !gateStatus.licenseReady
                  }
                  className="mt-7 w-full"
                >
                  {loading ? t("auth.signingIn") : t("auth.login")}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </form>
      </section>
    </main>
  );
}

function createPendingStartupHardwareStages(): DesktopStartupHardwareStage[] {
  return ["plc", "cameraPower", "cameraLight", "camera"].map((id) => ({
    id: id as DesktopStartupHardwareStage["id"],
    status: "pending",
  }));
}

function silentlyDisconnectCamera(accessToken: string | null | undefined) {
  if (!accessToken) {
    return;
  }

  void disconnectCamera(accessToken).catch(() => undefined);
}

function getCurrentSessionWithTimeout(accessToken: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  return restoreRememberedSession(accessToken, {
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeoutId));
}
