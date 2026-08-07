import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SettingsSectionTab = {
  id: string;
  label: string;
  icon?: LucideIcon;
};

export function SettingsSectionTabs({
  activeId,
  items,
  onSelect,
}: {
  activeId: string;
  items: SettingsSectionTab[];
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      role="tablist"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;

        return (
          <Button
            key={item.id}
            type="button"
            variant="outline"
            aria-selected={active}
            role="tab"
            className={[
              "h-10",
              active
                ? "border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-800"
                : "border-slate-300 bg-white text-slate-800",
            ].join(" ")}
            onClick={() => onSelect(item.id)}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
