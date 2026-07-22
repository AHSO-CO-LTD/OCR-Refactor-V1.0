"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectCamera,
  DEFAULT_CAMERA_STREAM_JPEG_QUALITY,
  DEFAULT_CAMERA_STREAM_MAX_WIDTH,
  type CameraProfile,
  getCameraStatus,
  getCameraStreamUrl,
} from "@/lib/api";
import { getAccessToken } from "@/lib/session";

type ConnectedCameraPreviewState = {
  connected: boolean;
  connectionStatus: CameraPreviewConnectionStatus;
  imageSrc: string;
  matchesExpectedCamera: boolean;
  runtimeConnected: boolean;
  runtimeDeviceName: string;
};

export type CameraPreviewConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "mismatch"
  | "error";

const STATUS_POLL_MS = 4000;

export function useConnectedCameraPreview(
  expectedDeviceName?: string,
  enabled = true,
  cameraProfile?: CameraProfile,
  streamEnabled = true,
) {
  const [state, setState] = useState<ConnectedCameraPreviewState>({
    connected: false,
    connectionStatus: enabled ? "connecting" : "idle",
    imageSrc: "",
    matchesExpectedCamera: false,
    runtimeConnected: false,
    runtimeDeviceName: "",
  });
  const socketRef = useRef<WebSocket | null>(null);
  const imageUrlRef = useRef("");
  const frameTimesRef = useRef<number[]>([]);
  const [fps, setFps] = useState(0);
  const accessTokenRef = useRef("");
  const ensuredProfileKeyRef = useRef("");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const cameraIdentityKey = buildCameraIdentityKey(
    cameraProfile,
    expectedDeviceName,
  );
  const hardwareProfileKey = buildCameraHardwareProfileKey(cameraProfile);
  const cameraProfileRef = useRef(cameraProfile);
  const expectedDeviceNameRef = useRef(expectedDeviceName);
  const hardwareProfileKeyRef = useRef(hardwareProfileKey);
  const streamEnabledRef = useRef(streamEnabled);
  const closeSocketRef = useRef<(clearImage?: boolean) => void>(() => undefined);
  const syncStatusRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    cameraProfileRef.current = cameraProfile;
    expectedDeviceNameRef.current = expectedDeviceName;
    hardwareProfileKeyRef.current = hardwareProfileKey;
  }, [cameraProfile, expectedDeviceName, hardwareProfileKey]);

  useEffect(() => {
    streamEnabledRef.current = streamEnabled;
    if (!enabled) return;

    if (!streamEnabled) {
      closeSocketRef.current(false);
      return;
    }

    void syncStatusRef.current();
  }, [enabled, streamEnabled]);

  const reconnect = useCallback(() => {
    ensuredProfileKeyRef.current = "";

    if (socketRef.current) {
      const activeSocket = socketRef.current;
      socketRef.current = null;
      activeSocket.close();
    }

    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = "";
    }

    frameTimesRef.current = [];
    setFps(0);

    setState({
      connected: false,
      connectionStatus: "connecting",
      imageSrc: "",
      matchesExpectedCamera: false,
      runtimeConnected: false,
      runtimeDeviceName: "",
    });
    setReconnectAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    accessTokenRef.current = getAccessToken() ?? "";

    function replaceImage(nextImageSrc: string) {
      const previousImageSrc = imageUrlRef.current;

      imageUrlRef.current = nextImageSrc;
      setState((current) => ({ ...current, imageSrc: nextImageSrc }));

      if (previousImageSrc) {
        window.setTimeout(() => {
          URL.revokeObjectURL(previousImageSrc);
        }, 1200);
      }
    }

    function closeSocket(clearImage = true) {
      if (socketRef.current) {
        const activeSocket = socketRef.current;
        socketRef.current = null;
        activeSocket.close();
      }

      if (clearImage) {
        replaceImage("");
      }

      frameTimesRef.current = [];
      setFps(0);
    }

    if (!enabled) {
      const resetTimer = window.setTimeout(() => {
        setState({
          connected: false,
          connectionStatus: "idle",
          imageSrc: "",
          matchesExpectedCamera: false,
          runtimeConnected: false,
          runtimeDeviceName: "",
        });
        closeSocket();
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
        closeSocket();
        if (imageUrlRef.current) {
          URL.revokeObjectURL(imageUrlRef.current);
        }
      };
    }

    function openSocket() {
      if (
        !accessTokenRef.current ||
        !streamEnabledRef.current ||
        socketRef.current
      ) {
        return;
      }

      const socket = new WebSocket(
        getCameraStreamUrl(accessTokenRef.current, {
          jpegQuality: DEFAULT_CAMERA_STREAM_JPEG_QUALITY,
          maxWidth: DEFAULT_CAMERA_STREAM_MAX_WIDTH,
        }),
      );
      socket.binaryType = "blob";
      socketRef.current = socket;

      socket.onopen = () => {
        if (!active || socketRef.current !== socket) {
          return;
        }

        setState((current) => ({
          ...current,
          connectionStatus: current.matchesExpectedCamera
            ? "connected"
            : "mismatch",
        }));
      };

      socket.onmessage = (event) => {
        if (!active || typeof event.data === "string") {
          return;
        }

        const now = performance.now();
        const frameTimes = frameTimesRef.current
          .filter((timestamp) => now - timestamp <= 1000)
          .concat(now);
        frameTimesRef.current = frameTimes;
        setFps(frameTimes.length);
        replaceImage(URL.createObjectURL(event.data as Blob));
        setState((current) => ({
          ...current,
          connectionStatus: current.matchesExpectedCamera
            ? "connected"
            : "mismatch",
        }));
      };

      socket.onclose = () => {
        if (active && socketRef.current === socket) {
          socketRef.current = null;
          replaceImage("");
          setState((current) => ({
            ...current,
            connectionStatus: "disconnected",
          }));
        }
      };

      socket.onerror = () => {
        if (active && socketRef.current === socket) {
          socketRef.current = null;
          replaceImage("");
          setState((current) => ({
            ...current,
            connectionStatus: "error",
          }));
          socket.close();
        }
      };
    }

    async function ensureCameraProfile() {
      const currentCameraProfile = cameraProfileRef.current;
      const currentHardwareProfileKey = hardwareProfileKeyRef.current;

      if (
        !currentCameraProfile ||
        ensuredProfileKeyRef.current === currentHardwareProfileKey
      ) {
        return true;
      }

      try {
        await connectCamera(accessTokenRef.current, currentCameraProfile);
        if (!active) {
          return false;
        }
        ensuredProfileKeyRef.current = currentHardwareProfileKey;
        return true;
      } catch {
        if (!active) {
          return false;
        }
        ensuredProfileKeyRef.current = "";
        setState({
          connected: false,
          connectionStatus: "error",
          imageSrc: "",
          matchesExpectedCamera: false,
          runtimeConnected: false,
          runtimeDeviceName: "",
        });
        closeSocket();
        return false;
      }
    }

    async function syncStatus() {
      if (!accessTokenRef.current) {
        setState({
          connected: false,
          connectionStatus: "error",
          imageSrc: "",
          matchesExpectedCamera: false,
          runtimeConnected: false,
          runtimeDeviceName: "",
        });
        closeSocket();
        return;
      }

      const cameraReady = await ensureCameraProfile();

      if (!active || !cameraReady) {
        return;
      }

      try {
        const status = await getCameraStatus(accessTokenRef.current);
        if (!active) {
          return;
        }
        const connected = Boolean(status.data.connected);
        const runtimeDeviceName = String(status.data.device_name ?? "");
        const matchesExpectedCamera = isExpectedCamera(
          runtimeDeviceName,
          expectedDeviceNameRef.current,
        );

        setState((current) => ({
          ...current,
          connected,
          connectionStatus: connected
            ? matchesExpectedCamera
              ? !streamEnabledRef.current ||
                socketRef.current?.readyState === WebSocket.OPEN
                ? "connected"
                : "connecting"
              : "mismatch"
            : "disconnected",
          matchesExpectedCamera,
          runtimeConnected: connected,
          runtimeDeviceName,
        }));

        if (connected) {
          if (streamEnabledRef.current) {
            openSocket();
          } else {
            closeSocket(false);
          }
          return;
        }

        closeSocket();
      } catch {
        if (!active) {
          return;
        }
        setState({
          connected: false,
          connectionStatus: "error",
          imageSrc: "",
          matchesExpectedCamera: false,
          runtimeConnected: false,
          runtimeDeviceName: "",
        });
        closeSocket();
      }
    }

    closeSocketRef.current = closeSocket;
    syncStatusRef.current = syncStatus;

    const connectingTimer = window.setTimeout(() => {
      if (!active) {
        return;
      }

      setState((current) => ({
        ...current,
        connected: false,
        connectionStatus: "connecting",
        imageSrc: "",
        matchesExpectedCamera: false,
        runtimeConnected: false,
      }));
    }, 0);

    void syncStatus();
    const intervalId = window.setInterval(() => {
      void syncStatus();
    }, STATUS_POLL_MS);
    const fpsIntervalId = window.setInterval(() => {
      const now = performance.now();
      const frameTimes = frameTimesRef.current.filter(
        (timestamp) => now - timestamp <= 1000,
      );
      frameTimesRef.current = frameTimes;
      setFps(frameTimes.length);
    }, 500);

    return () => {
      active = false;
      closeSocketRef.current = () => undefined;
      syncStatusRef.current = async () => undefined;
      window.clearTimeout(connectingTimer);
      window.clearInterval(intervalId);
      window.clearInterval(fpsIntervalId);
      closeSocket();
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, [cameraIdentityKey, enabled, reconnectAttempt]);

  useEffect(() => {
    if (
      !enabled ||
      !cameraProfileRef.current ||
      !hardwareProfileKey ||
      ensuredProfileKeyRef.current === hardwareProfileKey ||
      socketRef.current?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    let active = true;
    const applyTimer = window.setTimeout(() => {
      const accessToken = getAccessToken() ?? "";
      const currentCameraProfile = cameraProfileRef.current;
      const currentHardwareProfileKey = hardwareProfileKeyRef.current;

      if (
        !active ||
        !accessToken ||
        !currentCameraProfile ||
        !currentHardwareProfileKey ||
        socketRef.current?.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      void connectCamera(accessToken, currentCameraProfile)
        .then(() => {
          if (active) {
            ensuredProfileKeyRef.current = currentHardwareProfileKey;
          }
        })
        .catch(() => {
          if (!active) {
            return;
          }

          ensuredProfileKeyRef.current = "";
          if (socketRef.current) {
            const activeSocket = socketRef.current;
            socketRef.current = null;
            activeSocket.close();
          }
          if (imageUrlRef.current) {
            URL.revokeObjectURL(imageUrlRef.current);
            imageUrlRef.current = "";
          }
          setState({
            connected: false,
            connectionStatus: "error",
            imageSrc: "",
            matchesExpectedCamera: false,
            runtimeConnected: false,
            runtimeDeviceName: "",
          });
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(applyTimer);
    };
  }, [enabled, hardwareProfileKey, state.connectionStatus]);

  return { ...state, fps, reconnect };
}

function buildCameraIdentityKey(
  cameraProfile?: CameraProfile,
  expectedDeviceName?: string,
) {
  if (!cameraProfile) {
    return expectedDeviceName?.trim().toLowerCase() ?? "";
  }

  return [
    cameraProfile.sourceType,
    cameraProfile.cameraIdentityId
      ? `identity:${cameraProfile.cameraIdentityId}`
      : `device:${cameraProfile.deviceName?.trim().toLowerCase() ?? ""}`,
    cameraProfile.rtspUrl?.trim().toLowerCase() ?? "",
  ].join("|");
}

function buildCameraHardwareProfileKey(cameraProfile?: CameraProfile) {
  if (!cameraProfile) {
    return "";
  }

  return [
    buildCameraIdentityKey(cameraProfile),
    cameraProfile.exposure,
    cameraProfile.imageWidth,
    cameraProfile.imageHeight,
    cameraProfile.offsetX,
    cameraProfile.offsetY,
  ].join("|");
}

function isExpectedCamera(runtimeDeviceName: string, expectedDeviceName?: string) {
  const normalizedRuntimeName = runtimeDeviceName.trim().toLowerCase();
  const normalizedExpectedName = expectedDeviceName?.trim().toLowerCase();

  if (!normalizedExpectedName) {
    return true;
  }

  if (!normalizedRuntimeName) {
    return false;
  }

  return (
    normalizedRuntimeName.includes(normalizedExpectedName) ||
    normalizedExpectedName.includes(normalizedRuntimeName)
  );
}
