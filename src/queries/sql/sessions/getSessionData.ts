import sqlite from '@/lib/sqlite';
import clickhouse from '@/lib/clickhouse';
import { runQuery, SQLITE, CLICKHOUSE } from '@/lib/db';

export async function getSessionData(...args: [websiteId: string, sessionId: string]) {
  return runQuery({
    [SQLITE]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(websiteId: string, sessionId: string) {
  const { rawQuery } = sqlite;

  return rawQuery(
    `
    select
        website_id as "websiteId",
        session_id as "sessionId",
        data_key as "dataKey",
        data_type as "dataType",
        replace(string_value, '.0000', '') as "stringValue",
        number_value as "numberValue",
        date_value as "dateValue",
        created_at as "createdAt"
    from session_data
    where website_id = {{websiteId::uuid}}
      and session_id = {{sessionId::uuid}}
    order by data_key asc
    `,
    { websiteId, sessionId },
  );
}

async function clickhouseQuery(websiteId: string, sessionId: string) {
  const { rawQuery } = clickhouse;

  return rawQuery(
    `
    select
        website_id as websiteId,
        session_id as sessionId,
        data_key as dataKey,
        data_type as dataType,
        replace(string_value, '.0000', '')  as stringValue,
        number_value as numberValue,
        date_value as dateValue,
        created_at as createdAt
    from session_data final
    where website_id = {websiteId:UUID}
    and session_id = {sessionId:UUID}
    order by data_key asc
    `,
    { websiteId, sessionId },
  );
}
