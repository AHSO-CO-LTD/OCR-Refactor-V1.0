"use client";

type OperatorTestRuntimeStatusProps = {
  active?: boolean;
  label: string;
  value: string;
};

export function OperatorTestRuntimeStatus({
  active = false,
  label,
  value,
}: OperatorTestRuntimeStatusProps) {
  return (
    <div
      className={[
        "operator-preview-runtime-status shrink-0 whitespace-nowrap border px-3 py-1.5 text-left text-sm leading-5 text-white",
        active
          ? "border-emerald-500 bg-emerald-700/95"
          : "border-white/20 bg-black/80",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className={active ? "font-medium text-emerald-100" : "font-medium text-white/60"}>
        {label}:{" "}
      </span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
