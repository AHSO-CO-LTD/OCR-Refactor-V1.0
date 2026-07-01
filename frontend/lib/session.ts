import type { SessionUser } from "./api";

const TOKEN_KEY = "ocr_access_token";
const USER_KEY = "ocr_session_user";
const REMEMBER_KEY = "ocr_remember_session";

type SaveSessionOptions = {
  remember?: boolean;
};

export function saveSession(
  accessToken: string,
  user: SessionUser,
  options: SaveSessionOptions = {},
) {
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

