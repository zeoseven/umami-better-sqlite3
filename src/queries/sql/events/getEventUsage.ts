import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, SQLITE, runQuery } from '@/lib/db';
import sqlite from '@/lib/sqlite';
import { sqlIn } from '@/queries/sqlite/utils';

export function getEventUsage(...args: [websiteIds: string[], startDate: Date, endDate: Date]) {
  return runQuery({
    [SQLITE]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

function relationalQuery(
  websiteIds: string[],
  startDate: Date,
  endDate: Date,
): { websiteId: string; count: number }[] {
  if (websiteIds.length === 0) {
    return [];
  }

  const { rawQuery } = sqlite;

  return rawQuery(
    `
    select
      website_id as "websiteId",
      count(*) as count
    from website_event
    where website_id in ${sqlIn(websiteIds)}
      and created_at between {{startDate}} and {{endDate}}
    group by website_id
    `,
    { startDate, endDate },
  );
}

function clickhouseQuery(
  websiteIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<{ websiteId: string; count: number }[]> {
  const { rawQuery } = clickhouse;

  return rawQuery(
    `
    select 
      website_id as websiteId,
      count(*) as count
    from website_event 
    where website_id in {websiteIds:Array(UUID)}
      and created_at between {startDate:DateTime64} and {endDate:DateTime64}
    group by website_id
    `,
    {
      websiteIds,
      startDate,
      endDate,
    },
  );
}
