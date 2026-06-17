"use client";

import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type NumericKeypadProps = {
  allowDecimal?: boolean;
  allowNegative?: boolean;
  className?: string;
  onBackspace: () => void;
  onClear: () => void;
  onKeyPress: (key: string) => void;
};

const digitRows = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export function NumericKeypad({
  allowDecimal = false,
  allowNegative = false,
  className,
  onBackspace,
  onClear,
  onKeyPress,
}: NumericKeypadProps) {
  const { t } = useI18n();
  const showClearOnlyRow = allowDecimal && !allowNegative;
  const showBackspaceOnlyRow = !allowDecimal && allowNegative;
  const showCombinedUtilityRow = allowDecimal && allowNegative;

  return (
    <div className={cn("grid gap-2", className)}>
      {digitRows.map((row, index) => (
        <div key={`numeric-row-${index}`} className="grid grid-cols-3 gap-2">
          {row.map((digit) => (
            <KeyButton
              key={digit}
              label={digit}
              onPress={() => onKeyPress(digit)}
            />
          ))}
        </div>
      ))}

      <div className="grid grid-cols-3 gap-2">
        {allowDecimal ? (
          <KeyButton label="." onPress={() => onKeyPress(".")} />
        ) : (
          <KeyButton label={t("common.clear")} onPress={onClear} small />
        )}
        <KeyButton label="0" onPress={() => onKeyPress("0")} />
        {allowNegative ? (
          <KeyButton label="-" onPress={() => onKeyPress("-")} />
        ) : (
          <DangerKeyButton onPress={onBackspace} />
        )}
      </div>

      {showClearOnlyRow ? (
        <div className="grid grid-cols-1 gap-2">
          <KeyButton label={t("common.clear")} onPress={onClear} small />
        </div>
      ) : null}

      {showBackspaceOnlyRow ? (
        <div className="grid grid-cols-1 gap-2">
          <DangerKeyButton onPress={onBackspace} />
        </div>
      ) : null}

      {showCombinedUtilityRow ? (
        <div className="grid grid-cols-2 gap-2">
          <KeyButton label={t("common.clear")} onPress={onClear} small />
          <DangerKeyButton onPress={onBackspace} />
        </div>
      ) : null}
    </div>
  );
}

function KeyButton({
  label,
  onPress,
  small = false,
}: {
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-12 border-[#9db7d8] bg-white font-semibold text-slate-950 hover:bg-slate-50",
        small ? "text-sm" : "text-lg",
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      {label}
    </Button>
  );
}

function DangerKeyButton({ onPress }: { onPress: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 border-[#dba5a5] bg-[#fff4f4] text-slate-950 hover:bg-[#ffe4e4]"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      <Delete className="h-5 w-5" />
    </Button>
  );
}
