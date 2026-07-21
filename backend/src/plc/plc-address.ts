import type { PlcProtocol } from '@prisma/client';

export const MODBUS_M_COIL_OFFSET = 8192;

export function toToolBooleanAddress(
  protocol: PlcProtocol,
  logicalMAddress: number,
) {
  return protocol === 'modbus_tcp'
    ? logicalMAddress + MODBUS_M_COIL_OFFSET
    : logicalMAddress;
}
