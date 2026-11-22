import clickhouse from '@/lib/clickhouse';
import { EVENT_COLUMNS } from '@/lib/constants';
import { CLICKHOUSE, SQLITE, runQuery } from '@/lib/db';
import sqlite from '@/lib/sqlite';
import { PageParams, QueryFilters } from '@/lib/types';

const ORDER_BY_COLUMNS = [
  'id',
  'websiteId',
  'browser',
  'os',
  'device',
  'screen',
  'language',
  'country',
  'region',
  'city',
  'firstAt',
  'lastAt',
  'visits',
  'views',
  'createdAt',
];

export async function getWebsiteSessions(
  ...args: [websiteId: string, filters?: QueryFilters, pageParams?: PageParams]
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
      : 'lastAt';
  const paging = {
    ...pageParams,
    orderBy,
    sortDescending: pageParams.sortDescending ?? true,
  };

  return pagedRawQuery(
    `
    select
      session.session_id as "id",
      session.website_id as "websiteId",
      session.browser,
      session.os,
      session.device,
      session.screen,
      session.language,
      session.country,
      session.region,
      session.city,
      min(website_event.created_at) as "firstAt",
      max(website_event.created_at) as "lastAt",
      count(distinct website_event.visit_id) as "visits",
      sum(case when website_event.event_type = 1 then 1 else 0 end) as "views",
      max(website_event.created_at) as "createdAt"
    from website_event 
    ${cohortQuery}
    join session on session.session_id = website_event.session_id
    where website_event.website_id = {{websiteId::uuid}}
        and website_event.created_at between {{startDate}} and {{endDate}}
    ${filterQuery}
    ${
      search
        ? `and (distinct_id ${like} {{search}}
           or city ${like} {{search}}
           or browser ${like} {{search}}
           or os ${like} {{search}}
           or device ${like} {{search}})`
        : ''
    }
    group by session.session_id, 
      session.website_id, 
      session.browser, 
      session.os, 
      session.device, 
      session.screen, 
      session.language, 
      session.country, 
      session.region, 
      session.city
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
  const { pagedQuery, parseFilters, getDateStringSQL } = clickhouse;
  const { params, dateQuery, filterQuery, cohortQuery } = await parseFilters(websiteId, filters);
  const { search } = pageParams;
  const orderBy =
    pageParams.orderBy && ORDER_BY_COLUMNS.includes(pageParams.orderBy)
      ? pageParams.orderBy
      : 'lastAt';
  const paging = {
    ...pageParams,
    orderBy,
    sortDescending: pageParams.sortDescending ?? true,
  };

  let sql = '';

  if (EVENT_COLUMNS.some(item => Object.keys(filters).includes(item))) {
    sql = `
    select
      session_id as id,
      website_id as websiteId,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      ${getDateStringSQL('min(created_at)')} as firstAt,
      ${getDateStringSQL('max(created_at)')} as lastAt,
      uniq(visit_id) as visits,
      sumIf(1, event_type = 1) as views,
      lastAt as createdAt
    from website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
    ${dateQuery}
    ${filterQuery}
    ${
      search
        ? `and ((positionCaseInsensitive(distinct_id, {search:String}) > 0)
           or (positionCaseInsensitive(city, {search:String}) > 0)
           or (positionCaseInsensitive(browser, {search:String}) > 0)
           or (positionCaseInsensitive(os, {search:String}) > 0)
           or (positionCaseInsensitive(device, {search:String}) > 0))`
        : ''
    }
    group by session_id, website_id, browser, os, device, screen, language, country, region, city
    `;
  } else {
    sql = `
    select
      session_id as id,
      website_id as websiteId,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      ${getDateStringSQL('min(min_time)')} as firstAt,
      ${getDateStringSQL('max(max_time)')} as lastAt,
      uniq(visit_id) as visits,
      sumIf(views, event_type = 1) as views,
      lastAt as createdAt
    from website_event_stats_hourly website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
    ${dateQuery}
    ${filterQuery}
    ${
      search
        ? `and ((positionCaseInsensitive(distinct_id, {search:String}) > 0)
           or (positionCaseInsensitive(city, {search:String}) > 0)
           or (positionCaseInsensitive(browser, {search:String}) > 0)
           or (positionCaseInsensitive(os, {search:String}) > 0)
           or (positionCaseInsensitive(device, {search:String}) > 0))`
        : ''
    }
    group by session_id, website_id, browser, os, device, screen, language, country, region, city
    `;
  }

  return pagedQuery(sql, { ...params, search }, paging);
}
