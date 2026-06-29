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
  friendly_name: string;
  model_name?: string | null;
  serial_number?: string | null;
  device_class?: string | null;
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
  result: "OK" | "NG" | "UNKNOWN";
  errorMessage: string | null;
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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000/api";

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

export async function getCurrentSession(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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
  const response = await fetch(`${API_BASE_URL}/roles/${roleCode}/permissions`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ permissions }),
  });

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

export async function updateProductBatchSize(
  accessToken: string,
  productId: string,
  batchSize: number,
) {
  const response = await fetch(`${API_BASE_URL}/products/${productId}/batch-size`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ batchSize }),
  });

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
  const response = await fetch(`${API_BASE_URL}/products/ocr-test-settings/apply`, {
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
