import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CameraProfileDto,
  RoiRegionDto,
} from '../products/dto/product-profile.dto';

type DeviceToolHealthResponse = {
  service: string;
  version: string;
  camera_connected: boolean;
  plc_connected: boolean;
  ocr_model_loaded: boolean;
  details: {
    camera?: {
      connected?: boolean;
    };
  };
};

type DeviceToolOcrRoi = {
  label?: string | null;
  text: string;
  error?: string | null;
  debugImageBase64?: string | null;
};

type DeviceToolPredictResponse = {
  success: boolean;
  rows?: string[];
  error?: string | null;
  debug_image_base64?: string | null;
};

type DeviceToolActionResponse = {
  success: boolean;
  error?: string | null;
  [key: string]: unknown;
};

type DeviceToolOcrRoisResponse = {
  success: boolean;
  image_width: number;
  image_height: number;
  cycle_time_ms: number;
  results: DeviceToolOcrRoi[];
  error?: string | null;
};

type DeviceToolInspectionRequest = {
  modelPath: string;
  camera: CameraProfileDto;
  roiRegions: RoiRegionDto[];
  thresholdAccept: number;
  thresholdMns: number;
};

type DeviceToolImageInspectionRequest = Omit<
  DeviceToolInspectionRequest,
  'camera'
> & {
  crops: { slotIndex: number; imageBase64: string }[];
};

type DeviceToolCameraDevice = {
  index: number;
  friendly_name: string;
  model_name?: string | null;
  serial_number?: string | null;
  device_class?: string | null;
};

type DeviceToolCameraStatusResponse = {
  success: boolean;
  data: Record<string, unknown>;
};

type DeviceToolGrabFrameResponse = {
  success: boolean;
  width: number;
  height: number;
  channels: number;
  capture_time_ms: number;
  image_base64: string;
  encode_format: string;
};

