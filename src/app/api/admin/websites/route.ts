import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { pagingParams } from '@/lib/schema';
import { canViewAllWebsites } from '@/lib/auth';
import { getWebsites } from '@/queries';
import { ROLES } from '@/lib/constants';

export async function GET(request: Request) {
  const schema = z.object({
    userId: z.string().uuid(),
    includeOwnedTeams: z.string().optional(),
    includeAllTeams: z.string().optional(),
    ...pagingParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  if (!(await canViewAllWebsites(auth))) {
    return unauthorized();
  }

  const { userId, includeOwnedTeams, includeAllTeams } = query;

  const websites = await getWebsites(
    {
      userId,
      includeOwnedTeams: !!includeOwnedTeams,
      includeAllTeams: !!includeAllTeams,
      includeUser: true,
      includeTeam: true,
    },
    query,
  );

  return json(websites);
}
