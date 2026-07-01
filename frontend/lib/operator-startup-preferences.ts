"use client";

import type { ProductProfile, SessionUser } from "@/lib/api";

const OPERATOR_STARTUP_KEY = "ocr_operator_startup_preferences";

export const OPERATOR_STARTUP_ROUTE = "/dashboard/line";

export type OperatorStartupPreferences = {
  productId: string;
  productCode: string;
  cameraDeviceName: string;
  runtimeDeviceName: string;
  savedAt: string;
};

export function shouldUseOperatorStartup(user?: SessionUser | null) {
  return user?.role === "operator";
}

export function getPostLoginRoute(user?: SessionUser | null) {
  return shouldUseOperatorStartup(user) ? OPERATOR_STARTUP_ROUTE : "/dashboard";
}

export function getOperatorStartupPreferences() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawPreferences = window.localStorage.getItem(OPERATOR_STARTUP_KEY);

  if (!rawPreferences) {
    return null;
  }

  try {
    return JSON.parse(rawPreferences) as OperatorStartupPreferences;
  } catch {
    window.localStorage.removeItem(OPERATOR_STARTUP_KEY);
    return null;
  }
}

export function saveOperatorStartupPreferences(
  product: ProductProfile,
  runtimeDeviceName = "",
) {
  if (typeof window === "undefined" || product.camera.sourceType !== "usb") {
    return;
  }

  const preferences: OperatorStartupPreferences = {
    productId: product.id,
    productCode: product.code,
    cameraDeviceName: product.camera.deviceName ?? "",
    runtimeDeviceName,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(
    OPERATOR_STARTUP_KEY,
    JSON.stringify(preferences),
  );
}

export function selectOperatorStartupProduct(products: ProductProfile[]) {
  const usbProducts = products.filter(
    (product) => product.active && product.camera.sourceType === "usb",
  );
  const preferences = getOperatorStartupPreferences();

  if (!preferences) {
    return usbProducts[0] ?? products.find((product) => product.active) ?? null;
  }

  return (
    usbProducts.find((product) => product.id === preferences.productId) ??
    usbProducts.find((product) => product.code === preferences.productCode) ??
    products.find((product) => product.id === preferences.productId) ??
    products.find((product) => product.code === preferences.productCode) ??
    usbProducts[0] ??
    products.find((product) => product.active) ??
    null
  );
}

export function isExpectedRuntimeCamera(
  runtimeDeviceName?: string | null,
  expectedDeviceName?: string | null,
) {
  const normalizedRuntimeName = runtimeDeviceName?.trim().toLowerCase() ?? "";
  const normalizedExpectedName = expectedDeviceName?.trim().toLowerCase() ?? "";

  if (!normalizedExpectedName) {
    return Boolean(normalizedRuntimeName);
  }

  if (!normalizedRuntimeName) {
    return false;
  }

  return (
    normalizedRuntimeName.includes(normalizedExpectedName) ||
    normalizedExpectedName.includes(normalizedRuntimeName)
  );
}
