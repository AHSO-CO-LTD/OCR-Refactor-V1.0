"use client";

import { useEffect, useRef, useState } from "react";

type Size = { width: number; height: number };
type Point = { x: number; y: number };

type CameraPreviewImageProps = {
  imageSource: string;
  imageHeight?: number;
  imageWidth?: number;
  previewPanX?: number;
  previewPanY?: number;
  previewRotation?: number;
  zoomFactor?: number;
};

type CameraPreviewTransformLayerProps = CameraPreviewImageProps & {
  children: React.ReactNode;
  className?: string;
};

export function CameraPreviewImage({
  imageSource,
  imageHeight,
  imageWidth,
  previewPanX = 0,
  previewPanY = 0,
  previewRotation = 0,
  zoomFactor = 1,
}: CameraPreviewImageProps) {
  return (
    <CameraPreviewTransformLayer
      imageSource={imageSource}
      imageHeight={imageHeight}
      imageWidth={imageWidth}
      previewPanX={previewPanX}
      previewPanY={previewPanY}
      previewRotation={previewRotation}
      zoomFactor={zoomFactor}
    >
      {imageSource ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSource}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-contain"
        />
      ) : null}
    </CameraPreviewTransformLayer>
  );
}

export function CameraPreviewTransformLayer({
  children,
  className,
  imageHeight,
  imageSource,
  imageWidth,
  previewPanX = 0,
  previewPanY = 0,
  previewRotation = 0,
  zoomFactor = 1,
}: CameraPreviewTransformLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [naturalImageSize, setNaturalImageSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const imageSize = {
    width: imageWidth ?? naturalImageSize.width,
    height: imageHeight ?? naturalImageSize.height,
  };
  const layerTransform = getCameraPreviewLayerTransform({
    containerSize,
    imageSize,
    previewPanX,
    previewPanY,
    previewRotation,
    zoomFactor,
  });

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

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {imageSource ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSource}
          alt=""
          className="hidden"
          onLoad={(event) =>
            setNaturalImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
        />
      ) : null}
      <div
        className={className}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: `${layerTransform.width}px`,
          height: `${layerTransform.height}px`,
          transform: `translate(-50%, -50%) translate(${layerTransform.panX}px, ${layerTransform.panY}px) rotate(${previewRotation}deg) scale(${layerTransform.zoom})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function clientPointToCameraPoint({
  clientPoint,
  container,
  imageSize,
  previewPanX = 0,
  previewPanY = 0,
  previewRotation = 0,
  zoomFactor = 1,
}: {
  clientPoint: Point;
  container: HTMLElement | null;
  imageSize: Size;
  previewPanX?: number;
  previewPanY?: number;
  previewRotation?: number;
  zoomFactor?: number;
}) {
  const rect = container?.getBoundingClientRect();

  if (!rect || imageSize.width <= 0 || imageSize.height <= 0) {
    return null;
  }

  const containerSize = { width: rect.width, height: rect.height };
  const transform = getCameraPreviewLayerTransform({
    containerSize,
    imageSize,
    previewPanX,
    previewPanY,
    previewRotation,
    zoomFactor,
  });
  const center = {
    x: rect.left + rect.width / 2 + transform.panX,
    y: rect.top + rect.height / 2 + transform.panY,
  };
  const zoom = transform.zoom || 1;
  const unrotated = rotateVector(
    {
      x: (clientPoint.x - center.x) / zoom,
      y: (clientPoint.y - center.y) / zoom,
    },
    -previewRotation,
  );

  return {
    x: clamp(
      Math.round(((unrotated.x + transform.width / 2) / transform.width) * imageSize.width),
      0,
      imageSize.width,
    ),
    y: clamp(
      Math.round(((unrotated.y + transform.height / 2) / transform.height) * imageSize.height),
      0,
      imageSize.height,
    ),
  };
}

function getCameraPreviewLayerTransform({
  containerSize,
  imageSize,
  previewPanX,
  previewPanY,
  previewRotation,
  zoomFactor,
}: {
  containerSize: Size;
  imageSize: Size;
  previewPanX: number;
  previewPanY: number;
  previewRotation: number;
  zoomFactor: number;
}) {
  if (
    containerSize.width <= 0 ||
    containerSize.height <= 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    return { width: 0, height: 0, panX: 0, panY: 0, zoom: clamp(zoomFactor, 0.25, 6) };
  }

  const containScale = Math.min(
    containerSize.width / imageSize.width,
    containerSize.height / imageSize.height,
  );
  const zoom = clamp(zoomFactor, 0.25, 6);
  const layerSize = {
    width: imageSize.width * containScale,
    height: imageSize.height * containScale,
  };
  const panBounds = getPanBounds(containerSize, imageSize, zoom, previewRotation);

  return {
    ...layerSize,
    panX: clampRatioToPan(previewPanX, panBounds.maxX),
    panY: clampRatioToPan(previewPanY, panBounds.maxY),
    zoom,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
