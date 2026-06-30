"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LoginSystemStatus,
  type LoginGateStatus,
} from "@/components/auth/login-system-status";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useVirtualKeyboard } from "@/components/ui/virtual-keyboard";
import { ApiError, getCurrentSession, login } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  clearOperatorStartupAutoLoginRequest,
  getPostLoginRoute,
  hasOperatorStartupAutoLoginRequest,
  OPERATOR_AUTO_LOGIN_PASSWORD,
  OPERATOR_AUTO_LOGIN_USERNAME,
} from "@/lib/operator-startup-preferences";
import {
  clearSession,
  getAccessToken,
  saveSession,
} from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { apiError, t } = useI18n();
  const { isKeyboardOpen } = useVirtualKeyboard();
  const autoLoginAttemptedRef = useRef(false);
  const [startupAutoLoginRequested] = useState(() =>
    hasOperatorStartupAutoLoginRequest(),
  );
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [gateStatus, setGateStatus] = useState<LoginGateStatus>({
    checking: true,
    apiConnected: false,
    licenseReady: false,
  });

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();

    function markSessionChecked() {
      window.setTimeout(() => {
        if (!cancelled) {
          setSessionChecked(true);
        }
      }, 0);
    }

    if (!token) {
      markSessionChecked();
      return () => {
        cancelled = true;
      };
    }

    getCurrentSession(token)
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (startupAutoLoginRequested && response.data.user.role !== "operator") {
          clearSession();
          markSessionChecked();
          return;
        }

        if (startupAutoLoginRequested) {
          clearOperatorStartupAutoLoginRequest();
        }

        saveSession(token, response.data.user);
        router.replace(getPostLoginRoute(response.data.user));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        clearSession();
        markSessionChecked();
      });

    return () => {
      cancelled = true;
    };
  }, [router, startupAutoLoginRequested]);

  useEffect(() => {
    const hasExistingToken = Boolean(getAccessToken());

    if (
      !sessionChecked ||
      hasExistingToken ||
      loading ||
      gateStatus.checking ||
      !gateStatus.licenseReady ||
      !startupAutoLoginRequested ||
      autoLoginAttemptedRef.current
    ) {
      return;
    }

    autoLoginAttemptedRef.current = true;
    setLoading(true);
    setError("");

    login(OPERATOR_AUTO_LOGIN_USERNAME, OPERATOR_AUTO_LOGIN_PASSWORD)
      .then((response) => {
        saveSession(response.data.accessToken, response.data.user);
        clearOperatorStartupAutoLoginRequest();
        toast.success(t("auth.operatorAutoLoginSuccess"));
        router.replace(getPostLoginRoute(response.data.user));
      })
      .catch((cause) => {
        const message =
          cause instanceof ApiError
            ? apiError(cause.message, "auth.operatorAutoLoginFailed")
            : t("auth.operatorAutoLoginFailed");

        setError(message);
        toast.warning(message);
      })
      .finally(() => {
        clearOperatorStartupAutoLoginRequest();
        setLoading(false);
      });
  }, [
    apiError,
    gateStatus.checking,
    gateStatus.licenseReady,
    loading,
    router,
    sessionChecked,
    startupAutoLoginRequested,
    t,
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
      clearOperatorStartupAutoLoginRequest();
      saveSession(response.data.accessToken, response.data.user);
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
              <label className="block text-sm font-medium text-slate-700">
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

              <LoginSystemStatus onChange={setGateStatus} />

              {error ? (
                <div className="mt-5 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <Button
                disabled={loading || gateStatus.checking || !gateStatus.licenseReady}
                className="mt-7 w-full"
              >
                {loading ? t("auth.signingIn") : t("auth.login")}
              </Button>
            </CardContent>
          </Card>
        </form>
      </section>
    </main>
  );
}
