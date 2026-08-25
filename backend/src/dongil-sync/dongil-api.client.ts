export type DongilRegistration = {
  machineId: string;
  registrationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  assignedMachineTypeCode: string;
  registrationToken: string | null;
  requiresCredentialRecovery?: boolean;
};

export type DongilRegistrationStatus = {
  machineId: string;
  registrationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  assignedMachineTypeCode: string;
  rejectionReason: string | null;
  credentialReady: boolean;
};

export type DongilMachineAssignment = {
  assignedAt: string;
  product: { code: string; name: string };
  profile: { version: number };
  model: { version: string };
};

export type DongilMachineConfig = {
  machineId: string;
  assignedMachineType: { code: string; nameVi: string; nameEn: string };
  assignments: DongilMachineAssignment[];
};

export type DongilBatchItem = {
  localResultId: string;
  disposition: 'ACCEPTED' | 'REPLAYED' | 'FAILED';
  error?: { code?: string; message?: string };
};

export type DongilBatchResponse = {
  localBatchId: string;
  total: number;
  accepted: number;
  replayed: number;
  failed: number;
  items: DongilBatchItem[];
};

type DongilResultPayload = {
  localResultId: string;
  productCode: string;
  productName?: string;
  result: 'OK' | 'NG';
  localSessionId?: string;
  inspectedAt: string;
};

type ApiEnvelope<T> = {
  status: number;
  data: T | null;
  message: string;
  error: { code?: string; details?: unknown } | null;
};

export class DongilApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class DongilApiClient {
  constructor(private readonly serverUrl: string) {}

  register(payload: {
    machineId: string;
    machineTypeCode: string;
    licenseStatus: 'LICENSED' | 'UNLICENSED';
    appVersion?: string;
  }) {
    return this.request<DongilRegistration>('/api/v1/machines/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
    });
  }

  getRegistrationStatus(machineId: string, registrationToken: string) {
    return this.request<DongilRegistrationStatus>(
      '/api/v1/machines/registration-status',
      {
        method: 'POST',
        body: JSON.stringify({ machineId, registrationToken }),
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  getCurrentConfig(machineId: string, credential: string) {
    return this.request<DongilMachineConfig>('/api/v1/machine-config/current', {
      method: 'GET',
      headers: this.machineHeaders(machineId, credential),
    });
  }

  sendBatch(
    machineId: string,
    credential: string,
    payload: {
      localBatchId: string;
      items: DongilResultPayload[];
    },
  ) {
    return this.request<DongilBatchResponse>(
      '/api/v1/inspection-results/batches',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          ...this.machineHeaders(machineId, credential),
          'content-type': 'application/json',
        },
      },
    );
  }

  sendWashingBatch(
    machineId: string,
    credential: string,
    payload: {
      localBatchId: string;
      items: Array<DongilResultPayload & { okCount: number; ngCount: number }>;
    },
  ) {
    return this.request<DongilBatchResponse>(
      '/api/v1/machine-types/washing/inspection-results/batches',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          ...this.machineHeaders(machineId, credential),
          'content-type': 'application/json',
        },
      },
    );
  }

  private machineHeaders(machineId: string, credential: string) {
    return {
      authorization: `Machine ${credential}`,
      'x-machine-id': machineId,
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, `${this.serverUrl}/`), {
      ...init,
      signal: AbortSignal.timeout(8_000),
    });
    const envelope = (await response
      .json()
      .catch(() => null)) as ApiEnvelope<T> | null;
    if (!response.ok || !envelope || envelope.data === null) {
      throw new DongilApiError(
        response.status,
        envelope?.error?.code || 'DONGIL_REQUEST_FAILED',
        envelope?.message ||
          `Dongil Server request failed with HTTP ${response.status}`,
      );
    }
    return envelope.data;
  }
}
