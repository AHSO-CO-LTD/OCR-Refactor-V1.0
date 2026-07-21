export type RoleCode = "dev" | "admin" | "engineer" | "operator";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: RoleCode;
  permissions: string[];
  isDev: boolean;
}

export interface LoginResponse {
  data: {
    accessToken: string;
    user: SessionUser;
  };
}

export interface MeResponse {
  data: {
    user: SessionUser;
  };
}

export type RoleWithPermissions = {
  code: RoleCode;
  name: string;
  visible: boolean;
  permissions: string[];
};

export type Permission = {
  key: string;
  name: string;
  group: string;
  devOnly: boolean;
};

export type UserSummary = {
  id: string;
  username: string;
  fullName: string;
  department: string | null;
  employeeNo: string | null;
  role: RoleCode;
  active: boolean;
  lastLoginAt: string | null;
};

export type AssignableRole = {
  code: RoleCode;
  name: string;
  visible: boolean;
};

export type VirtualKeyboardResponse = {
  data: {
    success: boolean;
    keyboardType: "touch" | "osk";
  };
};

export type CreateUserPayload = {
  username: string;
  password: string;
  fullName: string;
  department?: string;
  employeeNo?: string;
  role: RoleCode;
  active: boolean;
};

export type UpdateUserPayload = {
  fullName: string;
  department?: string;
  employeeNo?: string;
  role: RoleCode;
  active: boolean;
};

export type CameraProfile = {
  cameraIdentityId?: string;
  sourceType: string;
  deviceName?: string;
  rtspUrl?: string;
  exposure: number;
  imageWidth: number;
  imageHeight: number;
  offsetX: number;
  offsetY: number;
  zoomFactor: number;
  previewPanX: number;
  previewPanY: number;
  previewRotation: number;
};

export type CameraRuntimeStatus = {
  success: boolean;
  data: {
    connected?: boolean;
    is_grabbing?: boolean;
    device_name?: string | null;
    image_width?: number | null;
    image_height?: number | null;
    [key: string]: unknown;
  };
};

export type CameraFrameRate = {
  success: boolean;
  data: {
    connected: boolean;
    requested_stream_fps?: number | null;
    configured_fps?: number | null;
    camera_resulting_fps?: number | null;
    camera_max_fps?: number | null;
    effective_stream_fps?: number | null;
    writable: boolean;
    error?: string | null;
    source?: Record<string, unknown> | null;
  };
};

export type CameraHardwareRange = {
  min?: number | null;
  max?: number | null;
  inc?: number | null;
  value?: number | null;
};

export type CameraHardwareRanges = {
  success: boolean;
  ranges: Record<string, CameraHardwareRange | null>;
  error?: string | null;
};

export type CameraDebugInfo = {
  success: boolean;
  diagnostics: Record<string, unknown>;
  error?: string | null;
};

export type CameraDevice = {
  index: number;
  identityId?: string;
  identity_id?: string;
  friendly_name: string;
  identified?: boolean;
  connectable?: boolean;
  status?: "identified" | "unidentified" | "disabled";
  model_name?: string | null;
  serial_number?: string | null;
  device_class?: string | null;
};

