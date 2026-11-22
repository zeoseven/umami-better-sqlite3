import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, SQLITE, runQuery } from '@/lib/db';
import sqlite from '@/lib/sqlite';

export async function getSessionActivity(
  ...args: [websiteId: string, sessionId: string, startDate: Date, endDate: Date]
) {
  return runQuery({
    [SQLITE]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  sessionId: string,
  startDate: Date,
  endDate: Date,
) {
  const { rawQuery } = sqlite;

  return rawQuery(
    `
    select
      event_id as "id",
      created_at as "createdAt",
      url_path as "urlPath",
      url_query as "urlQuery",
      referrer_domain as "referrerDomain",
      event_id as "eventId",
      event_type as "eventType",
      event_name as "eventName",
      visit_id as "visitId"
    from website_event
    where website_id = {{websiteId}}
      and session_id = {{sessionId}}
      and created_at between {{startDate}} and {{endDate}}
    order by created_at desc
    limit 500
    `,
    { websiteId, sessionId, startDate, endDate },
  );
}

async function clickhouseQuery(
  websiteId: string,
  sessionId: string,
  startDate: Date,
  endDate: Date,
) {
  const { rawQuery } = clickhouse;

  return rawQuery(
    `
    select
      created_at as createdAt,
      url_path as urlPath,
      url_query as urlQuery,
      referrer_domain as referrerDomain,
      event_id as eventId,
      event_type as eventType,
      event_name as eventName,
      visit_id as visitId
    from website_event
    where website_id = {websiteId:UUID}
      and session_id = {sessionId:UUID} 
      and created_at between {startDate:DateTime64} and {endDate:DateTime64}
    order by created_at desc
    limit 500
    `,
    { websiteId, sessionId, startDate, endDate },
  );
}