type DeviceToolCameraFrameRateResponse = {
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

type DeviceToolCameraRange = {
  min?: number | null;
  max?: number | null;
  inc?: number | null;
  value?: number | null;
};

type DeviceToolCameraRangesResponse = {
  success: boolean;
  ranges: Record<string, DeviceToolCameraRange | null>;
  error?: string | null;
};

type DeviceToolCameraDebugInfoResponse = {
  success: boolean;
  diagnostics: Record<string, unknown>;
  error?: string | null;
};

@Injectable()
export class DeviceToolService {
  private readonly activeCameraId = 'active-camera';

  constructor(private readonly configService: ConfigService) {}

  async getHealth() {
    return this.requestJson<DeviceToolHealthResponse>(
      this.getToolPath('/health'),
      { method: 'GET' },
      'check device tool health',
    );
  }

  async ensureCameraReady(camera: CameraProfileDto) {
    if (camera.sourceType !== 'usb') {
      throw new BadRequestException(
        'Current device tool integration supports usb camera profiles only',
      );
    }

    const selectedDevice = await this.resolveCameraDevice(camera.deviceName);
    const payload = {
      device_index: selectedDevice.index,
      exposure: camera.exposure,
      offset_x: camera.offsetX,
      offset_y: camera.offsetY,
      width: camera.imageWidth,
      height: camera.imageHeight,
    };

    const status = await this.getCameraStatus();

    if (this.isCameraConnected(status)) {
      if (!this.isSameRuntimeCamera(status, selectedDevice)) {
        await this.disconnectCamera();
        await this.requestJson(
          this.getToolPath('/camera/connect'),
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          'connect camera',
        );
        return;
      }

      await this.requestJson(
        this.getToolPath('/camera/settings'),
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        'update camera settings',
      );
      return;
    }

    await this.requestJson(
      this.getToolPath('/camera/connect'),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'connect camera',
    );
  }

  async ensureCameraPreviewReady(camera: CameraProfileDto) {
    if (camera.sourceType !== 'usb') {
      throw new BadRequestException(
        'Current device tool integration supports usb camera profiles only',
      );
    }

    const selectedDevice = await this.resolveCameraDevice(camera.deviceName);
    const payload = {
      device_index: selectedDevice.index,
      exposure: camera.exposure,
    };

    const status = await this.getCameraStatus();

    if (this.isCameraConnected(status)) {
      if (!this.isSameRuntimeCamera(status, selectedDevice)) {
        await this.disconnectCamera();
        await this.requestJson(
          this.getToolPath('/camera/connect'),
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          'connect preview camera',
        );
        return;
      }

      await this.requestJson(
        this.getToolPath('/camera/settings'),
        {
          method: 'POST',
          body: JSON.stringify({ exposure: camera.exposure }),
        },
        'update preview camera exposure',
      );
      return;
    }

    await this.requestJson(
      this.getToolPath('/camera/connect'),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'connect preview camera',
    );
  }

  private async resolveCameraDevice(deviceName?: string) {
    const devices = await this.requestJson<DeviceToolCameraDevice[]>(
      this.getToolPath('/camera/devices'),
      { method: 'GET' },
      'resolve camera device',
    );
    const normalizedDeviceName = this.normalizeCameraName(deviceName);

    if (!normalizedDeviceName) {
      const defaultDevice = devices[0];

      if (!defaultDevice) {
        throw new BadRequestException('No camera device is available');
      }

      return defaultDevice;
    }

    const matchedDevice = devices.find((device) => {
      const candidates = this.buildCameraNameCandidates(device);
      return candidates.some(
        (candidate) =>
          candidate.includes(normalizedDeviceName) ||
          normalizedDeviceName.includes(candidate),
      );
    });

    if (!matchedDevice) {
      throw new BadRequestException(
        `Camera device "${deviceName}" was not found`,
      );
    }

    return matchedDevice;
  }

  async getCameraStatus() {
    return this.requestJson<DeviceToolCameraStatusResponse>(
      this.getToolPath('/camera/status'),
      { method: 'GET' },
      'get camera status',
    );
  }

  private async disconnectCamera() {
    await this.requestJson(
      this.getToolPath('/camera/disconnect'),
      { method: 'POST' },
      'disconnect camera',
    );
  }

  async listCameraDevices() {
    return {
      data: await this.requestJson<DeviceToolCameraDevice[]>(
        this.getToolPath('/camera/devices'),
        { method: 'GET' },
        'list camera devices',
      ),
    };
  }

  async grabCameraFrame(request: {
    encodeFormat?: string;
    jpegQuality?: number;
  }) {
    return this.requestJson<DeviceToolGrabFrameResponse>(
      this.getToolPath('/camera/grab'),
      {
        method: 'POST',
        body: JSON.stringify({
          encode_format: request.encodeFormat ?? '.jpg',
          jpeg_quality: request.jpegQuality ?? 90,
        }),
      },
      'grab camera frame',
    );
  }

  async getCameraFrameRate() {
    try {
      return await this.requestJson<DeviceToolCameraFrameRateResponse>(
        this.getToolPath('/camera/frame-rate'),
        { method: 'GET' },
        'get camera frame rate',
      );
    } catch {
      return this.defaultCameraFrameRateResponse();
    }
  }

  async getCameraRanges() {
    return this.requestJson<DeviceToolCameraRangesResponse>(
      this.getToolPath('/camera/ranges'),
      { method: 'GET' },
      'get camera hardware ranges',
    );
  }

  async getCameraDebugInfo() {
    return this.requestJson<DeviceToolCameraDebugInfoResponse>(
      this.getToolPath('/camera/debug-info'),
      { method: 'GET' },
      'get camera debug information',
    );
  }

  async inspectProduct(request: DeviceToolInspectionRequest) {
    await this.ensureCameraReady(request.camera);

    return this.inspectRoiImage({
      modelPath: request.modelPath,
      roiRegions: request.roiRegions,
      thresholdAccept: request.thresholdAccept,
      thresholdMns: request.thresholdMns,
      grabFromCamera: true,
    });
  }

  async inspectProductImage(request: DeviceToolImageInspectionRequest) {
    await this.loadOcrModel({
      modelPath: request.modelPath,
      thresholdAccept: request.thresholdAccept,
      thresholdMns: request.thresholdMns,
    });

    const startedAt = Date.now();
    const results = await Promise.all(
      request.crops.map(async (crop) => {
        const roi = request.roiRegions.find(
          (region) => region.index === crop.slotIndex,
        );
        const prediction = await this.predictOcrCrop(crop.imageBase64);
        const rows = prediction.rows ?? [];

        return {
          label: `slot-${crop.slotIndex}`,
          text: rows.map((row) => String(row)).join(' '),
          x: roi?.x ?? 0,
          y: roi?.y ?? 0,
          width: roi?.width ?? 0,
          height: roi?.height ?? 0,
          error: prediction.success
            ? null
            : (prediction.error ?? 'OCR crop prediction failed'),
          debugImageBase64: prediction.debug_image_base64 ?? null,
        };
      }),
    );

    return {
      success: results.every((result) => !result.error),
      image_width: 0,
      image_height: 0,
      cycle_time_ms: Date.now() - startedAt,
      results,
      error: results.find((result) => result.error)?.error ?? null,
    };
  }

  async startCameraOcr(request: DeviceToolInspectionRequest) {
    await this.ensureCameraReady(request.camera);
    await this.loadOcrModel({
      modelPath: request.modelPath,
      thresholdAccept: request.thresholdAccept,
      thresholdMns: request.thresholdMns,
    });

    const response = await this.requestJson<DeviceToolActionResponse>(
      this.getToolPath(`/camera/${this.activeCameraId}/AI/yolo_ocr/start`),
      {
        method: 'POST',
        body: JSON.stringify({
          rois: request.roiRegions.map((region) => ({
            x: Math.max(0, Math.round(region.x - region.width / 2)),
            y: Math.max(0, Math.round(region.y - region.height / 2)),
            w: region.width,
            h: region.height,
          })),
        }),
      },
      'start camera OCR',
    );

    this.assertToolSuccess(response, 'start camera OCR');
    return response;
  }

  async stopCameraOcr() {
    const response = await this.requestJson<DeviceToolActionResponse>(
      this.getToolPath(`/camera/${this.activeCameraId}/AI/yolo_ocr/stop`),
      { method: 'POST' },
      'stop camera OCR',
    );

    this.assertToolSuccess(response, 'stop camera OCR');
    return response;
  }

  private async loadOcrModel(request: {
    modelPath: string;
    thresholdAccept: number;
    thresholdMns: number;
  }) {
    const response = await this.requestJson<DeviceToolActionResponse>(
      this.getToolPath('/AI/yolo_ocr/load_model'),
      {
        method: 'POST',
        body: JSON.stringify({
          model_path: request.modelPath,
          conf: request.thresholdAccept,
          iou: request.thresholdMns,
          row_threshold: 20,
        }),
      },
      'load OCR model',
    );

    this.assertToolSuccess(response, 'load OCR model');
  }

  private predictOcrCrop(imageBase64: string) {
    return this.requestJson<DeviceToolPredictResponse>(
      this.getToolPath('/AI/yolo_ocr/predict?debug_image=1'),
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

  private inspectRoiImage(request: {
    modelPath: string;
    roiRegions: RoiRegionDto[];
    thresholdAccept: number;
    thresholdMns: number;
    grabFromCamera: boolean;
    imageBase64?: string;
  }) {
    return this.requestJson<DeviceToolOcrRoisResponse>(
      this.getToolPath('/ocr/rois'),
      {
        method: 'POST',
        body: JSON.stringify({
          model_path: request.modelPath,
          grab_from_camera: request.grabFromCamera,
          image_base64: request.imageBase64,
          roi_list: request.roiRegions.map((region) => ({
            label: `slot-${region.index}`,
            x: Math.max(0, Math.round(region.x - region.width / 2)),
            y: Math.max(0, Math.round(region.y - region.height / 2)),
            width: region.width,
            height: region.height,
            rotation: Number(region.rotation),
            rotate_clockwise: this.shouldRotateClockwise(region.rotation),
          })),
          acceptance_threshold_ocr: request.thresholdAccept,
          duplication_threshold_ocr: request.thresholdMns,
          row_threshold: 20,
        }),
      },
      'run ROI OCR',
    );
  }

  private shouldRotateClockwise(rotation: number) {
    const normalized = ((rotation % 180) + 180) % 180;
    return normalized >= 45 && normalized < 135;
  }

  private isCameraConnected(status: DeviceToolCameraStatusResponse) {
    return Boolean(status.data.connected);
  }

  private isSameRuntimeCamera(
    status: DeviceToolCameraStatusResponse,
    device: DeviceToolCameraDevice,
  ) {
    const runtimeName = this.normalizeCameraName(status.data.device_name);

    if (!runtimeName) {
      return false;
    }

    return this.buildCameraNameCandidates(device).some(
      (candidate) =>
        runtimeName.includes(candidate) || candidate.includes(runtimeName),
    );
  }

  private buildCameraNameCandidates(device: DeviceToolCameraDevice) {
    return [
      device.friendly_name,
      device.model_name,
      device.serial_number,
      `${device.model_name ?? ''} (${device.serial_number ?? ''})`.trim(),
      `${device.model_name ?? ''} ${device.serial_number ?? ''}`.trim(),
    ]
      .filter(Boolean)
      .map((value) => this.normalizeCameraName(value))
      .filter(Boolean);
  }

  private defaultCameraFrameRateResponse(): DeviceToolCameraFrameRateResponse {
    return {
      success: true,
      data: {
        connected: false,
        requested_stream_fps: null,
        configured_fps: null,
        camera_resulting_fps: null,
        camera_max_fps: null,
        effective_stream_fps: null,
        writable: false,
        error: null,
        source: null,
      },
    };
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

  private decodeBase64Image(value: string) {
    const payload = value.startsWith('data:') ? value.split(',', 2)[1] : value;

    if (!payload) {
      throw new BadRequestException('Image crop payload is empty');
    }

    return Buffer.from(payload, 'base64');
  }

  private assertToolSuccess(
    response: DeviceToolActionResponse,
    action: string,
  ) {
    if (response.success === false) {
      throw new BadGatewayException(
        `Device tool failed to ${action}: ${response.error ?? 'Unknown error'}`,
      );
    }
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    action: string,
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');

    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(15000),
      });

      const raw = await response.text();
      const data = raw
        ? (JSON.parse(raw) as T | { detail?: string; error?: string })
        : null;

      if (!response.ok) {
        const message =
          (data &&
            typeof data === 'object' &&
            ('detail' in data || 'error' in data) &&
            (data.detail ?? data.error)) ||
          raw ||
          `${response.status} ${response.statusText}`;

        throw new BadGatewayException(
          `Device tool failed to ${action}: ${message}`,
        );
      }

      return data as T;
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
}
