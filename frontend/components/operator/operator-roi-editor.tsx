"use client";

import { PointerEvent, ReactNode, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProductProfile, RoiRegion } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Point = { x: number; y: number };
type ResizeCorner = "nw" | "ne" | "sw" | "se";
const ROI_SCAN_GRID_SIZE = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampRegionCenter(
  region: RoiRegion,
  position: Point,
  cameraWidth: number,
  cameraHeight: number,
) {
  const halfWidth = Math.min(region.width / 2, cameraWidth / 2);
  const halfHeight = Math.min(region.height / 2, cameraHeight / 2);

  return {
    x: Math.round(clamp(position.x, halfWidth, cameraWidth - halfWidth)),
    y: Math.round(clamp(position.y, halfHeight, cameraHeight - halfHeight)),
  };
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function rotateVector(vector: Point, degrees: number) {
  const radians = degreesToRadians(degrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function inverseRotateVector(vector: Point, degrees: number) {
  return rotateVector(vector, -degrees);
}

function normalizeSignedRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function snapRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  const snapAngles = [0, 90, 180, 270, 360];
  const snapTarget = snapAngles.find(
    (angle) => Math.abs(normalized - angle) <= 3,
  );

  if (snapTarget === undefined) {
    return normalizeSignedRotation(degrees);
  }

  const target = snapTarget === 360 ? 0 : snapTarget;
  return normalizeSignedRotation(degrees + target - normalized);
}

function getRegionCorners(region: RoiRegion) {
  const halfWidth = region.width / 2;
  const halfHeight = region.height / 2;
  const localCorners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];

  return localCorners.map((point) => {
    const rotated = rotateVector(point, region.rotation);
    return { x: region.x + rotated.x, y: region.y + rotated.y };
  });
}

function projectPolygon(points: Point[], axis: Point) {
  const projections = points.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...projections), max: Math.max(...projections) };
}

function getPolygonAxes(points: Point[]) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const edge = { x: next.x - point.x, y: next.y - point.y };
    const length = Math.hypot(edge.x, edge.y) || 1;
    return { x: -edge.y / length, y: edge.x / length };
  });
}

function regionsOverlap(first: RoiRegion, second: RoiRegion) {
  const firstCorners = getRegionCorners(first);
  const secondCorners = getRegionCorners(second);
  const axes = [...getPolygonAxes(firstCorners), ...getPolygonAxes(secondCorners)];

  return axes.every((axis) => {
    const firstProjection = projectPolygon(firstCorners, axis);
    const secondProjection = projectPolygon(secondCorners, axis);
    return (
      firstProjection.max > secondProjection.min &&
      secondProjection.max > firstProjection.min
    );
  });
}

function getOverlappingRegionIndexes(regions: RoiRegion[]) {
  const indexes = new Set<number>();
  regions.forEach((region, index) => {
    regions.slice(index + 1).forEach((otherRegion) => {
      if (regionsOverlap(region, otherRegion)) {
        indexes.add(region.index);
        indexes.add(otherRegion.index);
      }
    });
  });
  return indexes;
}

function getResizeAnchor(region: RoiRegion, corner: ResizeCorner) {
  const oppositeLocal = (() => {
    switch (corner) {
      case "nw":
        return { x: region.width / 2, y: region.height / 2 };
      case "ne":
        return { x: -region.width / 2, y: region.height / 2 };
      case "sw":
        return { x: region.width / 2, y: -region.height / 2 };
      case "se":
        return { x: -region.width / 2, y: -region.height / 2 };
    }
  })();

  const oppositeWorld = rotateVector(oppositeLocal, region.rotation);
  return { x: region.x + oppositeWorld.x, y: region.y + oppositeWorld.y };
}

function getResizeDirection(corner: ResizeCorner) {
  switch (corner) {
    case "nw":
      return { x: -1, y: -1 };
    case "ne":
      return { x: 1, y: -1 };
    case "sw":
      return { x: -1, y: 1 };
    case "se":
      return { x: 1, y: 1 };
  }
}

function safeSetPointerCapture(element: Element, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {}
}

export type OperatorRoiEditorProps = {
  product: ProductProfile;
  onChange: (newRois: RoiRegion[]) => void;
  overlayResult: "OK" | "NG" | null;
  okCount: number;
  ngCount: number;
  interactive?: boolean;
  topRightControls?: ReactNode;
};

