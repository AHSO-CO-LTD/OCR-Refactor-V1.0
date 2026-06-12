export type RoleCode = "dev" | "admin" | "engineer" | "operator";

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: RoleCode;
  permissions: string[];
  isDev: boolean;
};

export type LoginResponse = {
  data: {
    accessToken: string;
    user: SessionUser;
  };
};

export type MeResponse = {
  data: {
    user: SessionUser;
  };
};

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
  modelPath: string | null;
  active: boolean;
  camera: CameraProfile;
  roiRegions: RoiRegion[];
  createdAt: string;
  updatedAt: string;
};

export type ProductProfilePayload = {
  code: string;
  name: string;
  defaultNumber: number;
  batchSize: number;
  exposure: number;
  thresholdAccept: number;
  thresholdMns: number;
  modelPath?: string;
  active: boolean;
  camera: CameraProfile;
  roiRegions: RoiRegion[];
};

export type ApplyProductProfilePayload = {
  sourceProductId: string;
  targetProductIds?: string[];
  applyToAll?: boolean;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

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
