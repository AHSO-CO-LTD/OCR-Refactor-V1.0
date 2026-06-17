"use client";

import { ApiError } from "@/lib/api";

type Translate = (key: string) => string;
type ApiErrorTranslator = (message: string, fallbackKey: string) => string;

export function formatCameraApiError(
  cause: unknown,
  apiError: ApiErrorTranslator,
  t: Translate,
  fallbackKey: string,
) {
  if (!(cause instanceof ApiError)) {
    return t(fallbackKey);
  }

  return formatCameraErrorMessage(cause.message, apiError, t, fallbackKey);
}

export function formatCameraErrorMessage(
  message: string,
  apiError: ApiErrorTranslator,
  t: Translate,
  fallbackKey = "camera.genericError",
) {
  const notFoundMatch = message.match(/^Camera device "(.+)" was not found$/);

  if (notFoundMatch) {
    return withToken(t("camera.errorDeviceNotFound"), {
      name: notFoundMatch[1],
    });
  }

  if (message === "No camera device is available") {
    return t("camera.errorNoDeviceAvailable");
  }

  if (message.includes("supports usb camera profiles only")) {
    return t("camera.errorUnsupportedSource");
  }

  const unavailableMatch = message.match(
    /^Device tool is unavailable while trying to (.+?): (.+)$/,
  );

  if (unavailableMatch) {
    return formatUnavailableAction(unavailableMatch[1], unavailableMatch[2], t);
  }

  const failedMatch = message.match(/^Device tool failed to (.+?): (.+)$/);

  if (failedMatch) {
    return formatFailedAction(failedMatch[1], failedMatch[2], t);
  }

  const liveStreamMatch = message.match(/^Camera live stream failed: (.+)$/);

  if (liveStreamMatch) {
    return withToken(t("camera.errorStreamDetail"), {
      detail: liveStreamMatch[1],
    });
  }

  return apiError(message, fallbackKey);
}

function formatUnavailableAction(action: string, detail: string, t: Translate) {
  if (action.includes("connect")) {
    return withToken(t("camera.errorConnectUnavailable"), { detail });
  }

  if (action.includes("grab")) {
    return withToken(t("camera.errorGrabUnavailable"), { detail });
  }

  if (action.includes("stream")) {
    return withToken(t("camera.errorStreamUnavailable"), { detail });
  }

  if (action.includes("status")) {
    return withToken(t("camera.errorStatusUnavailable"), { detail });
  }

  return withToken(t("camera.errorDeviceToolUnavailable"), { detail });
}

function formatFailedAction(action: string, detail: string, t: Translate) {
  if (action.includes("connect")) {
    return withToken(t("camera.errorConnectDetail"), { detail });
  }

  if (action.includes("grab")) {
    return withToken(t("camera.errorGrabDetail"), { detail });
  }

  if (action.includes("stream")) {
    return withToken(t("camera.errorStreamDetail"), { detail });
  }

  if (action.includes("status")) {
    return withToken(t("camera.errorStatusDetail"), { detail });
  }

  return withToken(t("camera.errorActionDetail"), { detail });
}

function withToken(template: string, tokens: Record<string, string>) {
  return Object.entries(tokens).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}
