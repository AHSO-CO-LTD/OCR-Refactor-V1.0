"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError, getCurrentSession, login } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  clearSession,
  getAccessToken,
  saveSession,
} from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { apiError, t } = useI18n();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      return;
    }

    getCurrentSession(token)
      .then((response) => {
        saveSession(token, response.data.user);
        router.replace("/dashboard");
      })
      .catch(() => {
        clearSession();
      });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await login(username, password);
      saveSession(response.data.accessToken, response.data.user);
      router.replace("/dashboard");
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(apiError(cause.message, "auth.connectionError"));
      } else {
        setError(t("auth.connectionError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 p-4 text-[var(--foreground)] sm:p-6">
      <section className="w-full max-w-md">
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

              {error ? (
                <div className="mt-5 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <Button
                disabled={loading}
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
