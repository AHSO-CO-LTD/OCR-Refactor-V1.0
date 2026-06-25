import { InspectionResult } from '@prisma/client';

type InspectionSlotEvaluationInput = {
  rawText?: string | null;
  errorMessage?: string | null;
  expectedText: string;
};

export function matchesExpectedInspectionText(
  rawText: string,
  expectedText: string,
) {
  const text = rawText.trim().toUpperCase();
  const acceptedTexts = buildAcceptedInspectionTexts(expectedText);

  return acceptedTexts.some((candidate) => {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[-_])${escaped}($|[-_])`);
    return pattern.test(text);
  });
}

export function buildAcceptedInspectionTexts(expectedText: string) {
  const normalized = expectedText.trim().toUpperCase();
  const values = new Set<string>([
    normalized,
    normalized.split('').reverse().join(''),
  ]);

  if (normalized.includes('-')) {
    const parts = normalized.split('-');
    if (parts.length === 2) {
      const [left, right] = parts;
      const reversedLeft = left.split('').reverse().join('');
      const reversedRight = right.split('').reverse().join('');

      values.add(`${reversedRight}-${reversedLeft}`);
      values.add(`${reversedRight}${reversedLeft[0]}-${reversedLeft.slice(1)}`);
      values.add(
        `${reversedRight.slice(0, -1)}-${reversedRight.slice(-1)}${reversedLeft}`,
      );
    }
  }

  return [...values];
}

export function evaluateInspectionSlot({
  rawText,
  errorMessage,
  expectedText,
}: InspectionSlotEvaluationInput) {
  const normalizedText = rawText?.trim() ?? '';
  const matched = normalizedText
    ? matchesExpectedInspectionText(normalizedText, expectedText)
    : false;

  let result: InspectionResult = InspectionResult.UNKNOWN;
  if (matched) {
    result = InspectionResult.OK;
  } else if (normalizedText || errorMessage) {
    result = InspectionResult.NG;
  }

  return {
    rawText: normalizedText || null,
    errorMessage: errorMessage ?? null,
    matched,
    result,
  };
}

export function resolveInspectionResults(
  results: { text?: string | null; error?: string | null }[],
  expectedText: string,
) {
  if (results.length === 0) {
    return InspectionResult.UNKNOWN;
  }

  const evaluatedResults = results.map((result) =>
    evaluateInspectionSlot({
      rawText: result.text,
      errorMessage: result.error,
      expectedText,
    }),
  );

  if (
    evaluatedResults.every((result) => result.result === InspectionResult.OK)
  ) {
    return InspectionResult.OK;
  }

  if (
    evaluatedResults.some((result) => result.result === InspectionResult.NG)
  ) {
    return InspectionResult.NG;
  }

  return InspectionResult.UNKNOWN;
}
