import clickhouse from '@/lib/clickhouse';
import { ROLES } from '@/lib/constants';
import redis from '@/lib/redis';
import sqlite from '@/lib/sqlite';
import { PageParams, PageResult, Team, Website } from '@/lib/types';
import { getOrderBy, getPageParams, sqlIn, toDate } from './utils';

const CLICKHOUSE_DATA_TABLES = [
  'website_event',
  'event_data',
  'session_data',
  'website_event_stats_hourly',
  'website_revenue',
];

export async function purgeClickhouseWebsite(websiteId: string) {
  if (!clickhouse.enabled) {
    return;
  }

  await Promise.all(
    CLICKHOUSE_DATA_TABLES.map(table =>
      clickhouse.rawQuery(
        `alter table ${table} delete where website_id = {websiteId:UUID} settings mutations_sync = 1`,
        { websiteId },
      ),
    ),
  );
}

export interface GetWebsitesOptions {
  userId?: string;
  teamId?: string;
  includeOwnedTeams?: boolean;
  includeAllTeams?: boolean;
  includeUser?: boolean;
  includeCreateUser?: boolean;
  includeTeam?: boolean;
}

function mapWebsite(row: any): Website {
  if (!row) {
    return null;
  }

  return {
    id: row.website_id,
    name: row.name,
    domain: row.domain,
    shareId: row.share_id,
    resetAt: toDate(row.reset_at),
    userId: row.user_id,
    teamId: row.team_id,
    createdBy: row.created_by,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toDate(row.deleted_at),
  };
}

function mapTeam(row: any): Team {
  return {
    id: row.team_id,
    name: row.team_name,
    accessCode: row.team_access_code,
    logoUrl: row.team_logo_url,
    createdAt: toDate(row.team_created_at),
    updatedAt: toDate(row.team_updated_at),
    deletedAt: toDate(row.team_deleted_at),
  };
}

const ORDER_BY_COLUMNS = {
  name: 'w.name',
  domain: 'w.domain',
  createdAt: 'w.created_at',
  updatedAt: 'w.updated_at',
};

export async function getWebsite(websiteId: string): Promise<Website> {
  const { rawQuery } = sqlite;
  const result = rawQuery(
    `
    select *
    from website
    where website_id = {{websiteId}}
    `,
    { websiteId },
  );

  return mapWebsite(result?.[0]);
}

export async function getSharedWebsite(shareId: string): Promise<Website> {
  const { rawQuery } = sqlite;
  const result = rawQuery(
    `
    select *
    from website
    where share_id = {{shareId}}
      and deleted_at is null
    `,
    { shareId },
  );

  return mapWebsite(result?.[0]);
}

