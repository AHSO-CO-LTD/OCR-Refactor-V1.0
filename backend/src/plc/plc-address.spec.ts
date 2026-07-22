import { toToolBooleanAddress } from './plc-address';

describe('toToolBooleanAddress', () => {
  it('maps logical M addresses to Modbus coils', () => {
    expect(toToolBooleanAddress('modbus_tcp', 0)).toBe(8192);
    expect(toToolBooleanAddress('modbus_tcp', 101)).toBe(8293);
  });

  it('keeps logical M addresses unchanged for SLMP', () => {
    expect(toToolBooleanAddress('slmp', 0)).toBe(0);
    expect(toToolBooleanAddress('slmp', 101)).toBe(101);
  });
});
