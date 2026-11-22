import { ROLES } from '@/lib/constants';
import { getRandomChars } from '@/lib/crypto';
import sqlite from '@/lib/sqlite';
import { PageParams, PageResult, Role, User } from '@/lib/types';
import { getOrderBy, getPageParams, sqlIn, toDate } from './utils';
import { purgeClickhouseWebsite } from './website';

export interface GetUserOptions {
  includePassword?: boolean;
  showDeleted?: boolean;
}

function mapUser(row: any, includePassword = false): User {
  if (!row) {
    return null;
  }

  const user: User = {
    id: row.user_id,
    username: row.username,
    role: row.role,
    logoUrl: row.logo_url,
    displayName: row.display_name,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toDate(row.deleted_at),
  };

  if (includePassword) {
    user.password = row.password;
  }

  return user;
}

async function findUser(
  where: { id?: string; username?: string },
  options: GetUserOptions = {},
): Promise<User> {
  const { includePassword = false, showDeleted = false } = options;
  const { rawQuery } = sqlite;
  const column = where.id ? 'user_id' : 'username';
  const value = where.id ?? where.username;

  const result = rawQuery(
    `
    select *
    from "user"
    where ${column} = {{value}}
    ${showDeleted ? '' : 'and deleted_at is null'}
    `,
    { value },
  );

  return mapUser(result?.[0], includePassword);
}

export async function getUser(userId: string, options: GetUserOptions = {}) {
  return findUser({ id: userId }, options);
}

export async function getUserByUsername(username: string, options: GetUserOptions = {}) {
  return findUser({ username }, options);
}

export async function getUsers(pageParams: PageParams = {}): Promise<PageResult<User[]>> {
  const { rawQuery } = sqlite;
  const { search } = pageParams;
  const { page, pageSize, offset, limit } = getPageParams(pageParams);
  const orderBy = getOrderBy(
    pageParams.orderBy,
    { createdAt: 'u.created_at', username: 'u.username', role: 'u.role' },
    pageParams.sortDescending,
  );
  const searchQuery = search ? 'and u.username like {{search}}' : '';
  const params = {
    search: `%${search}%`,
  };

  const count = rawQuery<{ num: number }[]>(
    `
    select count(*) as num
    from "user" u
    where u.deleted_at is null
    ${searchQuery}
    `,
    params,
  ).at(0)?.num;

  const data = rawQuery(
    `
    select
      u.*,
      (select count(*) from website w where w.user_id = u.user_id and w.deleted_at is null) as website_count
    from "user" u
    where u.deleted_at is null
    ${searchQuery}
    ${orderBy || 'order by u.created_at desc'}
    limit {{limit}} offset {{offset}}
    `,
    { ...params, limit, offset },
  ).map(row => ({
    ...mapUser(row),
    _count: {
      website: row.website_count,
    },
  }));

  return { data, count, page, pageSize: limit, orderBy: pageParams.orderBy };
}

export async function createUser(data: {
  id: string;
  username: string;
  password: string;
  role: Role;
}): Promise<{ id: string; username: string; role: string }> {
  const { rawQuery } = sqlite;

  rawQuery(
    `
    insert into "user" (user_id, username, password, role)
    values ({{id}}, {{username}}, {{password}}, {{role}})
    `,
    data,
  );

  return { id: data.id, username: data.username, role: data.role };
}

const USER_UPDATE_COLUMNS = {
  username: 'username',
  password: 'password',
  role: 'role',
  logoUrl: 'logo_url',
  displayName: 'display_name',
  deletedAt: 'deleted_at',
};

export async function updateUser(userId: string, data: any): Promise<User> {
  const { rawQuery } = sqlite;
  const updates: string[] = [];
  const params: Record<string, any> = { userId };

  for (const [key, column] of Object.entries(USER_UPDATE_COLUMNS)) {
    if (data[key] !== undefined) {
      updates.push(`${column} = {{${key}}}`);
      params[key] = data[key];
    }
  }

  updates.push(`updated_at = {{updatedAt}}`);
  params['updatedAt'] = new Date();

  rawQuery(
    `
    update "user"
    set ${updates.join(', ')}
    where user_id = {{userId}}
    `,
    params,
  );

  return getUser(userId);
}

export async function deleteUser(userId: string): Promise<void> {
  const { rawQuery, transaction } = sqlite;
  const cloudMode = process.env.CLOUD_MODE;

  const teams = rawQuery<{ team_id: string }[]>(
    `
    select team_id
    from team_user
    where user_id = {{userId}}
      and role = {{role}}
    `,
    { userId, role: ROLES.teamOwner },
  );
  const teamIds = teams.map(({ team_id }) => team_id);
  const teamWebsiteIds = cloudMode
    ? []
    : teamIds.length > 0
      ? rawQuery<{ website_id: string }[]>(
          `select website_id from website where team_id in ${sqlIn(teamIds)}`,
        ).map(({ website_id }) => website_id)
      : [];

  const websites = rawQuery<{ website_id: string }[]>(
    `select website_id from website where user_id = {{userId}}`,
    { userId },
  );
  const websiteIds = Array.from(
    new Set([...websites.map(({ website_id }) => website_id), ...teamWebsiteIds]),
  );

  transaction(() => {
    if (cloudMode) {
      if (websiteIds.length > 0) {
        rawQuery(`update website set deleted_at = {{deletedAt}} where website_id in ${sqlIn(websiteIds)}`, {
          deletedAt: new Date(),
        });
      }

      rawQuery(
        `
        update "user"
        set username = {{username}}, deleted_at = {{deletedAt}}
        where user_id = {{userId}}
        `,
        { userId, username: getRandomChars(32), deletedAt: new Date() },
      );

      return;
    }

    if (teamIds.length > 0) {
      rawQuery(`delete from team_user where team_id in ${sqlIn(teamIds)} or user_id = {{userId}}`, {
        userId,
      });
      rawQuery(`delete from team where team_id in ${sqlIn(teamIds)}`);
    } else {
      rawQuery(`delete from team_user where user_id = {{userId}}`, { userId });
    }

    if (websiteIds.length > 0) {
      const ids = sqlIn(websiteIds);

      rawQuery(`delete from event_data where website_id in ${ids}`);
      rawQuery(`delete from session_data where website_id in ${ids}`);
      rawQuery(`delete from revenue where website_id in ${ids}`);
      rawQuery(`delete from website_event where website_id in ${ids}`);
      rawQuery(`delete from session where website_id in ${ids}`);
      rawQuery(`delete from segment where website_id in ${ids}`);
      rawQuery(`delete from report where website_id in ${ids}`);
      rawQuery(`delete from website where website_id in ${ids}`);
    }

    rawQuery(`delete from report where user_id = {{userId}}`, { userId });
    rawQuery(`delete from "user" where user_id = {{userId}}`, { userId });
  });

  if (!cloudMode && websiteIds.length > 0) {
    await Promise.all(websiteIds.map(id => purgeClickhouseWebsite(id)));
  }
}
