import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Buffer } from 'node:buffer';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { type RawData, WebSocketServer } from 'ws';
import { DeviceToolService } from '../device-tool/device-tool.service';

type JwtPayload = {
  sub: string;
  username: string;
  role: string;
};

@Injectable()
export class CameraStreamGateway {
  private readonly logger = new Logger(CameraStreamGateway.name);
  private readonly server = new WebSocketServer({ noServer: true });
  private attached = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly deviceToolService: DeviceToolService,
    private readonly jwtService: JwtService,
  ) {}

  attach(httpServer: Server) {
    if (this.attached) {
      return;
    }

    this.server.on('connection', (client, request) => {
      const url = new URL(request.url ?? '/', 'http://localhost');

      if (url.pathname === '/api/camera/ai/results') {
        void this.proxyCameraAiResults(client);
        return;
      }

      void this.proxyCameraStream(client, request);
    });

    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost');

      if (
        url.pathname !== '/api/camera/stream' &&
        url.pathname !== '/api/camera/ai/results'
      ) {
        return;
      }

      if (!this.isAuthorized(url)) {
        this.reject(socket, 401, 'Unauthorized');
        return;
      }

      this.server.handleUpgrade(request, socket, head, (client) => {
        this.server.emit('connection', client, request);
      });
    });

    this.attached = true;
  }

  private isAuthorized(url: URL) {
    const token = url.searchParams.get('token');

    if (!token) {
      return false;
    }

    try {
      this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      return true;
    } catch {
      return false;
    }
  }

  private async proxyCameraStream(client: WebSocket, request: IncomingMessage) {
    const clientUrl = new URL(request.url ?? '/', 'http://localhost');
    const debugTiming = clientUrl.searchParams.get('debugTiming');
    const shouldDebugTiming = debugTiming === '1';
    const jpegQuality = Number(
      clientUrl.searchParams.get('jpegQuality') ?? '70',
    );
    let toolUrl: string;

    try {
      const serial = await this.deviceToolService.setActiveStreamConfig(
        Number.isFinite(jpegQuality) ? jpegQuality : 70,
      );
      toolUrl = this.deviceToolService.getToolWebSocketUrl(
        `/camera/${encodeURIComponent(serial)}/stream`,
      );
    } catch (error) {
      this.sendClientError(client, 'Camera live stream failed', error);
      client.close();
      return;
    }

    const toolSocket = new WebSocket(toolUrl);
    let lastFrameId: number | null = null;

    const closeBoth = () => {
      if (toolSocket.readyState === WebSocket.OPEN) {
        toolSocket.close();
      }

      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    };

    toolSocket.on('message', (data, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) {
        return;
      }

      if (shouldDebugTiming && !isBinary) {
        const receivedAtMs = Date.now();
        try {
          const payload = JSON.parse(this.rawDataToText(data)) as {
            frame_id?: number;
            type?: string;
            [key: string]: unknown;
          };

          if (payload.type === 'frame_meta') {
            lastFrameId =
              typeof payload.frame_id === 'number' ? payload.frame_id : null;
            payload.backend_meta_received_at_ms = receivedAtMs;
            payload.backend_meta_sent_at_ms = Date.now();
            client.send(JSON.stringify(payload), { binary: false });
            return;
          }

          client.send(data, { binary: false });
          return;
        } catch {
          client.send(data, { binary: false });
          return;
        }
      }

      if (shouldDebugTiming && isBinary) {
        const receivedAtMs = Date.now();
        client.send(data, { binary: true }, () => {
          if (client.readyState !== WebSocket.OPEN) {
            return;
          }

          client.send(
            JSON.stringify({
              type: 'backend_frame_done',
              frame_id: lastFrameId,
              backend_binary_received_at_ms: receivedAtMs,
              backend_binary_sent_at_ms: Date.now(),
            }),
            { binary: false },
          );
        });
        return;
      }

      client.send(data, { binary: isBinary });
    });

    toolSocket.on('error', (error) => {
      this.logger.warn(`Camera stream source failed: ${error.message}`);

      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            success: false,
            error: `Camera live stream failed: ${error.message}`,
          }),
        );
      }

      closeBoth();
    });

    toolSocket.on('close', closeBoth);
    client.on('close', closeBoth);
    client.on('error', closeBoth);
  }

  private async proxyCameraAiResults(client: WebSocket) {
    let toolUrl: string;

    try {
      const serial = await this.deviceToolService.requireActiveCameraSerial(
        'read camera AI results',
      );
      toolUrl = this.deviceToolService.getToolWebSocketUrl(
        `/camera/${encodeURIComponent(serial)}/AI/yolo_ocr/results`,
      );
    } catch (error) {
      this.sendClientError(client, 'Camera AI results failed', error);
      client.close();
      return;
    }

    const toolSocket = new WebSocket(toolUrl);

    const closeBoth = () => {
      if (toolSocket.readyState === WebSocket.OPEN) {
        toolSocket.close();
      }

      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    };

    toolSocket.on('message', (data, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) {
        return;
      }

      client.send(data, { binary: isBinary });
    });

    toolSocket.on('error', (error) => {
      this.logger.warn(`Camera AI results source failed: ${error.message}`);

      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            success: false,
            error: `Camera AI results failed: ${error.message}`,
          }),
        );
      }

      closeBoth();
    });

    toolSocket.on('close', closeBoth);
    client.on('close', closeBoth);
    client.on('error', closeBoth);
  }

  private reject(socket: Duplex, statusCode: number, message: string) {
    socket.write(
      `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`,
    );
    socket.destroy();
  }

  private sendClientError(client: WebSocket, prefix: string, error: unknown) {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    client.send(
      JSON.stringify({
        success: false,
        error: `${prefix}: ${message}`,
      }),
    );
  }

  private rawDataToText(data: RawData) {
    if (Array.isArray(data)) {
      return Buffer.concat(data).toString('utf8');
    }

    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf8');
    }

    return data.toString('utf8');
  }
}
