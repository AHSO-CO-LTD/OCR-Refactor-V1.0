"use client";

import {
  ChangeEvent,
  ComponentProps,
  FormEvent,
  KeyboardEvent,
  PointerEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Copy,
  Plus,
  Redo2,
  RefreshCcw,
  RotateCw,
  Save,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  listCameraDevices,
  type CameraDevice,
  ProductProfile,
  ProductProfilePayload,
  RoiRegion,
} from "@/lib/api";
import {
  CameraPreviewTransformLayer,
  clientPointToCameraPoint,
} from "@/components/camera/camera-preview-image";
import { useConnectedCameraPreview } from "@/components/camera/use-connected-camera-preview";
import { getDesktopBridge } from "@/lib/desktop";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type ProductProfileFormProps = {
  product?: ProductProfile | null;
  products: ProductProfile[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (payload: ProductProfilePayload) => Promise<void>;
};

const previewAspectRatio = 3;
const defaultCameraWidth = 1500;
const defaultCameraHeight = defaultCameraWidth / previewAspectRatio;
const maxRoiRegions = 5;
const pasteOffset = 40;
const minRoiSize = 20;
const rotateSensitivity = 0.35;
const angleSnapThreshold = 3;
const alignmentSnapThreshold = 12;
const spacingSnapThreshold = 20;

type ResizeCorner = "nw" | "ne" | "sw" | "se";
type Point = { x: number; y: number };
type SpacingGuide = {
  orientation: "horizontal" | "vertical";
  from: number;
  to: number;
  cross: number;
};
type RoiAssist = {
  message: string;
  verticalX?: number;
  horizontalY?: number;
  spacingGuides?: SpacingGuide[];
};
type CameraFrame = { width: number; height: number };

const defaultDraft: ProductProfilePayload = {
  code: "",
  name: "",
  defaultNumber: 160,
  batchSize: 160,
  exposure: 3500,
  thresholdAccept: 0.5,
  thresholdMns: 0.5,
  modelPath: "",
  rotateTestImageClockwise: false,
  active: true,
  camera: {
    sourceType: "usb",
    deviceName: "Camera 1",
    rtspUrl: "",
    exposure: 3500,
    imageWidth: defaultCameraWidth,
    imageHeight: defaultCameraHeight,
    offsetX: 0,
    offsetY: 0,
    zoomFactor: 1,
    previewPanX: 0,
    previewPanY: 0,
    previewRotation: 0,
  },
  roiRegions: [],
};

function cloneDraft(source: ProductProfilePayload): ProductProfilePayload {
  return {
    ...source,
    camera: { ...source.camera },
    roiRegions: source.roiRegions.map((region) => ({
      ...region,
      rotation: normalizeSignedRotation(region.rotation),
    })),
  };
}

function toDraft(product?: ProductProfile | null): ProductProfilePayload {
  if (!product) {
    return cloneDraft(defaultDraft);
  }

  return {
    code: product.code,
    name: product.name,
    defaultNumber: product.defaultNumber,
    batchSize: product.batchSize,
    exposure: product.exposure,
    thresholdAccept: product.thresholdAccept,
    thresholdMns: product.thresholdMns,
    modelPath: product.modelPath ?? "",
    rotateTestImageClockwise: product.rotateTestImageClockwise,
    active: product.active,
    camera: {
      ...product.camera,
      deviceName: product.camera.deviceName ?? "",
      rtspUrl: product.camera.rtspUrl ?? "",
    },
    roiRegions: product.roiRegions.map((region) => ({
      ...region,
      rotation: normalizeSignedRotation(region.rotation),
    })),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCameraFrame(camera: ProductProfilePayload["camera"]): CameraFrame {
  const rawWidth = Number(camera.imageWidth);
  const width = Math.max(
    1,
    Math.round(rawWidth || defaultCameraWidth),
  );
  const rawHeight = Number(camera.imageHeight);
  const height = Math.max(
    1,
    Math.round(rawHeight || width / previewAspectRatio),
  );

  return { width, height };
}

function cameraDeviceValue(device: CameraDevice) {
  return device.friendly_name;
}

function regionFromClientPoint(
  point: Point,
  element: HTMLDivElement | null,
  camera: ProductProfilePayload["camera"],
) {
  return clientPointToCameraPoint({
    clientPoint: point,
    container: element,
    imageSize: getCameraFrame(camera),
    previewPanX: camera.previewPanX,
    previewPanY: camera.previewPanY,
    previewRotation: camera.previewRotation,
    zoomFactor: camera.zoomFactor,
  });
}

function regionFromPointer(
  event: PointerEvent<HTMLElement>,
  element: HTMLDivElement | null,
  camera: ProductProfilePayload["camera"],
) {
  return regionFromClientPoint(
    { x: event.clientX, y: event.clientY },
    element,
    camera,
  );
}

function nextRegionIndex(regions: RoiRegion[]) {
  return regions.reduce((max, region) => Math.max(max, region.index), 0) + 1;
}

function clampRegionCenter(
  region: RoiRegion,
  position: { x: number; y: number },
  frame: CameraFrame,
) {
  const halfWidth = Math.min(region.width / 2, frame.width / 2);
  const halfHeight = Math.min(region.height / 2, frame.height / 2);

  return {
    x: Math.round(clamp(position.x, halfWidth, frame.width - halfWidth)),
    y: Math.round(clamp(position.y, halfHeight, frame.height - halfHeight)),
  };
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function rotateVector(
  vector: { x: number; y: number },
  degrees: number,
) {
  const radians = degreesToRadians(degrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function inverseRotateVector(
  vector: { x: number; y: number },
  degrees: number,
) {
  return rotateVector(vector, -degrees);
}

function normalizeAngle(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function normalizeSignedRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function snapRotation(degrees: number) {
  const normalized = normalizeAngle(degrees);
  const snapAngles = [0, 90, 180, 270, 360];
  const snapTarget = snapAngles.find(
    (angle) => Math.abs(normalized - angle) <= angleSnapThreshold,
  );

  if (snapTarget === undefined) {
    return { rotation: normalizeSignedRotation(degrees), snapped: false };
  }

  const target = snapTarget === 360 ? 0 : snapTarget;
  return {
    rotation: normalizeSignedRotation(degrees + target - normalized),
    snapped: true,
  };
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
  return {
    min: Math.min(...projections),
    max: Math.max(...projections),
  };
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

function getAlignedPosition(
  region: RoiRegion,
  position: Point,
  regions: RoiRegion[],
  frame: CameraFrame,
) {
  let nextPosition = position;
  const assist: RoiAssist = { message: "" };

  regions
    .filter((item) => item.index !== region.index)
    .forEach((otherRegion) => {
      if (Math.abs(otherRegion.x - nextPosition.x) <= alignmentSnapThreshold) {
        nextPosition = { ...nextPosition, x: otherRegion.x };
        assist.verticalX = otherRegion.x;
        assist.message = "products.roiAssistAligned";
      }

      if (Math.abs(otherRegion.y - nextPosition.y) <= alignmentSnapThreshold) {
        nextPosition = { ...nextPosition, y: otherRegion.y };
        assist.horizontalY = otherRegion.y;
        assist.message = "products.roiAssistAligned";
      }
    });

  return {
    position: clampRegionCenter(region, nextPosition, frame),
    assist: assist.message ? assist : null,
  };
}

function getEqualSpacingAssist(regions: RoiRegion[]): RoiAssist | null {
  if (regions.length < 3) {
    return null;
  }

  const horizontalChain = getEqualSpacingChain(
    [...regions].sort((a, b) => a.x - b.x),
    "horizontal",
  );

  if (horizontalChain) {
    return horizontalChain;
  }

  const verticalChain = getEqualSpacingChain(
    [...regions].sort((a, b) => a.y - b.y),
    "vertical",
  );

  if (verticalChain) {
    return verticalChain;
  }

  return null;
}

function getEqualSpacingChain(
  sortedRegions: RoiRegion[],
  orientation: "horizontal" | "vertical",
) {
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
        Math.abs(gap - baseGap) <= spacingSnapThreshold &&
        crossDelta <= alignmentSnapThreshold * 2
      ) {
        chain = [...chain, sortedRegions[index]];
      } else {
        break;
      }
    }

    if (chain.length >= 3 && chain.length > bestChain.length) {
      bestChain = chain;
    }
  }

  if (bestChain.length < 3) {
    return null;
  }

  const cross = Math.round(
    bestChain.reduce((sum, region) => sum + region[crossAxis], 0) /
      bestChain.length,
  );

  return {
    message: "products.roiAssistEqualSpacing",
    horizontalY: orientation === "horizontal" ? cross : undefined,
    verticalX: orientation === "vertical" ? cross : undefined,
    spacingGuides: bestChain.slice(0, -1).map((region, index) => ({
      orientation,
      from: region[mainAxis],
      to: bestChain[index + 1][mainAxis],
      cross,
    })),
  };
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

  return {
    x: region.x + oppositeWorld.x,
    y: region.y + oppositeWorld.y,
  };
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
  } catch {
    // Some browsers/Electron builds reject capture after pointer lock/cancel.
    // ROI editing must continue without crashing the UI.
  }
}

export function ProductProfileForm({
  product,
  products,
  saving,
  onCancel,
  onSubmit,
}: ProductProfileFormProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ProductProfilePayload>(() =>
    toDraft(product),
  );
  const [copySourceId, setCopySourceId] = useState("");
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [loadingCameraDevices, setLoadingCameraDevices] = useState(false);
  const [cameraDeviceError, setCameraDeviceError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(product));
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [selectedRegionIndex, setSelectedRegionIndex] = useState<number | null>(
    null,
  );
  const [selectedRegionIndexes, setSelectedRegionIndexes] = useState<number[]>(
    [],
  );
  const [copiedRegion, setCopiedRegion] = useState<RoiRegion | null>(null);
  const [roiUndoStack, setRoiUndoStack] = useState<RoiRegion[][]>([]);
  const [roiRedoStack, setRoiRedoStack] = useState<RoiRegion[][]>([]);
  const [draggingRegion, setDraggingRegion] = useState<{
    index: number;
    offset: { x: number; y: number };
    start: Point;
    indexes: number[];
    initialRegions: RoiRegion[];
  } | null>(null);
  const [rotatingRegionIndex, setRotatingRegionIndex] = useState<number | null>(
    null,
  );
  const [resizingRegion, setResizingRegion] = useState<{
    index: number;
    anchor: { x: number; y: number };
    corner: ResizeCorner;
    rotation: number;
    indexes: number[];
    initialRegions: RoiRegion[];
    initialActiveRegion: RoiRegion;
  } | null>(null);
  const [drawingRegion, setDrawingRegion] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);
  const [roiAssist, setRoiAssist] = useState<RoiAssist | null>(null);
  const {
    imageSrc: livePreviewImageSrc,
  } = useConnectedCameraPreview(draft.camera.deviceName);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const modelFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastPreviewPointRef = useRef<Point | null>(null);
  const rotatingSessionRef = useRef<{
    indexes: number[];
    lastClientX: number;
    delta: number;
    initialRotations: Record<number, number>;
    frameId: number | null;
  } | null>(null);
  const rotateCleanupRef = useRef<(() => void) | null>(null);
  const isEditing = Boolean(product);
  const loadInitialCameraDevices = useEffectEvent(() => {
    void refreshCameraDevices(false);
  });

  useEffect(() => {
    loadInitialCameraDevices();
  }, []);

  const roiRegions = useMemo(
    () => [...draft.roiRegions].sort((a, b) => a.index - b.index),
    [draft.roiRegions],
  );
  const cameraFrame = getCameraFrame(draft.camera);
  const overlappingRegionIndexes = useMemo(
    () => getOverlappingRegionIndexes(roiRegions),
    [roiRegions],
  );
  const activeRegionIndexes = useMemo(() => {
    if (
      selectedRegionIndex !== null &&
      selectedRegionIndexes.includes(selectedRegionIndex)
    ) {
      return selectedRegionIndexes;
    }

    return selectedRegionIndex === null ? [] : [selectedRegionIndex];
  }, [selectedRegionIndex, selectedRegionIndexes]);

  function selectRegion(index: number, additive: boolean) {
    if (!additive) {
      setSelectedRegionIndex(index);
      setSelectedRegionIndexes([index]);
      return;
    }

    setSelectedRegionIndexes((current) => {
      const next = current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index];
      setSelectedRegionIndex(next.at(-1) ?? null);
      return next;
    });
  }

  function cloneRegions(regions: RoiRegion[]) {
    return regions.map((region) => ({ ...region }));
  }

  function saveRoiSnapshot() {
    setRoiUndoStack((current) => [...current, cloneRegions(draft.roiRegions)]);
    setRoiRedoStack([]);
  }

  function paintRotatingSession() {
    const session = rotatingSessionRef.current;

    if (!session) {
      return;
    }

    setDraft((current) => ({
      ...current,
      roiRegions: current.roiRegions.map((region) =>
        session.indexes.includes(region.index)
          ? {
              ...region,
              rotation:
                normalizeSignedRotation(
                  (session.initialRotations[region.index] ?? region.rotation) +
                    session.delta,
                ),
            }
          : region,
      ),
    }));
  }

  function updateRotatingSession(clientX: number) {
    const session = rotatingSessionRef.current;

    if (!session) {
      return;
    }

    const horizontalMovement = clientX - session.lastClientX;

    if (horizontalMovement === 0) {
      return;
    }

    session.lastClientX = clientX;
    const activeIndex = session.indexes[0];
    const activeRotation = session.initialRotations[activeIndex] ?? 0;
    const nextDelta = session.delta - horizontalMovement * rotateSensitivity;
    const snappedRotation = snapRotation(activeRotation + nextDelta);
    session.delta = snappedRotation.rotation - activeRotation;
    setRoiAssist(
      snappedRotation.snapped ? { message: "products.roiAssistStraight" } : null,
    );

    if (session.frameId !== null) {
      return;
    }

    session.frameId = window.requestAnimationFrame(() => {
      const activeSession = rotatingSessionRef.current;

      if (!activeSession) {
        return;
      }

      activeSession.frameId = null;
      paintRotatingSession();
    });
  }

  function endRotatingSession() {
    const session = rotatingSessionRef.current;

    if (session?.frameId !== null && session?.frameId !== undefined) {
      window.cancelAnimationFrame(session.frameId);
      session.frameId = null;
    }

    paintRotatingSession();
    rotatingSessionRef.current = null;
    rotateCleanupRef.current?.();
    rotateCleanupRef.current = null;
    setRotatingRegionIndex(null);
    setRoiAssist(null);
  }

  function startRotatingSession(
    indexes: number[],
    clientX: number,
    initialRotations: Record<number, number>,
  ) {
    rotateCleanupRef.current?.();
    setRoiAssist(null);
    rotatingSessionRef.current = {
      indexes,
      lastClientX: clientX,
      delta: 0,
      initialRotations,
      frameId: null,
    };

    function handlePointerMove(event: globalThis.PointerEvent) {
      updateRotatingSession(event.clientX);
    }

    function handleMouseMove(event: MouseEvent) {
      updateRotatingSession(event.clientX);
    }

    function handlePointerUp() {
      endRotatingSession();
    }

    function handleMouseUp() {
      endRotatingSession();
    }

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);
    rotateCleanupRef.current = () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
    };
    setRotatingRegionIndex(indexes[0] ?? null);
  }

  function restoreRoiRegions(regions: RoiRegion[]) {
    setDraft((current) => ({ ...current, roiRegions: cloneRegions(regions) }));
    setSelectedRegionIndex(null);
    setSelectedRegionIndexes([]);
    setDraggingRegion(null);
    endRotatingSession();
    setResizingRegion(null);
    setDrawingRegion(null);
    setRoiAssist(null);
  }

  function undoRoiChange() {
    setRoiUndoStack((undoStack) => {
      const previous = undoStack.at(-1);

      if (!previous) {
        toast.warning(t("products.undoUnavailable"));
        return undoStack;
      }

      setRoiRedoStack((redoStack) => [
        ...redoStack,
        cloneRegions(draft.roiRegions),
      ]);
      restoreRoiRegions(previous);
      toast.success(t("products.undoApplied"));
      return undoStack.slice(0, -1);
    });
  }

  function redoRoiChange() {
    setRoiRedoStack((redoStack) => {
      const next = redoStack.at(-1);

      if (!next) {
        toast.warning(t("products.redoUnavailable"));
        return redoStack;
      }

      setRoiUndoStack((undoStack) => [
        ...undoStack,
        cloneRegions(draft.roiRegions),
      ]);
      restoreRoiRegions(next);
      toast.success(t("products.redoApplied"));
      return redoStack.slice(0, -1);
    });
  }

  function validateDraft() {
    const messages: string[] = [];

    if (draft.code.trim().length === 0) {
      messages.push(t("products.validationCode"));
    }

    if (draft.name.trim().length === 0) {
      messages.push(t("products.validationName"));
    }

    if (draft.batchSize < 1) {
      messages.push(t("products.validationBatchSize"));
    }

    if (draft.roiRegions.length > maxRoiRegions) {
      messages.push(t("products.validationMaxRoi"));
    }

    if (getOverlappingRegionIndexes(draft.roiRegions).size > 0) {
      messages.push(t("products.validationRoiOverlap"));
    }

    setValidationMessages(messages);

    if (messages.length > 0) {
      toast.warning(messages[0]);
      return false;
    }

    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateDraft()) {
      return;
    }

    await onSubmit({
      ...draft,
      code: draft.code.trim(),
      name: draft.name.trim(),
      modelPath: draft.modelPath?.trim() || undefined,
      camera: {
        ...draft.camera,
        deviceName: draft.camera.deviceName?.trim() || undefined,
        rtspUrl: draft.camera.rtspUrl?.trim() || undefined,
      },
      roiRegions: roiRegions.map((region) => ({
        ...region,
        rotation: normalizeSignedRotation(region.rotation),
      })),
    });

    if (!isEditing) {
      setDraft(cloneDraft(defaultDraft));
      setCopySourceId("");
      setAdvancedOpen(false);
      setValidationMessages([]);
      setSelectedRegionIndex(null);
      setSelectedRegionIndexes([]);
      setCopiedRegion(null);
      setRoiUndoStack([]);
      setRoiRedoStack([]);
    }
  }

  function updateNumber(field: keyof ProductProfilePayload, value: string) {
    setDraft((current) => ({ ...current, [field]: Number(value) }));
  }

  async function handleBrowseModelFile() {
    const desktop = getDesktopBridge();

    if (desktop) {
      let result: Awaited<ReturnType<typeof desktop.selectModelFile>>;

      try {
        result = await desktop.selectModelFile();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("error.globalDescription"),
        );
        return;
      }

      if (result.canceled || !result.filePath) {
        return;
      }

      setDraft((current) => ({ ...current, modelPath: result.filePath ?? "" }));
      toast.success(t("products.modelFileSelected"));
      return;
    }

    modelFileInputRef.current?.click();
  }

  function handleModelFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const nativePath = (file as File & { path?: string }).path?.trim();
    const inputValue = event.target.value.trim();
    const browserValue =
      inputValue && !/fakepath/i.test(inputValue) ? inputValue : file.name;
    const resolvedPath = nativePath || browserValue;

    setDraft((current) => ({ ...current, modelPath: resolvedPath }));
    toast.success(t("products.modelFileSelected"));

    if (!nativePath) {
      toast.warning(t("products.modelPathBrowserFallback"));
    }

    event.target.value = "";
  }

  function handleClearModelPath() {
    setDraft((current) => ({ ...current, modelPath: "" }));
    toast.success(t("products.modelFileCleared"));
  }

  function updateCameraNumber(
    field: keyof ProductProfilePayload["camera"],
    value: string,
  ) {
    saveRoiSnapshot();
    setDraft((current) => {
      const numericValue = Number(value);
      const nextValue =
        field === "imageWidth" || field === "imageHeight"
          ? Math.max(1, Math.round(numericValue || 1))
          : numericValue;
      const nextCamera = { ...current.camera, [field]: nextValue };
      const nextFrame = getCameraFrame(nextCamera);
      const shouldClampRois =
        field === "imageWidth" || field === "imageHeight";

      return {
        ...current,
        camera: nextCamera,
        roiRegions: shouldClampRois
          ? current.roiRegions.map((region) => ({
              ...region,
              width: Math.min(region.width, nextFrame.width),
              height: Math.min(region.height, nextFrame.height),
              ...clampRegionCenter(
                {
                  ...region,
                  width: Math.min(region.width, nextFrame.width),
                  height: Math.min(region.height, nextFrame.height),
                },
                region,
                nextFrame,
              ),
            }))
          : current.roiRegions,
      };
    });
  }

  async function refreshCameraDevices(showToast = true) {
    const accessToken = getAccessToken();

    if (!accessToken) {
      setCameraDeviceError(t("users.missingSession"));
      return;
    }

    setLoadingCameraDevices(true);
    setCameraDeviceError("");

    try {
      const response = await listCameraDevices(accessToken);
      setCameraDevices(response.data);

      if (showToast) {
        toast.success(t("products.cameraDevicesLoaded"));
      }
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : t("products.cameraDevicesLoadError");

      setCameraDeviceError(message);

      if (showToast) {
        toast.error(message);
      }
    } finally {
      setLoadingCameraDevices(false);
    }
  }

  function selectCameraDevice(value: string) {
    const selectedDevice = cameraDevices.find(
      (device) => cameraDeviceValue(device) === value,
    );
    const deviceName = selectedDevice?.friendly_name ?? value;

    setDraft((current) => ({
      ...current,
      camera: {
        ...current.camera,
        sourceType: "usb",
        deviceName,
      },
    }));
  }

  function updateRegion(index: number, nextRegion: Partial<RoiRegion>) {
    setDraft((current) => ({
      ...current,
      roiRegions: current.roiRegions.map((region) =>
        region.index === index
          ? {
              ...region,
              ...nextRegion,
              rotation:
                nextRegion.rotation === undefined
                  ? region.rotation
                  : normalizeSignedRotation(nextRegion.rotation),
            }
          : region,
      ),
    }));
  }

  function swapRegionShape(index: number) {
    const region = draft.roiRegions.find((item) => item.index === index);

    if (!region) {
      return;
    }

    saveRoiSnapshot();
    updateRegion(index, {
      width: region.height,
      height: region.width,
    });
    toast.success(t("products.roiShapeSwapped"));
  }

  function handleCopyProfile() {
    const source = products.find((item) => item.id === copySourceId);

    if (!source) {
      toast.warning(t("products.validationTemplate"));
      return;
    }

    if (source.roiRegions.length > maxRoiRegions) {
      toast.warning(t("products.validationMaxRoi"));
    }

    setDraft((current) => ({
      ...current,
      defaultNumber: source.defaultNumber,
      batchSize: source.batchSize,
      exposure: source.exposure,
      thresholdAccept: source.thresholdAccept,
      thresholdMns: source.thresholdMns,
      active: source.active,
      camera: {
        ...source.camera,
        deviceName: source.camera.deviceName ?? "",
        rtspUrl: source.camera.rtspUrl ?? "",
      },
      roiRegions: source.roiRegions
        .slice(0, maxRoiRegions)
        .map((region, index) => ({
          ...region,
          index: index + 1,
          rotation: normalizeSignedRotation(region.rotation),
        })),
    }));
    setSelectedRegionIndex(null);
    setSelectedRegionIndexes([]);
    setCopiedRegion(null);
    setAdvancedOpen(true);
    toast.success(t("products.templateCopied"));
  }

  function createRegionFromDrag(
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) {
    if (draft.roiRegions.length >= maxRoiRegions) {
      toast.warning(t("products.validationMaxRoi"));
      return;
    }

    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    if (width < minRoiSize || height < minRoiSize) {
      return;
    }

    const newIndex = nextRegionIndex(draft.roiRegions);

    saveRoiSnapshot();
    setDraft((current) => {
      return {
        ...current,
        roiRegions: [
          ...current.roiRegions,
          {
            index: newIndex,
            x: Math.round((start.x + end.x) / 2),
            y: Math.round((start.y + end.y) / 2),
            width,
            height,
            rotation: 0,
          },
        ],
      };
    });
    setSelectedRegionIndex(newIndex);
    setSelectedRegionIndexes([newIndex]);
  }

  function removeRegion(index: number) {
    saveRoiSnapshot();
    setDraft((current) => ({
      ...current,
      roiRegions: current.roiRegions
        .filter((region) => region.index !== index)
        .map((region, regionIndex) => ({ ...region, index: regionIndex + 1 })),
    }));
    setSelectedRegionIndex(null);
    setSelectedRegionIndexes([]);
  }

  function handlePreviewPointerMove(event: PointerEvent<HTMLDivElement>) {
    const nextPosition = regionFromPointer(
      event,
      previewRef.current,
      draft.camera,
    );

    if (!nextPosition) {
      return;
    }

    lastPreviewPointRef.current = nextPosition;

    if (drawingRegion) {
      setDrawingRegion((current) =>
        current ? { ...current, current: nextPosition } : current,
      );
      return;
    }

    if (resizingRegion) {
      const direction = getResizeDirection(resizingRegion.corner);
      const localVector = inverseRotateVector(
        {
          x: nextPosition.x - resizingRegion.anchor.x,
          y: nextPosition.y - resizingRegion.anchor.y,
        },
        resizingRegion.rotation,
      );
      const width = Math.max(minRoiSize, direction.x * localVector.x);
      const height = Math.max(minRoiSize, direction.y * localVector.y);
      const centerOffset = rotateVector(
        {
          x: (direction.x * width) / 2,
          y: (direction.y * height) / 2,
        },
        resizingRegion.rotation,
      );
      const nextCenter = {
        x: resizingRegion.anchor.x + centerOffset.x,
        y: resizingRegion.anchor.y + centerOffset.y,
      };
      const nextRegion = {
        index: resizingRegion.index,
        x: nextCenter.x,
        y: nextCenter.y,
        width,
        height,
        rotation: resizingRegion.rotation,
      };

      if (resizingRegion.indexes.length > 1) {
        const activeCenter = clampRegionCenter(
          nextRegion,
          nextCenter,
          cameraFrame,
        );
        const widthScale = width / resizingRegion.initialActiveRegion.width;
        const heightScale = height / resizingRegion.initialActiveRegion.height;

        setDraft((current) => ({
          ...current,
          roiRegions: current.roiRegions.map((item) => {
            const initialRegion = resizingRegion.initialRegions.find(
              (initial) => initial.index === item.index,
            );

            if (!initialRegion) {
              return item;
            }

            if (item.index === resizingRegion.index) {
              return {
                ...item,
                ...activeCenter,
                width,
                height,
              };
            }

            return {
              ...item,
              width: Math.max(minRoiSize, initialRegion.width * widthScale),
              height: Math.max(minRoiSize, initialRegion.height * heightScale),
            };
          }),
        }));
        return;
      }

      updateRegion(resizingRegion.index, {
        ...clampRegionCenter(nextRegion, nextCenter, cameraFrame),
        width,
        height,
      });
      return;
    }

    if (!draggingRegion) {
      return;
    }

    const region = draft.roiRegions.find(
      (item) => item.index === draggingRegion.index,
    );

    if (!region) {
      return;
    }

    if (draggingRegion.indexes.length > 1) {
      const dx = nextPosition.x - draggingRegion.start.x;
      const dy = nextPosition.y - draggingRegion.start.y;

      setDraft((current) => ({
        ...current,
        roiRegions: current.roiRegions.map((item) => {
          const initialRegion = draggingRegion.initialRegions.find(
            (initial) => initial.index === item.index,
          );

          if (!initialRegion) {
            return item;
          }

          return {
            ...item,
            ...clampRegionCenter(
              initialRegion,
              {
                x: initialRegion.x + dx,
                y: initialRegion.y + dy,
              },
              cameraFrame,
            ),
          };
        }),
      }));
      setRoiAssist(null);
      return;
    }

    const alignedRegion = getAlignedPosition(
      region,
      {
        x: nextPosition.x + draggingRegion.offset.x,
        y: nextPosition.y + draggingRegion.offset.y,
      },
      draft.roiRegions,
      cameraFrame,
    );

    updateRegion(draggingRegion.index, alignedRegion.position);

    const projectedRegions = draft.roiRegions.map((item) =>
      item.index === draggingRegion.index
        ? { ...item, ...alignedRegion.position }
        : item,
    );
    const spacingAssist = getEqualSpacingAssist(projectedRegions);

    setRoiAssist(
      spacingAssist
        ? { ...alignedRegion.assist, ...spacingAssist }
        : alignedRegion.assist,
    );
  }

  function handlePreviewPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    if (draft.roiRegions.length >= maxRoiRegions) {
      toast.warning(t("products.validationMaxRoi"));
      return;
    }

    const start = regionFromPointer(event, previewRef.current, draft.camera);

    if (!start) {
      return;
    }

    lastPreviewPointRef.current = start;
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    event.currentTarget.focus();
    setSelectedRegionIndex(null);
    setSelectedRegionIndexes([]);
    setRoiAssist(null);
    setDrawingRegion({ start, current: start });
  }

  function finishDrawingRegion() {
    if (rotatingRegionIndex !== null) {
      return;
    }

    if (drawingRegion) {
      createRegionFromDrag(drawingRegion.start, drawingRegion.current);
      setDrawingRegion(null);
    }

    setDraggingRegion(null);
    setResizingRegion(null);
    setRoiAssist(null);
  }

  function handleRegionPointerDown(
    event: PointerEvent<HTMLDivElement>,
    index: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const pointerPosition = regionFromPointer(
      event,
      previewRef.current,
      draft.camera,
    );
    const region = draft.roiRegions.find((item) => item.index === index);

    if (!pointerPosition || !region) {
      return;
    }

    lastPreviewPointRef.current = pointerPosition;
    previewRef.current?.focus();
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    saveRoiSnapshot();
    selectRegion(index, event.shiftKey);
    const nextSelectedIndexes = event.shiftKey
      ? selectedRegionIndexes.includes(index)
        ? selectedRegionIndexes.filter((item) => item !== index)
        : [...selectedRegionIndexes, index]
      : selectedRegionIndexes.includes(index)
        ? selectedRegionIndexes
        : [index];

    setDraggingRegion({
      index,
      offset: {
        x: region.x - pointerPosition.x,
        y: region.y - pointerPosition.y,
      },
      start: pointerPosition,
      indexes: nextSelectedIndexes,
      initialRegions: draft.roiRegions
        .filter((item) => nextSelectedIndexes.includes(item.index))
        .map((item) => ({ ...item })),
    });
  }

  function handleRotatePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const region = draft.roiRegions.find((item) => item.index === index);

    if (!region) {
      return;
    }

    previewRef.current?.focus();
    saveRoiSnapshot();
    selectRegion(index, event.shiftKey);
    setDraggingRegion(null);
    setResizingRegion(null);
    const rotateIndexes = activeRegionIndexes.includes(index)
      ? activeRegionIndexes
      : [index];
    const initialRotations = Object.fromEntries(
      draft.roiRegions
        .filter((item) => rotateIndexes.includes(item.index))
        .map((item) => [item.index, item.rotation]),
    );

    startRotatingSession(rotateIndexes, event.clientX, initialRotations);
  }

  function handleResizePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    index: number,
    corner: ResizeCorner,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const region = draft.roiRegions.find((item) => item.index === index);

    if (!region) {
      return;
    }

    previewRef.current?.focus();
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    saveRoiSnapshot();
    selectRegion(index, event.shiftKey);
    setDraggingRegion(null);
    endRotatingSession();
    const resizeIndexes = activeRegionIndexes.includes(index)
      ? activeRegionIndexes
      : [index];
    setResizingRegion({
      index,
      anchor: getResizeAnchor(region, corner),
      corner,
      rotation: region.rotation,
      indexes: resizeIndexes,
      initialRegions: draft.roiRegions
        .filter((item) => resizeIndexes.includes(item.index))
        .map((item) => ({ ...item })),
      initialActiveRegion: { ...region },
    });
  }

  function copySelectedRegion() {
    const region = draft.roiRegions.find(
      (item) => item.index === selectedRegionIndex,
    );

    if (!region) {
      toast.warning(t("products.selectRoiFirst"));
      return;
    }

    setCopiedRegion({ ...region });
    toast.success(t("products.roiCopied"));
  }

  function duplicateSelectedRegion() {
    const region = draft.roiRegions.find(
      (item) => item.index === selectedRegionIndex,
    );

    if (!region) {
      toast.warning(t("products.selectRoiFirst"));
      return;
    }

    if (draft.roiRegions.length >= maxRoiRegions) {
      toast.warning(t("products.validationMaxRoi"));
      return;
    }

    const newIndex = nextRegionIndex(draft.roiRegions);
    const pastedRegion = clampRegionCenter(
      region,
      {
        x: region.x + pasteOffset,
        y: region.y + pasteOffset,
      },
      cameraFrame,
    );

    setCopiedRegion({ ...region });
    saveRoiSnapshot();
    setDraft((current) => ({
      ...current,
      roiRegions: [
        ...current.roiRegions,
        {
          ...region,
          ...pastedRegion,
          index: newIndex,
          rotation: normalizeSignedRotation(region.rotation),
        },
      ],
    }));
    setSelectedRegionIndex(newIndex);
    setSelectedRegionIndexes([newIndex]);
    lastPreviewPointRef.current = pastedRegion;
    toast.success(t("products.roiPasted"));
  }

  function pasteRegion() {
    if (!copiedRegion) {
      toast.warning(t("products.copyRoiFirst"));
      return;
    }

    if (draft.roiRegions.length >= maxRoiRegions) {
      toast.warning(t("products.validationMaxRoi"));
      return;
    }

    const newIndex = nextRegionIndex(draft.roiRegions);
    const pastePoint = lastPreviewPointRef.current ?? {
      x: copiedRegion.x + pasteOffset,
      y: copiedRegion.y + pasteOffset,
    };
    const pastedRegion = clampRegionCenter(
      copiedRegion,
      {
        x: pastePoint.x,
        y: pastePoint.y,
      },
      cameraFrame,
    );

    saveRoiSnapshot();
    setDraft((current) => ({
      ...current,
      roiRegions: [
        ...current.roiRegions,
        {
          ...copiedRegion,
          ...pastedRegion,
          index: newIndex,
          rotation: normalizeSignedRotation(copiedRegion.rotation),
        },
      ],
    }));
    setSelectedRegionIndex(newIndex);
    setSelectedRegionIndexes([newIndex]);
    toast.success(t("products.roiPasted"));
  }

  function removeSelectedRegions() {
    if (activeRegionIndexes.length === 0) {
      toast.warning(t("products.selectRoiFirst"));
      return;
    }

    saveRoiSnapshot();
    setDraft((current) => ({
      ...current,
      roiRegions: current.roiRegions
        .filter((region) => !activeRegionIndexes.includes(region.index))
        .map((region, regionIndex) => ({
          ...region,
          index: regionIndex + 1,
        })),
    }));
    setSelectedRegionIndex(null);
    setSelectedRegionIndexes([]);
    toast.success(t("products.roiDeleted"));
  }

  function handlePreviewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redoRoiChange();
        return;
      }
      undoRoiChange();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoRoiChange();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      if (activeRegionIndexes.length > 0) {
        event.preventDefault();
        removeSelectedRegions();
      }
      return;
    }

    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }

    if (event.key.toLowerCase() === "c") {
      event.preventDefault();
      copySelectedRegion();
      return;
    }

    if (event.key.toLowerCase() === "v") {
      event.preventDefault();
      pasteRegion();
    }
  }

  return (
    <Card className="p-4 shadow-none">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-950">
              {isEditing
                ? t("products.editProfile")
                : t("products.createProfile")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("products.profileHint")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-12 px-5 text-base"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-12 px-5 text-base"
            >
              {isEditing ? (
                <Save className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {saving
                ? t("products.saving")
                : isEditing
                  ? t("products.saveProfile")
                  : t("products.createProfile")}
            </Button>
          </div>
        </div>

        {validationMessages.length > 0 ? (
          <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {validationMessages.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </div>
        ) : null}

        <section className="border border-slate-200 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-950">
            {t("products.groupBasic")}
          </div>
          <div className="grid gap-4 min-[900px]:grid-cols-4">
            <TextField
              label={`${t("products.code")} *`}
              value={draft.code}
              hint={t("products.codeHint")}
              onChange={(value) =>
                setDraft((current) => ({ ...current, code: value }))
              }
            />
            <TextField
              label={`${t("products.name")} *`}
              value={draft.name}
              onChange={(value) =>
                setDraft((current) => ({ ...current, name: value }))
              }
            />
            <div className="block text-sm font-medium text-slate-700 min-[900px]:col-span-2">
              {t("products.modelPath")}
              <div className="mt-2 flex flex-col gap-2 min-[900px]:flex-row">
                <Input
                  value={draft.modelPath ?? ""}
                  inputMode="text"
                  autoComplete="off"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      modelPath: event.target.value,
                    }))
                  }
                  className="h-12 flex-1 text-base"
                />
                <input
                  ref={modelFileInputRef}
                  type="file"
                  accept=".onnx,.pt,.pth,.engine,.xml,.bin,.trt,.tflite,.pb"
                  className="hidden"
                  onChange={handleModelFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 px-4 text-base"
                  onClick={handleBrowseModelFile}
                >
                  {t("products.browseModel")}
                </Button>
                {draft.modelPath ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 px-4 text-base"
                    onClick={handleClearModelPath}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    {t("products.clearModelPath")}
                  </Button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {t("products.modelPathHint")}
              </p>
            </div>
            <NumberField
              label={t("products.batchSize")}
              value={draft.batchSize}
              min={1}
              onChange={(value) => updateNumber("batchSize", value)}
            />
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {t("products.touchHint")}
          </p>
        </section>

        <section className="border border-slate-200 p-4">
          <div className="grid gap-3 min-[900px]:grid-cols-[minmax(220px,320px)_auto_1fr] min-[900px]:items-end">
            <label className="block text-sm font-medium text-slate-700">
              {t("products.templateProfile")}
              <Select
                value={copySourceId}
                onChange={(event) => setCopySourceId(event.target.value)}
                className="mt-2 flex h-12 w-full border border-slate-300 bg-white px-4 py-2 text-base text-slate-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="">{t("products.selectTemplate")}</option>
                {products
                  .filter((item) => item.id !== product?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code}
                    </option>
                  ))}
              </Select>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyProfile}
              disabled={products.length === 0}
              className="h-12 px-5 text-base"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              {t("products.copyTemplate")}
            </Button>
            <p className="text-sm text-slate-500">
              {t("products.copyTemplateHint")}
            </p>
          </div>
        </section>

        <Button
          type="button"
          variant="outline"
          onClick={() => setAdvancedOpen((current) => !current)}
          className="h-12 w-full justify-between px-5 text-base"
        >
          {t("products.advancedProfile")}
          <ChevronDown
            className={advancedOpen ? "h-4 w-4 rotate-180" : "h-4 w-4"}
            aria-hidden="true"
          />
        </Button>

        {advancedOpen ? (
          <div className="space-y-4">
            <section className="border border-slate-200 p-4">
              <div className="mb-3 font-semibold">
                {t("products.groupProduct")}
              </div>
              <div className="grid gap-4 min-[900px]:grid-cols-4">
                <NumberField
                  label={t("products.defaultNumber")}
                  value={draft.defaultNumber}
                  onChange={(value) => updateNumber("defaultNumber", value)}
                />
                <NumberField
                  label={t("products.exposure")}
                  value={draft.exposure}
                  onChange={(value) => updateNumber("exposure", value)}
                />
                <NumberField
                  label={t("products.thresholdAccept")}
                  value={draft.thresholdAccept}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateNumber("thresholdAccept", value)}
                />
                <NumberField
                  label={t("products.thresholdMns")}
                  value={draft.thresholdMns}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateNumber("thresholdMns", value)}
                />
              </div>
            </section>

            <section className="border border-slate-200 p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-semibold">{t("products.groupCamera")}</div>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("products.cameraSelectHint")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void refreshCameraDevices()}
                  disabled={loadingCameraDevices}
                  className="h-11 px-4"
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                  {loadingCameraDevices
                    ? t("products.cameraDevicesLoading")
                    : t("products.refreshCameraDevices")}
                </Button>
              </div>
              <div className="grid gap-4 min-[900px]:grid-cols-[minmax(180px,0.7fr)_minmax(260px,1.3fr)_repeat(2,minmax(0,1fr))]">
                <label className="block text-sm font-medium text-slate-700">
                  {t("products.sourceType")}
                  <Select
                    value={draft.camera.sourceType}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        camera: {
                          ...current.camera,
                          sourceType: event.target.value,
                        },
                      }))
                    }
                    className="mt-2 flex h-12 w-full border border-slate-300 bg-white px-4 py-2 text-base text-slate-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  >
                    <option value="usb">{t("products.cameraSourceUsb")}</option>
                    <option value="rtsp">{t("products.cameraSourceRtsp")}</option>
                  </Select>
                </label>
                {draft.camera.sourceType === "usb" ? (
                  <label className="block text-sm font-medium text-slate-700">
                    {t("products.deviceName")}
                    <Select
                      value={draft.camera.deviceName ?? ""}
                      onChange={(event) => selectCameraDevice(event.target.value)}
                      className="mt-2 flex h-12 w-full border border-slate-300 bg-white px-4 py-2 text-base text-slate-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                    >
                      <option value="">
                        {loadingCameraDevices
                          ? t("products.cameraDevicesLoading")
                          : t("products.selectCameraDevice")}
                      </option>
                      {cameraDevices.map((device) => (
                        <option
                          key={`${device.index}-${device.serial_number ?? device.friendly_name}`}
                          value={cameraDeviceValue(device)}
                        >
                          #{device.index} {device.friendly_name}
                          {device.serial_number ? ` · ${device.serial_number}` : ""}
                        </option>
                      ))}
                      {draft.camera.deviceName &&
                      !cameraDevices.some(
                        (device) =>
                          cameraDeviceValue(device) === draft.camera.deviceName,
                      ) ? (
                        <option value={draft.camera.deviceName}>
                          {draft.camera.deviceName}
                        </option>
                      ) : null}
                    </Select>
                    {cameraDeviceError ? (
                      <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {t("products.cameraManualFallback")}
                      </div>
                    ) : null}
                  </label>
                ) : (
                  <TextField
                    label={t("products.rtspUrl")}
                    value={draft.camera.rtspUrl ?? ""}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        camera: { ...current.camera, rtspUrl: value },
                      }))
                    }
                  />
                )}
                {draft.camera.sourceType === "usb" && cameraDeviceError ? (
                  <TextField
                    label={t("products.manualDeviceName")}
                    value={draft.camera.deviceName ?? ""}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        camera: { ...current.camera, deviceName: value },
                      }))
                    }
                  />
                ) : null}
                {draft.camera.sourceType !== "usb" ? null : (
                  <div className="hidden min-[900px]:block" />
                )}
                {/* Preserve direct source editing for unsupported future camera types. */}
                {draft.camera.sourceType !== "usb" &&
                draft.camera.sourceType !== "rtsp" ? (
                  <TextField
                  label={t("products.sourceType")}
                  value={draft.camera.sourceType}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      camera: { ...current.camera, sourceType: value },
                    }))
                  }
                  />
                ) : null}
                <NumberField
                  label={t("products.cameraExposure")}
                  value={draft.camera.exposure}
                  onChange={(value) => updateCameraNumber("exposure", value)}
                />
                <NumberField
                  label={t("products.zoomFactor")}
                  value={draft.camera.zoomFactor}
                  step={0.01}
                  onChange={(value) => updateCameraNumber("zoomFactor", value)}
                />
              </div>
              <div className="mt-4 grid gap-4 min-[900px]:grid-cols-4">
                <NumberField
                  label={t("products.imageWidth")}
                  value={draft.camera.imageWidth}
                  min={1}
                  onChange={(value) => updateCameraNumber("imageWidth", value)}
                />
                <NumberField
                  label={t("products.imageHeight")}
                  value={draft.camera.imageHeight}
                  min={1}
                  onChange={(value) => updateCameraNumber("imageHeight", value)}
                />
                <NumberField
                  label={t("products.offsetX")}
                  value={draft.camera.offsetX}
                  onChange={(value) => updateCameraNumber("offsetX", value)}
                />
                <NumberField
                  label={t("products.offsetY")}
                  value={draft.camera.offsetY}
                  onChange={(value) => updateCameraNumber("offsetY", value)}
                />
              </div>
            </section>

            <section className="border border-slate-200 p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-semibold">{t("products.groupRoi")}</div>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("products.roiPreviewHint")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("products.roiShortcutHint")}
                  </p>
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="border border-cyan-200 bg-cyan-50 px-3 py-2 text-cyan-900">
                    {t("products.drawRoiHint")}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={duplicateSelectedRegion}
                      disabled={
                        selectedRegionIndex === null ||
                        roiRegions.length >= maxRoiRegions
                      }
                      className="h-12 px-4 text-base"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      {t("products.duplicateRoi")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={removeSelectedRegions}
                      disabled={activeRegionIndexes.length === 0}
                      className="h-12 px-4 text-base"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      {t("products.deleteSelectedRoi")}
                    </Button>
                    <div className="flex-1 border border-slate-200 bg-white px-3 py-2 text-slate-600">
                      {roiRegions.length}/{maxRoiRegions}{" "}
                      {t("products.roiLimit")}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={roiUndoStack.length === 0}
                      onClick={undoRoiChange}
                      aria-label={t("products.undoRoi")}
                      className="h-12 w-12"
                    >
                      <Undo2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={roiRedoStack.length === 0}
                      onClick={redoRoiChange}
                      aria-label={t("products.redoRoi")}
                      className="h-12 w-12"
                    >
                      <Redo2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>

              <div
                ref={previewRef}
                tabIndex={0}
                className="relative aspect-[3/1] w-full touch-none overflow-hidden border border-slate-700 bg-black outline-none focus:ring-2 focus:ring-cyan-400"
                onPointerDown={handlePreviewPointerDown}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={finishDrawingRegion}
                onPointerLeave={finishDrawingRegion}
                onKeyDown={handlePreviewKeyDown}
              >
                <div className="pointer-events-none absolute left-3 top-3 border border-white/20 bg-black/70 px-2 py-1 text-xs text-white">
                  {cameraFrame.width} x {cameraFrame.height}
                </div>
                <div className="pointer-events-none absolute right-3 top-3 z-20 grid max-w-[min(360px,calc(100%-96px))] gap-2 text-xs">
                  {roiAssist ? (
                    <div className="border border-amber-300/70 bg-amber-100/95 px-3 py-2 font-medium text-amber-950 shadow-sm">
                      {t(roiAssist.message)}
                    </div>
                  ) : null}
                  {overlappingRegionIndexes.size > 0 ? (
                    <div className="border border-red-300/80 bg-red-50/95 px-3 py-2 font-medium text-red-800 shadow-sm">
                      {t("products.validationRoiOverlap")}
                    </div>
                  ) : null}
                </div>
                <CameraPreviewTransformLayer
                  className="overflow-visible"
                  imageSource={livePreviewImageSrc}
                  imageHeight={cameraFrame.height}
                  imageWidth={cameraFrame.width}
                  zoomFactor={draft.camera.zoomFactor}
                  previewPanX={draft.camera.previewPanX}
                  previewPanY={draft.camera.previewPanY}
                  previewRotation={draft.camera.previewRotation}
                >
                  {livePreviewImageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={livePreviewImageSrc}
                      alt=""
                      draggable={false}
                      className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain opacity-95"
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:10%_20%]" />
                  {roiAssist?.verticalX !== undefined ? (
                    <div
                      className="pointer-events-none absolute top-0 h-full w-px bg-amber-300"
                      style={{
                        left: `${(roiAssist.verticalX / cameraFrame.width) * 100}%`,
                      }}
                    />
                  ) : null}
                  {roiAssist?.horizontalY !== undefined ? (
                    <div
                      className="pointer-events-none absolute left-0 h-px w-full bg-amber-300"
                      style={{
                        top: `${(roiAssist.horizontalY / cameraFrame.height) * 100}%`,
                      }}
                    />
                  ) : null}
                  {roiAssist?.spacingGuides?.map((guide, index) => {
                    const from = Math.min(guide.from, guide.to);
                    const to = Math.max(guide.from, guide.to);
                    const midpoint = (from + to) / 2;

                    if (guide.orientation === "horizontal") {
                      return (
                        <div
                          key={`${guide.orientation}-${index}`}
                          className="pointer-events-none absolute z-10 h-px bg-amber-300"
                          style={{
                            left: `${(from / cameraFrame.width) * 100}%`,
                            top: `${(guide.cross / cameraFrame.height) * 100}%`,
                            width: `${((to - from) / cameraFrame.width) * 100}%`,
                          }}
                        >
                          <span
                            className="absolute -top-3 border border-amber-300 bg-black/80 px-1 text-[10px] font-bold text-amber-200"
                            style={{
                              left: `${((midpoint - from) / (to - from || 1)) * 100}%`,
                              transform: "translateX(-50%)",
                            }}
                          >
                            =
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${guide.orientation}-${index}`}
                        className="pointer-events-none absolute z-10 w-px bg-amber-300"
                        style={{
                          left: `${(guide.cross / cameraFrame.width) * 100}%`,
                          top: `${(from / cameraFrame.height) * 100}%`,
                          height: `${((to - from) / cameraFrame.height) * 100}%`,
                        }}
                      >
                        <span
                          className="absolute -left-2 border border-amber-300 bg-black/80 px-1 text-[10px] font-bold text-amber-200"
                          style={{
                            top: `${((midpoint - from) / (to - from || 1)) * 100}%`,
                            transform: "translateY(-50%)",
                          }}
                        >
                          =
                        </span>
                      </div>
                    );
                  })}
                  {roiRegions.map((region) => (
                    <div
                      key={region.index}
                      onPointerDown={(event) =>
                        handleRegionPointerDown(event, region.index)
                      }
                      className={[
                        "absolute flex cursor-move items-center justify-center border-2 bg-cyan-400/20 text-xs font-bold text-cyan-100 outline-none ring-4 hover:bg-cyan-400/30",
                        overlappingRegionIndexes.has(region.index)
                          ? "border-red-400 ring-red-400/30"
                          : selectedRegionIndexes.includes(region.index)
                          ? "border-amber-300 ring-amber-300/25"
                          : "border-cyan-300 ring-cyan-500/10",
                      ].join(" ")}
                      style={{
                        left: `${((region.x - region.width / 2) / cameraFrame.width) * 100}%`,
                        top: `${((region.y - region.height / 2) / cameraFrame.height) * 100}%`,
                        width: `${(region.width / cameraFrame.width) * 100}%`,
                        height: `${(region.height / cameraFrame.height) * 100}%`,
                        transform: `rotate(${region.rotation}deg)`,
                      }}
                      title={`ROI ${region.index}: ${region.x}, ${region.y}`}
                    >
                      <div className="absolute -top-7 left-1/2 flex -translate-x-1/2 gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-6 w-6 cursor-grab border-cyan-200 bg-black/80 text-cyan-50 hover:bg-slate-900 active:cursor-grabbing"
                          onPointerDown={(event) =>
                            handleRotatePointerDown(event, region.index)
                          }
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`${t("products.rotateRoi")} ROI ${region.index}`}
                        >
                          <RotateCw className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                      {(["nw", "ne", "sw", "se"] as ResizeCorner[]).map(
                        (corner) => (
                          <button
                            key={corner}
                            type="button"
                            onPointerDown={(event) =>
                              handleResizePointerDown(
                                event,
                                region.index,
                                corner,
                              )
                            }
                            onClick={(event) => event.stopPropagation()}
                            className={[
                              "absolute h-3 w-3 border border-white bg-amber-300 outline-none ring-2 ring-black/30",
                              corner === "nw"
                                ? "-left-1.5 -top-1.5 cursor-nwse-resize"
                                : "",
                              corner === "ne"
                                ? "-right-1.5 -top-1.5 cursor-nesw-resize"
                                : "",
                              corner === "sw"
                                ? "-bottom-1.5 -left-1.5 cursor-nesw-resize"
                                : "",
                              corner === "se"
                                ? "-bottom-1.5 -right-1.5 cursor-nwse-resize"
                                : "",
                            ].join(" ")}
                            aria-label={`${t("products.resizeRoi")} ROI ${region.index}`}
                          />
                        ),
                      )}
                      <span className="pointer-events-none absolute left-1 top-1 border border-white/30 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {t(
                          region.width > region.height
                            ? "products.roiLandscape"
                            : region.width < region.height
                              ? "products.roiPortrait"
                              : "products.roiSquare",
                        )}
                      </span>
                      {region.index}
                    </div>
                  ))}
                  {drawingRegion ? (
                    <div
                      className="pointer-events-none absolute border-2 border-amber-300 bg-amber-300/20"
                      style={{
                        left: `${
                          (Math.min(
                            drawingRegion.start.x,
                            drawingRegion.current.x,
                          ) /
                            cameraFrame.width) *
                          100
                        }%`,
                        top: `${
                          (Math.min(
                            drawingRegion.start.y,
                            drawingRegion.current.y,
                          ) /
                            cameraFrame.height) *
                          100
                        }%`,
                        width: `${
                          (Math.abs(
                            drawingRegion.current.x - drawingRegion.start.x,
                          ) /
                            cameraFrame.width) *
                          100
                        }%`,
                        height: `${
                          (Math.abs(
                            drawingRegion.current.y - drawingRegion.start.y,
                          ) /
                            cameraFrame.height) *
                          100
                        }%`,
                      }}
                    />
                  ) : null}
                </CameraPreviewTransformLayer>
              </div>

              <div className="mt-3 grid gap-2">
                {roiRegions.map((region) => (
                  <div
                    key={region.index}
                    className="grid grid-cols-[52px_repeat(5,minmax(0,1fr))_86px_48px_48px] gap-2"
                  >
                    <div className="flex h-12 items-center border border-slate-200 px-3 text-base font-semibold">
                      {region.index}
                    </div>
                    <RegionNumber
                      value={region.x}
                      max={cameraFrame.width}
                      onChange={(value) => updateRegion(region.index, { x: value })}
                    />
                    <RegionNumber
                      value={region.y}
                      max={cameraFrame.height}
                      onChange={(value) => updateRegion(region.index, { y: value })}
                    />
                    <RegionNumber
                      value={region.width}
                      min={1}
                      max={cameraFrame.width}
                      onChange={(value) =>
                        updateRegion(region.index, { width: value })
                      }
                    />
                    <RegionNumber
                      value={region.height}
                      min={1}
                      max={cameraFrame.height}
                      onChange={(value) =>
                        updateRegion(region.index, { height: value })
                      }
                    />
                    <RegionNumber
                      value={region.rotation}
                      min={-360}
                      max={360}
                      onChange={(value) =>
                        updateRegion(region.index, { rotation: value })
                      }
                    />
                    <div className="flex h-12 items-center justify-center border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
                      {t(
                        region.width > region.height
                          ? "products.roiLandscape"
                          : region.width < region.height
                            ? "products.roiPortrait"
                            : "products.roiSquare",
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => swapRegionShape(region.index)}
                      aria-label={`${t("products.swapRoiShape")} ${region.index}`}
                      className="h-12 w-12"
                    >
                      <RotateCw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeRegion(region.index)}
                      disabled={roiRegions.length <= 1}
                      aria-label={`${t("products.removeRoiPoint")} ${region.index}`}
                      className="h-12 w-12"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-slate-200 p-4">
              <div className="mb-3 font-semibold">
                {t("products.groupStatus")}
              </div>
              <label className="block max-w-xs text-sm font-medium text-slate-700">
                {t("products.status")}
                <Select
                  value={draft.active ? "active" : "inactive"}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      active: event.target.value === "active",
                    }))
                  }
                  className="mt-2 flex h-12 w-full border border-slate-300 bg-white px-4 py-2 text-base text-slate-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="active">{t("products.active")}</option>
                  <option value="inactive">{t("products.inactive")}</option>
                </Select>
              </label>
            </section>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function TextField({
  label,
  value,
  className,
  hint,
  inputMode = "text",
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  className?: string;
  hint?: string;
  inputMode?: ComponentProps<"input">["inputMode"];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={["block text-sm font-medium text-slate-700", className].filter(Boolean).join(" ")}>
      {label}
      <Input
        value={value}
        inputMode={inputMode}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 text-base"
      />
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </label>
  );
}

function NumberField({
  label,
  value,
  min = 0,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 text-base"
      />
    </label>
  );
}

function RegionNumber({
  value,
  min = 0,
  max,
  onChange,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      inputMode="numeric"
      value={value}
      onChange={(event) =>
        onChange(clamp(Number(event.target.value), min, max))
      }
      className="h-12 text-base"
    />
  );
}
