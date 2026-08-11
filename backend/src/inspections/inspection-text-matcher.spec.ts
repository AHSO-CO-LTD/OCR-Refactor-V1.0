import { InspectionResult } from '@prisma/client';
import {
  buildAcceptedInspectionTexts,
  evaluateInspectionSlot,
  matchesExpectedInspectionText,
  resolveInspectionAggregateResult,
  resolveInspectionResults,
} from './inspection-text-matcher';

describe('inspection-text-matcher', () => {
  it('matches the forward product code', () => {
    expect(matchesExpectedInspectionText('IS35R', 'IS35R')).toBe(true);
  });

  it('matches a product code anywhere in OCR text without requiring dash boundaries', () => {
    expect(matchesExpectedInspectionText('PREFIXIS-35RSUFFIX', 'IS-35R')).toBe(
      true,
    );
  });

  it('applies legacy reverse variants to configured OCR variants too', () => {
    const acceptedTexts = buildAcceptedInspectionTexts('AB-12', ['AB-1-2']);

    expect(acceptedTexts).toEqual(
      expect.arrayContaining(['AB-12', '21-BA', '21B-A', '2-1BA', 'AB-1-2']),
    );
    expect(
      matchesExpectedInspectionText('OCR: IS-35-R', 'IS-35R', ['IS-35-R']),
    ).toBe(true);
    expect(
      matchesExpectedInspectionText('OCR: R-53-SI', 'IS-35R', ['IS-35-R']),
    ).toBe(true);
  });

  it('keeps accepting legacy reverse forms', () => {
    expect(matchesExpectedInspectionText('R53-SI', 'IS-35R')).toBe(true);
    expect(
      evaluateInspectionSlot({
        rawText: 'R53-SI',
        expectedText: 'IS-35R',
      }),
    ).toMatchObject({
      matchedText: 'IS-35R',
      result: InspectionResult.OK,
    });
  });

  it('returns the configured variant in its canonical order when a reversed variant matches', () => {
    expect(
      evaluateInspectionSlot({
        rawText: 'R-53-SI',
        expectedText: 'IS-35R',
        acceptedVariants: ['IS-35-R'],
      }),
    ).toMatchObject({
      matchedText: 'IS-35-R',
      result: InspectionResult.OK,
    });
  });

  it('returns UNKNOWN when OCR text and error are both empty', () => {
    expect(
      evaluateInspectionSlot({
        rawText: '   ',
        errorMessage: null,
        expectedText: 'IS35R',
      }),
    ).toMatchObject({
      rawText: null,
      errorMessage: null,
      matched: false,
      result: InspectionResult.UNKNOWN,
    });
  });

  it('returns NG when OCR text exists but does not match', () => {
    expect(
      evaluateInspectionSlot({
        rawText: 'WRONG',
        errorMessage: null,
        expectedText: 'IS35R',
      }),
    ).toMatchObject({
      rawText: 'WRONG',
      matched: false,
      result: InspectionResult.NG,
    });
  });

  it('matches a slot when any OCR row satisfies the expected-code rule', () => {
    expect(
      evaluateInspectionSlot({
        rows: ['WRONG', 'A_IS-35R_B'],
        rawText: 'WRONG A_IS-35R_B',
        errorMessage: null,
        expectedText: 'IS-35R',
      }),
    ).toMatchObject({
      rawText: 'WRONG A_IS-35R_B',
      matched: true,
      result: InspectionResult.OK,
    });

    expect(
      evaluateInspectionSlot({
        rows: ['WRONG', 'NOT_MATCHED'],
        rawText: 'WRONG NOT_MATCHED',
        errorMessage: null,
        expectedText: 'IS-35R',
      }),
    ).toMatchObject({
      matched: false,
      result: InspectionResult.NG,
    });
  });

  it('resolves aggregate result consistently across slots', () => {
    expect(
      resolveInspectionResults(
        [{ rows: ['IS35R'] }, { rows: ['prefixIS35Rsuffix'] }],
        'IS35R',
      ),
    ).toBe(InspectionResult.OK);

    expect(
      resolveInspectionResults([{ text: 'WRONG' }, { text: null }], 'IS35R'),
    ).toBe(InspectionResult.NG);

    expect(
      resolveInspectionResults([{ text: null }, { error: null }], 'IS35R'),
    ).toBe(InspectionResult.UNKNOWN);
  });

  it('ignores UNKNOWN slots when resolving aggregate result', () => {
    expect(
      resolveInspectionAggregateResult([
        InspectionResult.OK,
        InspectionResult.OK,
        InspectionResult.UNKNOWN,
      ]),
    ).toBe(InspectionResult.OK);

    expect(
      resolveInspectionAggregateResult([
        InspectionResult.OK,
        InspectionResult.UNKNOWN,
        InspectionResult.NG,
      ]),
    ).toBe(InspectionResult.NG);

    expect(
      resolveInspectionAggregateResult([
        InspectionResult.UNKNOWN,
        InspectionResult.UNKNOWN,
      ]),
    ).toBe(InspectionResult.UNKNOWN);
  });

  it('treats partially empty OCR slots as OK when all known slots match', () => {
    expect(
      resolveInspectionResults(
        [{ rows: ['IS-35R'] }, { rows: ['A_IS-35R_B'] }, { text: null }],
        'IS-35R',
      ),
    ).toBe(InspectionResult.OK);
  });
});