export async function getWebsites(
  options: GetWebsitesOptions = {},
  pageParams: PageParams = {},
): Promise<PageResult<Website[]>> {
  const { rawQuery } = sqlite;
  const { search } = pageParams;
  const {
    userId,
    teamId,
    includeOwnedTeams,
    includeAllTeams,
    includeUser,
    includeCreateUser,
    includeTeam,
  } = options;
  const { page, pageSize, offset, limit } = getPageParams(pageParams);
  const orderBy = getOrderBy(pageParams.orderBy, ORDER_BY_COLUMNS, pageParams.sortDescending);

  const conditions = ['w.deleted_at is null'];
  const params: Record<string, any> = {};

  if (userId) {
    const userConditions = ['w.user_id = {{userId}}'];

    params.userId = userId;

    if (includeOwnedTeams) {
      userConditions.push(`exists (
        select 1
        from team t
        join team_user tu on tu.team_id = t.team_id
        where t.team_id = w.team_id
          and t.deleted_at is null
          and tu.user_id = {{userId}}
          and tu.role = {{teamOwner}}
      )`);
      params.teamOwner = ROLES.teamOwner;
    }

    if (includeAllTeams) {
      userConditions.push(`exists (
        select 1
        from team t
        join team_user tu on tu.team_id = t.team_id
        where t.team_id = w.team_id
          and t.deleted_at is null
          and tu.user_id = {{userId}}
      )`);
    }

    conditions.push(`(${userConditions.join(' or ')})`);
  }

  if (teamId) {
    conditions.push('w.team_id = {{teamId}}');
    params.teamId = teamId;
  }

  if (search) {
    conditions.push('(w.name like {{search}} or w.domain like {{search}})');
    params.search = `%${search}%`;
  }

  const userJoin = includeUser
    ? 'left join "user" u on u.user_id = w.user_id'
    : '';
  const createUserJoin = includeCreateUser
    ? 'left join "user" cu on cu.user_id = w.created_by'
    : '';
  const teamJoin = includeTeam
    ? 'left join team t on t.team_id = w.team_id and t.deleted_at is null'
    : '';
  const userColumns = includeUser ? ', u.username as user_username, u.user_id as user_user_id' : '';
  const createUserColumns = includeCreateUser
    ? ', cu.username as create_user_username, cu.user_id as create_user_user_id'
    : '';
  const teamColumns = includeTeam
    ? `, t.team_id as team_id, t.name as team_name, t.access_code as team_access_code,
       t.logo_url as team_logo_url, t.created_at as team_created_at,
       t.updated_at as team_updated_at, t.deleted_at as team_deleted_at`
    : '';

  const where = conditions.join('\nand ');
  const baseQuery = `
    select w.*${userColumns}${createUserColumns}${teamColumns}
    from website w
    ${userJoin}
    ${createUserJoin}
    ${teamJoin}
    where ${where}
  `;

  const count = rawQuery<{ num: number }[]>(
    `select count(*) as num from (${baseQuery}) t`,
    params,
  ).at(0)?.num;

  const rows = rawQuery(
    `
    ${baseQuery}
    ${orderBy}
    limit {{limit}} offset {{offset}}
    `,
    { ...params, limit, offset },
  );

  const data = rows.map(row => {
    const website = mapWebsite(row);

    if (includeUser && row.user_user_id) {
      website.user = {
        id: row.user_user_id,
        username: row.user_username,
      };
    }

    if (includeCreateUser && row.create_user_user_id) {
      website.createUser = {
        id: row.create_user_user_id,
        username: row.create_user_username,
      };
    }

    if (includeTeam && row.team_id) {
      website.team = mapTeam(row);
    }

    return website;
  });

  if (includeTeam) {
    const teamIds = data.map(({ teamId }) => teamId).filter(n => n);

    if (teamIds.length > 0) {
      const teamUsers = rawQuery(
        `
        select team_user_id, team_id, user_id, role, created_at, updated_at
        from team_user
        where team_id in ${sqlIn(teamIds)}
          and role = {{role}}
        `,
        { role: ROLES.teamOwner },
      );

      for (const website of data) {
        if (website.teamId) {
          website.team = {
            ...website.team,
            teamUser: teamUsers
              .filter(teamUser => teamUser.team_id === website.teamId)
              .map(teamUser => ({
                id: teamUser.team_user_id,
                teamId: teamUser.team_id,
                userId: teamUser.user_id,
                role: teamUser.role,
                createdAt: toDate(teamUser.created_at),
                updatedAt: toDate(teamUser.updated_at),
              })),
          };
        }
      }
    }
  }

  return { data, count, page, pageSize: limit, orderBy: pageParams.orderBy };
}

export async function getAllWebsites(userId: string): Promise<Website[]> {
  const { rawQuery } = sqlite;

  return rawQuery(
    `
    select w.*
    from website w
    left join team t on t.team_id = w.team_id
    where w.deleted_at is null
      and (
        w.user_id = {{userId}}
        or (
          t.deleted_at is null
          and exists (
            select 1
            from team_user tu
            where tu.team_id = w.team_id
              and tu.user_id = {{userId}}
          )
        )
      )
    order by w.created_at desc
    `,
    { userId },
  ).map(mapWebsite);
}

