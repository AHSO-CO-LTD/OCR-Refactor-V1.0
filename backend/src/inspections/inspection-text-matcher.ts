import { InspectionResult } from '@prisma/client';

type InspectionSlotEvaluationInput = {
  rawText?: string | null;
  rows?: string[] | null;
  errorMessage?: string | null;
  expectedText: string;
  acceptedVariants?: string[] | null;
};

type AcceptedInspectionText = {
  candidate: string;
  displayText: string;
};

export function matchesExpectedInspectionText(
  rawText: string,
  expectedText: string,
  acceptedVariants: string[] = [],
) {
  return Boolean(
    findMatchedInspectionText(rawText, expectedText, acceptedVariants),
  );
}

function findMatchedInspectionText(
  rawText: string,
  expectedText: string,
  acceptedVariants: string[] = [],
) {
  const text = rawText.trim().toUpperCase();
  const acceptedTexts = buildAcceptedInspectionTextCandidates(
    expectedText,
    acceptedVariants,
  );

  return acceptedTexts.find(({ candidate }) => text.includes(candidate));
}

export function buildAcceptedInspectionTexts(
  expectedText: string,
  acceptedVariants: string[] = [],
) {
  return buildAcceptedInspectionTextCandidates(
    expectedText,
    acceptedVariants,
  ).map(({ candidate }) => candidate);
}

function buildAcceptedInspectionTextCandidates(
  expectedText: string,
  acceptedVariants: string[] = [],
) {
  const configuredTexts = [expectedText, ...acceptedVariants]
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  const candidates = configuredTexts.flatMap((value) =>
    buildLegacyAcceptedTexts(value).map((candidate) => ({
      candidate,
      displayText: value,
    })),
  );
  const uniqueCandidates = new Map<string, AcceptedInspectionText>();

  for (const candidate of candidates) {
    if (!uniqueCandidates.has(candidate.candidate)) {
      uniqueCandidates.set(candidate.candidate, candidate);
    }
  }

  return [...uniqueCandidates.values()].sort(
    (left, right) => right.candidate.length - left.candidate.length,
  );
}

function buildLegacyAcceptedTexts(value: string) {
  const accepted = [value, value.split('').reverse().join('')];

  if (!value.includes('-')) {
    return accepted;
  }

  const parts = value.split('-');
  if (parts.length !== 2) {
    return accepted;
  }

  const [left, right] = parts;
  const reversedLeft = left.split('').reverse().join('');
  const reversedRight = right.split('').reverse().join('');

  return [
    ...accepted,
    `${reversedRight}-${reversedLeft}`,
    `${reversedRight}${reversedLeft[0]}-${reversedLeft.slice(1)}`,
    `${reversedRight.slice(0, -1)}-${reversedRight.slice(-1)}${reversedLeft}`,
  ];
}

export function evaluateInspectionSlot({
  rawText,
  rows,
  errorMessage,
  expectedText,
  acceptedVariants,
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
  const matchedCandidate = textsToEvaluate
    .map((text) =>
      findMatchedInspectionText(text, expectedText, acceptedVariants ?? []),
    )
    .find(Boolean);
  const matched = Boolean(matchedCandidate);

  let result: InspectionResult = InspectionResult.UNKNOWN;
  if (matched) {
    result = InspectionResult.OK;
  } else if (textsToEvaluate.length > 0 || errorMessage) {
    result = InspectionResult.NG;
  }

  return {
    rawText: normalizedText || null,
    matchedText: matchedCandidate?.displayText ?? null,
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
  acceptedVariants: string[] = [],
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
      acceptedVariants,
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
