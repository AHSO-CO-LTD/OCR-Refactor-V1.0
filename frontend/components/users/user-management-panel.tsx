"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { CreateUserModal } from "@/components/users/create-user-modal";
import { EditUserModal } from "@/components/users/edit-user-modal";
import { UserSummaryStrip } from "@/components/users/user-summary-strip";
import { UsersTable } from "@/components/users/users-table";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type {
  AssignableRole,
  CreateUserPayload,
  UpdateUserPayload,
  UserSummary,
} from "@/lib/api";
import {
  ApiError,
  createUser,
  deleteUser,
  listAssignableRoles,
  listUsers,
  updateUser,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

export function              UserManagementPanel() {
  const { apiError, t } = useI18n();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false); 
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserSummary | null>(null);
  const [statusChange, setStatusChange] = useState<{
    user: UserSummary;
    nextActive: boolean;
  } | null>(null);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState("");

  const loadUsers = useCallback(
    async (showToast = false) => {
      const token = getAccessToken();

      if (!token) {
        return;
      }

      try {
        const response = await listUsers(token);
        setUsers(response.data);
        setError("");

        if (showToast) {
          toast.success(t("users.refreshSuccess"));
        }
      } catch (cause) {
        const message =
          cause instanceof ApiError
            ? apiError(cause.message, "users.loadError")
            : t("users.loadError");
        setError(message);

        if (showToast) {
          toast.error(message);
        }
      }
    },
    [apiError, t],
  );

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      return;
    }

    Promise.all([listUsers(token), listAssignableRoles(token)])
      .then(([usersResponse, rolesResponse]) => {
        setUsers(usersResponse.data);
        setRoles(rolesResponse.data);
        setError("");
      })
      .catch((cause) => {
        setError(
          cause instanceof ApiError
            ? apiError(cause.message, "users.loadError")
            : t("users.loadError"),
        );
      })
      .finally(() => {
        setLoading(false);
        setRolesLoading(false);
      });
  }, [apiError, t]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadUsers(true);
    setRefreshing(false);
  }

  async function handleCreate(payload: CreateUserPayload) {
    const token = getAccessToken();

    if (!token) {
      toast.error(t("users.missingSession"));
      return;
    }

    setCreating(true);
    const toastId = toast.loading(t("users.creating"));

    try {
      await createUser(token, payload);
      await loadUsers(false);
      toast.success(t("users.createSuccess"), { id: toastId });
      setCreateOpen(false);
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "users.createError")
          : t("users.createError");
      toast.error(message, { id: toastId });
      throw cause;
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(userId: string, payload: UpdateUserPayload) {
    const token = getAccessToken();

    if (!token) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("users.saving"));

    try {
      await updateUser(token, userId, payload);
      await loadUsers(false);
      toast.success(t("users.updateSuccess"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "users.updateError")
          : t("users.updateError");
      toast.error(message, { id: toastId });
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const token = getAccessToken();

    if (!token || !deletingUser) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("users.deleting"));

    try {
      await deleteUser(token, deletingUser.id);
      await loadUsers(false);
      toast.success(t("users.deleteSuccess"), { id: toastId });
      setDeletingUser(null);
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "users.deleteError")
          : t("users.deleteError");
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!statusChange) {
      return;
    }

    await handleUpdate(statusChange.user.id, {
      fullName: statusChange.user.fullName,
      department: statusChange.user.department ?? undefined,
      employeeNo: statusChange.user.employeeNo ?? undefined,
      role: statusChange.user.role,
      active: statusChange.nextActive,
    });
    setStatusChange(null);
  }

  function requestStatusChange(user: UserSummary, nextActive: boolean) {
    if (user.active === nextActive) {
      return;
    }

    setStatusChange({ user, nextActive });
  }

  return (
    <div className="min-w-0 space-y-4">
      <section className="min-w-0 border border-slate-200 bg-white p-3">
        <UserSummaryStrip users={users} />
      </section>

      <section className="flex min-w-0 flex-col gap-3 border border-slate-200 bg-white p-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-950">
            {t("users.managementTitle")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {t("users.managementHint")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            <RefreshCw
              className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              aria-hidden="true"
            />
            {refreshing ? t("users.refreshing") : t("users.refresh")}
          </Button>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={rolesLoading}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t("users.create")}
          </Button>
        </div>
      </section>

      {error ? (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <UsersTable
        loading={loading}
        users={users}
        busyUserId={
          saving
            ? editingUser?.id ?? deletingUser?.id ?? statusChange?.user.id
            : undefined
        }
        onEdit={setEditingUser}
        onDelete={setDeletingUser}
        onToggleStatus={requestStatusChange}
      />

      {createOpen ? (
        <CreateUserModal
          roles={roles}
          rolesLoading={rolesLoading}
          creating={creating}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      ) : null}

      {editingUser ? (
        <EditUserModal
          key={editingUser.id}
          user={editingUser}
          roles={roles}
          saving={saving}
          onClose={() => setEditingUser(null)}
          onSave={handleUpdate}
        />
      ) : null}

      <ConfirmModal
        open={deletingUser !== null}
        title={t("users.confirmDeleteTitle")}
        description={
          deletingUser
            ? `${t("users.confirmDeleteDescription")} ${deletingUser.username}`
            : t("users.confirmDeleteDescription")
        }
        confirmLabel={saving ? t("users.deleting") : t("users.confirmDelete")}
        cancelLabel={t("common.cancel")}
        loading={saving}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingUser(null)}
      />

      <ConfirmModal
        open={statusChange !== null}
        title={t("users.confirmStatusTitle")}
        description={
          statusChange
            ? `${t("users.confirmStatusDescription")} ${statusChange.user.username}`
            : t("users.confirmStatusDescription")
        }
        confirmLabel={saving ? t("users.saving") : t("users.confirmStatus")}
        cancelLabel={t("common.cancel")}
        loading={saving}
        onConfirm={handleToggleStatus}
        onCancel={() => setStatusChange(null)}
      />
    </div>
  );
}
