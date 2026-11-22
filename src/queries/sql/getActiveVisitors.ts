import { subMinutes } from 'date-fns';
import sqlite from '@/lib/sqlite';
import clickhouse from '@/lib/clickhouse';
import { runQuery, CLICKHOUSE, SQLITE } from '@/lib/db';

export async function getActiveVisitors(...args: [websiteId: string]) {
  return runQuery({
    [SQLITE]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(websiteId: string) {
  const { rawQuery } = sqlite;

  const result = await rawQuery(
    `
    select count(distinct session_id) as visitors
    from website_event
    where website_id = {{websiteId::uuid}}
    and created_at >= {{startDate}}
    `,
    { websiteId, startDate: subMinutes(new Date(), 5) },
  );

  return result[0] ?? null;
}

async function clickhouseQuery(websiteId: string): Promise<{ x: number }> {
  const { rawQuery } = clickhouse;

  const result = await rawQuery(
    `
    select
      count(distinct session_id) as "visitors"
    from website_event
    where website_id = {websiteId:UUID}
      and created_at >= {startDate:DateTime64}
    `,
    { websiteId, startDate: subMinutes(new Date(), 5) },
  );

  return result[0] ?? null;
}
