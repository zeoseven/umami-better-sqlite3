import bcrypt from 'bcryptjs';
import redis from '@/lib/redis';
import debug from 'debug';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, SHARE_TOKEN_HEADER } from '@/lib/constants';
import { secret, getRandomChars } from '@/lib/crypto';
import { createSecureToken, parseSecureToken, parseToken } from '@/lib/jwt';
import { ensureArray } from '@/lib/utils';
import { getTeam, getTeamUser, getUser, getWebsite } from '@/queries';
import { Auth, Report } from './types';

const log = debug('umami:auth');
const cloudMode = process.env.CLOUD_MODE;
const SALT_ROUNDS = 10;
export const AUTH_TOKEN_EXPIRATION = 60 * 60 * 24 * 30;

async function getActiveTeam(teamId: string) {
  const team = await getTeam(teamId);

  return team && !team.deletedAt ? team : null;
}

export function hashPassword(password: string, rounds = SALT_ROUNDS) {
  return bcrypt.hashSync(password, rounds);
}

export function checkPassword(password: string, passwordHash: string) {
  return bcrypt.compareSync(password, passwordHash);
}

export async function checkAuth(request: Request) {
  const token = request.headers.get('authorization')?.split(' ')?.[1];
  const payload = parseSecureToken(token, secret());
  const shareToken = await parseShareToken(request.headers);

  let user = null;
  const { userId, authKey, grant, iat } = payload || {};

  const expired = !!iat && Math.floor(Date.now() / 1000) - iat > AUTH_TOKEN_EXPIRATION;

  if (userId && !expired) {
    user = await getUser(userId);
  } else if (redis.enabled && authKey && !expired) {
    const key = await redis.client.get(authKey);

    if (key?.userId) {
      user = await getUser(key.userId);
    }
  }

  if (process.env.NODE_ENV === 'development') {
    log('checkAuth:', { token, shareToken, payload, user, grant });
  }

  if (!user?.id && !shareToken) {
    log('checkAuth: User not authorized');
    return null;
  }

  if (user) {
    user.isAdmin = user.role === ROLES.admin;
  }

  return {
    user,
    grant,
    token,
    shareToken,
    authKey,
  };
}

export async function saveAuth(data: any, expire = AUTH_TOKEN_EXPIRATION) {
  const authKey = `auth:${getRandomChars(32)}`;

  if (redis.enabled) {
    await redis.client.set(authKey, data);

    if (expire) {
      await redis.client.expire(authKey, expire);
    }
  }

  return createSecureToken({ authKey }, secret(), expire ? { expiresIn: expire } : undefined);
}

export function parseShareToken(headers: Headers) {
  try {
    return parseToken(headers.get(SHARE_TOKEN_HEADER), secret());
  } catch (e) {
    log(e);
    return null;
  }
}

export async function canViewWebsite({ user, shareToken }: Auth, websiteId: string) {
  if (user?.isAdmin) {
    return true;
  }

  const website = await getWebsite(websiteId);

  if (!website || website.deletedAt) {
    return false;
  }

  if (shareToken?.websiteId === websiteId) {
    if (shareToken.shareId && shareToken.shareId === website.shareId) {
      return true;
    }

    if (!user) {
      return false;
    }
  }

  if (!user) {
    return false;
  }

  if (website.userId) {
    return user.id === website.userId;
  }

  if (website.teamId) {
    if (!(await getActiveTeam(website.teamId))) {
      return false;
    }

    const teamUser = await getTeamUser(website.teamId, user.id);

    return !!teamUser;
  }

  return false;
}

export async function canViewAllWebsites({ user }: Auth) {
  return user.isAdmin;
}

export async function canCreateWebsite({ user, grant }: Auth) {
  if (cloudMode) {
    return !!grant?.find(a => a === PERMISSIONS.websiteCreate);
  }

  if (user.isAdmin) {
    return true;
  }

  return hasPermission(user.role, PERMISSIONS.websiteCreate);
}

export async function canUpdateWebsite({ user }: Auth, websiteId: string) {
  if (user.isAdmin) {
    return true;
  }

  const website = await getWebsite(websiteId);

  if (website.userId) {
    return user.id === website.userId;
  }

  if (website.teamId) {
    if (!(await getActiveTeam(website.teamId))) {
      return false;
    }

    const teamUser = await getTeamUser(website.teamId, user.id);

    return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteUpdate);
  }

  return false;
}

export async function canTransferWebsiteToUser({ user }: Auth, websiteId: string, userId: string) {
  const website = await getWebsite(websiteId);

  if (website.teamId && user.id === userId) {
    const teamUser = await getTeamUser(website.teamId, userId);

    return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteTransferToUser);
  }

  return false;
}

export async function canTransferWebsiteToTeam({ user }: Auth, websiteId: string, teamId: string) {
  const website = await getWebsite(websiteId);

  if (website.userId && website.userId === user.id) {
    const teamUser = await getTeamUser(teamId, user.id);

    return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteTransferToTeam);
  }

  return false;
}

