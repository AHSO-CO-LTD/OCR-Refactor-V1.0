import { classifyDongilFailure, DongilApiError } from './dongil-api.client';

describe('classifyDongilFailure', () => {
  it.each([
    [401, 'CREDENTIAL_RECOVERY'],
    [403, 'CREDENTIAL_RECOVERY'],
    [408, 'RETRYABLE'],
    [425, 'RETRYABLE'],
    [429, 'RETRYABLE'],
    [500, 'RETRYABLE'],
    [503, 'RETRYABLE'],
    [400, 'PERMANENT'],
    [404, 'PERMANENT'],
    [422, 'PERMANENT'],
  ] as const)('maps HTTP %s to %s', (status, expected) => {
    const error = new DongilApiError(
      status,
      'DONGIL_TEST_ERROR',
      'test error',
      '/api/v1/test',
      null,
      'correlation-1',
    );

    expect(classifyDongilFailure(error)).toBe(expected);
  });

  it('treats network errors as retryable', () => {
    expect(classifyDongilFailure(new Error('ECONNRESET'))).toBe('RETRYABLE');
  });
});
