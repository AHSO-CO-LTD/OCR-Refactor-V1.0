"use client";

import { CreateUserForm } from "@/components/users/create-user-form";
import { UserVirtualKeyboardButton } from "@/components/users/user-virtual-keyboard-button";
import type { AssignableRole, CreateUserPayload } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type CreateUserModalProps = {
  roles: AssignableRole[];
  rolesLoading: boolean;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: CreateUserPayload) => Promise<void>;
};

export function CreateUserModal({
  roles,
  rolesLoading,
  creating,
  onClose,
  onCreate,
}: CreateUserModalProps) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-6"
      role="presentation"
      onMouseDown={() => {
        if (!creating) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-modal-title"
        className="max-h-[calc(100dvh-3rem)] w-full max-w-2xl overflow-y-auto border border-slate-200 bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="create-user-modal-title" className="font-semibold">
                {t("users.createTitle")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("users.createHint")}
              </p>
            </div>
            <UserVirtualKeyboardButton />
          </div>
        </div>
        <CreateUserForm
          roles={roles}
          rolesLoading={rolesLoading}
          creating={creating}
          onCreate={onCreate}
          onCancel={onClose}
          showHeader={false}
        />
      </section>
    </div>
  );
}
