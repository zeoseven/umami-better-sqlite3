import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import debug from 'debug';
import { formatInTimeZone } from 'date-fns-tz';
import { SESSION_COLUMNS, OPERATORS, DEFAULT_PAGE_SIZE } from './constants';
import { fetchWebsite } from './load';
import { maxDate } from './date';
import { QueryFilters, QueryOptions, PageParams } from './types';
import { filtersToArray } from './params';

const log = debug('umami:sqlite');

const SQLITE = 'sqlite';

const DATE_FORMATS = {
  minute: '%Y-%m-%dT%H:%M:00',
  hour: '%Y-%m-%d %H:00:00',
  day: '%Y-%m-%d 00:00:00',
  month: '%Y-%m-01 00:00:00',
  year: '%Y-01-01 00:00:00',
};

const SCHEMA = `
create table if not exists "user" (
  user_id text primary key,
  username text not null unique,
  password text not null,
  role text not null,
  logo_url text,
  display_name text,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text,
  deleted_at text
);

create table if not exists "session" (
  session_id text primary key,
  website_id text not null,
  browser text,
  os text,
  device text,
  screen text,
  language text,
  country text,
  region text,
  city text,
  distinct_id text,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists "website" (
  website_id text primary key,
  name text not null,
  domain text,
  share_id text unique,
  reset_at text,
  user_id text,
  team_id text,
  created_by text,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text,
  deleted_at text
);

create table if not exists "website_event" (
  event_id text primary key,
  website_id text not null,
  session_id text not null,
  visit_id text not null,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  url_path text not null,
  url_query text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer_path text,
  referrer_query text,
  referrer_domain text,
  page_title text,
  gclid text,
  fbclid text,
  msclkid text,
  ttclid text,
  li_fat_id text,
  twclid text,
  event_type integer not null default 1,
  event_name text,
  tag text,
  hostname text
);

create table if not exists "event_data" (
  event_data_id text primary key,
  website_id text not null,
  website_event_id text not null,
  data_key text not null,
  string_value text,
  number_value real,
  date_value text,
  data_type integer not null,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists "session_data" (
  session_data_id text primary key,
  website_id text not null,
  session_id text not null,
  data_key text not null,
  string_value text,
  number_value real,
  date_value text,
  data_type integer not null,
  distinct_id text,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists "team" (
  team_id text primary key,
  name text not null,
  access_code text unique,
  logo_url text,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text,
  deleted_at text
);

create table if not exists "team_user" (
  team_user_id text primary key,
  team_id text not null,
  user_id text not null,
  role text not null,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text
);

create table if not exists "report" (
  report_id text primary key,
  user_id text not null,
  website_id text not null,
  type text not null,
  name text not null,
  description text not null,
  parameters text not null,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text
);

create table if not exists "segment" (
  segment_id text primary key,
  website_id text not null,
  type text not null,
  name text not null,
  parameters text not null,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text
);

create table if not exists "revenue" (
  revenue_id text primary key,
  website_id text not null,
  session_id text not null,
  event_id text not null,
  event_name text not null,
  currency text not null,
  revenue real,
  created_at text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists website_user_id_idx on website (user_id);
create index if not exists website_team_id_idx on website (team_id);
create index if not exists website_created_at_idx on website (created_at);
create index if not exists website_created_by_idx on website (created_by);
create index if not exists session_created_at_idx on session (created_at);
create index if not exists session_website_id_idx on session (website_id);
create index if not exists session_website_created_at_idx on session (website_id, created_at);
create index if not exists website_event_created_at_idx on website_event (created_at);
create index if not exists website_event_session_id_idx on website_event (session_id);
create index if not exists website_event_visit_id_idx on website_event (visit_id);
create index if not exists website_event_website_id_idx on website_event (website_id);
create index if not exists website_event_website_created_at_idx on website_event (website_id, created_at);
create index if not exists website_event_website_created_event_name_idx on website_event (website_id, created_at, event_name);
create index if not exists website_event_website_session_created_at_idx on website_event (website_id, session_id, created_at);
create index if not exists event_data_website_created_at_idx on event_data (website_id, created_at);
create index if not exists event_data_event_id_idx on event_data (website_event_id);
create index if not exists session_data_website_id_idx on session_data (website_id);
create index if not exists session_data_session_id_idx on session_data (session_id);
create index if not exists session_data_session_created_at_idx on session_data (session_id, created_at);
create index if not exists team_user_team_id_idx on team_user (team_id);
create index if not exists team_user_user_id_idx on team_user (user_id);
create index if not exists report_user_id_idx on report (user_id);
create index if not exists report_website_id_idx on report (website_id);
create index if not exists segment_website_id_idx on segment (website_id);
create index if not exists revenue_website_created_at_idx on revenue (website_id, created_at);
`;

