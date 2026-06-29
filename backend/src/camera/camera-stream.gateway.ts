import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Buffer } from 'node:buffer';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { type RawData, WebSocketServer } from 'ws';

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
    private readonly jwtService: JwtService,
  ) {}

  attach(httpServer: Server) {
    if (this.attached) {
      return;
    }

    this.server.on('connection', (client, request) => {
      const url = new URL(request.url ?? '/', 'http://localhost');

      if (url.pathname === '/api/camera/ai/results') {
        this.proxyCameraAiResults(client);
        return;
      }

      this.proxyCameraStream(client, request);
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

  private proxyCameraStream(client: WebSocket, request: IncomingMessage) {
    const clientUrl = new URL(request.url ?? '/', 'http://localhost');
    const fps = clientUrl.searchParams.get('fps');
    const debugTiming = clientUrl.searchParams.get('debugTiming');
    const shouldDebugTiming = debugTiming === '1';
    const jpegQuality = clientUrl.searchParams.get('jpegQuality') ?? '70';
    const maxWidth = clientUrl.searchParams.get('maxWidth') ?? '1600';
    const toolUrl = this.getToolStreamUrl(
      fps,
      jpegQuality,
      maxWidth,
      debugTiming,
    );
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

  private proxyCameraAiResults(client: WebSocket) {
    const toolSocket = new WebSocket(this.getToolAiResultsUrl());

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

  private getToolStreamUrl(
    fps: string | null,
    jpegQuality: string,
    maxWidth: string,
    debugTiming: string | null,
  ) {
    const baseUrl = (
      this.configService.get<string>('DEVICE_TOOL_BASE_URL') ??
      'http://localhost:8000'
    ).replace(/\/+$/, '');
    const url = new URL(this.getToolPath('/camera/stream'), baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (fps) {
      url.searchParams.set('fps', fps);
    }
    url.searchParams.set('jpeg_quality', jpegQuality);
    url.searchParams.set('max_width', maxWidth);
    if (debugTiming) {
      url.searchParams.set('debug_timing', debugTiming);
    }
    return url.toString();
  }

  private getToolAiResultsUrl() {
    const baseUrl = (
      this.configService.get<string>('DEVICE_TOOL_BASE_URL') ??
      'http://localhost:8000'
    ).replace(/\/+$/, '');
    const url = new URL(
      this.getToolPath('/camera/active-camera/AI/yolo_ocr/results'),
      baseUrl,
    );
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }

  private getToolPath(path: string) {
    const prefix =
      this.configService.get<string>('DEVICE_TOOL_API_PREFIX') ?? '/tool/v1';
    const normalizedPrefix = `/${prefix.replace(/^\/+|\/+$/g, '')}`;
    const normalizedPath = `/${path.replace(/^\/+/, '')}`;

    return `${normalizedPrefix}${normalizedPath}`;
  }

  private reject(socket: Duplex, statusCode: number, message: string) {
    socket.write(
      `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`,
    );
    socket.destroy();
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
