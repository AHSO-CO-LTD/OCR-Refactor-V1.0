import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Buffer } from 'node:buffer';
import WebSocket, { type RawData } from 'ws';
import { PrismaService } from '../database/prisma.service';
import {
  CameraProfileDto,
  RoiRegionDto,
} from '../products/dto/product-profile.dto';

type ToolEnvelope<T> =
  | {
      status: 'success';
      data: T;
    }
  | {
      status: 'fail';
      error: string;
    };

type ToolRootHealth = {
  service: string;
  status: string;
  version: string;
};

type ToolBaslerDevice = {
  serial: string;
  model?: string | null;
  vendor?: string | null;
  interface?: string | null;
  name?: string | null;
};

type ToolCameraStatus = {
  id: string;
  kind?: string;
  driver?: string;
  state: 'connected' | 'not connected';
  fps?: number | null;
  exposure?: number | null;
  jpeg_quality?: number | null;
  geometry?: {
    width?: number | null;
    height?: number | null;
    offset_x?: number | null;
    offset_y?: number | null;
  };
  detector_name?: string | null;
};

type ToolCameraRange = {
  min?: number | null;
  max?: number | null;
  inc?: number | null;
  value?: number | null;
};

type ToolPredictResponse = {
  rows?: string[];
};

type ToolCameraOcrRoiResult = {
  roi?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    rotate?: number;
  };
  rows?: string[];
  error?: string | null;
};

type ToolCameraOcrResult = {
  seq?: number;
  rows?: string[];
  rois?: ToolCameraOcrRoiResult[];
  error?: string | null;
};

type DeviceToolOcrRoi = {
  label?: string | null;
  rows: string[];
  text: string;
  error?: string | null;
  debugImageBase64?: string | null;
};

type DeviceToolInspectionRequest = {
  modelPath: string;
  camera: CameraProfileDto;
  roiRegions: RoiRegionDto[];
  thresholdAccept: number;
  thresholdMns: number;
  rowThreshold: number;
  rotateImageClockwise: boolean;
};

type DeviceToolImageInspectionRequest = Omit<
  DeviceToolInspectionRequest,
  'camera'
> & {
  crops: { slotIndex: number; imageBase64: string }[];
};

@Injectable()
export class DeviceToolService {
  private activeCameraSerial: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getHealth() {
    return this.requestRawJson<ToolRootHealth>('/', { method: 'GET' });
  }

  async listCameraIdentities() {
    const identities = await this.prisma.cameraIdentity.findMany({
      orderBy: [{ active: 'desc' }, { displayName: 'asc' }, { serial: 'asc' }],
    });

    return {
      data: identities.map((identity) => this.toCameraIdentity(identity)),
    };
  }

  async syncCameraIdentities() {
    await this.discoverAndUpsertCameraIdentities();
    return this.listCameraIdentities();
  }

  async updateCameraIdentity(
    id: string,
    dto: { active?: boolean; displayName?: string },
  ) {
    const existing = await this.prisma.cameraIdentity.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Camera identity not found');
    }

    const displayName = dto.displayName?.trim();
    const marksIdentified = Boolean(displayName || dto.active === true);

    if (dto.displayName !== undefined && !displayName) {
      throw new BadRequestException('Camera display name is required');
    }

    const identity = await this.prisma.cameraIdentity.update({
      where: { id },
      data: {
        active: dto.active,
        displayName,
        identifiedAt: marksIdentified
          ? (existing.identifiedAt ?? new Date())
          : undefined,
      },
    });

