import { ConfigService } from '@nestjs/config';
import { PlcToolClient } from './plc-tool.client';

describe('PlcToolClient', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let client: PlcToolClient;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'DEVICE_TOOL_BASE_URL') return 'http://127.0.0.1:8668';
        if (key === 'DEVICE_TOOL_API_PREFIX') return '/tool/v1';
        return undefined;
      }),
    } as unknown as ConfigService;
    client = new PlcToolClient(configService);
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('connects only through Modbus TCP with fixed connection settings', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'success',
          data: {
            id: 'plc-1',
            driver: 'modbus_tcp',
            state: 'connected',
            host: '192.168.0.10',
            port: 502,
          },
        }),
        { status: 200 },
      ),
    );

    await client.connect('192.168.0.10');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8668/tool/v1/modbus_tcp/connect',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          host: '192.168.0.10',
          port: 502,
          unit: 1,
          timeout: 2,
          reconnect: 1,
        }),
      }),
    );
  });

  it('uses the custom port for the selected Mitsubishi SLMP protocol', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'success',
          data: {
            id: 'plc-1',
            driver: 'slmp',
            state: 'connected',
            host: '192.168.0.10',
            port: 5500,
          },
        }),
        { status: 200 },
      ),
    );

    await client.connect('192.168.0.10', 'slmp', 5500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8668/tool/v1/slmp/connect',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          host: '192.168.0.10',
          port: 5500,
          plc_type: 'Q',
          comm_type: 'binary',
          reconnect: 1,
        }),
      }),
    );
  });

  it('does not fall back to SLMP when Modbus TCP fails', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'fail', error: 'offline' }), {
        status: 503,
      }),
    );

    await expect(client.connect('192.168.0.10')).rejects.toThrow('offline');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/modbus_tcp/connect');
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('/slmp/connect');
  });

  it('uses the fixed 2ms PLC watch interval and rising-edge debounce', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('event: change\ndata: {"address":8192,"value":true}\n\n', {
        status: 200,
      }),
    );
    const onEvent = jest.fn();

    await client.watchBoolean(
      '192.168.0.10',
      8192,
      3,
      new AbortController().signal,
      onEvent,
    );

    const calledRequest = fetchMock.mock.calls[0]?.[0];
    const calledUrl =
      typeof calledRequest === 'string'
        ? calledRequest
        : calledRequest instanceof URL
          ? calledRequest.toString()
          : (calledRequest?.url ?? '');
    expect(calledUrl).toContain('interval=0.002');
    expect(calledUrl).toContain('edge=rising');
    expect(calledUrl).toContain('debounce=1');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ address: 8192, value: true }),
    );
  });
});
