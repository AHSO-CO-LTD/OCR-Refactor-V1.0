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

  it('matches the reversed product code from the legacy flow', () => {
    expect(matchesExpectedInspectionText('R53SI', 'IS35R')).toBe(true);
  });

  it('matches accepted dashed legacy reverse variants', () => {
    const acceptedTexts = buildAcceptedInspectionTexts('AB-12');

    expect(acceptedTexts).toEqual(
      expect.arrayContaining(['AB-12', '21-BA', '21B-A', '2-1BA']),
    );
  });

  it('matches only on whole token boundaries', () => {
    expect(matchesExpectedInspectionText('XX-IS35R-YY', 'IS35R')).toBe(true);
    expect(matchesExpectedInspectionText('XX_IS35R_YY', 'IS35R')).toBe(false);
    expect(matchesExpectedInspectionText('XXIS35RYY', 'IS35R')).toBe(false);
  });

  it('requires dash boundaries when OCR text has extra text around the expected code', () => {
    expect(matchesExpectedInspectionText('IS-35R', 'IS-35R')).toBe(true);
    expect(matchesExpectedInspectionText('A-IS-35R', 'IS-35R')).toBe(true);
    expect(matchesExpectedInspectionText('IS-35R-A', 'IS-35R')).toBe(true);
    expect(matchesExpectedInspectionText('A-IS-35R-B', 'IS-35R')).toBe(true);

    expect(matchesExpectedInspectionText('AIS-35R', 'IS-35R')).toBe(false);
    expect(matchesExpectedInspectionText('IS-35RA', 'IS-35R')).toBe(false);
    expect(matchesExpectedInspectionText('AIS-35RB', 'IS-35R')).toBe(false);
    expect(matchesExpectedInspectionText('A_IS-35R_B', 'IS-35R')).toBe(false);
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
        rows: ['WRONG', 'A-IS-35R-B'],
        rawText: 'WRONG A-IS-35R-B',
        errorMessage: null,
        expectedText: 'IS-35R',
      }),
    ).toMatchObject({
      rawText: 'WRONG A-IS-35R-B',
      matched: true,
      result: InspectionResult.OK,
    });

    expect(
      evaluateInspectionSlot({
        rows: ['WRONG', 'AIS-35RB'],
        rawText: 'WRONG AIS-35RB',
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
        [{ rows: ['IS35R'] }, { rows: ['R53SI'] }],
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
        [{ rows: ['IS-35R'] }, { rows: ['A-IS-35R-B'] }, { text: null }],
        'IS-35R',
      ),
    ).toBe(InspectionResult.OK);
  });
});
