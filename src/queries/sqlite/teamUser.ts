import { uuid } from '@/lib/crypto';
import sqlite from '@/lib/sqlite';
import { PageParams, PageResult, TeamUser } from '@/lib/types';
import { getOrderBy, getPageParams, toDate } from './utils';

function mapTeamUser(row: any): TeamUser {
  if (!row) {
    return null;
  }

  return {
    id: row.team_user_id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

const ORDER_BY_COLUMNS = {
  username: 'u.username',
  role: 'tu.role',
  createdAt: 'tu.created_at',
};

export async function getTeamUser(teamId: string, userId: string): Promise<TeamUser> {
  const { rawQuery } = sqlite;
  const result = rawQuery(
    `
    select *
    from team_user
    where team_id = {{teamId}}
      and user_id = {{userId}}
    `,
    { teamId, userId },
  );

  return mapTeamUser(result?.[0]);
}

export async function getTeamUsers(
  teamId: string,
  filters: PageParams = {},
): Promise<PageResult<TeamUser[]>> {
  const { rawQuery } = sqlite;
  const { search } = filters;
  const { page, pageSize, offset, limit } = getPageParams(filters);
  const orderBy = getOrderBy(filters.orderBy, ORDER_BY_COLUMNS, filters.sortDescending);
  const searchQuery = search ? 'and u.username like {{search}}' : '';
  const params: Record<string, any> = { teamId, search: `%${search}%` };

  const baseQuery = `
    select tu.*, u.user_id as member_user_id, u.username as member_username
    from team_user tu
    join "user" u on u.user_id = tu.user_id
    where tu.team_id = {{teamId}}
      and u.deleted_at is null
      ${searchQuery}
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
  ).map(row => ({
    ...mapTeamUser(row),
    user: {
      id: row.member_user_id,
      username: row.member_username,
    },
  }));

  return { data, count, page, pageSize: limit, orderBy: filters.orderBy };
}

export async function createTeamUser(
  userId: string,
  teamId: string,
  role: string,
): Promise<TeamUser> {
  const { rawQuery } = sqlite;
  const id = uuid();

  const result = rawQuery<{ changes: number }>(
    `
    insert into team_user (team_user_id, user_id, team_id, role)
    values ({{id}}, {{userId}}, {{teamId}}, {{role}})
    on conflict(team_id, user_id) do nothing
    `,
    { id, userId, teamId, role },
  );

  if (!result.changes) {
    return null;
  }

  return getTeamUser(teamId, userId);
}

const TEAM_USER_UPDATE_COLUMNS = {
  userId: 'user_id',
  teamId: 'team_id',
  role: 'role',
};

export async function updateTeamUser(teamUserId: string, data: any): Promise<TeamUser> {
  const { rawQuery } = sqlite;
  const updates: string[] = [];
  const params: Record<string, any> = { teamUserId };

  for (const [key, column] of Object.entries(TEAM_USER_UPDATE_COLUMNS)) {
    if (data[key] !== undefined) {
      updates.push(`${column} = {{${key}}}`);
      params[key] = data[key];
    }
  }

  updates.push('updated_at = {{updatedAt}}');
  params.updatedAt = new Date();

  rawQuery(
    `
    update team_user
    set ${updates.join(', ')}
    where team_user_id = {{teamUserId}}
    `,
    params,
  );

  const result = rawQuery(
    `select * from team_user where team_user_id = {{teamUserId}}`,
    { teamUserId },
  );

  return mapTeamUser(result?.[0]);
}

export async function deleteTeamUser(teamId: string, userId: string): Promise<void> {
  const { rawQuery } = sqlite;

  rawQuery(
    `
    delete from team_user
    where team_id = {{teamId}}
      and user_id = {{userId}}
    `,
    { teamId, userId },
  );
}
