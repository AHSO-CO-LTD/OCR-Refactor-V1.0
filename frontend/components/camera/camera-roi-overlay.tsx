"use client";

import { RotateCw } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { clientPointToCameraPoint } from "@/components/camera/camera-preview-image";
import {
  clampGroupDelta,
  getAlignedRoiPosition,
  getEqualSpacingAssist,
  normalizeSignedRotation,
  regionIntersectsBox,
  snapRoiRotation,
  type RoiAssist,
} from "@/components/camera/roi-editor-geometry";
import type { RoiRegion, TestInspectionImageResult } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getInspectionSlotDisplayText } from "@/lib/inspection-slot-display";

type CameraRoiOverlayProps = {
  assist: RoiAssist | null;
  imageHeight: number;
  imageWidth: number;
  interactive?: boolean;
  onAssistChange: (assist: RoiAssist | null) => void;
  onChange?: (regions: RoiRegion[]) => void;
  onEditStart?: () => void;
  onSelectionChange: (indexes: number[]) => void;
  overlappingIndexes: Set<number>;
  previewPanX?: number;
  previewPanY?: number;
  previewRotation?: number;
  regions: RoiRegion[];
  selectedIndexes: number[];
  testResult?: TestInspectionImageResult | null;
  testRunning?: boolean;
  zoomFactor?: number;
};

type DragSession = {
  initialRegions: RoiRegion[];
  indexes: number[];
  start: { x: number; y: number };
};

type SelectionSession = {
  additiveIndexes: number[];
  current: { x: number; y: number };
  start: { x: number; y: number };
};

type RotationSession = {
  initialRotations: Map<number, number>;
  indexes: number[];
  startClientX: number;
};

