import { InspectionResult } from '@prisma/client';

type InspectionSlotEvaluationInput = {
  rawText?: string | null;
  rows?: string[] | null;
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
    const pattern = new RegExp(`(^|-)${escaped}($|-)`);
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
  rows,
  errorMessage,
  expectedText,
}: InspectionSlotEvaluationInput) {
  const normalizedText = rawText?.trim() ?? '';
  const normalizedRows = rows
    ?.map((row) => row.trim())
    .filter((row) => row.length > 0);
  const textsToEvaluate =
    normalizedRows && normalizedRows.length > 0
      ? normalizedRows
      : normalizedText
        ? [normalizedText]
        : [];
  const matched = textsToEvaluate.some((text) =>
    matchesExpectedInspectionText(text, expectedText),
  );

  let result: InspectionResult = InspectionResult.UNKNOWN;
  if (matched) {
    result = InspectionResult.OK;
  } else if (textsToEvaluate.length > 0 || errorMessage) {
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
  results: {
    rows?: string[] | null;
    text?: string | null;
    error?: string | null;
  }[],
  expectedText: string,
) {
  if (results.length === 0) {
    return InspectionResult.UNKNOWN;
  }

  const evaluatedResults = results.map((result) =>
    evaluateInspectionSlot({
      rawText: result.text,
      rows: result.rows,
      errorMessage: result.error,
      expectedText,
    }),
  );

  return resolveInspectionAggregateResult(
    evaluatedResults.map((result) => result.result),
  );
}

export function resolveInspectionAggregateResult(results: InspectionResult[]) {
  const knownResults = results.filter(
    (result) =>
      result === InspectionResult.OK || result === InspectionResult.NG,
  );

  if (knownResults.length === 0) {
    return InspectionResult.UNKNOWN;
  }

  if (knownResults.some((result) => result === InspectionResult.NG)) {
    return InspectionResult.NG;
  }

  return InspectionResult.OK;
}