export async function getAllUserWebsitesIncludingTeamOwner(userId: string): Promise<Website[]> {
  const { rawQuery } = sqlite;

  return rawQuery(
    `
    select w.*
    from website w
    left join team t on t.team_id = w.team_id
    where w.user_id = {{userId}}
      or (
        t.deleted_at is null
        and exists (
          select 1
          from team_user tu
          where tu.team_id = w.team_id
            and tu.user_id = {{userId}}
            and tu.role = {{role}}
        )
      )
    order by w.created_at desc
    `,
    { userId, role: ROLES.teamOwner },
  ).map(mapWebsite);
}

export async function getUserWebsites(
  userId: string,
  filters?: PageParams,
): Promise<PageResult<Website[]>> {
  return getWebsites(
    {
      userId,
      includeUser: true,
    },
    {
      orderBy: 'name',
      ...filters,
    },
  );
}

export async function getTeamWebsites(
  teamId: string,
  filters?: PageParams,
): Promise<PageResult<Website[]>> {
  return getWebsites(
    {
      teamId,
      includeCreateUser: true,
    },
    filters,
  );
}

const WEBSITE_UPDATE_COLUMNS = {
  name: 'name',
  domain: 'domain',
  shareId: 'share_id',
  userId: 'user_id',
  teamId: 'team_id',
  resetAt: 'reset_at',
  deletedAt: 'deleted_at',
};

export async function createWebsite(data: {
  id: string;
  name: string;
  domain?: string;
  shareId?: string;
  userId?: string;
  teamId?: string;
  createdBy?: string;
}): Promise<Website> {
  const { rawQuery } = sqlite;

  rawQuery(
    `
    insert into website (
      website_id, name, domain, share_id, user_id, team_id, created_by
    )
    values (
      {{id}}, {{name}}, {{domain}}, {{shareId}}, {{userId}}, {{teamId}}, {{createdBy}}
    )
    `,
    data,
  );

  return getWebsite(data.id);
}

export async function updateWebsite(websiteId: string, data: any): Promise<Website> {
  const { rawQuery } = sqlite;
  const updates: string[] = [];
  const params: Record<string, any> = { websiteId };

  for (const [key, column] of Object.entries(WEBSITE_UPDATE_COLUMNS)) {
    if (data[key] !== undefined) {
      updates.push(`${column} = {{${key}}}`);
      params[key] = data[key];
    }
  }

  updates.push('updated_at = {{updatedAt}}');
  params.updatedAt = new Date();

  rawQuery(
    `
    update website
    set ${updates.join(', ')}
    where website_id = {{websiteId}}
    `,
    params,
  );

  if (redis.enabled) {
    await redis.client.del(`website:${websiteId}`);
  }

  return getWebsite(websiteId);
}

export async function resetWebsite(websiteId: string): Promise<Website> {
  const { rawQuery, transaction } = sqlite;

  transaction(() => {
    rawQuery(`delete from event_data where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from session_data where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from revenue where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from website_event where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from session where website_id = {{websiteId}}`, { websiteId });
    rawQuery(
      `update website set reset_at = {{resetAt}} where website_id = {{websiteId}}`,
      { websiteId, resetAt: new Date() },
    );
  });

  try {
    await purgeClickhouseWebsite(websiteId);
  } finally {
    if (redis.enabled) {
      await redis.client.del(`website:${websiteId}`);
    }
  }

  return getWebsite(websiteId);
}

export async function deleteWebsite(websiteId: string): Promise<void> {
  const { rawQuery, transaction } = sqlite;
  const cloudMode = !!process.env.CLOUD_MODE;

  transaction(() => {
    rawQuery(`delete from event_data where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from session_data where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from revenue where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from website_event where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from session where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from report where website_id = {{websiteId}}`, { websiteId });
    rawQuery(`delete from segment where website_id = {{websiteId}}`, { websiteId });

    if (cloudMode) {
      rawQuery(
        `update website set deleted_at = {{deletedAt}} where website_id = {{websiteId}}`,
        { websiteId, deletedAt: new Date() },
      );
    } else {
      rawQuery(`delete from website where website_id = {{websiteId}}`, { websiteId });
    }
  });

  try {
    await purgeClickhouseWebsite(websiteId);
  } finally {
    if (redis.enabled) {
      await redis.client.del(`website:${websiteId}`);
    }
  }
}
