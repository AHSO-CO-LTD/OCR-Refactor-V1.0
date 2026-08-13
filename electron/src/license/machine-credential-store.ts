import { app, safeStorage } from "electron";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

type StoredMachineCredential = {
  format: "DONGIL_MACHINE_CREDENTIAL_V1";
  machineId: string;
  serverUrl: string;
  encryptedCredential: string;
};

function credentialPath() {
  return path.join(app.getPath("userData"), "dongil-machine-credential.json");
}

export function loadMachineCredential(machineId: string, serverUrl: string) {
  const filePath = credentialPath();
  if (!existsSync(filePath) || !safeStorage.isEncryptionAvailable()) return null;

  try {
    const stored = JSON.parse(readFileSync(filePath, "utf8")) as StoredMachineCredential;
    if (
      stored.format !== "DONGIL_MACHINE_CREDENTIAL_V1" ||
      stored.machineId !== machineId ||
      stored.serverUrl !== serverUrl ||
      !stored.encryptedCredential
    ) {
      return null;
    }
    return safeStorage.decryptString(Buffer.from(stored.encryptedCredential, "base64"));
  } catch {
    return null;
  }
}

export function saveMachineCredential(
  machineId: string,
  serverUrl: string,
  credential: string,
) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows credential encryption is unavailable");
  }

  const filePath = credentialPath();
  const temporaryPath = `${filePath}.tmp`;
  const stored: StoredMachineCredential = {
    format: "DONGIL_MACHINE_CREDENTIAL_V1",
    machineId,
    serverUrl,
    encryptedCredential: safeStorage.encryptString(credential).toString("base64"),
  };
  writeFileSync(temporaryPath, JSON.stringify(stored), { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, filePath);
}