export type CameraIdentity = {
  id: string;
  serial: string;
  displayName: string;
  driver: string;
  modelName: string | null;
  vendor: string | null;
  interfaceName: string | null;
  toolName: string | null;
  identified: boolean;
  identifiedAt: string | null;
  connectable: boolean;
  status: "identified" | "unidentified" | "disabled";
  active: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CameraFrame = {
  success: boolean;
  width: number;
  height: number;
  channels: number;
  capture_time_ms: number;
  image_base64: string;
  encode_format: string;
};

export type RoiRegion = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type ProductProfile = {
  id: string;
  code: string;
  name: string;
  defaultNumber: number;
  batchSize: number;
  exposure: number;
  thresholdAccept: number;
  thresholdMns: number;
  rowThreshold: number;
  modelPath: string | null;
  rotateTestImageClockwise: boolean;
  active: boolean;
  camera: CameraProfile;
  roiRegions: RoiRegion[];
  createdAt: string;
  updatedAt: string;
};

export type HealthResponse = {
  data: {
    status: string;
    service: string;
    timestamp: string;
  };
};

export type SetupStatusResponse = {
  data: {
    initialized: boolean;
    requiresAdminSetup: boolean;
    adminCount: number;
    activeAdminCount: number;
    devSupportReady: boolean;
  };
};

export type InitialAdminPayload = {
  username: string;
  password: string;
  fullName: string;
  department?: string;
  employeeNo?: string;
  lineResultSaveFolderPath: string;
};

export type SystemLicenseState = {
  status: "licensed" | "unlicensed" | "unknown";
  licensed: boolean | null;
  donglePresent: boolean | null;
  lastCheckedAt: string | null;
  code: string | null;
  message: string | null;
};

export type InspectionSlotState = {
  slotIndex: number | null;
  slotLabel: string | null;
  expectedText: string | null;
  rawText: string | null;
  rows?: string[];
  result: "OK" | "NG" | "UNKNOWN";
  errorMessage: string | null;
  imagePath?: string | null;
  toolDebugImageBase64?: string | null;
};

export type TestInspectionImageResult = {
  productId: string;
  productCode: string;
  expectedText: string;
  imageWidth: number;
  imageHeight: number;
  cycleTimeMs: number;
  success: boolean;
  error: string | null;
  result: "OK" | "NG" | "UNKNOWN";
  slots: InspectionSlotState[];
};

export type TestSessionImageResult = "OK" | "NG" | "UNKNOWN" | "ERROR";

export type LineResultSavePolicy = "all" | "ok" | "ng" | "none";

export type LineSessionEndReason =
  | "line_stop"
  | "product_change"
  | "plc_stop"
  | "app_shutdown";

export type LineResultSettings = {
  id: string;
  saveFolderPath: string | null;
  savePolicy: LineResultSavePolicy;
  saveBySession: boolean;
  newSessionOnLineStop: boolean;
  newSessionOnProductChange: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LineResultSettingsPayload = {
  saveFolderPath?: string | null;
  savePolicy?: LineResultSavePolicy;
  saveBySession?: boolean;
  newSessionOnLineStop?: boolean;
  newSessionOnProductChange?: boolean;
};

export type TestSessionReportPayload = {
  productId: string;
  saveFolderPath?: string;
  folderName?: string;
  totalImages: number;
  okImages: number;
  ngImages: number;
  unknownImages: number;
  errorImages: number;
  failedImages: Array<{
    fileName: string;
    relativePath: string;
    result: TestSessionImageResult;
    cycleTimeMs?: number | null;
    errorMessage?: string | null;
    originalImageBase64: string;
    roiResults: Array<{
      slotIndex?: number | null;
      slotLabel?: string | null;
      expectedText?: string | null;
      rawText?: string | null;
      rows?: string[];
      result: InspectionSlotState["result"];
      errorMessage?: string | null;
      toolDebugImageBase64?: string | null;
    }>;
  }>;
};

export type TestSessionReportResponse = {
  data: {
    id: string;
    productId: string;
    productCode: string;
    actorId: string;
    saveFolderPath: string | null;
    savedFailedImageCount: number;
    folderName: string | null;
    totalImages: number;
    okImages: number;
    ngImages: number;
    unknownImages: number;
    errorImages: number;
    createdAt: string;
  };
};

export type TestSessionReportListItem = {
  id: string;
  productId: string;
  productCode: string;
  actorId: string;
  actorUsername: string;
  folderName: string | null;
  totalImages: number;
  okImages: number;
  ngImages: number;
  unknownImages: number;
  errorImages: number;
  failedImages: Array<{
    id: string;
    fileName: string;
    relativePath: string;
    result: TestSessionImageResult;
    cycleTimeMs: number | null;
    errorMessage: string | null;
    originalImageBase64: string | null;
    roiResults: Array<{
      slotIndex: number | null;
      slotLabel: string | null;
      expectedText: string | null;
      rawText: string | null;
      rows?: string[];
      result: InspectionSlotState["result"];
      errorMessage: string | null;
    }>;
  }>;
  createdAt: string;
};

export type PaginatedTestSessionReportsResponse = {
  data: TestSessionReportListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type CurrentInspectionState = {
  jobId: string;
  status: string;
  productId: string;
  productCode: string;
  currentProductCode?: string;
  operatorId: string;
  startedAt: string | null;
  stoppedAt: string | null;
  endReason: LineSessionEndReason | null;
  resultSavePolicy: LineResultSavePolicy | null;
  resultSaveFolderPath: string | null;
  resultSessionFolderName: string | null;
  resultSavedAt: string | null;
  resultSaveError: string | null;
  batchSize: number;
  quantity: number;
  count: number;
  batch: number;
  okCount: number;
  ngCount: number;
  latestScanAt: string | null;
  lastResult: {
    result: "OK" | "NG" | "UNKNOWN";
    text: string | null;
    confidence: number | null;
    imagePath?: string | null;
    capturedAt: string;
  } | null;
  slots: InspectionSlotState[];
};

export type ProductProfilePayload = {
  code: string;
  name: string;
  defaultNumber: number;
  batchSize: number;
  exposure: number;
  thresholdAccept: number;
  thresholdMns: number;
  rowThreshold?: number;
  modelPath?: string;
  rotateTestImageClockwise?: boolean;
  active: boolean;
  camera: CameraProfile;
  roiRegions: RoiRegion[];
};

export type ApplyProductProfilePayload = {
  sourceProductId: string;
  targetProductIds?: string[];
  applyToAll?: boolean;
};

export type BulkProductOcrTestSettingsPayload = {
  rotateTestImageClockwise: boolean;
  applyToAll: boolean;
  productIds?: string[];
};

export type BulkProductAiSettingsPayload = {
  thresholdAccept: number;
  thresholdMns: number;
  rowThreshold: number;
  applyToAll: boolean;
  productIds?: string[];
};

export type PlcKeyOperation = "watch_boolean" | "write_boolean" | "pulse";

export type PlcCustomKey = {
  id?: string;
  name: string;
  address: number;
  operation: PlcKeyOperation;
  enabled: boolean;
};

export type PlcConfiguration = {
  id: string;
  ipAddress: string;
  protocol: "modbus_tcp" | "slmp";
  port: number;
  captureTriggerAddress: number | null;
  stopTriggerAddress: number | null;
  startTriggerAddress: number | null;
  cameraPowerAddress: number | null;
  cameraLightAddress: number | null;
  errorPulseAddress: number | null;
  okResultAddress: number | null;
  waitingCheckingAddress: number | null;
  errorPulseDurationMs: number;
  sleepTimeSeconds: number;
  customKeys: PlcCustomKey[];
  createdAt: string;
  updatedAt: string;
};

export type PlcConfigurationPayload = Omit<
  PlcConfiguration,
  "id" | "createdAt" | "updatedAt" | "customKeys"
> & {
  customKeys: Array<Omit<PlcCustomKey, "id">>;
};

export type PlcRuntimeEvent = {
  type: "status" | "signal" | "output" | "error";
  at: string;
  key?: string;
  address?: number;
  toolAddress?: number;
  value?: boolean;
  source?: "fixed" | "custom";
  message?: string;
  state?: PlcRuntimeStatus["state"];
};

export type PlcRuntimeStatus = {
  state:
    | "not_configured"
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "error";
  connected: boolean;
  host: string | null;
  protocol: "modbus_tcp" | "slmp" | null;
  cameraPowerCommand: boolean | null;
  cameraLightCommand: boolean | null;
  okResultCommand: boolean | null;
  waitingCheckingCommand: boolean | null;
  lastError: string | null;
  recentEvents: PlcRuntimeEvent[];
};

export type ProductImportResult = {
  totalCount: number;
  createdCount: number;
  updatedCount: number;
};

export type LineReportGroupBy = "day" | "month" | "year";

export type LineOperationReportSummary = {
  from: string;
  to: string;
  groupBy: LineReportGroupBy;
  totals: {
    sessions: number;
    results: number;
    ok: number;
    ng: number;
    unknown: number;
    rois: number;
  };
  groups: Array<{
    period: string;
    sessions: number;
    results: number;
    ok: number;
    ng: number;
    unknown: number;
  }>;
};

export type MachineRuntimeStep = {
  id: string;
  status: "pending" | "running" | "done" | "failed";
  message: string;
  at: string;
};

export type MachineRuntimeStatus = {
  state:
    | "inactive"
    | "running"
    | "stopping"
    | "idle_machine_stop"
    | "idle_capture_timeout"
    | "resuming"
    | "waiting_camera"
    | "restart_required"
    | "error";
  idleReason: "machine_stop" | "capture_timeout" | null;
  steps: MachineRuntimeStep[];
  message: string | null;
  countdownSeconds: number | null;
  lastActivityAt: string | null;
  sleepTimeSeconds: number;
  plcOffline: boolean;
  plcErrorMessage: string | null;
  updatedAt: string;
  canManualResume: boolean;
  restartRequired: boolean;
  lastPlcInspection: CurrentInspectionState | null;
  lastPlcInspectionSequence: number;
  captureTriggerSequence: number;
  lastCaptureTriggerAt: string | null;
  latestLiveInspection: CurrentInspectionState | null;
  liveInspectionSequence: number;
  liveInspectionError: string | null;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3979/api";

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string | string[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as ApiErrorBody;

    if (body.error?.message) {
      return body.error.message;
    }

    if (Array.isArray(body.message)) {
      return body.message.join(", ");
    }

    if (body.message) {
      return body.message;
    }
  } catch {
    return response.statusText;
  }

  return response.statusText;
}

async function fetchAuthenticatedBlob(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return response.blob();
}

export async function login(username: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as LoginResponse;
}

export async function getCurrentSession(
  accessToken: string,
  options: { signal?: AbortSignal } = {},
) {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as MeResponse;
}

export async function restoreRememberedSession(
  accessToken: string,
  options: { signal?: AbortSignal } = {},
) {
  const response = await fetch(`${API_BASE_URL}/auth/restore`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as MeResponse;
}

export async function getApiHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as HealthResponse;
}

export async function getCurrentInspection(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/inspections/current`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: CurrentInspectionState | null };
}

export async function getSetupStatus(options: { signal?: AbortSignal } = {}) {
  const response = await fetch(`${API_BASE_URL}/setup/status`, {
    signal: options.signal,
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as SetupStatusResponse;
}

export async function createInitialAdmin(payload: InitialAdminPayload) {
  const response = await fetch(`${API_BASE_URL}/setup/initial-admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as {
    data: {
      id: string;
      username: string;
      fullName: string;
      role: RoleCode;
    };
  };
}

export async function startInspection(
  accessToken: string,
  productId: string,
  operatorNote?: string,
) {
  const response = await fetch(`${API_BASE_URL}/inspections/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productId, operatorNote }),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: CurrentInspectionState };
}

export async function beginInspectionSession(
  accessToken: string,
  productId: string,
  operatorNote?: string,
) {
  const response = await fetch(`${API_BASE_URL}/inspections/begin`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productId, operatorNote }),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: CurrentInspectionState };
}

export async function stopInspection(
  accessToken: string,
  jobId: string,
  endReason: LineSessionEndReason = "line_stop",
) {
  const response = await fetch(`${API_BASE_URL}/inspections/${jobId}/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endReason }),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: CurrentInspectionState };
}

export async function getLineResultSettings(accessToken: string) {
  const response = await fetch(
    `${API_BASE_URL}/inspections/line-result-settings`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: LineResultSettings };
}

export async function updateLineResultSettings(
  accessToken: string,
  payload: LineResultSettingsPayload,
) {
  const response = await fetch(
    `${API_BASE_URL}/inspections/line-result-settings`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: LineResultSettings };
}

export async function testInspectionImage(
  accessToken: string,
  productId: string,
  crops: Array<{ slotIndex: number; imageBase64: string }>,
  roiRegions: RoiRegion[],
) {
  const response = await fetch(`${API_BASE_URL}/inspections/test-image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productId, crops, roiRegions }),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: TestInspectionImageResult };
}

export async function createTestSessionReport(
  accessToken: string,
  payload: TestSessionReportPayload,
) {
  const response = await fetch(`${API_BASE_URL}/inspections/test-sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as TestSessionReportResponse;
}

export async function listTestSessionReports(
  accessToken: string,
  limit = 10,
  page = 1,
) {
  const response = await fetch(
    `${API_BASE_URL}/inspections/test-sessions?limit=${limit}&page=${page}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as PaginatedTestSessionReportsResponse;
}

export async function getLineOperationReport(
  accessToken: string,
  from: string,
  to: string,
  groupBy: LineReportGroupBy,
) {
  const params = new URLSearchParams({ from, to, groupBy });
  const response = await fetch(
    `${API_BASE_URL}/inspections/line-reports/summary?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return (await response.json()) as { data: LineOperationReportSummary };
}

export async function downloadLineOperationReport(
  accessToken: string,
  from: string,
  to: string,
  groupBy: LineReportGroupBy,
) {
  const params = new URLSearchParams({ from, to, groupBy });
  return fetchAuthenticatedBlob(
    `${API_BASE_URL}/inspections/line-reports/export?${params}`,
    accessToken,
  );
}

export async function getSystemLicense(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/system/license`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: SystemLicenseState };
}

export async function getPublicSystemLicense() {
  const response = await fetch(`${API_BASE_URL}/system/license/public`);

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: SystemLicenseState };
}

export async function getCameraStatus(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/status`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as CameraRuntimeStatus;
}

export async function listCameraDevices(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/devices`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: CameraDevice[] };
}

export async function listCameraIdentities(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/identities`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: CameraIdentity[] };
}

export async function syncCameraIdentities(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/identities/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: CameraIdentity[] };
}

export async function updateCameraIdentity(
  accessToken: string,
  identityId: string,
  payload: Partial<Pick<CameraIdentity, "active" | "displayName">>,
) {
  const response = await fetch(
    `${API_BASE_URL}/camera/identities/${identityId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: CameraIdentity };
}

export async function testCameraIdentityConnection(
  accessToken: string,
  identityId: string,
) {
  const response = await fetch(
    `${API_BASE_URL}/camera/identities/${identityId}/test-connection`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as {
    data: {
      connected: true;
      identity: CameraIdentity;
      runtime: CameraRuntimeStatus["data"];
    };
  };
}

export async function getCameraFrameRate(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/frame-rate`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as CameraFrameRate;
}

export async function getCameraRanges(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/ranges`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as CameraHardwareRanges;
}

export async function getCameraDebugInfo(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/debug-info`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as CameraDebugInfo;
}

export async function connectCamera(
  accessToken: string,
  camera: CameraProfile,
) {
  const response = await fetch(`${API_BASE_URL}/camera/connect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(camera),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as CameraRuntimeStatus;
}

export async function disconnectCamera(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/disconnect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { success: boolean; error?: string };
}

export async function grabCameraFrame(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/grab`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ encodeFormat: ".jpg", jpegQuality: 90 }),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as CameraFrame;
}

export async function startCameraAi(accessToken: string, productId: string) {
  const response = await fetch(`${API_BASE_URL}/camera/ai/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productId }),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { success: boolean; error?: string };
}

export async function stopCameraAi(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/camera/ai/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { success: boolean; error?: string };
}

export function getCameraAiResultsUrl(accessToken: string) {
  const url = new URL(`${API_BASE_URL}/camera/ai/results`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", accessToken);
  return url.toString();
}

export function getCameraStreamUrl(
  accessToken: string,
  options: {
    debugTiming?: boolean;
    fps?: number;
    jpegQuality?: number;
    maxWidth?: number;
  } = {},
) {
  const url = new URL(`${API_BASE_URL}/camera/stream`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", accessToken);
  if (typeof options.fps === "number") {
    url.searchParams.set("fps", String(options.fps));
  }
  url.searchParams.set(
    "jpegQuality",
    String(options.jpegQuality ?? DEFAULT_CAMERA_STREAM_JPEG_QUALITY),
  );
  url.searchParams.set(
    "maxWidth",
    String(options.maxWidth ?? DEFAULT_CAMERA_STREAM_MAX_WIDTH),
  );
  if (options.debugTiming) {
    url.searchParams.set("debugTiming", "1");
  }
  return url.toString();
}

export const DEFAULT_CAMERA_STREAM_JPEG_QUALITY = 70;
export const DEFAULT_CAMERA_STREAM_MAX_WIDTH = 1600;

export async function listRoles(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/roles`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: RoleWithPermissions[] };
}

export async function listPermissions(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/permissions`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: Permission[] };
}

export async function updateRolePermissions(
  accessToken: string,
  roleCode: RoleCode,
  permissions: string[],
) {
  const response = await fetch(
    `${API_BASE_URL}/roles/${roleCode}/permissions`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ permissions }),
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: RoleWithPermissions[] };
}

export async function listUsers(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: UserSummary[] };
}

export async function listAssignableRoles(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/users/assignable-roles`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: AssignableRole[] };
}

