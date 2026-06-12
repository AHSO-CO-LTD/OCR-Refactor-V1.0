import * as React from "react";
import { cn } from "@/lib/utils";

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };

