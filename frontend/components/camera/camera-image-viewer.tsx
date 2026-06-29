"use client";

import { Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { CameraPreviewTransformLayer } from "@/components/camera/camera-preview-image";
import type { CameraFrame } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export type CameraViewTransform = {
  zoomFactor: number;
  previewPanX: number;
  previewPanY: number;
  previewRotation: number;
};

export type CameraLiveStats = {
  fps: number;
  cameraFps: number | null;
  cameraMaxFps: number | null;
  delayMs: number | null;
  captureTimeMs: number | null;
};

type CameraImageViewerProps = {
  imageSource: string;
  frame: CameraFrame | null;
  imageHeight?: number;
  imageWidth?: number;
  live: boolean;
  baseZoom: number;
  initialPreviewPanX?: number;
  initialPreviewPanY?: number;
  initialRotation?: number;
  onTransformChange?: (transform: CameraViewTransform) => void;
  footerAction?: ReactNode;
  liveStats?: CameraLiveStats | null;
  title: string;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const zoomStep = 0.1;
const rotationStep = 1;
const panStep = 24;
const minZoom = 0.25;
const maxZoom = 6;
const edgeResistance = 0.18;

export function CameraImageViewer({
  imageSource,
  frame,
  imageHeight,
  imageWidth,
  live,
  baseZoom,
  initialPreviewPanX = 0,
  initialPreviewPanY = 0,
  initialRotation = 0,
  onTransformChange,
  footerAction,
  liveStats,
  title,
}: CameraImageViewerProps) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(baseZoom);
  const [rotation, setRotation] = useState(initialRotation);
  const [panRatio, setPanRatio] = useState({
    x: clamp(initialPreviewPanX, -1, 1),
    y: clamp(initialPreviewPanY, -1, 1),
  });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [touchedEdge, setTouchedEdge] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const cameraImageSize = {
    width: Math.max(0, Math.round(Number(imageWidth) || imageSize.width)),
    height: Math.max(0, Math.round(Number(imageHeight) || imageSize.height)),
  };
  const panBounds = getPanBounds(containerSize, cameraImageSize, zoom, rotation);
  const pan = {
    x: clampRatioToPan(panRatio.x, panBounds.maxX),
    y: clampRatioToPan(panRatio.y, panBounds.maxY),
  };

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    onTransformChange?.({
      zoomFactor: roundNumber(zoom, 2),
      previewPanX: roundNumber(panRatio.x, 4),
      previewPanY: roundNumber(panRatio.y, 4),
      previewRotation: roundNumber(rotation, 2),
    });
  }, [onTransformChange, panRatio.x, panRatio.y, rotation, zoom]);

  const isFitView =
    imageSource &&
    Math.abs(zoom - 1) < 0.001 &&
    Math.abs(rotation) < 0.001 &&
    Math.abs(pan.x) < 1 &&
    Math.abs(pan.y) < 1;
  const canDrag = imageSource && !isFitView;

  function updateZoom(nextZoom: number) {
    const boundedZoom = clamp(Number(nextZoom.toFixed(2)), minZoom, maxZoom);
    setZoom(boundedZoom);
    setTouchedEdge(false);
  }

  function updateRotation(nextRotation: number) {
    setRotation(nextRotation);
    setTouchedEdge(false);
  }

  function movePan(deltaX: number, deltaY: number) {
    const nextPan = {
      x: pan.x + deltaX,
      y: pan.y + deltaY,
    };
    const boundedPan = clampPan(nextPan, panBounds);
    setTouchedEdge(hasTouchedEdge(nextPan, boundedPan));
    setPanRatio({
      x: toPanRatio(boundedPan.x, panBounds.maxX),
      y: toPanRatio(boundedPan.y, panBounds.maxY),
    });
  }

  function resetView() {
    setZoom(1);
    setRotation(0);
    setPanRatio({ x: 0, y: 0 });
    setTouchedEdge(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canDrag) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextPan = {
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY,
    };
    const boundedPan = clampPan(nextPan, panBounds);
    setTouchedEdge(hasTouchedEdge(nextPan, boundedPan));
    const resistedPan = applyEdgeResistance(nextPan, boundedPan);
    setPanRatio({
      x: toPanRatio(resistedPan.x, panBounds.maxX),
      y: toPanRatio(resistedPan.y, panBounds.maxY),
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      setPanRatio((current) => ({
        x: toPanRatio(clampRatioToPan(current.x, panBounds.maxX), panBounds.maxX),
        y: toPanRatio(clampRatioToPan(current.y, panBounds.maxY), panBounds.maxY),
      }));
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative flex aspect-[3/1] min-h-[280px] touch-none items-center justify-center overflow-hidden bg-slate-950"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="application"
      aria-label={title}
    >
      {imageSource ? (
        <CameraPreviewTransformLayer
          className={canDrag ? "cursor-grab active:cursor-grabbing" : undefined}
          imageSource={imageSource}
          imageHeight={cameraImageSize.height || undefined}
          imageWidth={cameraImageSize.width || undefined}
          previewPanX={panRatio.x}
          previewPanY={panRatio.y}
          previewRotation={rotation}
          zoomFactor={zoom}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSource}
            alt={title}
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            onLoad={(event) =>
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />
        </CameraPreviewTransformLayer>
      ) : (
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <ZoomIn className="h-10 w-10" />
          <div className="text-sm">{t("camera.noFrame")}</div>
        </div>
      )}

      {live && liveStats ? (
        <div className="absolute left-3 top-14 border border-white/10 bg-black/75 px-3 py-2 text-xs text-white">
          <div className="font-semibold">
            {t("camera.liveFps")}: {liveStats.fps.toFixed(1)}
            {liveStats.cameraFps === null
              ? ""
              : ` / ${liveStats.cameraFps.toFixed(1)}`}
          </div>
          <div className="mt-1 text-white/80">
            {t("camera.liveDelay")}:{" "}
            {liveStats.delayMs === null
              ? "-"
              : `${Math.max(0, liveStats.delayMs).toFixed(0)} ms`}
            {liveStats.captureTimeMs === null
              ? ""
              : ` · ${t("camera.captureTime")}: ${liveStats.captureTimeMs.toFixed(1)} ms`}
          </div>
        </div>
      ) : null}

      {frame && !live ? (
        <div className="absolute bottom-3 left-3 border border-white/10 bg-black/70 px-3 py-2 text-xs text-white">
          {frame.width} x {frame.height} - {frame.capture_time_ms.toFixed(1)} ms
        </div>
      ) : null}

      {imageSource ? (
        <>
          <div className="absolute left-3 top-3 border border-white/10 bg-black/70 px-3 py-2 text-xs text-white">
            {touchedEdge
              ? t("camera.edgeTouched")
              : isFitView
                ? t("camera.fitReady")
                : t("camera.dragToAdjust")}
          </div>
          <div className="absolute right-3 top-3 border border-white/10 bg-black/70 px-3 py-2 text-xs text-white">
            {t("products.zoomFactor")}: {zoom.toFixed(2)}x - {rotation} deg
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
            <div
              className="grid grid-cols-3 gap-1"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <span />
              <ViewerButton
                label={t("camera.moveUp")}
                onClick={() => movePan(0, -panStep)}
                disabled={panBounds.maxY === 0}
              >
                <ArrowUp className="h-4 w-4" />
              </ViewerButton>
              <span />
              <ViewerButton
                label={t("camera.moveLeft")}
                onClick={() => movePan(-panStep, 0)}
                disabled={panBounds.maxX === 0}
              >
                <ArrowLeft className="h-4 w-4" />
              </ViewerButton>
              <span />
              <ViewerButton
                label={t("camera.moveRight")}
                onClick={() => movePan(panStep, 0)}
                disabled={panBounds.maxX === 0}
              >
                <ArrowRight className="h-4 w-4" />
              </ViewerButton>
              <span />
              <ViewerButton
                label={t("camera.moveDown")}
                onClick={() => movePan(0, panStep)}
                disabled={panBounds.maxY === 0}
              >
                <ArrowDown className="h-4 w-4" />
              </ViewerButton>
            </div>
            <div
              className="flex flex-wrap items-center justify-end gap-2"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <ViewerButton
                label={t("camera.zoomOut")}
                onClick={() => updateZoom(zoom - zoomStep)}
                disabled={zoom <= minZoom}
              >
                <ZoomOut className="h-4 w-4" />
              </ViewerButton>
              <ViewerButton
                label={t("camera.fitToFrame")}
                onClick={resetView}
                disabled={Boolean(isFitView)}
              >
                <Maximize2 className="h-4 w-4" />
              </ViewerButton>
              <ViewerButton
                label={t("camera.zoomIn")}
                onClick={() => updateZoom(zoom + zoomStep)}
                disabled={zoom >= maxZoom}
              >
                <ZoomIn className="h-4 w-4" />
              </ViewerButton>
              <ViewerButton
                label={t("camera.rotateLeft")}
                onClick={() => updateRotation(rotation - rotationStep)}
              >
                <RotateCcw className="h-4 w-4" />
              </ViewerButton>
              <ViewerButton
                label={t("camera.rotateRight")}
                onClick={() => updateRotation(rotation + rotationStep)}
              >
                <RotateCw className="h-4 w-4" />
              </ViewerButton>
            </div>
            {footerAction ? (
              <div
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
              >
                {footerAction}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ViewerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-10 w-10 border border-white/10 bg-white/90 text-slate-950 hover:bg-white"
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundNumber(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

function toPanRatio(value: number, max: number) {
  if (max <= 0) {
    return 0;
  }

  return clamp(value / max, -1, 1);
}

function clampRatioToPan(ratio: number, max: number) {
  if (max <= 0) {
    return 0;
  }

  return clamp(ratio, -1, 1) * max;
}

function clampPan(
  pan: { x: number; y: number },
  bounds: { maxX: number; maxY: number },
) {
  return {
    x: clamp(pan.x, -bounds.maxX, bounds.maxX),
    y: clamp(pan.y, -bounds.maxY, bounds.maxY),
  };
}

function applyEdgeResistance(
  pan: { x: number; y: number },
  boundedPan: { x: number; y: number },
) {
  return {
    x: boundedPan.x + (pan.x - boundedPan.x) * edgeResistance,
    y: boundedPan.y + (pan.y - boundedPan.y) * edgeResistance,
  };
}

function hasTouchedEdge(
  pan: { x: number; y: number },
  boundedPan: { x: number; y: number },
) {
  return Math.abs(pan.x - boundedPan.x) > 0.5 || Math.abs(pan.y - boundedPan.y) > 0.5;
}

function getPanBounds(
  containerSize: { width: number; height: number },
  imageSize: { width: number; height: number },
  zoom: number,
  rotation: number,
) {
  if (
    containerSize.width <= 0 ||
    containerSize.height <= 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    return { maxX: 0, maxY: 0 };
  }

  const containerWidth = containerSize.width;
  const containerHeight = containerSize.height;
  const containScale = Math.min(
    containerWidth / imageSize.width,
    containerHeight / imageSize.height,
  );
  const displayedWidth = imageSize.width * containScale * zoom;
  const displayedHeight = imageSize.height * containScale * zoom;
  const radians = (Math.abs(rotation) * Math.PI) / 180;
  const rotatedWidth =
    Math.abs(displayedWidth * Math.cos(radians)) +
    Math.abs(displayedHeight * Math.sin(radians));
  const rotatedHeight =
    Math.abs(displayedWidth * Math.sin(radians)) +
    Math.abs(displayedHeight * Math.cos(radians));

  return {
    maxX: Math.max(0, (rotatedWidth - containerWidth) / 2),
    maxY: Math.max(0, (rotatedHeight - containerHeight) / 2),
  };
}
