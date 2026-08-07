import { disablePlcSimulator } from "@/lib/api";

const PLC_SIMULATOR_SESSION_KEY = "ocr_dev_plc_simulator_session";

export type StoredPlcSimulatorSession = {
  active: boolean;
  clientId: string;
  open: boolean;
  userId: string;
};

export function getOrCreatePlcSimulatorSession(
  userId: string,
): StoredPlcSimulatorSession {
  const stored = getPlcSimulatorSession(userId);
  if (stored) return stored;

  const session = {
    active: false,
    clientId: createClientId(),
    open: false,
    userId,
  };
  writeSession(session);
  return session;
}

export function getPlcSimulatorSession(userId: string) {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const parsed = JSON.parse(
      storage.getItem(PLC_SIMULATOR_SESSION_KEY) ?? "",
    ) as Partial<StoredPlcSimulatorSession>;
    if (
      parsed.userId !== userId ||
      typeof parsed.clientId !== "string" ||
      typeof parsed.active !== "boolean" ||
      typeof parsed.open !== "boolean"
    ) {
      return null;
    }
    return parsed as StoredPlcSimulatorSession;
  } catch {
    return null;
  }
}

export function updatePlcSimulatorSession(
  userId: string,
  changes: Partial<Pick<StoredPlcSimulatorSession, "active" | "open">>,
) {
  const current = getOrCreatePlcSimulatorSession(userId);
  writeSession({ ...current, ...changes });
}

export async function releasePlcSimulatorSession(
  accessToken: string,
  userId: string,
) {
  const session = getPlcSimulatorSession(userId);
  clearPlcSimulatorSession();
  if (!session?.active) return;
  await disablePlcSimulator(accessToken, session.clientId);
}

export function clearPlcSimulatorSession() {
  getStorage()?.removeItem(PLC_SIMULATOR_SESSION_KEY);
}

function writeSession(session: StoredPlcSimulatorSession) {
  getStorage()?.setItem(PLC_SIMULATOR_SESSION_KEY, JSON.stringify(session));
}

function createClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `plc-sim-${Date.now()}`;
}

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}
