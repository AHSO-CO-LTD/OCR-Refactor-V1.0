import { PrismaService } from '../database/prisma.service';
import { UsersService } from './users.service';

describe('UsersService login failure tracking', () => {
  it('records failed attempts without deactivating the account', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const service = new UsersService({
      user: { update },
    } as unknown as PrismaService);

    await service.markLoginFailure('user-1', 3);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        failedAttempts: 3,
      },
    });
  });
});
