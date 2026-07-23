"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  LoginSystemStatus,
  type LoginGateStatus,
} from "@/components/auth/login-system-status";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  getPostLoginRoute,
} from "@/lib/operator-startup-preferences";
import {
  clearSession,
  getRememberedAccessToken,
  saveSession,
} from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { apiError, t } = useI18n();
  const { isKeyboardOpen } = useVirtualKeyboard();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    "system" | "autoLogin" | "manual"
  >("system");
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
          router.replace(getPostLoginRoute());
          return;
        } catch {
          if (cancelled) return;
          silentlyDisconnectCamera(rememberedToken);
          clearSession();
        }
      }

      if (cancelled) return;
      setStartupMode("manual");
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
      router.replace(getPostLoginRoute());
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
    <main className="login-page h-[100dvh] overflow-y-auto bg-slate-100 text-[var(--foreground)]">
      <div className="login-layout mx-auto flex min-h-full w-full flex-col items-center px-4 py-4 sm:px-6">
        <div className="w-full max-w-2xl shrink-0">
          <LoginSystemStatus
            className="login-startup-status w-full bg-white"
            onChange={setGateStatus}
          />
        </div>

      <section
        className={[
          "login-main flex w-full max-w-md flex-1 flex-col py-6 transition-all duration-200",
          isKeyboardOpen ? "justify-start" : "justify-center",
        ].join(" ")}
      >
        <div className="login-brand mb-6 flex flex-col items-center text-center">
          <BrandLogo
            className="login-brand-logo h-16 w-auto"
            priority
            variant="ahso"
          />
          <h1 className="login-brand-title mt-4 text-balance text-3xl font-semibold tracking-tight text-slate-950">
            OCR Metal Core Washing
          </h1>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="login-card">
            <CardHeader className="login-card-header">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="login-form-title text-2xl font-semibold text-slate-950">
                    {t("auth.signIn")}
                  </h2>
                  <p className="login-form-subtitle mt-2 text-sm text-slate-500">
                    {t("auth.subtitle")}
                  </p>
                </div>
                <LanguageToggle />
              </div>
            </CardHeader>

            <CardContent className="login-card-content">
              {startupMode === "autoLogin" ? (
                <div className="mt-5 border border-cyan-200 bg-cyan-50 px-3 py-3 text-sm font-medium text-cyan-900">
                  {t("login.autoLoginChecking")}
                </div>
              ) : null}

              {startupMode === "manual" ? (
                <>
                  <label className="login-form-label mt-5 block text-sm font-medium text-slate-700">
                    {t("auth.username")}
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="mt-2 h-11 w-full border border-slate-300 px-3 text-slate-950 outline-none transition focus:border-cyan-600"
                      autoComplete="username"
                    />
                  </label>

                  <label className="login-form-label mt-5 block text-sm font-medium text-slate-700">
                    {t("auth.password")}
                    <span className="relative mt-2 block">
                      <Input
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-11 pr-12"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-virtual-keyboard-control
                        aria-label={
                          showPassword
                            ? t("auth.hidePassword")
                            : t("auth.showPassword")
                        }
                        aria-pressed={showPassword}
                        title={
                          showPassword
                            ? t("auth.hidePassword")
                            : t("auth.showPassword")
                        }
                        className="absolute inset-y-0 right-0 h-full w-11 border-l border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600"
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? (
                          <EyeOff aria-hidden="true" className="h-5 w-5" />
                        ) : (
                          <Eye aria-hidden="true" className="h-5 w-5" />
                        )}
                      </Button>
                    </span>
                  </label>

                  <label className="login-form-label mt-5 flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
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
                  className="login-submit mt-7 w-full"
                >
                  {loading ? t("auth.signingIn") : t("auth.login")}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </form>
      </section>
      </div>
    </main>
  );
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