export async function createUser(
  accessToken: string,
  payload: CreateUserPayload,
) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: UserSummary };
}

export async function updateUser(
  accessToken: string,
  userId: string,
  payload: UpdateUserPayload,
) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: UserSummary };
}

export async function deleteUser(accessToken: string, userId: string) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: { success: boolean } };
}

export async function openWindowsVirtualKeyboard(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/users/virtual-keyboard`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as VirtualKeyboardResponse;
}

export async function listProductProfiles(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/products`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: ProductProfile[] };
}

export async function downloadProductImportTemplate(
  accessToken: string,
  language: "en" | "vi",
) {
  return fetchAuthenticatedBlob(
    `${API_BASE_URL}/products/import/template?language=${language}`,
    accessToken,
  );
}

export async function importProductProfiles(
  accessToken: string,
  file: File,
) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/products/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return (await response.json()) as { data: ProductImportResult };
}

export async function createProductProfile(
  accessToken: string,
  payload: ProductProfilePayload,
) {
  const response = await fetch(`${API_BASE_URL}/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: ProductProfile };
}

export async function updateProductProfile(
  accessToken: string,
  productId: string,
  payload: ProductProfilePayload,
) {
  const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: ProductProfile };
}

export async function updateProductRoiRegions(
  accessToken: string,
  productId: string,
  roiRegions: RoiRegion[],
) {
  const response = await fetch(
    `${API_BASE_URL}/products/${productId}/roi-regions`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roiRegions }),
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: ProductProfile };
}

export async function updateProductProfileStatus(
  accessToken: string,
  productId: string,
  active: boolean,
) {
  const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ active }),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: ProductProfile };
}

export async function updateProductBatchSize(
  accessToken: string,
  productId: string,
  batchSize: number,
) {
  const response = await fetch(
    `${API_BASE_URL}/products/${productId}/batch-size`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batchSize }),
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: ProductProfile };
}

export async function updateProductOcrTestSettings(
  accessToken: string,
  productId: string,
  rotateTestImageClockwise: boolean,
) {
  const response = await fetch(
    `${API_BASE_URL}/products/${productId}/ocr-test-settings`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rotateTestImageClockwise }),
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: ProductProfile };
}

export async function bulkUpdateProductOcrTestSettings(
  accessToken: string,
  payload: BulkProductOcrTestSettingsPayload,
) {
  const response = await fetch(
    `${API_BASE_URL}/products/ocr-test-settings/apply`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: { updatedCount: number } };
}

export async function bulkUpdateProductAiSettings(
  accessToken: string,
  payload: BulkProductAiSettingsPayload,
) {
  const response = await fetch(`${API_BASE_URL}/products/ai-settings/apply`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: { updatedCount: number } };
}

export async function deleteProductProfile(
  accessToken: string,
  productId: string,
) {
  const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: { success: boolean } };
}

export async function applyProductProfile(
  accessToken: string,
  payload: ApplyProductProfilePayload,
) {
  const response = await fetch(`${API_BASE_URL}/products/apply-profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return (await response.json()) as { data: { updatedCount: number } };
}

export async function getPlcConfiguration(accessToken: string) {
  return plcRequest<{ data: PlcConfiguration | null }>(
    accessToken,
    "/plc/config",
  );
}

export async function savePlcConfiguration(
  accessToken: string,
  payload: PlcConfigurationPayload,
) {
  return plcRequest<{ data: PlcConfiguration }>(accessToken, "/plc/config", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getPlcStatus(accessToken: string) {
  return plcRequest<{ data: PlcRuntimeStatus }>(accessToken, "/plc/status");
}

export async function connectPlc(accessToken: string) {
  return plcRequest<{ data: PlcRuntimeStatus }>(accessToken, "/plc/connect", {
    method: "POST",
  });
}

export async function disconnectPlc(accessToken: string) {
  return plcRequest<{ data: PlcRuntimeStatus }>(
    accessToken,
    "/plc/disconnect",
    {
      method: "POST",
    },
  );
}

export async function setPlcCameraPower(accessToken: string, enabled: boolean) {
  return plcRequest<{ data: PlcRuntimeStatus }>(
    accessToken,
    "/plc/outputs/camera-power",
    { method: "PUT", body: JSON.stringify({ enabled }) },
  );
}

export async function setPlcCameraLight(accessToken: string, enabled: boolean) {
  return plcRequest<{ data: PlcRuntimeStatus }>(
    accessToken,
    "/plc/outputs/camera-light",
    { method: "PUT", body: JSON.stringify({ enabled }) },
  );
}

export async function setPlcOkResult(accessToken: string, enabled: boolean) {
  return plcRequest<{ data: PlcRuntimeStatus }>(
    accessToken,
    "/plc/outputs/ok-result",
    { method: "PUT", body: JSON.stringify({ enabled }) },
  );
}

export async function setPlcWaitingChecking(
  accessToken: string,
  enabled: boolean,
) {
  return plcRequest<{ data: PlcRuntimeStatus }>(
    accessToken,
    "/plc/outputs/waiting-checking",
    { method: "PUT", body: JSON.stringify({ enabled }) },
  );
}

export async function pulsePlcError(accessToken: string) {
  return plcRequest<{ data: PlcRuntimeStatus }>(
    accessToken,
    "/plc/outputs/error-pulse",
    { method: "POST" },
  );
}

export async function executePlcCustomKey(
  accessToken: string,
  id: string,
  value: boolean,
) {
  return plcRequest<{ data: PlcRuntimeStatus }>(
    accessToken,
    `/plc/custom-keys/${encodeURIComponent(id)}/execute`,
    { method: "POST", body: JSON.stringify({ value }) },
  );
}

export async function getMachineRuntimeStatus(accessToken: string) {
  return plcRequest<{ data: MachineRuntimeStatus }>(
    accessToken,
    "/plc/machine/status",
  );
}

export async function startMachineOperation(accessToken: string) {
  return plcRequest<{ data: MachineRuntimeStatus }>(
    accessToken,
    "/plc/machine/start",
    { method: "POST" },
  );
}

export async function stopMachineOperation(accessToken: string) {
  return plcRequest<{ data: MachineRuntimeStatus }>(
    accessToken,
    "/plc/machine/stop",
    { method: "POST" },
  );
}

export async function notifyManualPlcLatch(accessToken: string) {
  return plcRequest<{ data: MachineRuntimeStatus }>(
    accessToken,
    "/plc/machine/manual-latch",
    { method: "POST" },
  );
}

export async function resumeMachineOperation(accessToken: string) {
  return plcRequest<{ data: MachineRuntimeStatus }>(
    accessToken,
    "/plc/machine/resume",
    { method: "POST" },
  );
}

export async function reconnectMachinePlc(accessToken: string) {
  return plcRequest<{ data: MachineRuntimeStatus }>(
    accessToken,
    "/plc/machine/reconnect-plc",
    { method: "POST" },
  );
}

async function plcRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return (await response.json()) as T;
}