export function CameraRoiOverlay({
  assist,
  imageHeight,
  imageWidth,
  interactive = false,
  onAssistChange,
  onChange,
  onEditStart,
  onSelectionChange,
  overlappingIndexes,
  previewPanX = 0,
  previewPanY = 0,
  previewRotation = 0,
  regions,
  selectedIndexes,
  testResult = null,
  testRunning = false,
  zoomFactor = 1,
}: CameraRoiOverlayProps) {
  const { t } = useI18n();
  const dragRef = useRef<DragSession | null>(null);
  const rotationRef = useRef<RotationSession | null>(null);
  const [selection, setSelection] = useState<SelectionSession | null>(null);

  if (imageWidth <= 0 || imageHeight <= 0) return null;

  function cameraPoint(event: PointerEvent<HTMLElement>) {
    const container = event.currentTarget.closest('[role="application"]') as HTMLElement | null;
    return clientPointToCameraPoint({
      clientPoint: { x: event.clientX, y: event.clientY },
      container,
      imageSize: { width: imageWidth, height: imageHeight },
      previewPanX,
      previewPanY,
      previewRotation,
      zoomFactor,
    });
  }

  function capturePointer(event: PointerEvent<HTMLElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Electron may cancel a touch before pointer capture completes.
    }
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!interactive || event.button !== 0) return;
    const point = cameraPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    capturePointer(event);
    const additiveIndexes = event.shiftKey ? selectedIndexes : [];
    setSelection({ additiveIndexes, current: point, start: point });
    onSelectionChange(additiveIndexes);
    onAssistChange(null);
  }

  function handleRegionPointerDown(event: PointerEvent<HTMLDivElement>, region: RoiRegion) {
    if (!interactive || event.button !== 0) return;
    const point = cameraPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    capturePointer(event);

    const nextIndexes = event.shiftKey
      ? selectedIndexes.includes(region.index)
        ? selectedIndexes.filter((index) => index !== region.index)
        : [...selectedIndexes, region.index]
      : selectedIndexes.includes(region.index)
        ? selectedIndexes
        : [region.index];

    if (nextIndexes.length === 0) {
      onSelectionChange([]);
      return;
    }

    onSelectionChange(nextIndexes);
    onEditStart?.();
    dragRef.current = {
      indexes: nextIndexes,
      initialRegions: regions
        .filter((item) => nextIndexes.includes(item.index))
        .map((item) => ({ ...item })),
      start: point,
    };
  }

  function handleRotatePointerDown(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (!interactive || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    capturePointer(event);
    const indexes = selectedIndexes.includes(index) ? selectedIndexes : [index];
    onSelectionChange(indexes);
    onEditStart?.();
    rotationRef.current = {
      indexes,
      initialRotations: new Map(
        regions
          .filter((region) => indexes.includes(region.index))
          .map((region) => [region.index, region.rotation]),
      ),
      startClientX: event.clientX,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!interactive) return;

    if (selection) {
      const point = cameraPoint(event);
      if (!point) return;
      event.preventDefault();
      event.stopPropagation();
      const box = selectionBox(selection.start, point);
      const enclosed = regions
        .filter((region) => regionIntersectsBox(region, box))
        .map((region) => region.index);
      onSelectionChange([...new Set([...selection.additiveIndexes, ...enclosed])]);
      setSelection((current) => (current ? { ...current, current: point } : null));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const point = cameraPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    let delta = { x: point.x - drag.start.x, y: point.y - drag.start.y };
    delta = clampGroupDelta(drag.initialRegions, delta, imageWidth, imageHeight);

    let nextRegions = regions.map((region) => {
      const initial = drag.initialRegions.find((item) => item.index === region.index);
      return initial
        ? { ...region, x: Math.round(initial.x + delta.x), y: Math.round(initial.y + delta.y) }
        : region;
    });

    if (drag.indexes.length === 1) {
      const active = nextRegions.find((region) => region.index === drag.indexes[0]);
      if (active) {
        const aligned = getAlignedRoiPosition(
          active,
          { x: active.x, y: active.y },
          nextRegions,
          imageWidth,
          imageHeight,
        );
        nextRegions = nextRegions.map((region) =>
          region.index === active.index ? { ...region, ...aligned.position } : region,
        );
        onAssistChange(getEqualSpacingAssist(nextRegions) ?? aligned.assist);
      }
    } else {
      onAssistChange(getEqualSpacingAssist(nextRegions));
    }
    onChange?.(nextRegions);
  }

  function handleRotatePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const session = rotationRef.current;
    if (!session || !interactive) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = -(event.clientX - session.startClientX) * 0.35;
    const activeRotation = session.initialRotations.get(session.indexes[0]) ?? 0;
    const snapped = snapRoiRotation(activeRotation + delta);
    const snappedDelta = snapped.rotation - activeRotation;
    onAssistChange(snapped.snapped ? { message: "products.roiAssistStraight" } : null);
    onChange?.(
      regions.map((region) =>
        session.indexes.includes(region.index)
          ? {
              ...region,
              rotation: normalizeSignedRotation(
                (session.initialRotations.get(region.index) ?? region.rotation) + snappedDelta,
              ),
            }
          : region,
      ),
    );
  }

  function finishInteraction(event: PointerEvent<HTMLElement>) {
    if (!dragRef.current && !rotationRef.current && !selection) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    rotationRef.current = null;
    setSelection(null);
    onAssistChange(null);
  }

  const marquee = selection ? selectionBox(selection.start, selection.current) : null;

  return (
    <div
      className={["absolute inset-0 touch-none", interactive ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"].join(" ")}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      aria-hidden={!interactive}
    >
      {assist?.verticalX !== undefined ? (
        <div className="pointer-events-none absolute top-0 h-full w-px bg-amber-300" style={{ left: `${(assist.verticalX / imageWidth) * 100}%` }} />
      ) : null}
      {assist?.horizontalY !== undefined ? (
        <div className="pointer-events-none absolute left-0 h-px w-full bg-amber-300" style={{ top: `${(assist.horizontalY / imageHeight) * 100}%` }} />
      ) : null}
      {assist?.spacingGuides?.map((guide, index) => {
        const from = Math.min(guide.from, guide.to);
        const to = Math.max(guide.from, guide.to);
        const horizontal = guide.orientation === "horizontal";
        return (
          <div
            key={`${guide.orientation}-${index}`}
            className={horizontal ? "pointer-events-none absolute h-px bg-amber-300" : "pointer-events-none absolute w-px bg-amber-300"}
            style={horizontal ? {
              left: `${(from / imageWidth) * 100}%`,
              top: `${(guide.cross / imageHeight) * 100}%`,
              width: `${((to - from) / imageWidth) * 100}%`,
            } : {
              height: `${((to - from) / imageHeight) * 100}%`,
              left: `${(guide.cross / imageWidth) * 100}%`,
              top: `${(from / imageHeight) * 100}%`,
            }}
          >
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-amber-300 bg-slate-950 px-1 text-[10px] font-bold text-amber-200">=</span>
          </div>
        );
      })}
      {regions.map((region) => {
        const selected = selectedIndexes.includes(region.index);
        const overlapping = overlappingIndexes.has(region.index);
        const testSlot = testResult?.slots.find(
          (slot) => slot.slotIndex === region.index,
        );
        const testState = testRunning ? "CHECKING" : testSlot?.result;
        const testTone = cameraRoiTestTone(testState);
        const testLabel = testRunning
          ? t("configuration.test.runningShort")
          : getInspectionSlotDisplayText(
              testSlot,
              testResult?.productCode ?? "",
            );
        return (
          <div
            key={region.index}
            className={[
              "absolute cursor-move border-2 touch-none",
              overlapping
                ? "border-red-400 bg-red-500/15 shadow-[0_0_0_3px_rgba(248,113,113,0.25)]"
                : selected
                  ? "border-amber-300 bg-amber-300/15 shadow-[0_0_0_3px_rgba(252,211,77,0.22)]"
                  : testTone?.region ??
                    "border-cyan-400 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(8,145,178,0.35)]",
            ].join(" ")}
            onPointerDown={(event) => handleRegionPointerDown(event, region)}
            onPointerMove={handlePointerMove}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
            style={{
              height: `${(region.height / imageHeight) * 100}%`,
              left: `${((region.x - region.width / 2) / imageWidth) * 100}%`,
              top: `${((region.y - region.height / 2) / imageHeight) * 100}%`,
              transform: `rotate(${region.rotation}deg)`,
              width: `${(region.width / imageWidth) * 100}%`,
            }}
          >
            <span className={[
              "pointer-events-none absolute -top-6 left-0 max-w-52 truncate px-1.5 py-0.5 font-mono text-[11px] font-semibold",
              overlapping
                ? "bg-red-400 text-slate-950"
                : selected
                  ? "bg-amber-300 text-slate-950"
                  : testTone?.label ?? "bg-cyan-400 text-slate-950",
            ].join(" ")}>
              ROI {region.index}{testLabel ? ` · ${testLabel}` : ""}
            </span>
            {interactive && selected ? (
              <button
                type="button"
                className="absolute -right-5 -top-10 flex h-9 w-9 cursor-ew-resize items-center justify-center border border-amber-300 bg-slate-950 text-amber-200"
                onPointerDown={(event) => handleRotatePointerDown(event, region.index)}
                onPointerMove={handleRotatePointerMove}
                onPointerUp={finishInteraction}
                onPointerCancel={finishInteraction}
                aria-label={`${t("products.rotateRoi")} ROI ${region.index}`}
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}
      {marquee ? (
        <div
          className="pointer-events-none absolute border-2 border-amber-300 bg-amber-300/15"
          style={{
            height: `${((marquee.bottom - marquee.top) / imageHeight) * 100}%`,
            left: `${(marquee.left / imageWidth) * 100}%`,
            top: `${(marquee.top / imageHeight) * 100}%`,
            width: `${((marquee.right - marquee.left) / imageWidth) * 100}%`,
          }}
        />
      ) : null}
      {assist || overlappingIndexes.size > 0 ? (
        <div className="pointer-events-none absolute right-3 top-3 grid max-w-sm gap-2 text-xs font-semibold">
          {assist ? (
            <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
              {t(assist.message)}
            </div>
          ) : null}
          {overlappingIndexes.size > 0 ? (
            <div className="border border-red-300 bg-red-50 px-3 py-2 text-red-800">
              {t("products.validationRoiOverlap")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function cameraRoiTestTone(
  state: "CHECKING" | "OK" | "NG" | "UNKNOWN" | undefined,
) {
  if (state === "CHECKING") {
    return {
      label: "bg-amber-300 text-amber-950",
      region:
        "border-amber-300 bg-amber-300/15 shadow-[0_0_0_3px_rgba(252,211,77,0.22)]",
    };
  }
  if (state === "OK") {
    return {
      label: "bg-emerald-500 text-white",
      region:
        "border-emerald-400 bg-emerald-400/15 shadow-[0_0_0_3px_rgba(52,211,153,0.22)]",
    };
  }
  if (state === "NG") {
    return {
      label: "bg-red-500 text-white",
      region:
        "border-red-400 bg-red-500/15 shadow-[0_0_0_3px_rgba(248,113,113,0.25)]",
    };
  }
  if (state === "UNKNOWN") {
    return {
      label: "bg-slate-600 text-white",
      region:
        "border-slate-400 bg-slate-400/10 shadow-[0_0_0_2px_rgba(148,163,184,0.2)]",
    };
  }
  return null;
}

function selectionBox(start: { x: number; y: number }, current: { x: number; y: number }) {
  return {
    bottom: Math.max(start.y, current.y),
    left: Math.min(start.x, current.x),
    right: Math.max(start.x, current.x),
    top: Math.min(start.y, current.y),
  };
}
