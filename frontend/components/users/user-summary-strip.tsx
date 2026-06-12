"use client";

import { Card } from "@/components/ui/card";
import type { UserSummary } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type UserSummaryStripProps = {
  users: UserSummary[];
};

export function UserSummaryStrip({ users }: UserSummaryStripProps) {
  const { t } = useI18n();
  const activeCount = users.filter((user) => user.active).length;
  const inactiveCount = users.length - activeCount;
  const roleCount = new Set(users.map((user) => user.role)).size;

  const items = [
    { label: t("users.totalAccounts"), value: users.length },
    { label: t("users.activeAccounts"), value: activeCount },
    { label: t("users.inactiveAccounts"), value: inactiveCount },
    { label: t("users.visibleRoles"), value: roleCount },
  ];

  return (
    <div className="grid w-full min-w-0 grid-cols-4 gap-2">
      {items.map((item) => (
        <Card key={item.label} className="px-3 py-2 shadow-none">
          <div className="truncate text-xs font-medium text-slate-500">
            {item.label}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <div className="text-xl font-semibold leading-none text-slate-950">
              {item.value}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
