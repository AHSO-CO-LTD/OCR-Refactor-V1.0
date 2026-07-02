"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  createInitialAdmin,
  getSetupStatus,
  type InitialAdminPayload,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const initialForm: InitialAdminPayload & { confirmPassword: string } = {
  username: "admin",
  password: "",
  confirmPassword: "",
  fullName: "",
  department: "",
  employeeNo: "",
};

export default function SetupPage() {
  const router = useRouter();
  const { apiError, t } = useI18n();
  const [form, setForm] = useState(initialForm);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getSetupStatus()
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (!response.data.requiresAdminSetup) {
          router.replace("/login");
          return;
        }

        setChecking(false);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        const message =
          cause instanceof ApiError
            ? apiError(cause.message, "setup.loadError")
            : t("setup.loadError");
        setError(message);
        toast.error(message);
        setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiError, router, t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      const message = t("setup.passwordMismatch");
      setError(message);
      toast.error(message);
      return;
    }

    if (form.password.length < 8) {
      const message = t("setup.passwordTooShort");
      setError(message);
      toast.error(message);
      return;
    }

    setSaving(true);

    try {
      await createInitialAdmin({
        username: form.username.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        department: form.department?.trim() || undefined,
        employeeNo: form.employeeNo?.trim() || undefined,
      });
      toast.success(t("setup.adminCreated"));
      router.replace("/login");
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "setup.saveError")
          : t("setup.saveError");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 p-4 text-slate-950 sm:p-6">
      <section className="w-full max-w-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            {t("app.brand")}
          </div>
          <h1 className="mt-3 text-3xl font-semibold">
            {t("setup.title")}
          </h1>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            {t("setup.description")}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-2xl font-semibold">
                    <UserPlus className="h-6 w-6 text-cyan-700" aria-hidden="true" />
                    {t("setup.adminTitle")}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {t("setup.adminDescription")}
                  </p>
                </div>
                <LanguageToggle />
              </div>
            </CardHeader>

            <CardContent>
              {checking ? (
                <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {t("setup.checking")}
                </div>
              ) : (
                <div className="grid gap-4">
                  <TextField
                    label={t("setup.username")}
                    value={form.username}
                    onChange={(value) => updateField("username", value)}
                    autoComplete="username"
                  />
                  <TextField
                    label={t("setup.fullName")}
                    value={form.fullName}
                    onChange={(value) => updateField("fullName", value)}
                    autoComplete="name"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label={t("setup.department")}
                      value={form.department ?? ""}
                      required={false}
                      onChange={(value) => updateField("department", value)}
                    />
                    <TextField
                      label={t("setup.employeeNo")}
                      value={form.employeeNo ?? ""}
                      required={false}
                      onChange={(value) => updateField("employeeNo", value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label={t("setup.password")}
                      value={form.password}
                      onChange={(value) => updateField("password", value)}
                      type="password"
                      autoComplete="new-password"
                    />
                    <TextField
                      label={t("setup.confirmPassword")}
                      value={form.confirmPassword}
                      onChange={(value) => updateField("confirmPassword", value)}
                      type="password"
                      autoComplete="new-password"
                    />
                  </div>

                  {error ? (
                    <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <Button disabled={saving} className="mt-2 w-full">
                    {saving ? t("setup.creating") : t("setup.createAdmin")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </form>
      </section>
    </main>
  );
}

function TextField({
  label,
  value,
  type = "text",
  autoComplete,
  required = true,
  onChange,
}: {
  label: string;
  value: string;
  type?: "password" | "text";
  autoComplete?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <Input
        required={required}
        value={value}
        type={type}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 text-base"
      />
    </label>
  );
}
