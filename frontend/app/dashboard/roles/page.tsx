"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Permission, RoleCode, RoleWithPermissions } from "@/lib/api";
import {
  ApiError,
  listPermissions,
  listRoles,
  updateRolePermissions,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken, getStoredUser } from "@/lib/session";

const PROTECTED_ROLE_CODES: RoleCode[] = ["dev", "admin"];

function getManageableRoles(
  roles: RoleWithPermissions[],
  currentRole?: RoleCode,
) {
  if (currentRole === "dev") {
    return roles;
  }

  return roles.filter((role) => !PROTECTED_ROLE_CODES.includes(role.code));
}

export default function RolesPage() {
  const { apiError, t } = useI18n();
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleCode | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      return;
    }

    const currentUser = getStoredUser();

    Promise.all([listRoles(token), listPermissions(token)])
      .then(([rolesResponse, permissionsResponse]) => {
        const manageableRoles = getManageableRoles(
          rolesResponse.data,
          currentUser?.role,
        );

        setRoles(manageableRoles);
        setPermissions(permissionsResponse.data);
        const firstRole = manageableRoles[0] ?? null;
        setSelectedRole(firstRole?.code ?? null);
        setDraftPermissions(firstRole?.permissions ?? []);
      })
      .catch((cause) => {
        setError(
          cause instanceof ApiError
            ? apiError(cause.message, "roles.loadError")
            : t("roles.loadError"),
        );
      })
      .finally(() => setLoading(false));
  }, [apiError, t]);

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>(
      (groups, permission) => {
        groups[permission.group] = groups[permission.group] ?? [];
        groups[permission.group].push(permission);
        return groups;
      },
      {},
    );
  }, [permissions]);

  const selectedRoleData = roles.find((role) => role.code === selectedRole);
  const isDevRole = selectedRoleData?.code === "dev";

  function handleSelectRole(role: RoleWithPermissions) {
    const currentUser = getStoredUser();
    const manageableRole = getManageableRoles([role], currentUser?.role)[0];

    if (!manageableRole) {
      const errorMessage = apiError(
        "Only dev can manage protected roles",
        "roles.updateError",
      );
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setSelectedRole(role.code);
    setDraftPermissions(role.permissions);
    setMessage("");
    setError("");
  }

  function togglePermission(permissionKey: string) {
    setDraftPermissions((current) =>
      current.includes(permissionKey)
        ? current.filter((item) => item !== permissionKey)
        : [...current, permissionKey],
    );
  }

  async function handleSave() {
    const token = getAccessToken();

    if (!token || !selectedRole) {
      return;
    }

    const currentUser = getStoredUser();

    if (
      currentUser?.role !== "dev" &&
      PROTECTED_ROLE_CODES.includes(selectedRole)
    ) {
      const errorMessage = apiError(
        "Only dev can manage protected roles",
        "roles.updateError",
      );
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await updateRolePermissions(
        token,
        selectedRole,
        draftPermissions,
      );
      const manageableRoles = getManageableRoles(
        response.data,
        currentUser?.role,
      );
      setRoles(manageableRoles);
      if (!manageableRoles.some((role) => role.code === selectedRole)) {
        const firstRole = manageableRoles[0] ?? null;
        setSelectedRole(firstRole?.code ?? null);
        setDraftPermissions(firstRole?.permissions ?? []);
      }
      setMessage(t("roles.saved"));
      toast.success(t("roles.saved"));
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? apiError(cause.message, "roles.updateError")
          : t("roles.updateError"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      titleKey="roles.title"
      descriptionKey="roles.description"
    >
      <div className="grid min-w-0 gap-5 min-[1200px]:grid-cols-[240px_minmax(0,1fr)] min-[1400px]:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-slate-500">
            {t("roles.roles")}
          </div>
          <div className="space-y-2">
            {roles.map((role) => (
              <button
                key={role.code}
                onClick={() => handleSelectRole(role)}
                className={[
                  "flex w-full min-w-0 items-center justify-between gap-3 border px-3 py-3 text-left transition",
                  selectedRole === role.code
                    ? "border-cyan-300 bg-cyan-50"
                    : "border-slate-200 hover:border-slate-300",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {t(`role.${role.code}`)}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {role.code}
                  </span>
                </span>
                <Badge>
                  {role.permissions.length}
                </Badge>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          {loading ? (
            <div className="text-sm text-slate-500">{t("roles.loading")}</div>
          ) : null}

          {!loading && selectedRoleData ? (
            <>
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {t(`role.${selectedRoleData.code}`)}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isDevRole
                      ? t("roles.devHidden")
                      : t("roles.normalHint")}
                  </p>
                </div>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? t("roles.saving") : t("roles.save")}
                </Button>
              </div>

              {message ? (
                <div className="mt-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {message}
                </div>
              ) : null}
              {error ? (
                <div className="mt-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-5 grid min-w-0 gap-5 min-[1280px]:grid-cols-2">
                {Object.entries(groupedPermissions).map(
                  ([group, groupPermissions]) => (
                    <div key={group} className="min-w-0 border border-slate-200 p-4">
                      <div className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {t(`permission.group.${group}`)}
                      </div>
                      <div className="space-y-2">
                        {groupPermissions.map((permission) => {
                          const checked = draftPermissions.includes(
                            permission.key,
                          );

                          return (
                            <label
                              key={permission.key}
                              className="flex min-w-0 cursor-pointer items-start gap-3 border border-slate-100 px-3 py-2 hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  togglePermission(permission.key)
                                }
                                className="mt-1"
                              />
                              <span className="min-w-0">
                                <span className="block break-words text-sm font-medium">
                                  {t(`permission.${permission.key}`)}
                                </span>
                                <span className="break-all text-xs text-slate-500">
                                  {permission.key}
                                  {permission.devOnly
                                    ? ` / ${t("roles.devOnly")}`
                                    : ""}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </>
          ) : null}

          {!loading && !selectedRoleData ? (
            <div className="text-sm text-slate-500">
              {t("roles.noManageableRoles")}
            </div>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}
