import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ToolEnvelope<T> =
  | { status: 'success'; data: T }
  | { status: 'fail'; error: string };

export type PlcProtocolName = 'modbus_tcp' | 'slmp';

export type PlcToolStatus = {
  id: string;
  driver: PlcProtocolName;
  state: 'connected' | 'not connected';
  host: string;
  port: number;
};

export type PlcWatchEvent = {
  event: 'change' | 'snapshot' | 'error';
  address?: number;
  value?: boolean;
  values?: boolean[];
  edge?: 'rising' | 'falling';
  seq?: number;
  error?: string;
};

@Injectable()
export class PlcToolClient {
  constructor(private readonly configService: ConfigService) {}

  connect(
    ipAddress: string,
    protocol: PlcProtocolName = 'modbus_tcp',
    port = protocol === 'modbus_tcp' ? 502 : 5000,
  ) {
    const body =
      protocol === 'modbus_tcp'
        ? {
            host: ipAddress,
            port,
            unit: 1,
            timeout: 2,
            reconnect: 1,
          }
        : {
            host: ipAddress,
            port,
            plc_type: 'Q',
            comm_type: 'binary',
            reconnect: 1,
          };

    return this.request<PlcToolStatus>(`/${protocol}/connect`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  list() {
    return this.request<PlcToolStatus[]>('/comm/list', { method: 'GET' });
  }

  status(host: string) {
    return this.request<PlcToolStatus>(
      `/comm/${encodeURIComponent(host)}/status`,
      { method: 'GET' },
    );
  }

  disconnect(host: string) {
    return this.request<null>(`/comm/${encodeURIComponent(host)}/disconnect`, {
      method: 'POST',
    });
  }

  writeBoolean(host: string, address: number, value: boolean) {
    return this.request<{ address: number; count: number }>(
      `/comm/${encodeURIComponent(host)}/write_boolean`,
      {
        method: 'POST',
        body: JSON.stringify({ address, values: [value] }),
      },
    );
  }

  pulse(host: string, address: number, durationSeconds: number) {
    return this.request<{ address: number; duration: number }>(
      `/comm/${encodeURIComponent(host)}/pulse`,
      {
        method: 'POST',
        body: JSON.stringify({ address, duration: durationSeconds }),
      },
    );
  }

  async watchBoolean(
    host: string,
    address: number,
    count: number,
    signal: AbortSignal,
    onEvent: (event: PlcWatchEvent) => void,
  ) {
    const query = new URLSearchParams({
      address: String(address),
      count: String(count),
      interval: '0.002',
      mode: 'change',
      edge: 'rising',
      debounce: '1',
    });
    const response = await this.fetchTool(
      `/comm/${encodeURIComponent(host)}/watch_boolean?${query}`,
      { method: 'GET', signal },
      0,
    );

    if (!response.body) {
      throw new BadGatewayException('PLC watch stream returned no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const parsed = this.parseSseFrame(frame);
        if (parsed) onEvent(parsed);
      }
    }
  }

  private async request<T>(path: string, init: RequestInit) {
    const response = await this.fetchTool(path, init, 20000);
    const body = (await response.json()) as ToolEnvelope<T>;
    if (body.status === 'fail') {
      throw new BadGatewayException(body.error);
    }
    return body.data;
  }

  private async fetchTool(path: string, init: RequestInit, timeoutMs: number) {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const timeoutSignal =
      timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
    const signal = init.signal
      ? timeoutSignal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : init.signal
      : timeoutSignal;

    try {
      const response = await fetch(`${this.baseUrl()}${this.toolPath(path)}`, {
        ...init,
        headers,
        signal,
      });
      if (!response.ok) {
        throw new BadGatewayException(await this.readError(response));
      }
      return response;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new ServiceUnavailableException(
        `PLC Device Tool is unavailable: ${this.errorMessage(error)}`,
      );
    }
  }

  private parseSseFrame(frame: string): PlcWatchEvent | null {
    let event = '';
    let data = '';
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!event || !data) return null;
    return { event, ...(JSON.parse(data) as object) } as PlcWatchEvent;
  }

  private async readError(response: Response) {
    const raw = await response.text();
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      return parsed.error ?? parsed.message ?? raw;
    } catch {
      return raw || `${response.status} ${response.statusText}`;
    }
  }

  private baseUrl() {
    return (
      this.configService.get<string>('DEVICE_TOOL_BASE_URL') ??
      'http://127.0.0.1:8668'
    ).replace(/\/+$/, '');
  }

  private toolPath(path: string) {
    const prefix =
      this.configService.get<string>('DEVICE_TOOL_API_PREFIX') ?? '/tool/v1';
    return `/${prefix.replace(/^\/+|\/+$/g, '')}/${path.replace(/^\/+/, '')}`;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