    return { data: this.toCameraIdentity(identity) };
  }

  async listCameraDevices() {
    const identities = await this.discoverAndUpsertCameraIdentities();

    return {
      data: identities.map((identity, index) => ({
        index,
        identityId: identity.id,
        identity_id: identity.id,
        friendly_name: identity.displayName,
        identified: Boolean(identity.identifiedAt),
        connectable: Boolean(identity.identifiedAt && identity.active),
        status: this.getCameraIdentityStatus(identity),
        model_name: identity.modelName,
        serial_number: identity.serial,
        device_class: identity.interfaceName,
      })),
    };
  }

  async getCameraStatus() {
    const session = await this.getActiveCameraSession();

    if (!session) {
      return {
        success: true,
        data: {
          connected: false,
          is_grabbing: false,
          device_name: null,
          serial_number: null,
        },
      };
    }

    const identity = await this.findIdentityBySerial(session.id);

    return {
      success: true,
      data: this.toRuntimeStatusData(session, identity),
    };
  }

  async ensureCameraReady(camera: CameraProfileDto) {
    return this.ensureCameraConnected(camera);
  }

  async ensureCameraPreviewReady(camera: CameraProfileDto) {
    return this.ensureCameraConnected(camera);
  }

  async disconnectCamera() {
    const serial = await this.getActiveCameraSerial();

    if (!serial) {
      return { success: true };
    }

    await this.requestToolJson<null>(
      this.getToolPath(`/basler_area/${encodeURIComponent(serial)}/disconnect`),
      { method: 'POST' },
      'disconnect camera',
    );
    this.activeCameraSerial = null;

    return { success: true };
  }

  async grabCameraFrame(request: {
    encodeFormat?: string;
    jpegQuality?: number;
  }) {
    void request;

    const serial = await this.requireActiveCameraSerial('grab camera frame');
    const buffer = await this.requestToolBinary(
      this.getToolPath(`/camera/${encodeURIComponent(serial)}/grab`),
      { method: 'GET' },
      'grab camera frame',
    );
    const status = await this.getActiveCameraSession();
    const geometry = status?.geometry ?? {};

    return {
      success: true,
      width: geometry.width ?? 0,
      height: geometry.height ?? 0,
      channels: 3,
      capture_time_ms: 0,
      image_base64: buffer.toString('base64'),
      encode_format: '.jpg',
    };
  }

  async getCameraFrameRate() {
    const session = await this.getActiveCameraSession();
    const connected = Boolean(session);
    const diagnostics = connected
      ? await this.getCameraDebugInfo().catch(() => null)
      : null;
    const source: Record<string, unknown> | null =
      diagnostics?.diagnostics ?? null;
    const resultingFps = this.toNumber(source?.resulting_fps);

    return {
      success: true,
      data: {
        connected,
        requested_stream_fps: null,
        configured_fps: null,
        camera_resulting_fps: session?.fps ?? resultingFps,
        camera_max_fps: resultingFps,
        effective_stream_fps: session?.fps ?? null,
        writable: connected,
        error: null,
        source,
      },
    };
  }

  async getCameraRanges() {
    const serial = await this.getActiveCameraSerial();

    if (!serial) {
      return {
        success: false,
        ranges: {},
        error: 'No active camera is connected',
      };
    }

    const ranges = await this.requestToolJson<
      Record<string, ToolCameraRange | null>
    >(
      this.getToolPath(`/basler_area/${encodeURIComponent(serial)}/ranges`),
      { method: 'GET' },
      'get camera hardware ranges',
    );

    return { success: true, ranges, error: null };
  }

  async getCameraDebugInfo() {
    const serial = await this.getActiveCameraSerial();

    if (!serial) {
      return {
        success: false,
        diagnostics: {},
        error: 'No active camera is connected',
      };
    }

    const diagnostics = await this.requestToolJson<Record<string, unknown>>(
      this.getToolPath(`/basler_area/${encodeURIComponent(serial)}/debug_info`),
      { method: 'GET' },
      'get camera debug information',
    );

    return { success: true, diagnostics, error: null };
  }

  async inspectProduct(request: DeviceToolInspectionRequest) {
    await this.startCameraOcr(request);

    try {
      const serial = await this.requireActiveCameraSerial('read camera OCR');
      const result = await this.waitForCameraOcrResult(serial);
      const session = await this.getActiveCameraSession();
      const geometry = session?.geometry ?? {};

      return {
        success: !result.error,
        image_width: geometry.width ?? 0,
        image_height: geometry.height ?? 0,
        cycle_time_ms: 0,
        results: this.cameraOcrResultToSlots(result, request.roiRegions),
        error: result.error ?? null,
      };
    } finally {
      await this.stopCameraOcr().catch(() => undefined);
    }
  }

  async inspectProductImage(request: DeviceToolImageInspectionRequest) {
    await this.loadOcrModel({
      modelPath: request.modelPath,
      thresholdAccept: request.thresholdAccept,
      thresholdMns: request.thresholdMns,
      rowThreshold: request.rowThreshold,
    });

    const startedAt = Date.now();
    const results = await Promise.all(
      request.crops.map(async (crop) => {
        const roi = request.roiRegions.find(
          (region) => region.index === crop.slotIndex,
        );
        const prediction = await this.predictOcrCrop(crop.imageBase64);
        const rows = (prediction.rows ?? []).map((row) => String(row));

        return {
          label: `slot-${crop.slotIndex}`,
          rows,
          text: rows.join(' '),
          x: roi?.x ?? 0,
          y: roi?.y ?? 0,
          width: roi?.width ?? 0,
          height: roi?.height ?? 0,
          error: null,
          debugImageBase64: null,
        };
      }),
    );

    return {
      success: true,
      image_width: 0,
      image_height: 0,
      cycle_time_ms: Date.now() - startedAt,
      results,
      error: null,
    };
  }

  async startCameraOcr(request: DeviceToolInspectionRequest) {
    const serial = await this.ensureCameraConnected(request.camera);
    await this.loadOcrModel({
      modelPath: request.modelPath,
      thresholdAccept: request.thresholdAccept,
      thresholdMns: request.thresholdMns,
      rowThreshold: request.rowThreshold,
    });

    return this.requestToolJson<{ rois: number[][] | null }>(
      this.getToolPath(
        `/camera/${encodeURIComponent(serial)}/AI/yolo_ocr/start`,
      ),
      {
        method: 'POST',
        body: JSON.stringify({
          rois: request.roiRegions.map((region) =>
            this.toToolRoi(region, request),
          ),
        }),
      },
      'start camera OCR',
    );
  }

  async stopCameraOcr() {
    const serial = await this.getActiveCameraSerial();

    if (!serial) {
      return { success: true };
    }

    await this.requestToolJson<null>(
      this.getToolPath(
        `/camera/${encodeURIComponent(serial)}/AI/yolo_ocr/stop`,
      ),
      { method: 'POST' },
      'stop camera OCR',
    );

    return { success: true };
  }

  getActiveCameraSerialSync() {
    return this.activeCameraSerial;
  }

  async requireActiveCameraSerial(action: string) {
    const serial = await this.getActiveCameraSerial();

    if (!serial) {
      throw new BadRequestException(
        `No active camera is connected to ${action}`,
      );
    }

    return serial;
  }

  getToolWebSocketUrl(path: string) {
    const url = new URL(this.getToolPath(path), this.getBaseUrl());
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }

  async setActiveStreamConfig(jpegQuality: number) {
    const serial = await this.requireActiveCameraSerial('configure stream');

    await this.requestToolJson<{ jpeg_quality: number }>(
      this.getToolPath(`/camera/${encodeURIComponent(serial)}/stream_config`),
      {
        method: 'POST',
        body: JSON.stringify({ jpeg_quality: jpegQuality }),
      },
      'configure camera stream',
    );

    return serial;
  }

  private async ensureCameraConnected(camera: CameraProfileDto) {
    if (camera.sourceType !== 'usb') {
      throw new BadRequestException(
        'Current device tool integration supports usb camera profiles only',
      );
    }

    const identity = await this.resolveCameraIdentity(camera);
    const activeSession = await this.getActiveCameraSession();

    if (activeSession && activeSession.id !== identity.serial) {
      await this.disconnectCamera();
    }

    if (!activeSession || activeSession.id !== identity.serial) {
      await this.requestToolJson<ToolCameraStatus>(
        this.getToolPath('/basler_area/connect'),
        {
          method: 'POST',
          body: JSON.stringify({
            serial: identity.serial,
            interface: identity.interfaceName ?? 'GigE',
            exposure: camera.exposure,
          }),
        },
        'connect camera',
      );
    }

    await this.requestToolJson<{
      applied: Record<string, unknown>;
      camera: ToolCameraStatus;
    }>(
      this.getToolPath(
        `/basler_area/${encodeURIComponent(identity.serial)}/param`,
      ),
      {
        method: 'POST',
        body: JSON.stringify({
          exposure: camera.exposure,
          width: camera.imageWidth,
          height: camera.imageHeight,
          offset_x: camera.offsetX,
          offset_y: camera.offsetY,
        }),
      },
      'update camera settings',
    );

    this.activeCameraSerial = identity.serial;
    return identity.serial;
  }

  private async discoverAndUpsertCameraIdentities() {
    const devices = await this.requestToolJson<ToolBaslerDevice[]>(
      this.getToolPath('/basler_area/devices'),
      { method: 'GET' },
      'list camera devices',
    );
    const now = new Date();

    for (const device of devices) {
      await this.prisma.cameraIdentity.upsert({
        where: { serial: device.serial },
        create: {
          serial: device.serial,
          displayName: this.defaultIdentityName(device),
          driver: 'basler_area',
          active: false,
          modelName: device.model ?? null,
          vendor: device.vendor ?? null,
          interfaceName: device.interface ?? null,
          toolName: device.name ?? null,
          lastSeenAt: now,
        },
        update: {
          modelName: device.model ?? null,
          vendor: device.vendor ?? null,
          interfaceName: device.interface ?? null,
          toolName: device.name ?? null,
          lastSeenAt: now,
        },
      });
    }

    return this.prisma.cameraIdentity.findMany({
      where:
        devices.length > 0
          ? { serial: { in: devices.map((device) => device.serial) } }
          : undefined,
      orderBy: [{ active: 'desc' }, { displayName: 'asc' }, { serial: 'asc' }],
    });
  }

  private async resolveCameraIdentity(camera: CameraProfileDto) {
    if (camera.cameraIdentityId) {
      const identity = await this.prisma.cameraIdentity.findUnique({
        where: { id: camera.cameraIdentityId },
      });

      this.assertCameraIdentityConnectable(identity, camera.cameraIdentityId);
      return identity;
    }

    const normalizedDeviceName = this.normalizeCameraName(camera.deviceName);
    const identities = await this.prisma.cameraIdentity.findMany({
      where: { active: true, identifiedAt: { not: null } },
    });
    const fromSaved = this.findMatchingIdentity(
      identities,
      normalizedDeviceName,
    );

    if (fromSaved) {
      return fromSaved;
    }

    const discovered = await this.discoverAndUpsertCameraIdentities();
    const fromDiscovered = this.findMatchingIdentity(
      discovered.filter((identity) =>
        this.isCameraIdentityConnectable(identity),
      ),
      normalizedDeviceName,
    );

    if (fromDiscovered) {
      return fromDiscovered;
    }

    if (
      !normalizedDeviceName &&
      discovered.length === 1 &&
      this.isCameraIdentityConnectable(discovered[0])
    ) {
      return discovered[0];
    }

    throw new BadRequestException(
      `Camera identity "${camera.deviceName ?? camera.cameraIdentityId ?? ''}" was not identified or is disabled`,
    );
  }

  private assertCameraIdentityConnectable<
    T extends {
      active: boolean;
      displayName: string;
      identifiedAt: Date | null;
    },
  >(identity: T | null, fallbackName: string): asserts identity is T {
    if (!identity) {
      throw new BadRequestException(
        `Camera identity "${fallbackName}" was not found`,
      );
    }

    if (!identity.identifiedAt) {
      throw new BadRequestException(
        `Camera "${identity.displayName}" has not been identified`,
      );
    }

    if (!identity.active) {
      throw new BadRequestException(
        `Camera "${identity.displayName}" is disabled`,
      );
    }
  }

  private isCameraIdentityConnectable(identity: {
    active: boolean;
    identifiedAt: Date | null;
  }) {
    return Boolean(identity.identifiedAt && identity.active);
  }

  private getCameraIdentityStatus(identity: {
    active: boolean;
    identifiedAt: Date | null;
  }) {
    if (!identity.identifiedAt) {
      return 'unidentified';
    }

    return identity.active ? 'identified' : 'disabled';
  }

  private findMatchingIdentity<
    T extends {
      displayName: string;
      interfaceName: string | null;
      modelName: string | null;
      serial: string;
      toolName: string | null;
    },
  >(identities: T[], normalizedDeviceName: string) {
    if (!normalizedDeviceName) {
      return null;
    }

    return (
      identities.find((identity) =>
        [
          identity.displayName,
          identity.serial,
          identity.modelName,
          identity.toolName,
          `${identity.modelName ?? ''} ${identity.serial}`.trim(),
        ]
          .map((value) => this.normalizeCameraName(value))
          .filter(Boolean)
          .some(
            (candidate) =>
              candidate.includes(normalizedDeviceName) ||
              normalizedDeviceName.includes(candidate),
          ),
      ) ?? null
    );
  }

  private async getActiveCameraSerial() {
    const session = await this.getActiveCameraSession();
    return session?.id ?? null;
  }

  private async getActiveCameraSession() {
    const sessions = await this.requestToolJson<ToolCameraStatus[]>(
      this.getToolPath('/camera/list'),
      { method: 'GET' },
      'list connected cameras',
    ).catch((): ToolCameraStatus[] => []);

    if (this.activeCameraSerial) {
      const activeSession = sessions.find(
        (session) => session.id === this.activeCameraSerial,
      );

      if (activeSession) {
        return activeSession;
      }
    }

    const firstSession = sessions[0] ?? null;
    this.activeCameraSerial = firstSession?.id ?? null;
    return firstSession;
  }

  private findIdentityBySerial(serial: string) {
    return this.prisma.cameraIdentity.findUnique({ where: { serial } });
  }

  private async loadOcrModel(request: {
    modelPath: string;
    thresholdAccept: number;
    thresholdMns: number;
    rowThreshold: number;
  }) {
    await this.requestToolJson<Record<string, unknown>>(
      this.getToolPath('/AI/yolo_ocr/load_model'),
      {
        method: 'POST',
        body: JSON.stringify({
          model_path: request.modelPath,
          conf: request.thresholdAccept,
          iou: request.thresholdMns,
          row_threshold: request.rowThreshold,
        }),
      },
      'load OCR model',
    );
  }

  private predictOcrCrop(imageBase64: string) {
    return this.requestToolJson<ToolPredictResponse>(
      this.getToolPath('/AI/yolo_ocr/predict'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: this.decodeBase64Image(imageBase64),
      },
      'predict OCR crop',
    );
  }

  private waitForCameraOcrResult(serial: string) {
    return new Promise<ToolCameraOcrResult>((resolve, reject) => {
      const socket = new WebSocket(
        this.getToolWebSocketUrl(
          `/camera/${encodeURIComponent(serial)}/AI/yolo_ocr/results`,
        ),
      );
      const timeout = setTimeout(() => {
        socket.close();
        reject(
          new ServiceUnavailableException('Timed out waiting for OCR result'),
        );
      }, 15000);

      socket.once('message', (data) => {
        clearTimeout(timeout);

        try {
          const envelope = JSON.parse(
            this.rawDataToString(data),
          ) as ToolEnvelope<ToolCameraOcrResult>;

          if (envelope.status === 'fail') {
            reject(
              new BadGatewayException(
                `Device tool OCR failed: ${envelope.error}`,
              ),
            );
            return;
          }

          resolve(envelope.data);
        } catch (error) {
          reject(this.toError(error));
        } finally {
          socket.close();
        }
      });

      socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(
          new ServiceUnavailableException(
            `Device tool OCR stream is unavailable: ${error.message}`,
          ),
        );
      });
    });
  }

  private cameraOcrResultToSlots(
    result: ToolCameraOcrResult,
    roiRegions: RoiRegionDto[],
  ): DeviceToolOcrRoi[] {
    if (Array.isArray(result.rois)) {
      return roiRegions.map((region, index) => {
        const roiResult = result.rois?.[index];

        return {
          label: `slot-${region.index}`,
          rows: (roiResult?.rows ?? []).map((row) => String(row)),
          text: (roiResult?.rows ?? []).map((row) => String(row)).join(' '),
          error: roiResult?.error ?? null,
          debugImageBase64: null,
        };
      });
    }

    return [
      {
        label: 'frame',
        rows: (result.rows ?? []).map((row) => String(row)),
        text: (result.rows ?? []).map((row) => String(row)).join(' '),
        error: result.error ?? null,
        debugImageBase64: null,
      },
    ];
  }

  private toToolRoi(
    region: RoiRegionDto,
    request: DeviceToolInspectionRequest,
  ) {
    return {
      x: Math.max(0, Math.round(region.x - region.width / 2)),
      y: Math.max(0, Math.round(region.y - region.height / 2)),
      w: region.width,
      h: region.height,
      rotate: request.rotateImageClockwise
        ? 90
        : this.toToolRotation(region.rotation),
    };
  }

  private toToolRotation(rotation: number) {
    const normalized = ((rotation % 360) + 360) % 360;
    return (Math.round(normalized / 90) * 90) % 360;
  }

  private decodeBase64Image(value: string) {
    const payload = value.startsWith('data:') ? value.split(',', 2)[1] : value;

    if (!payload) {
      throw new BadRequestException('Image crop payload is empty');
    }

    return Buffer.from(payload, 'base64');
  }

  private async requestRawJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchTool(
      path,
      init,
      'check device tool health',
    );
    return (await response.json()) as T;
  }

  private async requestToolJson<T>(
    path: string,
    init: RequestInit,
    action: string,
  ): Promise<T> {
    const response = await this.fetchTool(path, init, action);
    const raw = await response.text();
    const parsed = raw ? (JSON.parse(raw) as ToolEnvelope<T>) : null;

    if (!parsed) {
      throw new BadGatewayException(
        `Device tool returned no data while trying to ${action}`,
      );
    }

    if (parsed.status === 'fail') {
      throw new BadGatewayException(
        `Device tool failed to ${action}: ${parsed.error}`,
      );
    }

    return parsed.data;
  }

  private async requestToolBinary(
    path: string,
    init: RequestInit,
    action: string,
  ) {
    const response = await this.fetchTool(path, init, action);
    return Buffer.from(await response.arrayBuffer());
  }

  private async fetchTool(path: string, init: RequestInit, action: string) {
    const headers = new Headers(init.headers);

    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const message = await this.readToolError(response);
        throw new BadGatewayException(
          `Device tool failed to ${action}: ${message}`,
        );
      }

      return response;
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown device tool error';

      throw new ServiceUnavailableException(
        `Device tool is unavailable while trying to ${action}: ${message}`,
      );
    }
  }

  private async readToolError(response: Response) {
    const raw = await response.text();

    if (!raw) {
      return `${response.status} ${response.statusText}`;
    }

    try {
      const parsed = JSON.parse(raw) as { detail?: string; error?: string };
      return parsed.detail ?? parsed.error ?? raw;
    } catch {
      return raw;
    }
  }

  private rawDataToString(data: RawData) {
    if (Array.isArray(data)) {
      return Buffer.concat(data).toString('utf8');
    }

    if (Buffer.isBuffer(data)) {
      return data.toString('utf8');
    }

    return Buffer.from(data).toString('utf8');
  }

  private toError(error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
  }

  private getBaseUrl() {
    const value =
      this.configService.get<string>('DEVICE_TOOL_BASE_URL') ??
      'http://localhost:8000';

    return value.replace(/\/+$/, '');
  }

  private getToolPath(path: string) {
    const prefix =
      this.configService.get<string>('DEVICE_TOOL_API_PREFIX') ?? '/tool/v1';
    const normalizedPrefix = `/${prefix.replace(/^\/+|\/+$/g, '')}`;
    const normalizedPath = `/${path.replace(/^\/+/, '')}`;

    return `${normalizedPrefix}${normalizedPath}`;
  }

  private defaultIdentityName(device: ToolBaslerDevice) {
    return (
      device.name || `${device.model ?? 'Basler camera'} (${device.serial})`
    );
  }

  private normalizeCameraName(value: unknown) {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toRuntimeStatusData(
    session: ToolCameraStatus,
    identity: {
      displayName: string;
      interfaceName: string | null;
      modelName: string | null;
      serial: string;
      vendor: string | null;
    } | null,
  ) {
    const geometry = session.geometry ?? {};

    return {
      connected: session.state === 'connected',
      is_grabbing: Boolean(session.fps && session.fps > 0),
      device_name: identity?.displayName ?? session.id,
      serial_number: session.id,
      model_name: identity?.modelName ?? null,
      vendor: identity?.vendor ?? null,
      interface: identity?.interfaceName ?? null,
      image_width: geometry.width ?? null,
      image_height: geometry.height ?? null,
      geometry_width: geometry.width ?? null,
      geometry_height: geometry.height ?? null,
      offset_x: geometry.offset_x ?? null,
      offset_y: geometry.offset_y ?? null,
      exposure: session.exposure ?? null,
      fps: session.fps ?? null,
      detector_name: session.detector_name ?? null,
      jpeg_quality: session.jpeg_quality ?? null,
    };
  }

  private toCameraIdentity(identity: {
    active: boolean;
    createdAt: Date;
    displayName: string;
    driver: string;
    id: string;
    identifiedAt: Date | null;
    interfaceName: string | null;
    lastSeenAt: Date | null;
    modelName: string | null;
    serial: string;
    toolName: string | null;
    updatedAt: Date;
    vendor: string | null;
  }) {
    return {
      id: identity.id,
      serial: identity.serial,
      displayName: identity.displayName,
      driver: identity.driver,
      modelName: identity.modelName,
      vendor: identity.vendor,
      interfaceName: identity.interfaceName,
      toolName: identity.toolName,
      identified: Boolean(identity.identifiedAt),
      identifiedAt: identity.identifiedAt?.toISOString() ?? null,
      connectable: Boolean(identity.identifiedAt && identity.active),
      status: this.getCameraIdentityStatus(identity),
      active: identity.active,
      lastSeenAt: identity.lastSeenAt?.toISOString() ?? null,
      createdAt: identity.createdAt.toISOString(),
      updatedAt: identity.updatedAt.toISOString(),
    };
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }

    return null;
  }
}
