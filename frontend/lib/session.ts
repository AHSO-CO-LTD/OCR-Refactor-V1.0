import type { RoleCode, RoleWithPermissions, SessionUser } from "./api";

const TOKEN_KEY = "ocr_access_token";
const USER_KEY = "ocr_session_user";
const LEGACY_REMEMBER_KEY = "ocr_remember_session";
const DEV_ROLE_PREVIEW_KEY = "ocr_dev_role_preview";

export type DevRolePreview = {
  permissions: string[];
  role: RoleCode;
};

export function saveSession(accessToken: string, user: SessionUser) {
  clearDevRolePreview();
  const storage = getTemporaryStorage();
  storage?.setItem(TOKEN_KEY, accessToken);
  storage?.setItem(USER_KEY, JSON.stringify(user));
  clearLegacyRememberedSession();
}

export function getAccessToken() {
  return getTemporaryStorage()?.getItem(TOKEN_KEY) ?? null;
}

export function refreshSession(accessToken: string, user: SessionUser) {
  const storage = getTemporaryStorage();
  if (storage?.getItem(TOKEN_KEY) === accessToken) {
    storage.setItem(USER_KEY, JSON.stringify(user));
    return;
  }
  saveSession(accessToken, user);
}

export function getStoredUser() {
  return applyDevRolePreview(getAuthenticatedStoredUser());
}

export function getDevRolePreview() {
  const storage = getTemporaryStorage();
  const rawPreview = storage?.getItem(DEV_ROLE_PREVIEW_KEY);
  if (!rawPreview) return null;

  try {
    const preview = JSON.parse(rawPreview) as DevRolePreview;
    const validRole = ["dev", "admin", "engineer", "operator"].includes(
      preview.role,
    );
    const validPermissions =
      Array.isArray(preview.permissions) &&
      preview.permissions.every((permission) => typeof permission === "string");
    if (validRole && validPermissions) return preview;
  } catch {
    // Clear malformed preview state below.
  }

  clearDevRolePreview();
  return null;
}

export function setDevRolePreview(role: RoleWithPermissions) {
  const user = getAuthenticatedStoredUser();
  const storage = getTemporaryStorage();
  if (!user?.isDev || !storage) return;
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
  if (!user?.isDev || !preview) return user;
  return {
    ...user,
    isDev: preview.role === "dev",
    permissions: preview.permissions,
    role: preview.role,
  } satisfies SessionUser;
}

export function clearSession() {
  const storage = getTemporaryStorage();
  storage?.removeItem(TOKEN_KEY);
  storage?.removeItem(USER_KEY);
  clearDevRolePreview();
  clearLegacyRememberedSession();
}

export function clearLegacyRememberedSession() {
  const storage = getPersistentStorage();
  storage?.removeItem(TOKEN_KEY);
  storage?.removeItem(USER_KEY);
  storage?.removeItem(LEGACY_REMEMBER_KEY);
}

function getAuthenticatedStoredUser() {
  const rawUser = getTemporaryStorage()?.getItem(USER_KEY);
  if (!rawUser) return null;
  try {
    return JSON.parse(rawUser) as SessionUser;
  } catch {
    clearSession();
    return null;
  }
}

function getTemporaryStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function getPersistentStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}