function getDatabasePath() {
  const url = process.env.DATABASE_URL || 'file:./data/umami.db';

  if (/^[a-z]+:\/\//i.test(url)) {
    throw new Error(
      `Unsupported database URL: ${url}. Only SQLite files are supported (e.g. file:./data/umami.db).`,
    );
  }

  const filename = url.startsWith('file:') ? url.substring('file:'.length) : url;

  return path.isAbsolute(filename) ? filename : path.resolve(process.cwd(), filename);
}

function getTimezoneOffset(timezone?: string) {
  if (!timezone || timezone.toLowerCase() === 'utc') {
    return null;
  }

  try {
    return formatInTimeZone(new Date(), timezone, 'xxx');
  } catch {
    return null;
  }
}

function getAddIntervalQuery(field: string, interval: string): string {
  const match = interval.trim().match(/^(\d+)\s+(minute|hour|day|month|year)s?$/i);

  if (!match) {
    return field;
  }

  return `strftime('%Y-%m-%dT%H:%M:%fZ', ${field}, '+${match[1]} ${match[2]}s')`;
}

function getDayDiffQuery(field1: string, field2: string): string {
  return `cast(julianday(date(${field1})) - julianday(date(${field2})) as integer)`;
}

function getCastColumnQuery(field: string, type: string): string {
  return `cast(${field} as ${type === 'float' ? 'real' : type})`;
}

function getDateSQL(field: string, unit: string, timezone?: string): string {
  const offset = getTimezoneOffset(timezone);
  const value = offset ? `datetime(${field}, '${offset}')` : field;
  const format = DATE_FORMATS[unit] ?? DATE_FORMATS.day;

  return `strftime('${format}', ${value})`;
}

function getDateWeeklySQL(field: string, timezone?: string) {
  const offset = getTimezoneOffset(timezone);
  const value = offset ? `datetime(${field}, '${offset}')` : field;

  return `strftime('%w:%H', ${value})`;
}

export function getTimestampSQL(field: string) {
  return `cast(strftime('%s', ${field}) as integer)`;
}

function getTimestampDiffSQL(field1: string, field2: string): string {
  return `cast((julianday(${field2}) - julianday(${field1})) * 86400 as integer)`;
}

function getSearchSQL(column: string, param: string = 'search'): string {
  return `and ${column} like {{${param}}}`;
}

function mapFilter(column: string, operator: string, name: string, type: string = '') {
  const value = `{{${name}${type ? `::${type}` : ''}}}`;

  switch (operator) {
    case OPERATORS.equals:
      return `${column} = ${value}`;
    case OPERATORS.notEquals:
      return `${column} != ${value}`;
    case OPERATORS.contains:
      return `${column} like ${value}`;
    case OPERATORS.doesNotContain:
      return `${column} not like ${value}`;
    default:
      return '';
  }
}

function mapCohortFilter(column: string, operator: string, name: string) {
  const value = `{{${name}}}`;

  switch (operator) {
    case OPERATORS.equals:
      return `${column} = ${value}`;
    case OPERATORS.notEquals:
      return `${column} != ${value}`;
    case OPERATORS.contains:
      return `${column} like ${value}`;
    case OPERATORS.doesNotContain:
      return `${column} not like ${value}`;
    default:
      return '';
  }
}

function getFilterQuery(filters: QueryFilters = {}, options: QueryOptions = {}): string {
  const query = filtersToArray(filters, options).reduce((arr, { name, column, operator }) => {
    if (column) {
      arr.push(`and ${mapFilter(column, operator, name)}`);

      if (name === 'referrer') {
        arr.push(
          `and (website_event.referrer_domain != website_event.hostname or website_event.referrer_domain is null)`,
        );
      }
    }

    return arr;
  }, []);

  return query.join('\n');
}

function getCohortQuery(websiteId: string, filters: QueryFilters = {}, options: QueryOptions = {}) {
  const params = {};
  const query = filtersToArray(filters, options).reduce(
    (arr, { name, column, operator, value }, index) => {
      if (column) {
        const key = `cohort${index}`;

        params[key] = [OPERATORS.contains, OPERATORS.doesNotContain].includes(operator as any)
          ? `%${value}%`
          : value;

        arr.push(
          `${arr.length === 0 ? 'where' : 'and'} ${mapCohortFilter(column, operator, key)}`,
        );

        if (name === 'referrer') {
          arr.push(`and referrer_domain != hostname`);
        }
      }

      return arr;
    },
    [],
  );

  if (query.length > 0) {
    // add website and date range filters
    query.push(`and website_event.website_id = {{websiteId}}`);
    query.push(
      `and website_event.created_at between {{cohortStartDate}} and {{cohortEndDate}}`,
    );

    return {
      query: `join
    (select distinct website_event.session_id
    from website_event
    join session on session.session_id = website_event.session_id
    ${query.join('\n')}) cohort
    on cohort.session_id = website_event.session_id
    `,
      params: {
        ...params,
        cohortStartDate: filters.startDate,
        cohortEndDate: filters.endDate,
      },
    };
  }

  return { query: '', params: {} };
}