export async function canDeleteWebsite({ user }: Auth, websiteId: string) {
  if (user.isAdmin) {
    return true;
  }

  const website = await getWebsite(websiteId);

  if (website.userId) {
    return user.id === website.userId;
  }

  if (website.teamId) {
    if (!(await getActiveTeam(website.teamId))) {
      return false;
    }

    const teamUser = await getTeamUser(website.teamId, user.id);

    return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteDelete);
  }

  return false;
}

export async function canViewReport(auth: Auth, report: Report) {
  if (!report) {
    return false;
  }

  if (auth.user?.isAdmin) {
    return true;
  }

  if (auth.user && auth.user.id == report.userId) {
    return true;
  }

  return !!(await canViewWebsite(auth, report.websiteId));
}

export async function canUpdateReport({ user }: Auth, report: Report) {
  if (!report || !user) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  return user.id == report.userId;
}

export async function canDeleteReport(auth: Auth, report: Report) {
  return canUpdateReport(auth, report);
}

export async function canCreateTeam({ user, grant }: Auth) {
  if (cloudMode) {
    return !!grant?.find(a => a === PERMISSIONS.teamCreate);
  }

  if (user.isAdmin) {
    return true;
  }

  return !!user;
}

export async function canViewTeam({ user }: Auth, teamId: string) {
  if (user.isAdmin) {
    return true;
  }

  if (!(await getActiveTeam(teamId))) {
    return false;
  }

  return getTeamUser(teamId, user.id);
}

function canManageTeamRole(actorRole: string, targetRole: string) {
  if (targetRole === ROLES.teamOwner || targetRole === ROLES.teamManager) {
    return actorRole === ROLES.teamOwner;
  }

  return true;
}

export async function canUpdateTeam({ user, grant }: Auth, teamId: string, targetUserId?: string) {
  if (user.isAdmin) {
    return true;
  }

  if (cloudMode) {
    return (
      !!grant?.find(a => a === PERMISSIONS.teamUpdate) && !!(await getActiveTeam(teamId))
    );
  }

  if (!(await getActiveTeam(teamId))) {
    return false;
  }

  const teamUser = await getTeamUser(teamId, user.id);

  if (!teamUser || !hasPermission(teamUser.role, PERMISSIONS.teamUpdate)) {
    return false;
  }

  if (targetUserId) {
    const targetTeamUser = await getTeamUser(teamId, targetUserId);

    if (targetTeamUser && !canManageTeamRole(teamUser.role, targetTeamUser.role)) {
      return false;
    }
  }

  return true;
}

export async function canAddUserToTeam({ user, grant }: Auth) {
  if (cloudMode) {
    return !!grant?.find(a => a === PERMISSIONS.teamUpdate);
  }

  return user.isAdmin;
}

export async function canDeleteTeam({ user }: Auth, teamId: string) {
  if (user.isAdmin) {
    return true;
  }

  if (!(await getActiveTeam(teamId))) {
    return false;
  }

  const teamUser = await getTeamUser(teamId, user.id);

  return teamUser && hasPermission(teamUser.role, PERMISSIONS.teamDelete);
}

export async function canDeleteTeamUser({ user }: Auth, teamId: string, removeUserId: string) {
  if (user.isAdmin) {
    return true;
  }

  if (removeUserId === user.id) {
    return true;
  }

  if (!(await getActiveTeam(teamId))) {
    return false;
  }

  const teamUser = await getTeamUser(teamId, user.id);

  if (!teamUser || !hasPermission(teamUser.role, PERMISSIONS.teamUpdate)) {
    return false;
  }

  const targetTeamUser = await getTeamUser(teamId, removeUserId);

  return !!targetTeamUser && canManageTeamRole(teamUser.role, targetTeamUser.role);
}

export async function canCreateTeamWebsite({ user }: Auth, teamId: string) {
  if (user.isAdmin) {
    return true;
  }

  if (!(await getActiveTeam(teamId))) {
    return false;
  }

  const teamUser = await getTeamUser(teamId, user.id);

  return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteCreate);
}

export async function canCreateUser({ user }: Auth) {
  return user.isAdmin;
}

export async function canViewUser({ user }: Auth, viewedUserId: string) {
  if (user.isAdmin) {
    return true;
  }

  return user.id === viewedUserId;
}

export async function canViewUsers({ user }: Auth) {
  return user.isAdmin;
}

export async function canUpdateUser({ user }: Auth, viewedUserId: string) {
  if (user.isAdmin) {
    return true;
  }

  return user.id === viewedUserId;
}

export async function canDeleteUser({ user }: Auth) {
  return user.isAdmin;
}

export async function hasPermission(role: string, permission: string | string[]) {
  return ensureArray(permission).some(e => ROLE_PERMISSIONS[role]?.includes(e));
}
