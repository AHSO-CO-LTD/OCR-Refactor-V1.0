import type { InspectionSlotState } from "@/lib/api";

export function getInspectionSlotDisplayText(
  slot: InspectionSlotState | undefined,
  productCode: string,
  fallback = "",
  options: { showNgRecognizedText?: boolean } = {},
) {
  if (!slot) return fallback;

  if (slot.result === "OK") {
    return (
      slot.matchedText?.trim() ||
      slot.rawText?.trim() ||
      productCode.trim() ||
      slot.expectedText?.trim() ||
      fallback ||
      "OK"
    );
  }

  if (slot.result === "NG" && options.showNgRecognizedText === false) {
    return "NG";
  }

  return slot.rawText?.trim() || slot.result || fallback;
}
