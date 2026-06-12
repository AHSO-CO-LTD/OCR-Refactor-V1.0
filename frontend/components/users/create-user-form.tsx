"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AssignableRole, CreateUserPayload, RoleCode } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type CreateUserFormProps = {
  roles: AssignableRole[];
  rolesLoading: boolean;
  creating: boolean;
  onCreate: (payload: CreateUserPayload) => Promise<void>;
  onCancel?: () => void;
  showHeader?: boolean;
};

type DraftUser = {
  username: string;
  password: string;
  fullName: string;
  department: string;
  employeeNo: string;
  role: RoleCode | "";
  active: boolean;
};

type DraftErrors = Partial<Record<keyof DraftUser, string>>;

const emptyDraft: DraftUser = {
  username: "",
  password: "",
  fullName: "",
  department: "",
  employeeNo: "",
  role: "",
  active: true,
};

function RequiredMark() {
  return <span className="text-red-600" aria-hidden="true">*</span>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-red-600">{message}</p>;
}

export function CreateUserForm({
  roles,
  rolesLoading,
  creating,
  onCreate,
  onCancel,
  showHeader = true,
}: CreateUserFormProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<DraftUser>(emptyDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const firstRole = useMemo(() => roles[0]?.code ?? "", [roles]);
  const selectedRole = draft.role || firstRole;

  function updateDraft<K extends keyof DraftUser>(key: K, value: DraftUser[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const nextErrors: DraftErrors = {};

    if (draft.username.trim().length < 3) {
      nextErrors.username = t("users.validationUsername");
    }

    if (draft.password.length < 6) {
      nextErrors.password = t("users.validationPassword");
    }

    if (!draft.fullName.trim()) {
      nextErrors.fullName = t("users.validationFullName");
    }

    if (!selectedRole) {
      nextErrors.role = t("users.validationRole");
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    await onCreate({
      username: draft.username.trim(),
      password: draft.password,
      fullName: draft.fullName.trim(),
      department: draft.department.trim() || undefined,
      employeeNo: draft.employeeNo.trim() || undefined,
      role: selectedRole as RoleCode,
      active: draft.active,
    });

    setDraft({ ...emptyDraft, role: firstRole, active: true });
    setAdvancedOpen(false);
    onCancel?.();
  }

  return (
    <Card className="border-0 p-5 shadow-none">
      {showHeader ? (
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="font-semibold text-slate-950">
              {t("users.createTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("users.createHint")}
            </p>
          </div>
          <div className="border border-cyan-200 bg-cyan-50 p-2 text-cyan-800">
            <UserPlus className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="flex gap-1 text-sm font-medium" htmlFor="username">
            {t("users.username")}
            <RequiredMark />
          </label>
          <Input
            id="username"
            value={draft.username}
            onChange={(event) => updateDraft("username", event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={creating}
            enterKeyHint="next"
            inputMode="text"
            placeholder="engineer1"
            aria-invalid={Boolean(errors.username)}
          />
          <FieldError message={errors.username} />
        </div>

        <div className="space-y-1.5">
          <label className="flex gap-1 text-sm font-medium" htmlFor="password">
            {t("users.password")}
            <RequiredMark />
          </label>
          <Input
            id="password"
            type="password"
            value={draft.password}
            onChange={(event) => updateDraft("password", event.target.value)}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={creating}
            enterKeyHint="next"
            placeholder="change-me"
            aria-invalid={Boolean(errors.password)}
          />
          <FieldError message={errors.password} />
        </div>

        <div className="space-y-1.5">
          <label className="flex gap-1 text-sm font-medium" htmlFor="fullName">
            {t("users.fullName")}
            <RequiredMark />
          </label>
          <Input
            id="fullName"
            value={draft.fullName}
            onChange={(event) => updateDraft("fullName", event.target.value)}
            autoComplete="name"
            disabled={creating}
            enterKeyHint="next"
            inputMode="text"
            placeholder={t("users.fullNamePlaceholder")}
            aria-invalid={Boolean(errors.fullName)}
          />
          <FieldError message={errors.fullName} />
        </div>

        <div className="space-y-1.5">
          <label className="flex gap-1 text-sm font-medium" htmlFor="role">
            {t("users.role")}
            <RequiredMark />
          </label>
          <Select
            id="role"
            value={selectedRole}
            onChange={(event) =>
              updateDraft("role", event.target.value as RoleCode)
            }
            disabled={creating || rolesLoading || roles.length === 0}
            aria-invalid={Boolean(errors.role)}
          >
            {roles.length === 0 ? (
              <option value="">{t("users.noAssignableRoles")}</option>
            ) : null}
            {roles.map((role) => (
              <option key={role.code} value={role.code}>
                {t(`role.${role.code}`)}
              </option>
            ))}
          </Select>
          <p className="text-xs text-slate-500">
            {t("users.assignableRoleHint")}
          </p>
          <FieldError message={errors.role} />
        </div>

        <div className="border border-slate-200">
          <button
            type="button"
            onClick={() => setAdvancedOpen((current) => !current)}
            className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium hover:bg-slate-50"
            aria-expanded={advancedOpen}
          >
            <span>{t("users.advancedTab")}</span>
            <span className="text-xs text-slate-500">
              {advancedOpen ? t("users.hideAdvanced") : t("users.showAdvanced")}
            </span>
          </button>

          {advancedOpen ? (
            <div className="space-y-4 border-t border-slate-200 p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="department">
                    {t("users.department")}
                  </label>
                  <Input
                    id="department"
                    value={draft.department}
                    onChange={(event) =>
                      updateDraft("department", event.target.value)
                    }
                    disabled={creating}
                    enterKeyHint="next"
                    inputMode="text"
                    placeholder={t("users.departmentPlaceholder")}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="employeeNo">
                    {t("users.employeeNo")}
                  </label>
                  <Input
                    id="employeeNo"
                    value={draft.employeeNo}
                    onChange={(event) =>
                      updateDraft("employeeNo", event.target.value)
                    }
                    autoCapitalize="characters"
                    autoCorrect="off"
                    disabled={creating}
                    enterKeyHint="done"
                    inputMode="text"
                    placeholder="EN001"
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 border border-slate-200 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) =>
                    updateDraft("active", event.target.checked)
                  }
                  disabled={creating}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">{t("users.active")}</span>
                  <span className="text-xs text-slate-500">
                    {t("users.activeHint")}
                  </span>
                </span>
              </label>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={creating}
            >
              {t("common.cancel")}
            </Button>
          ) : null}
          <Button
            type="submit"
            className={onCancel ? "w-full sm:w-auto" : "w-full"}
            disabled={creating || rolesLoading || roles.length === 0}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {creating ? t("users.creating") : t("users.create")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
