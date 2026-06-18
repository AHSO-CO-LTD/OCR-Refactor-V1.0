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
    effective_stream_fps: number;
    writable: boolean;
    error?: string | null;
    source?: Record<string, string | null> | null;
  };
};

@Injectable()
export class DeviceToolService {
  constructor(private readonly configService: ConfigService) {}

  async getHealth() {
    return this.requestJson<DeviceToolHealthResponse>(
      '/api/v1/health',
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
          '/api/v1/camera/connect',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          'connect camera',
        );
        return;
      }

      await this.requestJson(
        '/api/v1/camera/settings',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        'update camera settings',
      );
      return;
    }

    await this.requestJson(
      '/api/v1/camera/connect',
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
          '/api/v1/camera/connect',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          'connect preview camera',
        );
        return;
      }

      await this.requestJson(
        '/api/v1/camera/settings',
        {
          method: 'POST',
          body: JSON.stringify({ exposure: camera.exposure }),
        },
        'update preview camera exposure',
      );
      return;
    }

    await this.requestJson(
      '/api/v1/camera/connect',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'connect preview camera',
    );
  }

  private async resolveCameraDevice(deviceName?: string) {
    const devices = await this.requestJson<DeviceToolCameraDevice[]>(
      '/api/v1/camera/devices',
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
      '/api/v1/camera/status',
      { method: 'GET' },
      'get camera status',
    );
  }

  private async disconnectCamera() {
    await this.requestJson(
      '/api/v1/camera/disconnect',
      { method: 'POST' },
      'disconnect camera',
    );
  }

  async listCameraDevices() {
    return {
      data: await this.requestJson<DeviceToolCameraDevice[]>(
        '/api/v1/camera/devices',
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
      '/api/v1/camera/grab',
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
        '/api/v1/camera/frame-rate',
        { method: 'GET' },
        'get camera frame rate',
      );
    } catch {
      return this.defaultCameraFrameRateResponse();
    }
  }

  async updateCameraFrameRate(fps: number) {
    return this.requestJson<DeviceToolCameraFrameRateResponse>(
      '/api/v1/camera/frame-rate',
      {
        method: 'PATCH',
        body: JSON.stringify({ fps }),
      },
      'update camera frame rate',
    );
  }

  async inspectProduct(request: DeviceToolInspectionRequest) {
    await this.ensureCameraReady(request.camera);

    return this.requestJson<DeviceToolOcrRoisResponse>(
      '/api/v1/ocr/rois',
      {
        method: 'POST',
        body: JSON.stringify({
          model_path: request.modelPath,
          grab_from_camera: true,
          roi_list: request.roiRegions.map((region) => ({
            label: `slot-${region.index}`,
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
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
        effective_stream_fps: 10,
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
}
