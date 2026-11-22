import { ROLES } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import sqlite from '@/lib/sqlite';
import { PageParams, PageResult, Team } from '@/lib/types';
import { getOrderBy, getPageParams, sqlIn, toDate } from './utils';

function mapTeam(row: any): Team {
  if (!row) {
    return null;
  }

  return {
    id: row.team_id,
    name: row.name,
    accessCode: row.access_code,
    logoUrl: row.logo_url,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toDate(row.deleted_at),
  };
}

function mapTeamUser(row: any) {
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
  name: 't.name',
  createdAt: 't.created_at',
  updatedAt: 't.updated_at',
};

export async function getTeam(teamId: string, options: { includeMembers?: boolean } = {}) {
  const { rawQuery } = sqlite;
  const { includeMembers = false } = options;

  const result = rawQuery(
    `
    select *
    from team
    where team_id = {{teamId}}
    `,
    { teamId },
  );

  const team = mapTeam(result?.[0]);

  if (team && includeMembers) {
    const teamUsers = rawQuery(
      `
      select *
      from team_user
      where team_id = {{teamId}}
      order by created_at asc
      `,
      { teamId },
    );

    team.teamUser = teamUsers.map(mapTeamUser);
  }

  return team;
}

export async function getTeamByAccessCode(accessCode: string) {
  const { rawQuery } = sqlite;
  const result = rawQuery(
    `
    select *
    from team
    where access_code = {{accessCode}}
      and deleted_at is null
    `,
    { accessCode },
  );

  return mapTeam(result?.[0]);
}

export async function getUserTeams(
  userId: string,
  filters: PageParams = {},
): Promise<PageResult<Team[]>> {
  const { rawQuery } = sqlite;
  const { search } = filters;
  const { page, pageSize, offset, limit } = getPageParams(filters);
  const orderBy = getOrderBy(filters.orderBy, ORDER_BY_COLUMNS, filters.sortDescending);
  const searchQuery = search ? 'and t.name like {{search}}' : '';
  const params: Record<string, any> = { userId, search: `%${search}%` };

  const baseQuery = `
    select
      t.*,
      (
        select count(*)
        from website w
        where w.team_id = t.team_id
          and w.deleted_at is null
      ) as website_count,
      (
        select count(*)
        from team_user tu2
        join "user" u2 on u2.user_id = tu2.user_id
        where tu2.team_id = t.team_id
          and u2.deleted_at is null
      ) as team_user_count
    from team t
    where t.deleted_at is null
      and exists (
        select 1
        from team_user tu
        where tu.team_id = t.team_id
          and tu.user_id = {{userId}}
      )
      ${searchQuery}
  `;

  const count = rawQuery<{ num: number }[]>(
    `select count(*) as num from (${baseQuery}) t`,
    params,
  ).at(0)?.num;

  const teams = rawQuery(
    `
    ${baseQuery}
    ${orderBy}
    limit {{limit}} offset {{offset}}
    `,
    { ...params, limit, offset },
  ).map(row => ({
    ...mapTeam(row),
    _count: {
      website: row.website_count,
      teamUser: row.team_user_count,
    },
  }));

  const teamIds = teams.map(({ id }) => id);

  if (teamIds.length > 0) {
    const teamUsers = rawQuery(
      `
      select tu.*, u.user_id as member_user_id, u.username as member_username
      from team_user tu
      join "user" u on u.user_id = tu.user_id
      where tu.team_id in ${sqlIn(teamIds)}
        and u.deleted_at is null
      order by tu.created_at asc
      `,
    );

    for (const team of teams) {
      team.teamUser = teamUsers
        .filter(teamUser => teamUser.team_id === team.id)
        .map(teamUser => ({
          ...mapTeamUser(teamUser),
          user: {
            id: teamUser.member_user_id,
            username: teamUser.member_username,
          },
        }));
    }
  }

  return { data: teams, count, page, pageSize: limit, orderBy: filters.orderBy };
}

export async function createTeam(
  data: { id: string; name: string; accessCode?: string },
  userId: string,
): Promise<any> {
  const { rawQuery, transaction } = sqlite;
  const teamUserId = uuid();

  transaction(() => {
    rawQuery(
      `
      insert into team (team_id, name, access_code)
      values ({{id}}, {{name}}, {{accessCode}})
      `,
      data,
    );

    rawQuery(
      `
      insert into team_user (team_user_id, team_id, user_id, role)
      values ({{teamUserId}}, {{teamId}}, {{userId}}, {{role}})
      `,
      {
        teamUserId,
        teamId: data.id,
        userId,
        role: ROLES.teamOwner,
      },
    );
  });

  const team = await getTeam(data.id);

  return [
    team,
    {
      id: teamUserId,
      teamId: data.id,
      userId,
      role: ROLES.teamOwner,
    },
  ];
}

const TEAM_UPDATE_COLUMNS = {
  name: 'name',
  accessCode: 'access_code',
  logoUrl: 'logo_url',
  deletedAt: 'deleted_at',
};

export async function updateTeam(teamId: string, data: any): Promise<Team> {
  const { rawQuery } = sqlite;
  const updates: string[] = [];
  const params: Record<string, any> = { teamId };

  for (const [key, column] of Object.entries(TEAM_UPDATE_COLUMNS)) {
    if (data[key] !== undefined) {
      updates.push(`${column} = {{${key}}}`);
      params[key] = data[key];
    }
  }

  updates.push('updated_at = {{updatedAt}}');
  params.updatedAt = new Date();

  rawQuery(
    `
    update team
    set ${updates.join(', ')}
    where team_id = {{teamId}}
    `,
    params,
  );

  return getTeam(teamId);
}

export async function deleteTeam(teamId: string): Promise<void> {
  const { rawQuery, transaction } = sqlite;
  const cloudMode = process.env.CLOUD_MODE;

  if (cloudMode) {
    rawQuery(
      `update team set deleted_at = {{deletedAt}} where team_id = {{teamId}}`,
      { teamId, deletedAt: new Date() },
    );

    return;
  }

  transaction(() => {
    rawQuery(`delete from team_user where team_id = {{teamId}}`, { teamId });
    rawQuery(`delete from team where team_id = {{teamId}}`, { teamId });
  });
}
