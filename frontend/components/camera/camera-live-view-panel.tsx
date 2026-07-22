"use client";

import {
  BrainCircuit,
  Camera,
  PackageSearch,
  RefreshCcw,
  ScanEye,
  ScanLine,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListboxSelect } from "@/components/ui/listbox-select";
import {
  CameraImageViewer,
  type CameraLiveStats,
  type CameraViewTransform,
} from "@/components/camera/camera-image-viewer";
import { CameraSettingsForm } from "@/components/camera/camera-settings-form";
import { CameraDebugPanel } from "@/components/camera/camera-debug-panel";
import { CameraConnectionTestPanel } from "@/components/camera/camera-connection-test-panel";
import {
  ConfigurationInspectionTestPanel,
  type ConfigurationTestPreview,
} from "@/components/camera/configuration-inspection-test-panel";
import { CameraIdentitiesPanel } from "@/components/camera/camera-identities-panel";
import { CameraRoiOverlay } from "@/components/camera/camera-roi-overlay";
import { RoiSettingsPanel } from "@/components/camera/roi-settings-panel";
import {
  cloneRoiRegions,
  getOverlappingRegionIndexes,
  normalizeConfigurationRois,
  type RoiAssist,
} from "@/components/camera/roi-editor-geometry";
import { ProductProfilesPanel } from "@/components/products/product-profiles-panel";
import { AiSettingsPanel } from "@/components/settings/ai-settings-panel";
import {
  formatCameraApiError,
  formatCameraErrorMessage,
} from "@/components/camera/camera-error";
import {
  connectCamera,
  disconnectCamera,
  getCameraAiResultsUrl,
  getCameraRanges,
  getCameraStatus,
  getCameraStreamUrl,
  DEFAULT_CAMERA_STREAM_JPEG_QUALITY,
  DEFAULT_CAMERA_STREAM_MAX_WIDTH,
  grabCameraFrame,
  listCameraDevices,
  listProductProfiles,
  startCameraAi,
  stopCameraAi,
  updateProductProfile,
  type CameraDevice,
  type CameraFrame,
  type CameraHardwareRanges,
  type CameraProfile,
  type CameraRuntimeStatus,
  type ProductProfile,
  type ProductProfilePayload,
  type SessionUser,
  type TestInspectionImageResult,
} from "@/lib/api";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { getAccessToken, getStoredUser } from "@/lib/session";

type ConfigurationTab =
  | "products"
  | "ai"
  | "roi"
  | "camera"
  | "identities"
  | "debug";

type CameraLiveViewPanelProps = {
  configurationMode?: boolean;
};

type ConfigurationTabDefinition = {
  id: ConfigurationTab;
  icon: typeof PackageSearch;
  labelKey: TranslationKey;
  permission: string | null;
  devOnly?: boolean;
};

