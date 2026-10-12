import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionService } from '../auth/auth-session.service';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { CameraStreamGateway } from './camera-stream.gateway';

type AuthorizedSession = { id: string; userId: string } | null;

describe('CameraStreamGateway local session authorization', () => {
  it('accepts an active local session', async () => {
    const harness = createHarness({
      id: 'session-1',
      userId: 'user-1',
      user: { active: true },
    });

    await expect(authorize(harness.gateway, 'signed-token')).resolves.toEqual({
      id: 'session-1',
      userId: 'user-1',
    });
  });

  it('rejects a signed token whose local session is revoked or missing', async () => {
    const harness = createHarness(null);

    await expect(
      authorize(harness.gateway, 'signed-token'),
    ).resolves.toBeNull();
  });
});

function createHarness(activeSession: unknown) {
  const gateway = new CameraStreamGateway(
    {
      getOrThrow: jest.fn().mockReturnValue('jwt-secret'),
    } as unknown as ConfigService,
    {} as DeviceToolService,
    {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        username: 'operator',
        role: 'operator',
        sid: 'session-1',
      }),
    } as unknown as JwtService,
    {
      findActive: jest.fn().mockResolvedValue(activeSession),
    } as unknown as AuthSessionService,
  );
  return { gateway };
}

function authorize(gateway: CameraStreamGateway, token: string) {
  const url = new URL('http://localhost/api/camera/stream');
  url.searchParams.set('token', token);
  return (
    gateway as unknown as {
      authorizeUpgrade(url: URL): Promise<AuthorizedSession>;
    }
  ).authorizeUpgrade(url);
}