function getDateQuery(filters: QueryFilters = {}) {
  const { startDate, endDate } = filters;

  if (startDate) {
    if (endDate) {
      return `and website_event.created_at between {{startDate}} and {{endDate}}`;
    } else {
      return `and website_event.created_at >= {{startDate}}`;
    }
  }

  return '';
}

function getFilterParams(filters: QueryFilters = {}) {
  return filtersToArray(filters).reduce((obj, { name, operator, value }) => {
    obj[name] = [OPERATORS.contains, OPERATORS.doesNotContain].includes(operator as any)
      ? `%${value}%`
      : value;

    return obj;
  }, {});
}

async function parseFilters(
  websiteId: string,
  filters: QueryFilters = {},
  options: QueryOptions = {},
) {
  const website = await fetchWebsite(websiteId);
  const joinSession = Object.keys(filters).find(key =>
    ['referrer', ...SESSION_COLUMNS].includes(key),
  );
  const cohort = getCohortQuery(websiteId, filters?.cohort);

  return {
    joinSession:
      options?.joinSession || joinSession
        ? `inner join session on website_event.session_id = session.session_id`
        : '',
    filterQuery: getFilterQuery(filters, options),
    dateQuery: getDateQuery(filters),
    params: {
      ...getFilterParams(filters),
      ...cohort.params,
      websiteId,
      startDate: maxDate(filters.startDate, website?.resetAt),
    },
    cohortQuery: cohort.query,
  };
}

function normalizeValue(value: any) {
  if (value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  return value;
}

function rawQuery<T = any>(sql: string, data: Record<string, any> = {}): T {
  if (process.env.LOG_QUERY) {
    log('QUERY:\n', sql);
    log('PARAMETERS:\n', data);
  }

  const names = new Set<string>();
  const query = sql.replace(/\{\{\s*(\w+)(::\w+)?\s*\}\}/g, (_, name: string) => {
    names.add(name);

    return `@${name}`;
  });

  const params = {};

  for (const name of names) {
    params[name] = normalizeValue(data[name]);
  }

  const statement = client.prepare(query);

  if (statement.reader) {
    return statement.all(params) as T;
  }

  return statement.run(params) as T;
}

async function pagedRawQuery(
  query: string,
  queryParams: { [key: string]: any },
  pageParams: PageParams = {},
) {
  const { page = 1, pageSize, orderBy, sortDescending = false } = pageParams;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? 'desc' : 'asc';

  const statements = [
    orderBy && `order by ${orderBy} ${direction}`,
    +size > 0 && `limit ${+size} offset ${offset}`,
  ]
    .filter(n => n)
    .join('\n');

  const count = rawQuery<{ num: number }[]>(`select count(*) as num from (${query}) t`, queryParams)
    .at(0)
    ?.num;

  const data = rawQuery(`${query}${statements}`, queryParams);

  return { data, count, page: +page, pageSize: size, orderBy };
}

function transaction<T>(fn: () => T): T {
  return client.transaction(fn)();
}

function ensureUniqueIndex(
  db: Database.Database,
  indexName: string,
  table: string,
  columns: string,
) {
  try {
    db.exec(`create unique index if not exists ${indexName} on ${table} (${columns})`);
  } catch {
    db.exec(`delete from ${table} where rowid not in (select max(rowid) from ${table} group by ${columns})`);
    db.exec(`create unique index if not exists ${indexName} on ${table} (${columns})`);
  }
}

function initialize(db: Database.Database) {
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  ensureUniqueIndex(db, 'session_data_session_key_idx', 'session_data', 'session_id, data_key');
  ensureUniqueIndex(db, 'team_user_team_user_idx', 'team_user', 'team_id, user_id');

  const existingUsers = db.prepare(`select count(*) as num from "user"`).get() as { num: number };
  const existingData = db
    .prepare(
      `select (select count(*) from website) + (select count(*) from team) as num`,
    )
    .get() as { num: number };

  if (existingUsers.num === 0 && existingData.num === 0) {
    db.prepare(
      `insert or ignore into "user" (user_id, username, password, role) values (?, ?, ?, ?)`,
    ).run(
      '00000000-0000-0000-0000-000000000000',
      'admin',
      bcrypt.hashSync('umami', 10),
      'admin',
    );

    log('Created default admin user (admin/umami)');
  }
}

function getClient(): Database.Database {
  const filename = getDatabasePath();

  fs.mkdirSync(path.dirname(filename), { recursive: true });

  const db = new Database(filename);

  initialize(db);

  if (process.env.NODE_ENV !== 'production') {
    global[SQLITE] = db;
  }

  log('SQLite initialized:', filename);

  return db;
}

const client: Database.Database = global[SQLITE] || getClient();

export default {
  client,
  transaction,
  getAddIntervalQuery,
  getCastColumnQuery,
  getDateSQL,
  getDateWeeklySQL,
  getDayDiffQuery,
  getFilterQuery,
  getSearchSQL,
  getTimestampSQL,
  getTimestampDiffSQL,
  pagedRawQuery,
  parseFilters,
  rawQuery,
};
