import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, SQLITE, runQuery } from '@/lib/db';
import sqlite from '@/lib/sqlite';
import { PageParams, QueryFilters } from '@/lib/types';

const ORDER_BY_COLUMNS = [
  'id',
  'websiteId',
  'sessionId',
  'createdAt',
  'urlPath',
  'urlQuery',
  'referrerPath',
  'referrerQuery',
  'referrerDomain',
  'pageTitle',
  'eventType',
  'eventName',
];

export function getWebsiteEvents(
  ...args: [websiteId: string, filters: QueryFilters, pageParams?: PageParams]
) {
  return runQuery({
    [SQLITE]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  filters: QueryFilters,
  pageParams: PageParams = {},
) {
  const { pagedRawQuery, parseFilters } = sqlite;
  const { search } = pageParams;
  const { filterQuery, cohortQuery, params } = await parseFilters(websiteId, {
    ...filters,
  });
  const like = 'like';
  const orderBy =
    pageParams.orderBy && ORDER_BY_COLUMNS.includes(pageParams.orderBy)
      ? pageParams.orderBy
      : 'createdAt';
  const paging = {
    ...pageParams,
    orderBy,
    sortDescending: pageParams.sortDescending ?? true,
  };

  return pagedRawQuery(
    `
    select
      event_id as "id",
      website_id as "websiteId", 
      session_id as "sessionId",
      created_at as "createdAt",
      url_path as "urlPath",
      url_query as "urlQuery",
      referrer_path as "referrerPath",
      referrer_query as "referrerQuery",
      referrer_domain as "referrerDomain",
      page_title as "pageTitle",
      event_type as "eventType",
      event_name as "eventName"
    from website_event
    ${cohortQuery}
    where website_id = {{websiteId::uuid}}
        and created_at between {{startDate}} and {{endDate}}
    ${filterQuery}
    ${
      search
        ? `and ((event_name ${like} {{search}} and event_type = 2)
           or (url_path ${like} {{search}} and event_type = 1))`
        : ''
    }
    `,
    { ...params, search: `%${search}%` },
    paging,
  );
}

async function clickhouseQuery(
  websiteId: string,
  filters: QueryFilters,
  pageParams: PageParams = {},
) {
  const { pagedQuery, parseFilters } = clickhouse;
  const { params, dateQuery, filterQuery, cohortQuery } = await parseFilters(websiteId, filters);
  const { search } = pageParams;
  const orderBy =
    pageParams.orderBy && ORDER_BY_COLUMNS.includes(pageParams.orderBy)
      ? pageParams.orderBy
      : 'createdAt';
  const paging = {
    ...pageParams,
    orderBy,
    sortDescending: pageParams.sortDescending ?? true,
  };

  return pagedQuery(
    `
    select
      event_id as id,
      website_id as websiteId, 
      session_id as sessionId,
      created_at as createdAt,
      url_path as urlPath,
      url_query as urlQuery,
      referrer_path as referrerPath,
      referrer_query as referrerQuery,
      referrer_domain as referrerDomain,
      page_title as pageTitle,
      event_type as eventType,
      event_name as eventName
    from website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
    ${dateQuery}
    ${filterQuery}
    ${
      search
        ? `and ((positionCaseInsensitive(event_name, {search:String}) > 0 and event_type = 2)
           or (positionCaseInsensitive(url_path, {search:String}) > 0 and event_type = 1))`
        : ''
    }
    `,
    { ...params, search },
    paging,
  );
}
