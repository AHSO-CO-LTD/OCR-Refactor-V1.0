import { InspectionResult } from '@prisma/client';
import {
  buildAcceptedInspectionTexts,
  evaluateInspectionSlot,
  matchesExpectedInspectionText,
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
    expect(matchesExpectedInspectionText('XX_IS35R_YY', 'IS35R')).toBe(true);
    expect(matchesExpectedInspectionText('XXIS35RYY', 'IS35R')).toBe(false);
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

  it('resolves aggregate result consistently across slots', () => {
    expect(
      resolveInspectionResults([{ text: 'IS35R' }, { text: 'R53SI' }], 'IS35R'),
    ).toBe(InspectionResult.OK);

    expect(
      resolveInspectionResults([{ text: 'WRONG' }, { text: null }], 'IS35R'),
    ).toBe(InspectionResult.NG);

    expect(
      resolveInspectionResults([{ text: null }, { error: null }], 'IS35R'),
    ).toBe(InspectionResult.UNKNOWN);
  });
});
