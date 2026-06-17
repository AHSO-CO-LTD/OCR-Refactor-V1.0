"use client";

import { useEffect, useRef, useState } from "react";

type CameraPreviewImageProps = {
  imageSource: string;
  previewPanX?: number;
  previewPanY?: number;
  previewRotation?: number;
  zoomFactor?: number;
};

export function CameraPreviewImage({
  imageSource,
  previewPanX = 0,
  previewPanY = 0,
  previewRotation = 0,
  zoomFactor = 1,
}: CameraPreviewImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

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

  const panBounds = getPanBounds(
    containerSize,
    imageSize,
    clamp(zoomFactor, 0.25, 6),
    previewRotation,
  );
  const panX = clampRatioToPan(previewPanX, panBounds.maxX);
  const panY = clampRatioToPan(previewPanY, panBounds.maxY);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {imageSource ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSource}
          alt=""
          draggable={false}
          className="h-full w-full select-none object-contain"
          onLoad={(event) =>
            setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          style={{
            transform: `translate(${panX}px, ${panY}px) rotate(${previewRotation}deg) scale(${clamp(zoomFactor, 0.25, 6)})`,
            transformOrigin: "center center",
          }}
        />
      ) : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampRatioToPan(ratio: number, max: number) {
  if (max <= 0) {
    return 0;
  }

  return clamp(ratio, -1, 1) * max;
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

  const containScale = Math.min(
    containerSize.width / imageSize.width,
    containerSize.height / imageSize.height,
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
    maxX: Math.max(0, (rotatedWidth - containerSize.width) / 2),
    maxY: Math.max(0, (rotatedHeight - containerSize.height) / 2),
  };
}
