import { app, safeStorage } from "electron";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const FORMAT = "AHSO_REMEMBERED_LOGIN_V1";
let currentWindowsUserSid: string | null = null;

type StoredRememberedLogin = {
  format: typeof FORMAT;
  encryptedToken: string;
};

export type LocalRememberedLogin =
  | { status: "NO_REMEMBERED_LOGIN" }
  | { status: "REMEMBER_LOCAL_TOKEN_INVALID" }
  | { status: "REMEMBER_SECURE_STORAGE_UNAVAILABLE" }
  | { status: "REMEMBER_TOKEN_LOADED"; token: string };

function rememberedLoginPath() {
  return join(app.getPath("userData"), "remembered-login.json");
}

export function getRememberedLoginCapability() {
  return {
    available: safeStorage.isEncryptionAvailable(),
    hasLocalCredential: existsSync(rememberedLoginPath()),
  };
}

export function loadRememberedLogin(): LocalRememberedLogin {
  const filePath = rememberedLoginPath();
  if (!existsSync(filePath)) return { status: "NO_REMEMBERED_LOGIN" };
  if (!safeStorage.isEncryptionAvailable()) {
    return { status: "REMEMBER_SECURE_STORAGE_UNAVAILABLE" };
  }

  try {
    const stored = JSON.parse(
      readFileSync(filePath, "utf8"),
    ) as StoredRememberedLogin;
    if (stored.format !== FORMAT || !stored.encryptedToken) {
      return { status: "REMEMBER_LOCAL_TOKEN_INVALID" };
    }
    const token = safeStorage.decryptString(
      Buffer.from(stored.encryptedToken, "base64"),
    );
    if (!token) return { status: "REMEMBER_LOCAL_TOKEN_INVALID" };
    return { status: "REMEMBER_TOKEN_LOADED", token };
  } catch {
    return { status: "REMEMBER_LOCAL_TOKEN_INVALID" };
  }
}

export function saveRememberedLogin(token: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows credential encryption is unavailable");
  }

  const filePath = rememberedLoginPath();
  const temporaryPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;
  const stored: StoredRememberedLogin = {
    format: FORMAT,
    encryptedToken: safeStorage.encryptString(token).toString("base64"),
  };

  removeRememberedLoginArtifact(temporaryPath);
  removeRememberedLoginArtifact(backupPath);
  writeFileSync(temporaryPath, JSON.stringify(stored), {
    encoding: "utf8",
    mode: 0o600,
  });
  protectRememberedLoginFile(temporaryPath);

  try {
    if (existsSync(filePath)) {
      protectRememberedLoginFile(filePath);
      renameSync(filePath, backupPath);
    }
    renameSync(temporaryPath, filePath);
    protectRememberedLoginFile(filePath);
    removeRememberedLoginArtifact(backupPath);
  } catch (error) {
    try {
      removeRememberedLoginArtifact(filePath);
      if (existsSync(backupPath)) renameSync(backupPath, filePath);
      removeRememberedLoginArtifact(temporaryPath);
    } catch (rollbackError) {
      console.error(
        "Remembered-login local rollback failed:",
        errorMessage(rollbackError),
      );
    }
    throw error;
  }
}

export function clearRememberedLogin() {
  const filePath = rememberedLoginPath();
  removeRememberedLoginArtifact(filePath);
  removeRememberedLoginArtifact(`${filePath}.tmp`);
  removeRememberedLoginArtifact(`${filePath}.bak`);
}

function protectRememberedLoginFile(filePath: string) {
  if (process.platform !== "win32") return;
  const userSid = getCurrentWindowsUserSid();
  const result = spawnSync(
    "icacls.exe",
    [
      filePath,
      "/inheritance:r",
      "/grant:r",
      `*${userSid}:F`,
      "*S-1-5-32-544:F",
      "*S-1-5-18:F",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error("Could not protect the remembered-login credential file");
  }
}

function removeRememberedLoginArtifact(filePath: string) {
  if (!existsSync(filePath)) return;

  try {
    unlinkSync(filePath);
  } catch (error) {
    if (process.platform !== "win32") throw error;
    protectRememberedLoginFile(filePath);
    unlinkSync(filePath);
  }
}

function getCurrentWindowsUserSid() {
  if (currentWindowsUserSid) return currentWindowsUserSid;

  const result = spawnSync(
    "whoami.exe",
    ["/user", "/fo", "csv", "/nh"],
    { encoding: "utf8", windowsHide: true },
  );
  const sid = result.stdout?.match(/"(S-\d+(?:-\d+)+)"/i)?.[1];

  if (result.status !== 0 || !sid) {
    throw new Error("Could not resolve the current Windows user SID");
  }

  currentWindowsUserSid = sid;
  return sid;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
