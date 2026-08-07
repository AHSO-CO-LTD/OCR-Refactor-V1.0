import type { RoleCode, RoleWithPermissions, SessionUser } from "./api";

const TOKEN_KEY = "ocr_access_token";
const USER_KEY = "ocr_session_user";
const REMEMBER_KEY = "ocr_remember_session";
const DEV_ROLE_PREVIEW_KEY = "ocr_dev_role_preview";

export type DevRolePreview = {
  permissions: string[];
  role: RoleCode;
};

type SaveSessionOptions = {
  remember?: boolean;
};

export function saveSession(
  accessToken: string,
  user: SessionUser,
  options: SaveSessionOptions = {},
) {
  clearDevRolePreview();
  const userPayload = JSON.stringify(user);

  if (options.remember) {
    const persistentStorage = getPersistentStorage();
    const temporaryStorage = getTemporaryStorage();

    persistentStorage?.setItem(TOKEN_KEY, accessToken);
    persistentStorage?.setItem(USER_KEY, userPayload);
    persistentStorage?.setItem(REMEMBER_KEY, "1");
    temporaryStorage?.removeItem(TOKEN_KEY);
    temporaryStorage?.removeItem(USER_KEY);
    return;
  }

  const temporaryStorage = getTemporaryStorage();

  temporaryStorage?.setItem(TOKEN_KEY, accessToken);
  temporaryStorage?.setItem(USER_KEY, userPayload);
  clearPersistentSession();
}

export function getAccessToken() {
  return (
    getTemporaryStorage()?.getItem(TOKEN_KEY) ??
    getRememberedAccessToken()
  );
}

export function getRememberedAccessToken() {
  const persistentStorage = getPersistentStorage();

  if (!persistentStorage) {
    return null;
  }

  if (persistentStorage.getItem(REMEMBER_KEY) !== "1") {
    clearPersistentSession();
    return null;
  }

  const accessToken = persistentStorage.getItem(TOKEN_KEY);

  if (!accessToken) {
    clearPersistentSession();
  }

  return accessToken;
}

export function refreshSession(accessToken: string, user: SessionUser) {
  const temporaryStorage = getTemporaryStorage();
  const persistentStorage = getPersistentStorage();
  const userPayload = JSON.stringify(user);

  if (temporaryStorage?.getItem(TOKEN_KEY) === accessToken) {
    temporaryStorage.setItem(USER_KEY, userPayload);
    return;
  }

  if (
    persistentStorage?.getItem(REMEMBER_KEY) === "1" &&
    persistentStorage.getItem(TOKEN_KEY) === accessToken
  ) {
    persistentStorage.setItem(USER_KEY, userPayload);
    return;
  }

  saveSession(accessToken, user, { remember: false });
}

export function getStoredUser() {
  return applyDevRolePreview(getAuthenticatedStoredUser());
}

export function getDevRolePreview() {
  const storage = getTemporaryStorage();
  const rawPreview = storage?.getItem(DEV_ROLE_PREVIEW_KEY);

  if (!rawPreview) {
    return null;
  }

  try {
    const preview = JSON.parse(rawPreview) as DevRolePreview;
    const validRole = ["dev", "admin", "engineer", "operator"].includes(
      preview.role,
    );
    const validPermissions = Array.isArray(preview.permissions) &&
      preview.permissions.every((permission) => typeof permission === "string");

    if (validRole && validPermissions) {
      return preview;
    }
  } catch {
    // Clear the malformed preview state below.
  }

  clearDevRolePreview();
  return null;
}

export function setDevRolePreview(role: RoleWithPermissions) {
  const user = getAuthenticatedStoredUser();
  const storage = getTemporaryStorage();

  if (!user?.isDev || !storage) {
    return;
  }

  if (role.code === "dev") {
    clearDevRolePreview();
    return;
  }

  storage.setItem(
    DEV_ROLE_PREVIEW_KEY,
    JSON.stringify({
      permissions: role.permissions,
      role: role.code,
    } satisfies DevRolePreview),
  );
}

export function clearDevRolePreview() {
  getTemporaryStorage()?.removeItem(DEV_ROLE_PREVIEW_KEY);
}

export function applyDevRolePreview(
  user: SessionUser | null,
  preview = getDevRolePreview(),
) {
  if (!user?.isDev || !preview) {
    return user;
  }

  return {
    ...user,
    isDev: preview.role === "dev",
    permissions: preview.permissions,
    role: preview.role,
  } satisfies SessionUser;
}

function getAuthenticatedStoredUser() {
  const rawUser =
    getTemporaryStorage()?.getItem(USER_KEY) ??
    getRememberedStoredUser();

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as SessionUser;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  getTemporaryStorage()?.removeItem(TOKEN_KEY);
  getTemporaryStorage()?.removeItem(USER_KEY);
  clearDevRolePreview();
  clearPersistentSession();
}

function getRememberedStoredUser() {
  const persistentStorage = getPersistentStorage();

  if (!persistentStorage) {
    return null;
  }

  if (persistentStorage.getItem(REMEMBER_KEY) !== "1") {
    clearPersistentSession();
    return null;
  }

  return persistentStorage.getItem(USER_KEY);
}

function clearPersistentSession() {
  const persistentStorage = getPersistentStorage();

  persistentStorage?.removeItem(TOKEN_KEY);
  persistentStorage?.removeItem(USER_KEY);
  persistentStorage?.removeItem(REMEMBER_KEY);
}

function getTemporaryStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

function getPersistentStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

