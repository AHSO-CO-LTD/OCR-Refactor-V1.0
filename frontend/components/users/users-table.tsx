"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserSummary } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type UsersTableProps = {
  loading: boolean;
  users: UserSummary[];
  busyUserId?: string;
  onEdit: (user: UserSummary) => void;
  onDelete: (user: UserSummary) => void;
  onToggleStatus: (user: UserSummary, nextActive: boolean) => void;
};

function formatLastLogin(value: string | null, locale: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function UserTableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <tr key={index}>
          {Array.from({ length: 8 }).map((__, cellIndex) => (
            <td key={cellIndex} className="border-b border-slate-100 px-4 py-4">
              <div className="h-4 w-full max-w-32 animate-pulse bg-slate-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function UsersTable({
  loading,
  users,
  busyUserId,
  onEdit,
  onDelete,
  onToggleStatus,
}: UsersTableProps) {
  const { language, t } = useI18n();

  return (
    <Card className="min-w-0 overflow-hidden shadow-none">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-950">{t("users.listTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("users.listHint")}</p>
      </div>

      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-4 py-3">
                {t("users.username")}
              </th>
              <th className="border-b border-slate-200 px-4 py-3">
                {t("users.fullName")}
              </th>
              <th className="border-b border-slate-200 px-4 py-3">
                {t("users.employeeNo")}
              </th>
              <th className="border-b border-slate-200 px-4 py-3">
                {t("users.department")}
              </th>
              <th className="border-b border-slate-200 px-4 py-3">
                {t("users.role")}
              </th>
              <th className="border-b border-slate-200 px-4 py-3">
                {t("users.status")}
              </th>
              <th className="border-b border-slate-200 px-4 py-3">
                {t("users.lastLogin")}
              </th>
              <th className="border-b border-slate-200 px-4 py-3 text-right">
                {t("users.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? <UserTableSkeleton /> : null}

            {!loading && users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <div className="mx-auto max-w-sm">
                    <div className="text-base font-semibold text-slate-950">
                      {t("users.emptyTitle")}
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {t("users.emptyDescription")}
                    </p>
                  </div>
                </td>
              </tr>
            ) : null}

            {!loading
              ? users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="max-w-40 break-words border-b border-slate-100 px-4 py-3 font-medium text-slate-950">
                      {user.username}
                    </td>
                    <td className="max-w-48 break-words border-b border-slate-100 px-4 py-3">
                      {user.fullName}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                      {user.employeeNo ?? "-"}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                      {user.department ?? "-"}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      {t(`role.${user.role}`)}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      <select
                        value={user.active ? "active" : "inactive"}
                        onChange={(event) =>
                          onToggleStatus(user, event.target.value === "active")
                        }
                        disabled={busyUserId === user.id}
                        title={t("users.quickToggleStatus")}
                        className={[
                          "h-9 min-w-28 border px-2 text-sm font-medium outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60",
                          user.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-300 bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        <option value="active">{t("users.active")}</option>
                        <option value="inactive">{t("users.inactive")}</option>
                      </select>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                      {formatLastLogin(user.lastLoginAt, language)}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onEdit(user)}
                          disabled={busyUserId === user.id}
                          aria-label={`${t("users.edit")} ${user.username}`}
                          title={`${t("users.edit")} ${user.username}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden min-[1200px]:inline">
                            {t("users.edit")}
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onDelete(user)}
                          disabled={busyUserId === user.id}
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          aria-label={`${t("users.delete")} ${user.username}`}
                          title={`${t("users.delete")} ${user.username}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden min-[1200px]:inline">
                            {t("users.delete")}
                          </span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