export function CameraLiveViewPanel({ configurationMode = false }: CameraLiveViewPanelProps) {
  const { apiError, t } = useI18n();
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [status, setStatus] = useState<CameraRuntimeStatus | null>(null);
  const [hardwareRanges, setHardwareRanges] =
    useState<CameraHardwareRanges | null>(null);
  const [frame, setFrame] = useState<CameraFrame | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [live, setLive] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiStarting, setAiStarting] = useState(false);
  const [streamFrameUrl, setStreamFrameUrl] = useState("");
  const [liveStats, setLiveStats] = useState<CameraLiveStats | null>(null);
  const [savingView, setSavingView] = useState(false);
  const [applyingCameraSettings, setApplyingCameraSettings] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [activeTab, setActiveTab] = useState<ConfigurationTab>("camera");
  const [roiAssist, setRoiAssist] = useState<RoiAssist | null>(null);
  const [roiSelectedIndexes, setRoiSelectedIndexes] = useState<number[]>([]);
  const [roiUndoStack, setRoiUndoStack] = useState<ProductProfile["roiRegions"][]>([]);
  const [roiRedoStack, setRoiRedoStack] = useState<ProductProfile["roiRegions"][]>([]);
  const [visitedTabs, setVisitedTabs] = useState<Set<ConfigurationTab>>(
    () => new Set(["camera"]),
  );
  const [configurationTestPreview, setConfigurationTestPreview] =
    useState<ConfigurationTestPreview | null>(null);
  const [configurationTestResult, setConfigurationTestResult] =
    useState<TestInspectionImageResult | null>(null);
  const [configurationTestRunning, setConfigurationTestRunning] =
    useState(false);
  const [aiSettingsDirty, setAiSettingsDirty] = useState(false);
  const [cameraSettingsDirty, setCameraSettingsDirty] = useState(false);
  const [productSettingsDirty, setProductSettingsDirty] = useState(false);
  const user = useMemo(() => getStoredUser(), []);
  const canViewDebug = user?.isDev === true;
  const canManageCamera =
    user?.isDev === true || user?.permissions.includes("camera.manage") === true;
  const canRunCameraAi =
    canManageCamera ||
    user?.permissions.includes("inspection.start") === true ||
    user?.permissions.includes("inspection.test") === true;
  const availableTabs = useMemo(
    () => buildConfigurationTabs(user),
    [user],
  );
  const [viewerTransform, setViewerTransform] = useState<CameraViewTransform>({
    zoomFactor: 1,
    previewPanX: 0,
    previewPanY: 0,
    previewRotation: 0,
  });
  const streamSocketRef = useRef<WebSocket | null>(null);
  const aiSocketRef = useRef<WebSocket | null>(null);
  const streamFrameUrlRef = useRef("");
  const streamMetaRef = useRef<StreamFrameMeta | null>(null);
  const streamFrameTimesRef = useRef<number[]>([]);
  const savedRoisRef = useRef(new Map<string, ProductProfile["roiRegions"]>());
  const savedProductsRef = useRef(new Map<string, ProductProfile>());

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );
  const savedSelectedProduct = selectedProduct
    ? (savedProductsRef.current.get(selectedProduct.id) ?? selectedProduct)
    : null;
  const roiSettingsDirty = Boolean(
    selectedProduct &&
      savedSelectedProduct &&
      roiRegionsFingerprint(selectedProduct.roiRegions) !==
        roiRegionsFingerprint(savedSelectedProduct.roiRegions),
  );
  const hasUnsavedConfigurationChanges =
    roiSettingsDirty ||
    aiSettingsDirty ||
    cameraSettingsDirty ||
    productSettingsDirty;
  const overlappingRoiIndexes = useMemo(
    () => getOverlappingRegionIndexes(selectedProduct?.roiRegions ?? []),
    [selectedProduct?.roiRegions],
  );

  const prepareProducts = useCallback((nextProducts: ProductProfile[]) => {
    return nextProducts
      .filter((product) => product.active)
      .map((product) => {
        const roiRegions = normalizeConfigurationRois(product.roiRegions);
        savedRoisRef.current.set(product.id, cloneRoiRegions(roiRegions));
        const normalizedProduct = { ...product, roiRegions };
        savedProductsRef.current.set(
          product.id,
          cloneConfigurationProduct(normalizedProduct),
        );
        return normalizedProduct;
      });
  }, []);

  const handleProductsChanged = useCallback((nextProducts: ProductProfile[]) => {
    const activeProducts = prepareProducts(nextProducts);
    setProducts(activeProducts);
    setSelectedProductId((current) =>
      activeProducts.some((product) => product.id === current)
        ? current
        : (activeProducts[0]?.id ?? ""),
    );
    setRoiUndoStack([]);
    setRoiRedoStack([]);
    setRoiSelectedIndexes([]);
    setRoiAssist(null);
    setConfigurationTestPreview(null);
    setConfigurationTestResult(null);
    setConfigurationTestRunning(false);
  }, [prepareProducts]);

  function handleRoiDraftChange(regions: ProductProfile["roiRegions"]) {
    if (!selectedProduct) return;
    setConfigurationTestResult(null);
    setProducts((current) =>
      current.map((product) =>
        product.id === selectedProduct.id
          ? { ...product, roiRegions: normalizeConfigurationRois(regions) }
          : product,
      ),
    );
  }

  function saveRoiSnapshot() {
    if (!selectedProduct) return;
    setRoiUndoStack((current) => [
      ...current,
      cloneRoiRegions(selectedProduct.roiRegions),
    ]);
    setRoiRedoStack([]);
  }

  function undoRoiChange() {
    const previous = roiUndoStack.at(-1);
    if (!previous || !selectedProduct) {
      toast.warning(t("products.undoUnavailable"));
      return;
    }
    setRoiRedoStack((current) => [
      ...current,
      cloneRoiRegions(selectedProduct.roiRegions),
    ]);
    setRoiUndoStack((current) => current.slice(0, -1));
    handleRoiDraftChange(cloneRoiRegions(previous));
    setRoiSelectedIndexes([]);
    toast.success(t("products.undoApplied"));
  }

  function redoRoiChange() {
    const next = roiRedoStack.at(-1);
    if (!next || !selectedProduct) {
      toast.warning(t("products.redoUnavailable"));
      return;
    }
    setRoiUndoStack((current) => [
      ...current,
      cloneRoiRegions(selectedProduct.roiRegions),
    ]);
    setRoiRedoStack((current) => current.slice(0, -1));
    handleRoiDraftChange(cloneRoiRegions(next));
    setRoiSelectedIndexes([]);
    toast.success(t("products.redoApplied"));
  }

  function resetRoiChanges() {
    if (!selectedProduct) return;
    const savedRegions = savedRoisRef.current.get(selectedProduct.id);
    if (!savedRegions) return;
    saveRoiSnapshot();
    handleRoiDraftChange(cloneRoiRegions(savedRegions));
    setRoiSelectedIndexes([]);
    setRoiAssist(null);
    toast.success(t("configuration.roiResetApplied"));
  }

  function handleSavedRoiProduct(product: ProductProfile) {
    const normalizedProduct = {
      ...product,
      roiRegions: normalizeConfigurationRois(product.roiRegions),
    };
    savedRoisRef.current.set(
      product.id,
      cloneRoiRegions(normalizedProduct.roiRegions),
    );
    setRoiUndoStack([]);
    setRoiRedoStack([]);
    setRoiSelectedIndexes([]);
    setRoiAssist(null);
    handleSavedProduct(normalizedProduct);
  }

  function handleConfigurationTabChange(tab: ConfigurationTab) {
    setVisitedTabs((current) =>
      current.has(tab) ? current : new Set(current).add(tab),
    );
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(window.history.state, "", url);
    }
  }

  useEffect(() => {
    if (!configurationMode || typeof window === "undefined") return;
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const requestedTabAllowed =
      requestedTab === "products" ||
      requestedTab === "ai" ||
      requestedTab === "roi" ||
      requestedTab === "camera" ||
      requestedTab === "identities" ||
      (requestedTab === "debug" && canViewDebug);
    const requestedDefinition = requestedTabAllowed
      ? availableTabs.find((tab) => tab.id === requestedTab)
      : undefined;
    const nextTab =
      requestedDefinition?.id ??
      (availableTabs.some((tab) => tab.id === activeTab)
        ? activeTab
        : availableTabs[0]?.id);

    if (nextTab && nextTab !== activeTab) {
      const timerId = window.setTimeout(() => {
        setVisitedTabs((current) =>
          current.has(nextTab) ? current : new Set(current).add(nextTab),
        );
        setActiveTab(nextTab);
      }, 0);
      return () => window.clearTimeout(timerId);
    }
  }, [activeTab, availableTabs, canViewDebug, configurationMode]);
  useEffect(() => {
    let cancelled = false;

    async function loadCameraContext() {
      const accessToken = getAccessToken();

      if (!accessToken) {
        toast.error(t("users.missingSession"));
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [productResponse, cameraRuntime] = await Promise.all([
          listProductProfiles(accessToken),
          loadCameraRuntime(accessToken),
        ]);

        if (cancelled) {
          return;
        }

        const activeProducts = prepareProducts(productResponse.data);
        setProducts(activeProducts);
        setSelectedProductId(activeProducts[0]?.id ?? "");
        setStatus(cameraRuntime.statusResponse);
        setDevices(cameraRuntime.devices);
        setHardwareRanges(cameraRuntime.rangesResponse);
      } catch (cause) {
        if (!cancelled) {
          toast.error(formatCameraApiError(cause, apiError, t, "camera.loadError"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCameraContext();

    return () => {
      cancelled = true;
    };
  }, [apiError, configurationMode, prepareProducts, t]);

  async function refreshCameraRuntime(showFeedback = true) {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    const toastId = showFeedback
      ? toast.loading(t("camera.refreshingDevices"))
      : undefined;

    try {
      const cameraRuntime = await loadCameraRuntime(accessToken);
      setStatus(cameraRuntime.statusResponse);
      setDevices(cameraRuntime.devices);
      setHardwareRanges(cameraRuntime.rangesResponse);
      if (showFeedback) {
        toast.success(t("camera.devicesRefreshed"), { id: toastId });
      }
    } catch (cause) {
      toast.error(
        formatCameraApiError(cause, apiError, t, "camera.devicesRefreshError"),
        toastId ? { id: toastId } : undefined,
      );
    }
  }

  useEffect(() => {
    return () => {
      streamSocketRef.current?.close();
      aiSocketRef.current?.close();

      if (streamFrameUrlRef.current) {
        URL.revokeObjectURL(streamFrameUrlRef.current);
      }
    };
  }, []);

  async function handleSelectProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    setSelectedProductId(productId);
    setRoiUndoStack([]);
    setRoiRedoStack([]);
    setRoiSelectedIndexes([]);
    setRoiAssist(null);
    setConfigurationTestPreview(null);
    setConfigurationTestResult(null);
    setConfigurationTestRunning(false);

    if (!product) return;
    setViewerTransform(toViewerTransform(product.camera));

    if (configurationMode) {
      await switchToProductCamera(product);
    }
  }

  async function switchToProductCamera(
    product: ProductProfile,
    providedAccessToken?: string,
  ) {
    const accessToken = providedAccessToken ?? getAccessToken();
    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSwitchingCamera(true);
    setConnecting(true);
    closeAiResults();
    closeLiveStream({ silent: true });
    setFrame(null);
    const toastId = toast.loading(
      t("configuration.switchingCamera").replace("{camera}", product.camera.deviceName || product.code),
    );

    try {
      await disconnectCamera(accessToken).catch(() => undefined);
      const response = await connectCamera(accessToken, product.camera);
      const cameraRuntime = await loadCameraRuntime(accessToken);
      setStatus(response);
      setDevices(cameraRuntime.devices);
      setHardwareRanges(cameraRuntime.rangesResponse);
      openStreamSocket(accessToken, toastId);
    } catch (cause) {
      setLive(false);
      setSwitchingCamera(false);
      toast.error(formatCameraApiError(cause, apiError, t, "camera.connectError"), {
        id: toastId,
      });
    } finally {
      setConnecting(false);
    }
  }

  async function handleGrabFrame(showToast = true) {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      setLive(false);
      return;
    }

    setGrabbing(true);

    try {
      const response = await grabCameraFrame(accessToken);
      setFrame(response);

      if (showToast) {
        toast.success(t("camera.grabbed"));
      }
    } catch (cause) {
      setLive(false);

      if (showToast) {
        toast.error(formatCameraApiError(cause, apiError, t, "camera.grabError"));
      }
    } finally {
      setGrabbing(false);
    }
  }

  async function handleToggleLiveStream() {
    if (live) {
      closeLiveStream();
      toast.success(t("camera.streamStopped"));
      return;
    }

    await startLiveStream();
  }

  async function handleToggleAi() {
    if (aiRunning) {
      await stopAi();
      return;
    }

    await startAi();
  }

  async function startAi() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    if (!selectedProduct) {
      toast.warning(t("camera.selectProductFirst"));
      return;
    }

    if (!selectedProduct.modelPath) {
      toast.warning(t("camera.aiModelRequired"));
      return;
    }

    if (selectedProduct.roiRegions.length === 0) {
      toast.warning(t("camera.aiRoiRequired"));
      return;
    }

    setAiStarting(true);
    const toastId = toast.loading(t("camera.aiStarting"));

    try {
      await startCameraAi(accessToken, selectedProduct.id);
      openAiResultsSocket(accessToken);
      setAiRunning(true);
      toast.success(t("camera.aiStarted"), { id: toastId });
    } catch (cause) {
      closeAiResults();
      toast.error(formatCameraApiError(cause, apiError, t, "camera.aiStartError"), {
        id: toastId,
      });
    } finally {
      setAiStarting(false);
    }
  }

  async function stopAi() {
    const accessToken = getAccessToken();

    closeAiResults();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    const toastId = toast.loading(t("camera.aiStopping"));

    try {
      await stopCameraAi(accessToken);
      toast.success(t("camera.aiStopped"), { id: toastId });
    } catch (cause) {
      toast.error(formatCameraApiError(cause, apiError, t, "camera.aiStopError"), {
        id: toastId,
      });
    }
  }

  async function startLiveStream() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    if (!selectedProduct) {
      toast.warning(t("camera.selectProductFirst"));
      return;
    }

    setConnecting(true);
    const toastId = toast.loading(t("camera.connecting"));

    try {
      const response = await connectCamera(accessToken, selectedProduct.camera);
      const cameraRuntime = await loadCameraRuntime(accessToken);
      setStatus(response);
      setDevices(cameraRuntime.devices);
      setHardwareRanges(cameraRuntime.rangesResponse);
      openStreamSocket(accessToken, toastId);
    } catch (cause) {
      setLive(false);
      toast.error(formatCameraApiError(cause, apiError, t, "camera.connectError"), {
        id: toastId,
      });
    } finally {
      setConnecting(false);
    }
  }

  function openStreamSocket(
    accessToken: string,
    toastId: string | number,
    options: {
      onSettled?: () => void;
      successMessage?: string;
    } = {},
  ) {
    closeLiveStream({ silent: true });
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      options.onSettled?.();
    };

    const socket = new WebSocket(
      getCameraStreamUrl(accessToken, {
        jpegQuality: DEFAULT_CAMERA_STREAM_JPEG_QUALITY,
        maxWidth: DEFAULT_CAMERA_STREAM_MAX_WIDTH,
      }),
    );
    socket.binaryType = "blob";
    streamSocketRef.current = socket;

    socket.onopen = () => {
      resetLiveStats();
      setLive(true);
      setSwitchingCamera(false);
      toast.success(options.successMessage ?? t("camera.streamStarted"), {
        id: toastId,
      });
      settle();
    };

    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        handleStreamMessage(event.data);
        return;
      }

      updateLiveStats();
      replaceStreamFrameUrl(URL.createObjectURL(event.data as Blob));
    };

    socket.onerror = () => {
      setSwitchingCamera(false);
      toast.error(t("camera.streamError"), { id: toastId });
      settle();
    };

    socket.onclose = () => {
      if (streamSocketRef.current !== socket) return;
      streamSocketRef.current = null;
      setLive(false);
      setSwitchingCamera(false);
      if (!settled) {
        toast.error(t("camera.streamError"), { id: toastId });
      }
      settle();
    };
  }

  function openAiResultsSocket(accessToken: string) {
    closeAiResults();

    const socket = new WebSocket(getCameraAiResultsUrl(accessToken));
    aiSocketRef.current = socket;

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      try {
        JSON.parse(event.data);
      } catch {
        toast.error(t("camera.aiResultError"));
      }
    };

    socket.onerror = () => {
      toast.error(t("camera.aiResultError"));
    };

    socket.onclose = () => {
      if (aiSocketRef.current === socket) {
        aiSocketRef.current = null;
      }

      setAiRunning(false);
    };
  }

  function handleStreamMessage(message: string) {
    try {
      const payload = JSON.parse(message) as StreamMessage;

      if ("type" in payload && payload.type === "frame_meta") {
        streamMetaRef.current = payload;
        return;
      }

      if ("error" in payload && payload.error) {
        toast.error(
          formatCameraErrorMessage(payload.error, apiError, t, "camera.streamError"),
        );
      }
    } catch {
      toast.error(t("camera.streamError"));
    }
  }

  function updateLiveStats() {
    const now = Date.now();
    const frameTimes = streamFrameTimesRef.current
      .filter((timestamp) => now - timestamp <= 1000)
      .concat(now);
    const meta = streamMetaRef.current;

    streamFrameTimesRef.current = frameTimes;
    setLiveStats({
      fps: frameTimes.length,
      cameraFps: meta?.camera_resulting_fps ?? meta?.stream_fps ?? null,
      cameraMaxFps: meta?.camera_max_fps ?? null,
      delayMs: meta?.sent_at_ms ? now - meta.sent_at_ms : null,
      captureTimeMs: meta?.capture_time_ms ?? null,
    });
  }

  function resetLiveStats() {
    streamMetaRef.current = null;
    streamFrameTimesRef.current = [];
    setLiveStats(null);
  }

  function closeLiveStream(options: { silent?: boolean } = {}) {
    const socket = streamSocketRef.current;

    if (socket) {
      streamSocketRef.current = null;
      socket.close();
    }

    replaceStreamFrameUrl("");
    resetLiveStats();
    setLive(false);

    if (!options.silent) {
      setStatus((current) =>
        current
          ? {
              ...current,
              data: {
                ...current.data,
                is_grabbing: false,
              },
            }
          : current,
      );
    }
  }

  function closeAiResults() {
    const socket = aiSocketRef.current;

    if (socket) {
      aiSocketRef.current = null;
      socket.close();
    }

    setAiRunning(false);

  }

  function replaceStreamFrameUrl(nextFrameUrl: string) {
    if (streamFrameUrlRef.current) {
      URL.revokeObjectURL(streamFrameUrlRef.current);
    }

    streamFrameUrlRef.current = nextFrameUrl;
    setStreamFrameUrl(nextFrameUrl);
  }

  function handleSavedProduct(product: ProductProfile) {
    const nextProduct = configurationMode
      ? { ...product, roiRegions: normalizeConfigurationRois(product.roiRegions) }
      : product;
    savedRoisRef.current.set(
      product.id,
      cloneRoiRegions(nextProduct.roiRegions),
    );
    savedProductsRef.current.set(
      product.id,
      cloneConfigurationProduct(nextProduct),
    );
    setConfigurationTestResult(null);
    setProducts((current) =>
      current.map((item) => (item.id === product.id ? nextProduct : item)),
    );
    setViewerTransform(toViewerTransform(nextProduct.camera));
  }

  async function handleApplyCameraSettings(camera: CameraProfile) {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      throw new Error("Missing session");
    }
    if (!selectedProduct) {
      toast.warning(t("camera.selectProductFirst"));
      throw new Error("Product profile is required");
    }

    const wasLive = live;
    const wasAiRunning = aiRunning;
    setApplyingCameraSettings(true);
    const toastId = toast.loading(t("camera.applyingSettings"));
    let savedProduct: ProductProfile;

    try {
      const response = await updateProductProfile(
        accessToken,
        selectedProduct.id,
        buildProductPayload(selectedProduct, camera),
      );
      savedProduct = response.data;
      handleSavedProduct(savedProduct);
    } catch (cause) {
      setApplyingCameraSettings(false);
      toast.error(
        formatCameraApiError(cause, apiError, t, "camera.settingsSaveError"),
        { id: toastId },
      );
      throw cause;
    }

    closeLiveStream({ silent: true });
    setFrame(null);
    if (wasAiRunning) {
      closeAiResults();
      await stopCameraAi(accessToken).catch(() => undefined);
    }

    try {
      await disconnectCamera(accessToken).catch(() => undefined);
      const runtimeStatus = await connectCamera(accessToken, savedProduct.camera);
      const cameraRuntime = await loadCameraRuntime(accessToken);
      setStatus(runtimeStatus);
      setDevices(cameraRuntime.devices);
      setHardwareRanges(cameraRuntime.rangesResponse);

      if (wasAiRunning) {
        try {
          await startCameraAi(accessToken, savedProduct.id);
          openAiResultsSocket(accessToken);
          setAiRunning(true);
        } catch (cause) {
          toast.warning(
            formatCameraApiError(cause, apiError, t, "camera.aiRestartError"),
          );
        }
      }

      if (wasLive) {
        openStreamSocket(accessToken, toastId, {
          onSettled: () => setApplyingCameraSettings(false),
          successMessage: t("camera.settingsApplied"),
        });
      } else {
        setApplyingCameraSettings(false);
        toast.success(t("camera.settingsApplied"), { id: toastId });
      }

      return savedProduct;
    } catch (cause) {
      setApplyingCameraSettings(false);
      toast.error(
        formatCameraApiError(cause, apiError, t, "camera.settingsRestartError"),
        { id: toastId },
      );
      throw cause;
    }
  }

  async function handleSaveView() {
    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    if (!selectedProduct) {
      toast.warning(t("camera.selectProductFirst"));
      return;
    }

    if (!imageSource) {
      toast.warning(t("camera.noFrame"));
      return;
    }

    setSavingView(true);
    const toastId = toast.loading(t("camera.savingSettings"));

    try {
      const response = await updateProductProfile(
        accessToken,
        selectedProduct.id,
        buildProductPayload(selectedProduct, {
          ...selectedProduct.camera,
          zoomFactor: viewerTransform.zoomFactor,
          previewPanX: viewerTransform.previewPanX,
          previewPanY: viewerTransform.previewPanY,
          previewRotation: normalizeRotation(viewerTransform.previewRotation),
        }),
      );
      handleSavedProduct(response.data);
      toast.success(t("camera.settingsSaved"), { id: toastId });
    } catch (cause) {
      toast.error(formatCameraApiError(cause, apiError, t, "camera.settingsSaveError"), {
        id: toastId,
      });
    } finally {
      setSavingView(false);
    }
  }

  const connected = Boolean(status?.data?.connected);
  const cameraImageSource = streamFrameUrl
    ? streamFrameUrl
    : frame
      ? `data:${mediaTypeForFrame(frame.encode_format)};base64,${frame.image_base64}`
      : "";
  const imageSource = configurationTestPreview?.imageSource || cameraImageSource;
  const displayedFrame = configurationTestPreview
    ? configurationTestPreview.frame
    : frame;
  const displayedLive = live && !configurationTestPreview;

  return (
    <div className="grid min-h-0 gap-5">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ScanEye className="h-5 w-5 text-cyan-700" />
              {t("camera.liveView")}
            </CardTitle>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge
                className={
                  connected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }
              >
                {connected ? t("camera.connected") : t("camera.disconnected")}
              </Badge>
              {live ? (
                <Badge className="border-cyan-200 bg-cyan-50 text-cyan-800">
                  {t("camera.live")}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {configurationMode ? (
              <div className="w-full min-w-0 basis-full sm:w-auto sm:min-w-[260px] sm:basis-auto sm:flex-1 xl:flex-none">
                <ListboxSelect
                  value={selectedProductId}
                  onChange={(productId) => void handleSelectProduct(productId)}
                  disabled={loading || switchingCamera || applyingCameraSettings || products.length === 0}
                  emptyLabel={t("products.emptyTitle")}
                  options={products.map((product) => ({
                    value: product.id,
                    label: product.code,
                    description: product.camera.deviceName || product.name,
                  }))}
                />
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleGrabFrame()}
              disabled={loading || grabbing || live || applyingCameraSettings}
            >
              <RefreshCcw className="h-4 w-4" />
              {grabbing ? t("camera.grabbing") : t("camera.grab")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleToggleLiveStream()}
              disabled={loading || connecting || applyingCameraSettings}
            >
              <Camera className="h-4 w-4" />
              {live ? t("camera.stopLive") : t("camera.startLive")}
            </Button>
            {canRunCameraAi && !configurationMode ? (
              <Button
                type="button"
                variant={aiRunning ? "outline" : "default"}
                onClick={() => void handleToggleAi()}
                disabled={loading || connecting || aiStarting || applyingCameraSettings || !selectedProduct}
              >
                <BrainCircuit className="h-4 w-4" />
                {aiRunning
                  ? t("camera.stopAi")
                  : aiStarting
                    ? t("camera.aiStarting")
                    : t("camera.startAi")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="relative p-0">
          <CameraImageViewer
            key={buildViewerKey(selectedProduct)}
            imageSource={imageSource}
            frame={displayedFrame}
            imageHeight={selectedProduct?.camera.imageHeight}
            imageWidth={selectedProduct?.camera.imageWidth}
            live={displayedLive}
            liveStats={displayedLive ? liveStats : null}
            baseZoom={selectedProduct?.camera.zoomFactor ?? 1}
            initialPreviewPanX={selectedProduct?.camera.previewPanX ?? 0}
            initialPreviewPanY={selectedProduct?.camera.previewPanY ?? 0}
            initialRotation={selectedProduct?.camera.previewRotation ?? 0}
            onTransformChange={setViewerTransform}
            overlay={
              selectedProduct ? (
                <CameraRoiOverlay
                  assist={roiAssist}
                  imageHeight={selectedProduct.camera.imageHeight}
                  imageWidth={selectedProduct.camera.imageWidth}
                  interactive={configurationMode && activeTab === "roi" && !applyingCameraSettings}
                  onAssistChange={setRoiAssist}
                  onChange={handleRoiDraftChange}
                  onEditStart={saveRoiSnapshot}
                  onSelectionChange={setRoiSelectedIndexes}
                  overlappingIndexes={overlappingRoiIndexes}
                  previewPanX={viewerTransform.previewPanX}
                  previewPanY={viewerTransform.previewPanY}
                  previewRotation={viewerTransform.previewRotation}
                  regions={selectedProduct.roiRegions}
                  selectedIndexes={roiSelectedIndexes}
                  testResult={
                    hasUnsavedConfigurationChanges
                      ? null
                      : configurationTestResult
                  }
                  testRunning={configurationTestRunning}
                  zoomFactor={viewerTransform.zoomFactor}
                />
              ) : null
            }
            footerAction={canManageCamera ? (
              <Button
                type="button"
                onClick={() => void handleSaveView()}
                disabled={!selectedProduct || !imageSource || savingView || applyingCameraSettings || configurationTestRunning}
                className="h-10 border-cyan-700 bg-cyan-700 px-4 text-white hover:bg-cyan-800"
              >
                {savingView
                  ? t("camera.savingSettings")
                  : t("camera.saveSettings")}
              </Button>
            ) : null}
            title={t("camera.liveView")}
          />
          {configurationMode &&
          (configurationTestRunning || configurationTestResult) ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
              <div
                className={configurationTestResultClassName(
                  configurationTestResult?.result,
                  configurationTestRunning,
                )}
                role="status"
              >
                {configurationTestRunning
                  ? t("configuration.test.running")
                  : configurationTestResult?.result}
                {configurationTestResult && !configurationTestRunning ? (
                  <span className="ml-2 border-l border-current/30 pl-2 font-mono text-xs tabular-nums">
                    {configurationTestResult.cycleTimeMs.toFixed(0)} ms
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {switchingCamera || applyingCameraSettings ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 text-white" role="status">
              <div className="flex items-center gap-3 border border-white/15 bg-slate-950 px-5 py-4">
                <RefreshCcw className="h-5 w-5 animate-spin text-cyan-400" />
                <span className="font-medium">
                  {applyingCameraSettings
                    ? t("camera.applyingSettingsLive")
                    : t("configuration.switchingCamera").replace(
                        "{camera}",
                        selectedProduct?.camera.deviceName || selectedProduct?.code || "-",
                      )}
                </span>
              </div>
            </div>
          ) : null}
        </CardContent>
        {configurationMode && canRunCameraAi ? (
          <ConfigurationInspectionTestPanel
            key={selectedProductId || "no-product"}
            connected={connected}
            disabled={
              loading ||
              connecting ||
              switchingCamera ||
              applyingCameraSettings
            }
            hasUnsavedChanges={hasUnsavedConfigurationChanges}
            onPreviewChange={setConfigurationTestPreview}
            onResultChange={setConfigurationTestResult}
            onRunningChange={setConfigurationTestRunning}
            product={savedSelectedProduct}
          />
        ) : null}
      </Card>

      {configurationMode ? (
        <nav className="flex min-w-0 flex-wrap gap-2 border border-slate-200 bg-white p-2" aria-label={t("configuration.tabsLabel")}>
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleConfigurationTabChange(tab.id)}
              disabled={applyingCameraSettings}
              className={[
                "flex min-h-11 items-center gap-2 border px-4 text-sm font-semibold transition active:translate-y-px",
                activeTab === tab.id
                  ? "border-cyan-300 bg-cyan-50 text-cyan-950"
                  : "border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50",
              ].join(" ")}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <tab.icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </button>
          ))}
        </nav>
      ) : null}

      <div hidden={configurationMode && activeTab !== "camera"}>
      <div className="grid gap-5">
        <CameraConnectionTestPanel
          disabled={live || connecting || switchingCamera || applyingCameraSettings}
          onTestComplete={() => void refreshCameraRuntime(false)}
        />
        <CameraSettingsForm
          key={buildSettingsFormKey(selectedProduct)}
          product={selectedProduct}
          devices={devices}
          hardwareRanges={hardwareRanges}
          disabled={loading || switchingCamera || applyingCameraSettings}
          onDirtyChange={setCameraSettingsDirty}
          onApply={handleApplyCameraSettings}
        />
      </div>
      </div>

      {configurationMode && visitedTabs.has("products") ? (
        <div hidden={activeTab !== "products"}>
        <ProductProfilesPanel
          unifiedConfiguration
          onDirtyChange={setProductSettingsDirty}
          onProductsChanged={handleProductsChanged}
        />
        </div>
      ) : null}

      {configurationMode && visitedTabs.has("ai") ? (
        <div hidden={activeTab !== "ai"}>
          <AiSettingsPanel
            key={selectedProduct?.id ?? "no-product"}
            onDirtyChange={setAiSettingsDirty}
            product={selectedProduct}
            onSaved={handleSavedProduct}
          />
        </div>
      ) : null}

      {configurationMode && visitedTabs.has("roi") ? (
        <div hidden={activeTab !== "roi"}>
        <RoiSettingsPanel
          key={selectedProduct?.id ?? "no-product"}
          product={selectedProduct}
          canRedo={roiRedoStack.length > 0}
          canUndo={roiUndoStack.length > 0}
          onEditStart={saveRoiSnapshot}
          onDraftChange={handleRoiDraftChange}
          onRedo={redoRoiChange}
          onReset={resetRoiChanges}
          onSaved={handleSavedRoiProduct}
          onUndo={undoRoiChange}
          overlappingIndexes={overlappingRoiIndexes}
        />
        </div>
      ) : null}

      {configurationMode && visitedTabs.has("identities") ? (
        <div hidden={activeTab !== "identities"}>
        <CameraIdentitiesPanel />
        </div>
      ) : null}

      {configurationMode && visitedTabs.has("debug") && canViewDebug ? (
        <div hidden={activeTab !== "debug"}>
        <CameraDebugPanel />
        </div>
      ) : null}
    </div>
  );
}

type StreamFrameMeta = {
  type: "frame_meta";
  capture_time_ms?: number | null;
  sent_at_ms?: number | null;
  stream_fps?: number | null;
  camera_resulting_fps?: number | null;
  camera_max_fps?: number | null;
};

const configurationTabs: ConfigurationTabDefinition[] = [
  {
    id: "products",
    icon: PackageSearch,
    labelKey: "nav.products",
    permission: "product.manage",
  },
  {
    id: "ai",
    icon: BrainCircuit,
    labelKey: "nav.aiSettings",
    permission: "product.manage",
  },
  {
    id: "roi",
    icon: ScanLine,
    labelKey: "nav.roi",
    permission: "roi.edit",
  },
  {
    id: "camera",
    icon: Camera,
    labelKey: "nav.camera",
    permission: "camera.manage",
  },
  {
    id: "identities",
    icon: SlidersHorizontal,
    labelKey: "nav.cameraIdentity",
    permission: "camera.identity.manage",
  },
  {
    id: "debug",
    icon: Wrench,
    labelKey: "nav.cameraDebug",
    permission: null,
    devOnly: true,
  },
];

function buildConfigurationTabs(user: SessionUser | null) {
  if (!user) return [];
  return configurationTabs.filter((tab) => {
    if (tab.devOnly) return user.isDev;
    return user.isDev || tab.permission === null || user.permissions.includes(tab.permission);
  });
}

type StreamMessage = StreamFrameMeta | { error?: string };

async function loadCameraRuntime(accessToken: string) {
  const [statusResponse, deviceResponse, rangesResult] = await Promise.all([
    getCameraStatus(accessToken),
    listCameraDevices(accessToken),
    getCameraRanges(accessToken).catch(() => defaultCameraRanges()),
  ]);

  return {
    statusResponse,
    devices: deviceResponse.data,
    rangesResponse: rangesResult,
  };
}

function defaultCameraRanges(): CameraHardwareRanges {
  return {
    success: false,
    ranges: {},
    error: null,
  };
}


function mediaTypeForFrame(format: string) {
  if (format === ".png") {
    return "image/png";
  }

  if (format === ".bmp") {
    return "image/bmp";
  }

  return "image/jpeg";
}

function buildViewerKey(product: ProductProfile | null) {
  if (!product) {
    return "camera-viewer-empty";
  }

  return [
    product.id,
    product.updatedAt,
    product.camera.zoomFactor,
    product.camera.imageWidth,
    product.camera.imageHeight,
    product.camera.previewPanX,
    product.camera.previewPanY,
    product.camera.previewRotation,
  ].join("-");
}

function buildSettingsFormKey(product: ProductProfile | null) {
  if (!product) {
    return "camera-settings-empty";
  }

  return [
    product.id,
    product.updatedAt,
    product.camera.sourceType,
    product.camera.deviceName,
    product.camera.rtspUrl,
  ].join("-");
}

function toViewerTransform(camera: CameraProfile): CameraViewTransform {
  return {
    zoomFactor: camera.zoomFactor ?? 1,
    previewPanX: camera.previewPanX ?? 0,
    previewPanY: camera.previewPanY ?? 0,
    previewRotation: camera.previewRotation ?? 0,
  };
}

function normalizeRotation(rotation: number) {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function buildProductPayload(
  product: ProductProfile,
  camera: CameraProfile,
): ProductProfilePayload {
  return {
    code: product.code,
    name: product.name,
    defaultNumber: product.defaultNumber,
    batchSize: product.batchSize,
    exposure: product.exposure,
    thresholdAccept: product.thresholdAccept,
    thresholdMns: product.thresholdMns,
    rowThreshold: product.rowThreshold,
    modelPath: product.modelPath ?? undefined,
    active: product.active,
    camera: {
      ...camera,
      deviceName: camera.deviceName?.trim() || undefined,
      cameraIdentityId: camera.cameraIdentityId,
      rtspUrl: camera.rtspUrl?.trim() || undefined,
    },
    roiRegions: product.roiRegions,
  };
}

function cloneConfigurationProduct(product: ProductProfile): ProductProfile {
  return {
    ...product,
    camera: { ...product.camera },
    roiRegions: cloneRoiRegions(product.roiRegions),
  };
}

function roiRegionsFingerprint(regions: ProductProfile["roiRegions"]) {
  return JSON.stringify(
    [...regions]
      .sort((left, right) => left.index - right.index)
      .map(({ index, x, y, width, height, rotation }) => ({
        index,
        x,
        y,
        width,
        height,
        rotation,
      })),
  );
}

function configurationTestResultClassName(
  result: TestInspectionImageResult["result"] | undefined,
  running: boolean,
) {
  const baseClassName =
    "border px-4 py-2 text-sm font-bold shadow-sm";

  if (running) {
    return `${baseClassName} border-amber-300 bg-amber-50 text-amber-900`;
  }
  if (result === "OK") {
    return `${baseClassName} border-emerald-400 bg-emerald-700 text-white`;
  }
  if (result === "NG") {
    return `${baseClassName} border-red-400 bg-red-700 text-white`;
  }
  return `${baseClassName} border-slate-300 bg-slate-950 text-white`;
}
