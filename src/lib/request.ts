import { z, ZodSchema } from 'zod';
import { FILTER_COLUMNS, FILTER_GROUPS, DEFAULT_RESET_DATE } from '@/lib/constants';
import { badRequest, unauthorized } from '@/lib/response';
import { getAllowedUnits, getMinimumUnit } from '@/lib/date';
import { checkAuth } from '@/lib/auth';
import { getWebsiteSegment, getWebsiteDateRange } from '@/queries';

export async function getJsonBody(request: Request) {
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

export async function parseRequest(
  request: Request,
  schema?: ZodSchema,
  options?: { skipAuth: boolean },
): Promise<any> {
  const url = new URL(request.url);
  let query = Object.fromEntries(url.searchParams);
  let body = await getJsonBody(request);
  let error: () => void | undefined;
  let auth = null;

  const getErrorMessages = (error: z.ZodError) => {
    return Object.entries(error.format())
      .map(([key, value]) => {
        const messages = (value as any)._errors;
        return messages ? `${key}: ${messages.join(', ')}` : null;
      })
      .filter(Boolean);
  };

  if (schema) {
    const isGet = request.method === 'GET';
    const result = schema.safeParse(isGet ? query : body);

    if (!result.success) {
      error = () => badRequest(getErrorMessages(result.error));
    } else if (isGet) {
      query = result.data;
    } else {
      body = result.data;
    }
  }

  if (!options?.skipAuth && !error) {
    auth = await checkAuth(request);

    if (!auth) {
      error = () => unauthorized();
    }
  }

  return { url, query, body, auth, error };
}

export async function getRequestDateRange(query: Record<string, any>, websiteId?: string) {
  const { startAt, endAt, unit } = query;

  // All-time
  if (+startAt === 0 && +endAt === 1) {
    const result = websiteId ? await getWebsiteDateRange(websiteId) : null;
    const { mindate, maxdate } = result ?? {};
    const startDate = new Date(mindate ?? DEFAULT_RESET_DATE);
    const endDate = new Date(maxdate ?? Date.now());

    return {
      startDate,
      endDate,
      unit: getMinimumUnit(startDate, endDate),
    };
  }

  const startDate = new Date(+startAt);
  const endDate = new Date(+endAt);
  const minUnit = getMinimumUnit(startDate, endDate);

  return {
    startDate,
    endDate,
    unit: (getAllowedUnits(startDate, endDate).includes(unit as string) ? unit : minUnit) as string,
  };
}

export async function getRequestFilters(query: Record<string, any>, websiteId?: string) {
  const result: Record<string, any> = {};

  for (const key of Object.keys(FILTER_COLUMNS)) {
    const value = query[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }

  for (const key of Object.keys(FILTER_GROUPS)) {
    const value = query[key];
    if (value !== undefined) {
      const segment = websiteId ? await getWebsiteSegment(websiteId, key, value) : null;
      const parameters = segment?.parameters ?? {};

      if (key === 'segment') {
        Object.assign(result, parameters);
      } else {
        result[key] = parameters;
      }
    }
  }

  return result;
}
