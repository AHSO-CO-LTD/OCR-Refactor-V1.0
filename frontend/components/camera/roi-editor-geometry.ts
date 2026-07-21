import type { RoiRegion } from "@/lib/api";

export const CONFIGURATION_ROI_WIDTH = 300;
export const CONFIGURATION_ROI_HEIGHT = 440;
export const MAX_CONFIGURATION_ROIS = 5;

const alignmentThreshold = 12;
const spacingThreshold = 20;

type Point = { x: number; y: number };

export type RoiSpacingGuide = {
  cross: number;
  from: number;
  orientation: "horizontal" | "vertical";
  to: number;
};

export type RoiAssist = {
  horizontalY?: number;
  message: "products.roiAssistAligned" | "products.roiAssistEqualSpacing" | "products.roiAssistStraight";
  spacingGuides?: RoiSpacingGuide[];
  verticalX?: number;
};

export function cloneRoiRegions(regions: RoiRegion[]) {
  return regions.map((region) => ({ ...region }));
}

export function normalizeConfigurationRois(regions: RoiRegion[]) {
  return regions.map((region) => ({
    ...region,
    height: CONFIGURATION_ROI_HEIGHT,
    width: CONFIGURATION_ROI_WIDTH,
  }));
}

export function normalizeSignedRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

export function snapRoiRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  const target = [0, 90, 180, 270, 360].find(
    (angle) => Math.abs(normalized - angle) <= 4,
  );

  if (target === undefined) {
    return { rotation: normalizeSignedRotation(degrees), snapped: false };
  }

  const snappedTarget = target === 360 ? 0 : target;
  return {
    rotation: normalizeSignedRotation(degrees + snappedTarget - normalized),
    snapped: true,
  };
}

export function getOverlappingRegionIndexes(regions: RoiRegion[]) {
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

export function getAlignedRoiPosition(
  region: RoiRegion,
  position: Point,
  regions: RoiRegion[],
  imageWidth: number,
  imageHeight: number,
) {
  let nextPosition = clampRegionCenter(region, position, imageWidth, imageHeight);
  const assist: Partial<RoiAssist> = {};

  regions
    .filter((item) => item.index !== region.index)
    .forEach((otherRegion) => {
      if (Math.abs(otherRegion.x - nextPosition.x) <= alignmentThreshold) {
        nextPosition = { ...nextPosition, x: otherRegion.x };
        assist.verticalX = otherRegion.x;
      }
      if (Math.abs(otherRegion.y - nextPosition.y) <= alignmentThreshold) {
        nextPosition = { ...nextPosition, y: otherRegion.y };
        assist.horizontalY = otherRegion.y;
      }
    });

  return {
    assist:
      assist.horizontalY !== undefined || assist.verticalX !== undefined
        ? ({ ...assist, message: "products.roiAssistAligned" } as RoiAssist)
        : null,
    position: clampRegionCenter(region, nextPosition, imageWidth, imageHeight),
  };
}

export function getEqualSpacingAssist(regions: RoiRegion[]): RoiAssist | null {
  if (regions.length < 3) return null;

  return (
    getEqualSpacingChain([...regions].sort((a, b) => a.x - b.x), "horizontal") ??
    getEqualSpacingChain([...regions].sort((a, b) => a.y - b.y), "vertical")
  );
}

export function regionIntersectsBox(
  region: RoiRegion,
  box: { left: number; right: number; top: number; bottom: number },
) {
  const corners = getRegionCorners(region);
  const regionBox = {
    bottom: Math.max(...corners.map((point) => point.y)),
    left: Math.min(...corners.map((point) => point.x)),
    right: Math.max(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
  };

  return !(
    regionBox.right < box.left ||
    regionBox.left > box.right ||
    regionBox.bottom < box.top ||
    regionBox.top > box.bottom
  );
}

export function clampGroupDelta(
  regions: RoiRegion[],
  delta: Point,
  imageWidth: number,
  imageHeight: number,
) {
  if (regions.length === 0) return { x: 0, y: 0 };

  const corners = regions.flatMap(getRegionCorners);
  const minX = Math.min(...corners.map((point) => point.x));
  const maxX = Math.max(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxY = Math.max(...corners.map((point) => point.y));

  return {
    x: Math.min(Math.max(delta.x, -minX), imageWidth - maxX),
    y: Math.min(Math.max(delta.y, -minY), imageHeight - maxY),
  };
}

function clampRegionCenter(
  region: RoiRegion,
  position: Point,
  imageWidth: number,
  imageHeight: number,
) {
  const corners = getRegionCorners({ ...region, x: 0, y: 0 });
  const halfWidth = Math.max(...corners.map((point) => Math.abs(point.x)));
  const halfHeight = Math.max(...corners.map((point) => Math.abs(point.y)));

  return {
    x: Math.min(Math.max(position.x, halfWidth), imageWidth - halfWidth),
    y: Math.min(Math.max(position.y, halfHeight), imageHeight - halfHeight),
  };
}

function getEqualSpacingChain(
  sortedRegions: RoiRegion[],
  orientation: "horizontal" | "vertical",
): RoiAssist | null {
  const mainAxis = orientation === "horizontal" ? "x" : "y";
  const crossAxis = orientation === "horizontal" ? "y" : "x";
  let bestChain: RoiRegion[] = [];

  for (let start = 0; start <= sortedRegions.length - 3; start += 1) {
    let chain = sortedRegions.slice(start, start + 2);
    const baseGap = sortedRegions[start + 1][mainAxis] - sortedRegions[start][mainAxis];
    const baseCross = sortedRegions[start][crossAxis];

    for (let index = start + 2; index < sortedRegions.length; index += 1) {
      const previous = chain[chain.length - 1];
      const gap = sortedRegions[index][mainAxis] - previous[mainAxis];
      const crossDelta = Math.abs(sortedRegions[index][crossAxis] - baseCross);
      if (
        Math.abs(gap - baseGap) <= spacingThreshold &&
        crossDelta <= alignmentThreshold * 2
      ) {
        chain = [...chain, sortedRegions[index]];
      } else {
        break;
      }
    }

    if (chain.length >= 3 && chain.length > bestChain.length) bestChain = chain;
  }

  if (bestChain.length < 3) return null;

  const cross = Math.round(
    bestChain.reduce((sum, region) => sum + region[crossAxis], 0) / bestChain.length,
  );

  return {
    horizontalY: orientation === "horizontal" ? cross : undefined,
    message: "products.roiAssistEqualSpacing",
    spacingGuides: bestChain.slice(0, -1).map((region, index) => ({
      cross,
      from: region[mainAxis],
      orientation,
      to: bestChain[index + 1][mainAxis],
    })),
    verticalX: orientation === "vertical" ? cross : undefined,
  };
}

function rotateVector(point: Point, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function getRegionCorners(region: RoiRegion) {
  const halfWidth = region.width / 2;
  const halfHeight = region.height / 2;
  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => {
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
