import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, SQLITE, runQuery } from '@/lib/db';
import sqlite from '@/lib/sqlite';

export async function getUTM(
  ...args: [
    websiteId: string,
    filters: {
      startDate: Date;
      endDate: Date;
      timezone?: string;
    },
  ]
) {
  return runQuery({
    [SQLITE]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  filters: {
    startDate: Date;
    endDate: Date;
    timezone?: string;
  },
) {
  const { startDate, endDate } = filters;
  const { rawQuery } = sqlite;

  return rawQuery(
    `
    select url_query, count(*) as "num"
    from website_event
    where website_id = {{websiteId::uuid}}
      and created_at between {{startDate}} and {{endDate}}
      and coalesce(url_query, '') != ''
      and event_type = 1
    group by 1
    `,
    {
      websiteId,
      startDate,
      endDate,
    },
  );
}

async function clickhouseQuery(
  websiteId: string,
  filters: {
    startDate: Date;
    endDate: Date;
    timezone?: string;
  },
) {
  const { startDate, endDate } = filters;
  const { rawQuery } = clickhouse;

  return rawQuery(
    `
    select url_query, count(*) as "num"
    from website_event
    where website_id = {websiteId:UUID}
      and created_at between {startDate:DateTime64} and {endDate:DateTime64}
      and url_query != ''
      and event_type = 1
    group by 1
    `,
    {
      websiteId,
      startDate,
      endDate,
    },
  );
}
