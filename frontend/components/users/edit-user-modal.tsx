"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { UserVirtualKeyboardButton } from "@/components/users/user-virtual-keyboard-button";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  AssignableRole,
  RoleCode,
  UpdateUserPayload,
  UserSummary,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type EditUserModalProps = {
  user: UserSummary;
  roles: AssignableRole[];
  saving: boolean;
  onClose: () => void;
  onSave: (userId: string, payload: UpdateUserPayload) => Promise<void>;
};

type EditDraft = {
  fullName: string;
  department: string;
  employeeNo: string;
  role: RoleCode;
  active: boolean;
};

export function EditUserModal({
  user,
  roles,
  saving,
  onClose,
  onSave,
}: EditUserModalProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<EditDraft>({
    fullName: user.fullName,
    department: user.department ?? "",
    employeeNo: user.employeeNo ?? "",
    role: user.role,
    active: user.active,
  });
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  function updateDraft<K extends keyof EditDraft>(key: K, value: EditDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function validate() {
    if (!draft.fullName.trim()) {
      return t("users.validationFullName");
    }

    if (!draft.role) {
      return t("users.validationRole");
    }

    return "";
  }

  function requestSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      toast.warning(validationError);
      return;
    }

    setConfirmOpen(true);
  }

  async function confirmSave() {
    await onSave(user.id, {
      fullName: draft.fullName.trim(),
      department: draft.department.trim() || undefined,
      employeeNo: draft.employeeNo.trim() || undefined,
      role: draft.role,
      active: draft.active,
    });
    setConfirmOpen(false);
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-6"
        role="presentation"
        onMouseDown={() => {
          if (!saving && !confirmOpen) {
            onClose();
          }
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
          className="max-h-[calc(100dvh-3rem)] w-full max-w-xl overflow-y-auto border border-slate-200 bg-white shadow-xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="edit-user-title" className="font-semibold text-slate-950">
                  {t("users.editTitle")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {user.username} / {t(`role.${user.role}`)}
                </p>
              </div>
              <UserVirtualKeyboardButton />
            </div>
          </div>

          <form onSubmit={requestSave} className="space-y-4 p-5">
            {error ? (
              <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {error}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="editFullName">
                {t("users.fullName")}
              </label>
              <Input
                id="editFullName"
                value={draft.fullName}
                onChange={(event) =>
                  updateDraft("fullName", event.target.value)
                }
                disabled={saving}
                enterKeyHint="next"
                inputMode="text"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="editDepartment">
                  {t("users.department")}
                </label>
                <Input
                  id="editDepartment"
                  value={draft.department}
                  onChange={(event) =>
                    updateDraft("department", event.target.value)
                  }
                  disabled={saving}
                  enterKeyHint="next"
                  inputMode="text"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="editEmployeeNo">
                  {t("users.employeeNo")}
                </label>
                <Input
                  id="editEmployeeNo"
                  value={draft.employeeNo}
                  onChange={(event) =>
                    updateDraft("employeeNo", event.target.value)
                  }
                  autoCapitalize="characters"
                  autoCorrect="off"
                  disabled={saving}
                  enterKeyHint="done"
                  inputMode="text"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="editRole">
                {t("users.role")}
              </label>
              <Select
                id="editRole"
                value={draft.role}
                onChange={(event) =>
                  updateDraft("role", event.target.value as RoleCode)
                }
                disabled={saving || roles.length === 0}
              >
                {roles.map((role) => (
                  <option key={role.code} value={role.code}>
                    {t(`role.${role.code}`)}
                  </option>
                ))}
              </Select>
            </div>

            <label className="flex items-start gap-3 border border-slate-200 px-3 py-3 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) =>
                  updateDraft("active", event.target.checked)
                }
                disabled={saving}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">{t("users.active")}</span>
                <span className="text-xs text-slate-500">
                  {t("users.activeHint")}
                </span>
              </span>
            </label>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {saving ? t("users.saving") : t("users.saveChanges")}
              </Button>
            </div>
          </form>
        </section>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={t("users.confirmUpdateTitle")}
        description={t("users.confirmUpdateDescription")}
        confirmLabel={saving ? t("users.saving") : t("users.confirmUpdate")}
        cancelLabel={t("common.cancel")}
        loading={saving}
        onConfirm={confirmSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
