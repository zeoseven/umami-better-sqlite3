import sqlite from '@/lib/sqlite';

export interface CreateSessionData {
  id: string;
  websiteId: string;
  browser?: string;
  os?: string;
  device?: string;
  screen?: string;
  language?: string;
  country?: string;
  region?: string;
  city?: string;
  distinctId?: string;
  createdAt?: Date;
}

export async function createSession(
  data: CreateSessionData,
  options: { skipDuplicates?: boolean } = {},
) {
  const { rawQuery } = sqlite;
  const { skipDuplicates = false } = options;
  const createdAt = data.createdAt ?? new Date();

  const result = rawQuery<{ changes: number }>(
    `
    insert ${skipDuplicates ? 'or ignore ' : ''}into "session" (
      session_id, website_id, browser, os, device, screen, language,
      country, region, city, distinct_id, created_at
    )
    values (
      {{id}}, {{websiteId}}, {{browser}}, {{os}}, {{device}}, {{screen}}, {{language}},
      {{country}}, {{region}}, {{city}}, {{distinctId}}, {{createdAt}}
    )
    `,
    { ...data, createdAt },
  );

  return result.changes === 0 ? null : data;
}
