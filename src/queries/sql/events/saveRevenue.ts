import { uuid } from '@/lib/crypto';
import { SQLITE, runQuery } from '@/lib/db';
import sqlite from '@/lib/sqlite';

export interface SaveRevenueArgs {
  websiteId: string;
  sessionId: string;
  eventId: string;
  eventName: string;
  currency: string;
  revenue: number;
  createdAt: Date;
}

export async function saveRevenue(data: SaveRevenueArgs) {
  return runQuery({
    [SQLITE]: () => relationalQuery(data),
  });
}

async function relationalQuery(data: SaveRevenueArgs) {
  const { websiteId, sessionId, eventId, eventName, currency, revenue, createdAt } = data;
  const { rawQuery } = sqlite;

  rawQuery(
    `
    insert into revenue (
      revenue_id, website_id, session_id, event_id, event_name, currency, revenue, created_at
    )
    values (
      {{id}}, {{websiteId}}, {{sessionId}}, {{eventId}}, {{eventName}}, {{currency}}, {{revenue}}, {{createdAt}}
    )
    `,
    {
      id: uuid(),
      websiteId,
      sessionId,
      eventId,
      eventName,
      currency,
      revenue,
      createdAt,
    },
  );
}
