import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';

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
      this.proxyCameraStream(client, request);
    });

    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost');

      if (url.pathname !== '/api/camera/stream') {
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
    const fps = clientUrl.searchParams.get('fps') ?? '10';
    const jpegQuality = clientUrl.searchParams.get('jpegQuality') ?? '70';
    const maxWidth = clientUrl.searchParams.get('maxWidth') ?? '1600';
    const toolUrl = this.getToolStreamUrl(fps, jpegQuality, maxWidth);
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
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
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

  private getToolStreamUrl(fps: string, jpegQuality: string, maxWidth: string) {
    const baseUrl = (
      this.configService.get<string>('DEVICE_TOOL_BASE_URL') ??
      'http://localhost:8000'
    ).replace(/\/+$/, '');
    const url = new URL('/api/v1/camera/stream', baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('fps', fps);
    url.searchParams.set('jpeg_quality', jpegQuality);
    url.searchParams.set('max_width', maxWidth);
    return url.toString();
  }

  private reject(socket: Duplex, statusCode: number, message: string) {
    socket.write(
      `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`,
    );
    socket.destroy();
  }
}
