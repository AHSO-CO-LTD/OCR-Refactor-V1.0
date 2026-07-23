import { Check, Circle, LoaderCircle, TriangleAlert } from "lucide-react";
import type {
  DesktopShutdownStageId,
  DesktopShutdownStageStatus,
} from "@/lib/desktop";
import { cn } from "@/lib/utils";

export type ShutdownChecklistItem = {
  error?: string;
  id: DesktopShutdownStageId;
  label: string;
  status: DesktopShutdownStageStatus;
};

export function ShutdownChecklist({
  items,
  className,
}: {
  items: ShutdownChecklistItem[];
  className?: string;
}) {
  return (
    <ol className={cn("grid gap-2", className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "grid min-h-12 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border px-3 py-2 text-sm",
            item.status === "done" &&
              "border-emerald-200 bg-emerald-50 text-emerald-900",
            item.status === "failed" && "border-red-200 bg-red-50 text-red-900",
            item.status === "running" &&
              "border-cyan-300 bg-cyan-50 text-cyan-950",
            item.status === "pending" &&
              "border-slate-200 bg-white text-slate-600",
            item.status === "skipped" &&
              "border-slate-200 bg-slate-50 text-slate-500",
          )}
          aria-current={item.status === "running" ? "step" : undefined}
        >
          <span className="grid h-8 w-8 place-items-center border border-current/25 bg-white/70">
            <ShutdownStageIcon status={item.status} />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{item.label}</span>
            {item.error ? (
              <span className="mt-0.5 block break-words text-xs text-red-700">
                {item.error}
              </span>
            ) : null}
          </span>
          <span className="h-2 w-2 bg-current opacity-60" aria-hidden="true" />
        </li>
      ))}
    </ol>
  );
}

function ShutdownStageIcon({ status }: { status: DesktopShutdownStageStatus }) {
  if (status === "done") {
    return <Check className="h-4 w-4" aria-hidden="true" />;
  }

  if (status === "failed") {
    return <TriangleAlert className="h-4 w-4" aria-hidden="true" />;
  }

  if (status === "running") {
    return <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />;
  }

  if (status === "skipped") {
    return <span className="text-xs" aria-hidden="true">—</span>;
  }

  return <Circle className="h-3.5 w-3.5" aria-hidden="true" />;
}
