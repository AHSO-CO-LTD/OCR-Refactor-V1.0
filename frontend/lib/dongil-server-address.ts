export const DONGIL_SERVER_DEFAULT_PORT = 3979;

export function normalizeDongilServerIp(value: string) {
  const normalized = value.trim();
  const octets = normalized.split(".");
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) =>
        !/^\d{1,3}$/.test(octet) ||
        Number(octet) < 0 ||
        Number(octet) > 255,
    )
  ) {
    return null;
  }

  return octets.map((octet) => String(Number(octet))).join(".");
}

export function buildDongilServerUrl(value: string) {
  const serverIp = normalizeDongilServerIp(value);
  return serverIp
    ? `http://${serverIp}:${DONGIL_SERVER_DEFAULT_PORT}`
    : null;
}

export function getDongilServerIp(serverUrl?: string | null) {
  if (!serverUrl) return null;
  try {
    const url = new URL(serverUrl);
    return normalizeDongilServerIp(url.hostname);
  } catch {
    return null;
  }
}
