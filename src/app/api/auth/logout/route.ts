import redis from '@/lib/redis';
import { ok } from '@/lib/response';
import { parseSecureToken } from '@/lib/jwt';
import { secret } from '@/lib/crypto';

export async function POST(request: Request) {
  if (redis.enabled) {
    const token = request.headers.get('authorization')?.split(' ')?.[1];

    if (token) {
      const payload = parseSecureToken(token, secret());

      if (payload?.authKey) {
        await redis.client.del(payload.authKey);
      }
    }
  }

  return ok();
}
