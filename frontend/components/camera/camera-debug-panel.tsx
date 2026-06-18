"use client";

import { Activity, Pause, Play, RotateCcw, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_CAMERA_STREAM_FPS,
  DEFAULT_CAMERA_STREAM_JPEG_QUALITY,
  DEFAULT_CAMERA_STREAM_MAX_WIDTH,
  getCameraStreamUrl,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

const MAX_DEBUG_ROWS = 60;

type StreamFrameMeta = {
  type: "frame_meta";
  frame_id?: number | null;
  capture_time_ms?: number | null;
  resize_time_ms?: number | null;
  encode_time_ms?: number | null;
  tool_total_time_ms?: number | null;
  sent_at_ms?: number | null;
  stream_fps?: number | null;
  requested_fps?: number | null;
  frame_width?: number | null;
  frame_height?: number | null;
  encoded_bytes?: number | null;
};

type StreamFrameDone = {
  type: "frame_done";
  frame_id?: number | null;
  send_time_ms?: number | null;
  frame_loop_time_ms?: number | null;
};

type StreamErrorMessage = {
  error?: string;
};

type DebugFrameRow = {
  id: number;
  receivedAt: string;
  actualFps: number;
  targetFps: number | null;
  totalMs: number | null;
  grabMs: number | null;
  resizeMs: number | null;
  encodeMs: number | null;
  sendMs: number | null;
  loopMs: number | null;
  delayMs: number | null;
  size: string;
  bytes: number | null;
};

export function CameraDebugPanel() {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<DebugFrameRow[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const [actualFps, setActualFps] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const metaRef = useRef<StreamFrameMeta | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const frameIdRef = useRef(0);
  const frameCountRef = useRef(0);

  const latestRow = rows[0] ?? null;

  useEffect(() => {
    return () => {
      const socket = socketRef.current;

      if (socket) {
        socketRef.current = null;
        socket.close();
      }
    };
  }, []);

  function startDebugStream() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    closeSocket({ silent: true });
    resetRuntimeCounters();

    const socket = new WebSocket(
      getCameraStreamUrl(accessToken, {
        fps: DEFAULT_CAMERA_STREAM_FPS,
        jpegQuality: DEFAULT_CAMERA_STREAM_JPEG_QUALITY,
        maxWidth: DEFAULT_CAMERA_STREAM_MAX_WIDTH,
      }),
    );
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.onopen = () => {
      setRunning(true);
      toast.success(t("cameraDebug.streamStarted"));
    };

    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        handleStreamMessage(event.data);
        return;
      }

      recordFrame();
    };

    socket.onerror = () => {
      toast.error(t("cameraDebug.streamError"));
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      setRunning(false);
    };
  }

  function stopDebugStream() {
    closeSocket();
  }

  function clearDebugRows() {
    setRows([]);
    resetRuntimeCounters();
  }

  function closeSocket(options: { silent?: boolean } = {}) {
    const socket = socketRef.current;

    if (socket) {
      socketRef.current = null;
      socket.close();
    }

    setRunning(false);

    if (!options.silent) {
      toast.success(t("cameraDebug.streamStopped"));
    }
  }

  function resetRuntimeCounters() {
    metaRef.current = null;
    frameTimesRef.current = [];
    frameIdRef.current = 0;
    frameCountRef.current = 0;
    setFrameCount(0);
    setActualFps(0);
  }

  function handleStreamMessage(message: string) {
    try {
      const payload = JSON.parse(message) as
        | StreamFrameMeta
        | StreamFrameDone
        | StreamErrorMessage;

      if ("type" in payload && payload.type === "frame_meta") {
        metaRef.current = payload;
        return;
      }

      if ("type" in payload && payload.type === "frame_done") {
        updateFrameCompletion(payload);
        return;
      }

      if ("error" in payload && payload.error) {
        toast.error(payload.error);
      }
    } catch {
      toast.error(t("cameraDebug.streamError"));
    }
  }

  function recordFrame() {
    const now = Date.now();
    const frameTimes = frameTimesRef.current
      .filter((timestamp) => now - timestamp <= 1000)
      .concat(now);
    const meta = metaRef.current;
    const nextActualFps = frameTimes.length;
    const nextFrameCount = frameCountRef.current + 1;
    const nextRow: DebugFrameRow = {
      id: meta?.frame_id ?? frameIdRef.current + 1,
      receivedAt: new Date(now).toLocaleTimeString(),
      actualFps: nextActualFps,
      targetFps: meta?.stream_fps ?? meta?.requested_fps ?? null,
      totalMs: meta?.tool_total_time_ms ?? null,
      grabMs: meta?.capture_time_ms ?? null,
      resizeMs: meta?.resize_time_ms ?? null,
      encodeMs: meta?.encode_time_ms ?? null,
      sendMs: null,
      loopMs: null,
      delayMs: meta?.sent_at_ms ? now - meta.sent_at_ms : null,
      size:
        meta?.frame_width && meta?.frame_height
          ? `${meta.frame_width} x ${meta.frame_height}`
          : "-",
      bytes: meta?.encoded_bytes ?? null,
    };

    frameTimesRef.current = frameTimes;
    frameIdRef.current = nextRow.id;
    frameCountRef.current = nextFrameCount;
    setActualFps(nextActualFps);
    setFrameCount(nextFrameCount);
    setRows((current) => [nextRow, ...current].slice(0, MAX_DEBUG_ROWS));
  }

  function updateFrameCompletion(payload: StreamFrameDone) {
    const frameId = payload.frame_id;

    if (!frameId) {
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.id === frameId
          ? {
              ...row,
              sendMs: payload.send_time_ms ?? row.sendMs,
              loopMs: payload.frame_loop_time_ms ?? row.loopMs,
            }
          : row,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center border border-cyan-200 bg-cyan-50 text-cyan-700">
            <Timer className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold text-slate-950">
              {t("cameraDebug.title")}
            </div>
            <div className="text-sm text-slate-500">
              {t("cameraDebug.description")}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={
              running
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }
          >
            {running ? t("cameraDebug.running") : t("cameraDebug.stopped")}
          </Badge>
          <Button
            type="button"
            onClick={running ? stopDebugStream : startDebugStream}
            className="gap-2"
          >
            {running ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? t("cameraDebug.stop") : t("cameraDebug.start")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={clearDebugRows}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            {t("cameraDebug.clear")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("cameraDebug.frames")}
          value={String(frameCount)}
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          label={t("cameraDebug.actualFps")}
          value={`${actualFps} FPS`}
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          label={t("cameraDebug.targetFps")}
          value={
            latestRow?.targetFps
              ? `${formatNumber(latestRow.targetFps)} FPS`
              : "-"
          }
          icon={<Timer className="h-4 w-4" />}
        />
        <MetricCard
          label={t("cameraDebug.total")}
          value={formatMs(latestRow?.totalMs)}
          icon={<Timer className="h-4 w-4" />}
        />
        <MetricCard
          label={t("cameraDebug.grab")}
          value={formatMs(latestRow?.grabMs)}
          icon={<Timer className="h-4 w-4" />}
        />
        <MetricCard
          label={t("cameraDebug.resize")}
          value={formatMs(latestRow?.resizeMs)}
          icon={<Timer className="h-4 w-4" />}
        />
        <MetricCard
          label={t("cameraDebug.encode")}
          value={formatMs(latestRow?.encodeMs)}
          icon={<Timer className="h-4 w-4" />}
        />
        <MetricCard
          label={t("cameraDebug.send")}
          value={formatMs(latestRow?.sendMs)}
          icon={<Timer className="h-4 w-4" />}
        />
        <MetricCard
          label={t("cameraDebug.loop")}
          value={formatMs(latestRow?.loopMs)}
          icon={<Timer className="h-4 w-4" />}
        />
        <MetricCard
          label={t("cameraDebug.delay")}
          value={formatMs(latestRow?.delayMs)}
          icon={<Timer className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-base">{t("cameraDebug.latestFrames")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              {t("cameraDebug.empty")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold">#</th>
                    <th className="px-3 py-3 font-semibold">Time</th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.actualFps")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.targetFps")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.total")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.grab")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.resize")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.encode")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.send")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.loop")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.delay")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.size")}
                    </th>
                    <th className="px-3 py-3 font-semibold">
                      {t("cameraDebug.bytes")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.id}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{row.receivedAt}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {row.actualFps} FPS
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {row.targetFps ? `${formatNumber(row.targetFps)} FPS` : "-"}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatMs(row.totalMs)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatMs(row.grabMs)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatMs(row.resizeMs)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatMs(row.encodeMs)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatMs(row.sendMs)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatMs(row.loopMs)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatMs(row.delayMs)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{row.size}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatBytes(row.bytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-24 items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-slate-200 bg-slate-50 text-slate-600">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
          <div className="truncate text-lg font-semibold text-slate-950">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatMs(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toFixed(1)} ms`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatBytes(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  return `${(value / 1024).toFixed(1)} KB`;
}
