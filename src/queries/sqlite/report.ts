import sqlite from '@/lib/sqlite';
import { PageParams, PageResult, Report } from '@/lib/types';
import { getOrderBy, getPageParams, parseJson, toDate } from './utils';

export interface GetReportsOptions {
  websiteId?: string;
  teamId?: string;
  userId?: string;
  includeWebsite?: boolean;
}

function mapReport(row: any): Report {
  if (!row) {
    return null;
  }

  const report: Report = {
    id: row.report_id,
    userId: row.user_id,
    websiteId: row.website_id,
    type: row.type,
    name: row.name,
    description: row.description,
    parameters: parseJson(row.parameters) ?? {},
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };

  if (row.website_domain !== undefined) {
    report.website = {
      domain: row.website_domain,
      userId: row.website_user_id,
    };
  }

  return report;
}

const ORDER_BY_COLUMNS = {
  name: 'r.name',
  type: 'r.type',
  description: 'r.description',
  createdAt: 'r.created_at',
  updatedAt: 'r.updated_at',
};

export async function getReport(reportId: string): Promise<Report> {
  const { rawQuery } = sqlite;
  const result = rawQuery(
    `
    select *
    from report
    where report_id = {{reportId}}
    `,
    { reportId },
  );

  return mapReport(result?.[0]);
}

export async function getReports(
  options: GetReportsOptions = {},
  pageParams: PageParams = {},
): Promise<PageResult<Report[]>> {
  const { rawQuery } = sqlite;
  const { search } = pageParams;
  const { websiteId, teamId, userId, includeWebsite } = options;
  const { page, pageSize, offset, limit } = getPageParams(pageParams);
  const orderBy = getOrderBy(pageParams.orderBy, ORDER_BY_COLUMNS, pageParams.sortDescending);

  const conditions = [];
  const params: Record<string, any> = {};

  if (websiteId) {
    conditions.push('r.website_id = {{websiteId}}');
    params.websiteId = websiteId;
  }

  if (teamId) {
    conditions.push('(w.deleted_at is null and w.team_id = {{teamId}})');
    params.teamId = teamId;
  }

  if (userId) {
    conditions.push('(w.deleted_at is null and w.user_id = {{userId}})');
    params.userId = userId;
  }

  if (search) {
    conditions.push(`(
      r.name like {{search}}
      or r.description like {{search}}
      or r.type like {{search}}
      or u.username like {{search}}
      or w.name like {{search}}
      or w.domain like {{search}}
    )`);
    params.search = `%${search}%`;
  }

  const where = conditions.length > 0 ? `where ${conditions.join('\nand ')}` : '';
  const websiteColumns = includeWebsite
    ? ', w.domain as website_domain, w.user_id as website_user_id'
    : '';

  const baseQuery = `
    select r.*${websiteColumns}
    from report r
    left join "user" u on u.user_id = r.user_id
    left join website w on w.website_id = r.website_id
    ${where}
  `;

  const count = rawQuery<{ num: number }[]>(
    `select count(*) as num from (${baseQuery}) t`,
    params,
  ).at(0)?.num;

  const data = rawQuery(
    `
    ${baseQuery}
    ${orderBy}
    limit {{limit}} offset {{offset}}
    `,
    { ...params, limit, offset },
  ).map(mapReport);

  return { data, count, page, pageSize: limit, orderBy: pageParams.orderBy };
}

export async function getUserReports(
  userId: string,
  filters?: PageParams,
): Promise<PageResult<Report[]>> {
  return getReports(
    {
      userId,
      includeWebsite: true,
    },
    filters,
  );
}

export async function getWebsiteReports(
  websiteId: string,
  filters: PageParams = {},
): Promise<PageResult<Report[]>> {
  return getReports(
    {
      websiteId,
    },
    filters,
  );
}

export async function createReport(data: {
  id: string;
  userId: string;
  websiteId: string;
  type: string;
  name: string;
  description: string;
  parameters: any;
}): Promise<Report> {
  const { rawQuery } = sqlite;

  rawQuery(
    `
    insert into report (
      report_id, user_id, website_id, type, name, description, parameters
    )
    values (
      {{id}}, {{userId}}, {{websiteId}}, {{type}}, {{name}}, {{description}}, {{parameters}}
    )
    `,
    { ...data, parameters: JSON.stringify(data.parameters ?? {}) },
  );

  return getReport(data.id);
}

const REPORT_UPDATE_COLUMNS = {
  userId: 'user_id',
  websiteId: 'website_id',
  type: 'type',
  name: 'name',
  description: 'description',
};

export async function updateReport(reportId: string, data: any): Promise<Report> {
  const { rawQuery } = sqlite;
  const updates: string[] = [];
  const params: Record<string, any> = { reportId };

  for (const [key, column] of Object.entries(REPORT_UPDATE_COLUMNS)) {
    if (data[key] !== undefined) {
      updates.push(`${column} = {{${key}}}`);
      params[key] = data[key];
    }
  }

  if (data.parameters !== undefined) {
    updates.push('parameters = {{parameters}}');
    params.parameters = JSON.stringify(data.parameters ?? {});
  }

  updates.push('updated_at = {{updatedAt}}');
  params.updatedAt = new Date();

  rawQuery(
    `
    update report
    set ${updates.join(', ')}
    where report_id = {{reportId}}
    `,
    params,
  );

  return getReport(reportId);
}

export async function deleteReport(reportId: string): Promise<void> {
  const { rawQuery } = sqlite;

  rawQuery(`delete from report where report_id = {{reportId}}`, { reportId });
}