export function OperatorRoiEditor({
  product,
  onChange,
  overlayResult,
  okCount,
  ngCount,
  interactive = true,
  topRightControls,
}: OperatorRoiEditorProps) {
  const { t } = useI18n();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [selectedRegionIndex, setSelectedRegionIndex] = useState<number | null>(
    null,
  );
  const [draggingRegion, setDraggingRegion] = useState<{
    index: number;
    offset: Point;
    start: Point;
    initialRegion: RoiRegion;
  } | null>(null);
  const [resizingRegion, setResizingRegion] = useState<{
    index: number;
    anchor: Point;
    corner: ResizeCorner;
    rotation: number;
    initialRegion: RoiRegion;
  } | null>(null);
  const rotatingSessionRef = useRef<{
    index: number;
    lastClientX: number;
    delta: number;
    initialRotation: number;
    frameId: number | null;
  } | null>(null);
  const rotateCleanupRef = useRef<(() => void) | null>(null);

  const cameraWidth = product.camera.imageWidth || 3000;
  const cameraHeight = product.camera.imageHeight || 1000;
  const roiRegions = product.roiRegions;

  const overlappingRegionIndexes = useMemo(
    () => getOverlappingRegionIndexes(roiRegions),
    [roiRegions],
  );

  function regionFromClientPoint(point: Point, element: HTMLDivElement | null) {
    const rect = element?.getBoundingClientRect();
    if (!rect) return null;

    return {
      x: clamp(
        Math.round(((point.x - rect.left) / rect.width) * cameraWidth),
        0,
        cameraWidth,
      ),
      y: clamp(
        Math.round(((point.y - rect.top) / rect.height) * cameraHeight),
        0,
        cameraHeight,
      ),
    };
  }

  function handleRegionPointerDown(
    event: PointerEvent<HTMLDivElement>,
    index: number,
  ) {
    event.stopPropagation();
    const element = event.currentTarget;
    safeSetPointerCapture(element, event.pointerId);

    const point = regionFromClientPoint(
      { x: event.clientX, y: event.clientY },
      previewRef.current,
    );

    if (!point) return;

    const region = roiRegions.find((r) => r.index === index);
    if (!region) return;

    setSelectedRegionIndex(index);
    setDraggingRegion({
      index,
      offset: { x: region.x - point.x, y: region.y - point.y },
      start: point,
      initialRegion: { ...region },
    });
  }

  function handleResizePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    index: number,
    corner: ResizeCorner,
  ) {
    event.stopPropagation();
    const element = event.currentTarget;
    safeSetPointerCapture(element, event.pointerId);

    const region = roiRegions.find((r) => r.index === index);
    if (!region) return;

    setSelectedRegionIndex(index);
    setResizingRegion({
      index,
      anchor: getResizeAnchor(region, corner),
      corner,
      rotation: region.rotation,
      initialRegion: { ...region },
    });
  }

  function paintRotatingSession() {
    const session = rotatingSessionRef.current;
    if (!session) return;

    const nextRois = roiRegions.map((region) =>
      region.index === session.index
        ? {
            ...region,
            rotation: normalizeSignedRotation(
              session.initialRotation + session.delta,
            ),
          }
        : region,
    );

    onChange(nextRois);
  }

  function updateRotatingSession(clientX: number) {
    const session = rotatingSessionRef.current;
    if (!session) return;

    const horizontalMovement = clientX - session.lastClientX;
    if (horizontalMovement === 0) return;

    session.lastClientX = clientX;
    const nextDelta = session.delta - horizontalMovement * 0.35;
    const snapped = snapRotation(session.initialRotation + nextDelta);
    session.delta = snapped - session.initialRotation;

    if (session.frameId !== null) return;

    session.frameId = window.requestAnimationFrame(() => {
      const activeSession = rotatingSessionRef.current;
      if (!activeSession) return;
      activeSession.frameId = null;
      paintRotatingSession();
    });
  }

  function endRotatingSession() {
    const session = rotatingSessionRef.current;
    if (session?.frameId !== null && session?.frameId !== undefined) {
      window.cancelAnimationFrame(session.frameId);
    }

    paintRotatingSession();
    rotatingSessionRef.current = null;
    rotateCleanupRef.current?.();
    rotateCleanupRef.current = null;
  }

  function handleRotatePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    event.stopPropagation();
    const region = roiRegions.find((r) => r.index === index);
    if (!region) return;

    setSelectedRegionIndex(index);
    rotateCleanupRef.current?.();
    rotatingSessionRef.current = {
      index,
      lastClientX: event.clientX,
      delta: 0,
      initialRotation: region.rotation,
      frameId: null,
    };

    function handlePointerMove(e: globalThis.PointerEvent) {
      updateRotatingSession(e.clientX);
    }
    function handlePointerUp() {
      endRotatingSession();
    }

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);

    rotateCleanupRef.current = () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
    };
  }

  function handlePreviewPointerMove(event: PointerEvent<HTMLDivElement>) {
    const point = regionFromClientPoint(
      { x: event.clientX, y: event.clientY },
      previewRef.current,
    );
    if (!point) return;

    if (draggingRegion) {
      const region = roiRegions.find((r) => r.index === draggingRegion.index);
      if (!region) return;

      const newPosition = {
        x: point.x + draggingRegion.offset.x,
        y: point.y + draggingRegion.offset.y,
      };
      const clamped = clampRegionCenter(
        region,
        newPosition,
        cameraWidth,
        cameraHeight,
      );

      const nextRois = roiRegions.map((r) =>
        r.index === draggingRegion.index ? { ...r, x: clamped.x, y: clamped.y } : r,
      );
      onChange(nextRois);
    } else if (resizingRegion) {
      const region = roiRegions.find((r) => r.index === resizingRegion.index);
      if (!region) return;

      const anchor = resizingRegion.anchor;
      const direction = getResizeDirection(resizingRegion.corner);

      const centerToAnchorWorld = { x: anchor.x - point.x, y: anchor.y - point.y };
      const centerToAnchorLocal = inverseRotateVector(
        centerToAnchorWorld,
        resizingRegion.rotation,
      );

      const newWidth = Math.max(
        20,
        Math.min(centerToAnchorLocal.x * -2 * direction.x, cameraWidth),
      );
      const newHeight = Math.max(
        20,
        Math.min(centerToAnchorLocal.y * -2 * direction.y, cameraHeight),
      );

      const localOffset = {
        x: (newWidth / 2) * direction.x,
        y: (newHeight / 2) * direction.y,
      };
      const worldOffset = rotateVector(localOffset, resizingRegion.rotation);
      const newCenter = { x: anchor.x - worldOffset.x, y: anchor.y - worldOffset.y };

      const clampedCenter = clampRegionCenter(
        { ...region, width: newWidth, height: newHeight },
        newCenter,
        cameraWidth,
        cameraHeight,
      );

      const nextRois = roiRegions.map((r) =>
        r.index === resizingRegion.index
          ? {
              ...r,
              x: clampedCenter.x,
              y: clampedCenter.y,
              width: Math.round(newWidth),
              height: Math.round(newHeight),
            }
          : r,
      );
      onChange(nextRois);
    }
  }

  function finishPointerSession() {
    if (draggingRegion) {
      const region = roiRegions.find((r) => r.index === draggingRegion.index);
      if (region && overlappingRegionIndexes.has(region.index)) {
        // Rollback on overlap
        const nextRois = roiRegions.map((r) =>
          r.index === draggingRegion.index ? draggingRegion.initialRegion : r,
        );
        onChange(nextRois);
      }
      setDraggingRegion(null);
    }

    if (resizingRegion) {
      const region = roiRegions.find((r) => r.index === resizingRegion.index);
      if (region && overlappingRegionIndexes.has(region.index)) {
        // Rollback on overlap
        const nextRois = roiRegions.map((r) =>
          r.index === resizingRegion.index ? resizingRegion.initialRegion : r,
        );
        onChange(nextRois);
      }
      setResizingRegion(null);
    }
  }

  return (
    <div
      ref={previewRef}
      tabIndex={interactive ? 0 : -1}
      className="relative aspect-[3/1] w-full touch-none overflow-hidden border border-cyan-400 bg-slate-950 outline-none"
      onPointerMove={interactive ? handlePreviewPointerMove : undefined}
      onPointerUp={interactive ? finishPointerSession : undefined}
      onPointerLeave={interactive ? finishPointerSession : undefined}
      onPointerDown={interactive ? () => setSelectedRegionIndex(null) : undefined}
    >
      <div
        className="absolute inset-0 bg-contain bg-center bg-no-repeat opacity-95 pointer-events-none"
        style={{ backgroundImage: "url('/preview-background.png')" }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:8.333%_20%] pointer-events-none" />
      
      <div className="absolute left-3 top-3 border border-white/15 bg-black/75 px-2 py-1 font-mono text-xs font-semibold text-white pointer-events-none">
        {cameraWidth} x {cameraHeight}
      </div>
      <div className="absolute right-3 top-3 z-20 flex max-w-[min(420px,calc(100%-96px))] flex-col items-end gap-2">
        {topRightControls ? (
          <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
            {topRightControls}
          </div>
        ) : null}
        <div className="border border-white/15 bg-black px-3 py-2 text-right text-xs text-white pointer-events-none">
          <div className="font-semibold">{t("operator.livePreview")}</div>
          <div className="text-white/70">{product.camera.deviceName}</div>
        </div>
      </div>
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
        <div className="inline-flex items-center rounded-full border border-white/20 bg-black/70 px-2.5 py-0.5 text-xs font-semibold transition-colors text-white">
          {t("operator.currentProduct")}: {product.code}
        </div>
        <div className="inline-flex items-center rounded-full border border-white/20 bg-black/70 px-2.5 py-0.5 text-xs font-semibold transition-colors text-white">
          OK {okCount} / NG {ngCount}
        </div>
      </div>

      <div className="absolute right-3 top-16 z-20 grid max-w-[min(360px,calc(100%-96px))] gap-2 text-xs pointer-events-none">
        {overlappingRegionIndexes.size > 0 ? (
          <div className="border border-red-300/80 bg-red-50/95 px-3 py-2 font-medium text-red-800 shadow-sm">
            {t("products.validationRoiOverlap")}
          </div>
        ) : null}
      </div>

      {roiRegions.map((region) => (
        <div
          key={region.index}
          onPointerDown={
            interactive
              ? (event) => handleRegionPointerDown(event, region.index)
              : undefined
          }
          className={[
            "absolute flex items-center justify-center border-2 bg-cyan-400/20 text-xs font-bold text-cyan-100 outline-none ring-4 transition-shadow",
            interactive ? "cursor-move hover:bg-cyan-400/30" : "cursor-default",
            overlappingRegionIndexes.has(region.index)
              ? "border-red-400 ring-red-400/30 bg-red-400/20 hover:bg-red-400/30"
              : selectedRegionIndex === region.index
              ? "border-amber-300 ring-amber-300/25 bg-amber-400/20 hover:bg-amber-400/30"
              : "border-cyan-300 ring-cyan-500/10",
          ].join(" ")}
          style={{
            left: `${((region.x - region.width / 2) / cameraWidth) * 100}%`,
            top: `${((region.y - region.height / 2) / cameraHeight) * 100}%`,
            width: `${(region.width / cameraWidth) * 100}%`,
            height: `${(region.height / cameraHeight) * 100}%`,
            transform: `rotate(${region.rotation}deg)`,
          }}
          title={`${t("products.roiIndex")} ${region.index}: ${region.x}, ${region.y}`}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="operator-roi-scan-surface" />
            <div className="operator-roi-scan-frame">
              <span className="operator-roi-scan-corner corner-tl" />
              <span className="operator-roi-scan-corner corner-tr" />
              <span className="operator-roi-scan-corner corner-bl" />
              <span className="operator-roi-scan-corner corner-br" />
            </div>
            <div className="operator-roi-scan-grid-container">
              {Array.from({ length: ROI_SCAN_GRID_SIZE * ROI_SCAN_GRID_SIZE }).map(
                (_, cellIndex) => {
                  const row = Math.floor(cellIndex / ROI_SCAN_GRID_SIZE);
                  const column = cellIndex % ROI_SCAN_GRID_SIZE;

                  return (
                    <span
                      key={`${region.index}-${cellIndex}`}
                      className="operator-roi-scan-cell"
                      style={{
                        animationDelay: `${region.index * 180 + row * 220 + column * 24}ms`,
                      }}
                    />
                  );
                },
              )}
            </div>
            <div
              className="operator-roi-scan-glow"
              style={{ animationDelay: `${region.index * 180}ms` }}
            />
            <div
              className="operator-roi-scan-line"
              style={{ animationDelay: `${region.index * 180}ms` }}
            />
          </div>
          {interactive && selectedRegionIndex === region.index ? (
            <div className="absolute -top-7 left-1/2 flex -translate-x-1/2 gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-6 w-6 cursor-grab border-cyan-200 bg-black/80 text-cyan-50 hover:bg-slate-900 active:cursor-grabbing"
                onPointerDown={(event) => handleRotatePointerDown(event, region.index)}
                onClick={(event) => event.stopPropagation()}
              >
                <RotateCw className="h-3 w-3" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          
          {interactive && selectedRegionIndex === region.index
            ? (["nw", "ne", "sw", "se"] as ResizeCorner[]).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  onPointerDown={(event) =>
                    handleResizePointerDown(event, region.index, corner)
                  }
                  onClick={(event) => event.stopPropagation()}
                  className={[
                    "absolute h-3 w-3 border border-white bg-amber-300 outline-none ring-2 ring-black/30",
                    corner === "nw" ? "-left-1.5 -top-1.5 cursor-nwse-resize" : "",
                    corner === "ne" ? "-right-1.5 -top-1.5 cursor-nesw-resize" : "",
                    corner === "sw" ? "-bottom-1.5 -left-1.5 cursor-nesw-resize" : "",
                    corner === "se" ? "-bottom-1.5 -right-1.5 cursor-nwse-resize" : "",
                  ].join(" ")}
                />
              ))
            : null}
          <span className="relative z-10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]">
            {region.index}
          </span>
        </div>
      ))}

      {overlayResult ? (
        <div
          className={
            overlayResult === "OK" ? "operator-ok-overlay" : "operator-ng-overlay"
          }
        >
          <div className="border-4 border-white px-12 py-8 text-7xl font-black tracking-normal text-white drop-shadow-[0_6px_20px_rgba(0,0,0,0.45)] min-[1180px]:text-8xl">
            {overlayResult}
          </div>
        </div>
      ) : null}
    </div>
  );
}
