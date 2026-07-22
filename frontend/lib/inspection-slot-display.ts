import type { InspectionSlotState } from "@/lib/api";

export function getInspectionSlotDisplayText(
  slot: InspectionSlotState | undefined,
  productCode: string,
  fallback = "",
) {
  if (!slot) return fallback;

  if (slot.result === "OK") {
    return productCode.trim() || slot.expectedText?.trim() || fallback || "OK";
  }

  return slot.rawText?.trim() || slot.result || fallback;
}
