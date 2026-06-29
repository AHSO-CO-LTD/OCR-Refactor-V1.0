"use client";

import { type CSSProperties } from "react";
import { CameraPreviewTransformLayer } from "@/components/camera/camera-preview-image";
import type { InspectionSlotState, ProductProfile } from "@/lib/api";

export function TestFailImagePreview({
  imageSrc,
  product,
  slots,
}: {
  imageSrc: string;
  product: ProductProfile;
  slots: InspectionSlotState[];
}) {
  const slotMap = new Map<number, InspectionSlotState>();

  slots.forEach((slot) => {
    if (typeof slot.slotIndex === "number") {
      slotMap.set(slot.slotIndex, slot);
    }
  });

  const cameraWidth = Math.max(1, Math.round(product.camera.imageWidth || 1500));
  const cameraHeight = Math.max(1, Math.round(product.camera.imageHeight || 500));
  const roiZoom = Math.min(Math.max(Number(product.camera.zoomFactor) || 1, 0.25), 6);
  const roiZoomCompensation = 1 / roiZoom;

  return (
    <div className="relative aspect-[3/1] w-full overflow-hidden border border-cyan-400 bg-slate-950">
      <CameraPreviewTransformLayer
        className="overflow-visible"
        imageSource={imageSrc}
        imageHeight={cameraHeight}
        imageWidth={cameraWidth}
        zoomFactor={product.camera.zoomFactor}
        previewPanX={product.camera.previewPanX}
        previewPanY={product.camera.previewPanY}
        previewRotation={product.camera.previewRotation}
      >
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain opacity-95"
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:8.333%_20%]" />
        {product.roiRegions.map((region) => {
          const slot = slotMap.get(region.index);
          const slotResult = slot?.result ?? "UNKNOWN";
          const recognizedText = slot?.rawText?.trim() || slotResult;
          const colorClasses =
            slotResult === "OK"
              ? {
                  border: "rgb(34 197 94 / 1)",
                  ring: "rgb(34 197 94 / 0.22)",
                  fill: "bg-emerald-400/15",
                  text: "text-emerald-100",
                  badge: "bg-emerald-500 text-white",
                }
              : slotResult === "NG"
                ? {
                    border: "rgb(239 68 68 / 1)",
                    ring: "rgb(239 68 68 / 0.24)",
                    fill: "bg-red-400/15",
                    text: "text-red-100",
                    badge: "bg-red-500 text-white",
                  }
                : {
                    border: "rgb(250 204 21 / 1)",
                    ring: "rgb(250 204 21 / 0.24)",
                    fill: "bg-amber-300/15",
                    text: "text-amber-50",
                    badge: "bg-amber-400 text-slate-950",
                  };

          return (
            <div
              key={`report-roi-${region.index}`}
              className="absolute flex items-center justify-center"
              style={{
                left: `${((region.x - region.width / 2) / cameraWidth) * 100}%`,
                top: `${((region.y - region.height / 2) / cameraHeight) * 100}%`,
                width: `${(region.width / cameraWidth) * 100}%`,
                height: `${(region.height / cameraHeight) * 100}%`,
                transform: `rotate(${region.rotation}deg)`,
                ["--roi-ui-scale" as string]: roiZoomCompensation,
                ["--roi-border-width" as string]: `${2 * roiZoomCompensation}px`,
                ["--roi-ring-width" as string]: `${4 * roiZoomCompensation}px`,
                ["--roi-corner-size" as string]: `${10 * roiZoomCompensation}px`,
                ["--roi-corner-offset" as string]: `${1 * roiZoomCompensation}px`,
                ["--roi-line-height" as string]: `${4 * roiZoomCompensation}px`,
                ["--roi-glow-height" as string]: `${88 * roiZoomCompensation}px`,
                ["--roi-label-size" as string]: `${12 * roiZoomCompensation}px`,
                ["--roi-badge-font-size" as string]: `${9 * roiZoomCompensation}px`,
                ["--roi-badge-padding-x" as string]: `${5 * roiZoomCompensation}px`,
                ["--roi-badge-padding-y" as string]: `${3 * roiZoomCompensation}px`,
              } as CSSProperties}
            >
              <div
                className={[
                  "pointer-events-none absolute inset-0 overflow-hidden transition-shadow",
                  colorClasses.fill,
                ].join(" ")}
                style={{
                  borderStyle: "solid",
                  borderWidth: "var(--roi-border-width)",
                  borderColor: colorClasses.border,
                  boxShadow: `0 0 0 var(--roi-ring-width) ${colorClasses.ring}`,
                }}
              >
                <div className="operator-roi-scan-surface" />
                <div className="operator-roi-scan-frame">
                  <span className="operator-roi-scan-corner corner-tl" />
                  <span className="operator-roi-scan-corner corner-tr" />
                  <span className="operator-roi-scan-corner corner-bl" />
                  <span className="operator-roi-scan-corner corner-br" />
                </div>
              </div>
              <div
                className="pointer-events-none absolute left-0 z-10"
                style={{
                  top: "0",
                  left: "0",
                  transform: "translate(0, calc(-100% + var(--roi-border-width)))",
                }}
              >
                <span
                  className={[
                    "inline-flex items-center whitespace-nowrap font-bold shadow-[0_1px_2px_rgba(0,0,0,0.35)]",
                    colorClasses.badge,
                  ].join(" ")}
                  style={{
                    fontSize: "var(--roi-badge-font-size)",
                    paddingLeft: "var(--roi-badge-padding-x)",
                    paddingRight: "var(--roi-badge-padding-x)",
                    paddingTop: "var(--roi-badge-padding-y)",
                    paddingBottom: "var(--roi-badge-padding-y)",
                    lineHeight: 1.15,
                  }}
                  title={recognizedText}
                >
                  {recognizedText}
                </span>
              </div>
              <span
                className={[
                  "relative z-10 font-bold drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]",
                  colorClasses.text,
                ].join(" ")}
                style={{ fontSize: "var(--roi-label-size)" }}
              >
                {region.index}
              </span>
            </div>
          );
        })}
      </CameraPreviewTransformLayer>
      <div className="pointer-events-none absolute left-3 top-3 border border-white/15 bg-black/75 px-2 py-1 font-mono text-xs font-semibold text-white">
        {cameraWidth} x {cameraHeight}
      </div>
    </div>
  );
}
