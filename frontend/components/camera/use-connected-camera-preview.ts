"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CAMERA_STREAM_FPS,
  DEFAULT_CAMERA_STREAM_JPEG_QUALITY,
  DEFAULT_CAMERA_STREAM_MAX_WIDTH,
  getCameraStatus,
  getCameraStreamUrl,
} from "@/lib/api";
import { getAccessToken } from "@/lib/session";

type ConnectedCameraPreviewState = {
  connected: boolean;
  imageSrc: string;
  matchesExpectedCamera: boolean;
  runtimeConnected: boolean;
  runtimeDeviceName: string;
};

const STATUS_POLL_MS = 4000;

export function useConnectedCameraPreview(expectedDeviceName?: string) {
  const [state, setState] = useState<ConnectedCameraPreviewState>({
    connected: false,
    imageSrc: "",
    matchesExpectedCamera: false,
    runtimeConnected: false,
    runtimeDeviceName: "",
  });
  const socketRef = useRef<WebSocket | null>(null);
  const imageUrlRef = useRef("");
  const accessTokenRef = useRef("");

  useEffect(() => {
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
    }

    function openSocket() {
      if (!accessTokenRef.current || socketRef.current) {
        return;
      }

      const socket = new WebSocket(
        getCameraStreamUrl(accessTokenRef.current, {
          fps: DEFAULT_CAMERA_STREAM_FPS,
          jpegQuality: DEFAULT_CAMERA_STREAM_JPEG_QUALITY,
          maxWidth: DEFAULT_CAMERA_STREAM_MAX_WIDTH,
        }),
      );
      socket.binaryType = "blob";
      socketRef.current = socket;

      socket.onmessage = (event) => {
        if (typeof event.data === "string") {
          return;
        }

        replaceImage(URL.createObjectURL(event.data as Blob));
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
      };

      socket.onerror = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
      };
    }

    async function syncStatus() {
      if (!accessTokenRef.current) {
        setState({
          connected: false,
          imageSrc: "",
          matchesExpectedCamera: false,
          runtimeConnected: false,
          runtimeDeviceName: "",
        });
        closeSocket();
        return;
      }

      try {
        const status = await getCameraStatus(accessTokenRef.current);
        const connected = Boolean(status.data.connected);
        const runtimeDeviceName = String(status.data.device_name ?? "");
        const matchesExpectedCamera = isExpectedCamera(
          runtimeDeviceName,
          expectedDeviceName,
        );

        setState((current) => ({
          ...current,
          connected,
          matchesExpectedCamera,
          runtimeConnected: connected,
          runtimeDeviceName,
        }));

        if (connected) {
          openSocket();
          return;
        }

        closeSocket();
      } catch {
        setState({
          connected: false,
          imageSrc: "",
          matchesExpectedCamera: false,
          runtimeConnected: false,
          runtimeDeviceName: "",
        });
        closeSocket();
      }
    }

    void syncStatus();
    const intervalId = window.setInterval(() => {
      void syncStatus();
    }, STATUS_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
      closeSocket();
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, [expectedDeviceName]);

  return state;
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
