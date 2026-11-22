import sqlite from '@/lib/sqlite';
import { Segment } from '@/lib/types';
import { parseJson, toDate } from './utils';

function mapSegment(row: any): Segment {
  if (!row) {
    return null;
  }

  return {
    id: row.segment_id,
    websiteId: row.website_id,
    type: row.type,
    name: row.name,
    parameters: parseJson(row.parameters) ?? {},
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export async function getSegment(segmentId: string): Promise<Segment> {
  const { rawQuery } = sqlite;
  const result = rawQuery(
    `
    select *
    from segment
    where segment_id = {{segmentId}}
    `,
    { segmentId },
  );

  return mapSegment(result?.[0]);
}

export async function getWebsiteSegment(
  websiteId: string,
  type: string,
  name: string,
): Promise<Segment> {
  const { rawQuery } = sqlite;
  const result = rawQuery(
    `
    select *
    from segment
    where website_id = {{websiteId}}
      and type = {{type}}
      and name = {{name}}
    `,
    { websiteId, type, name },
  );

  return mapSegment(result?.[0]);
}

export async function getWebsiteSegments(websiteId: string, type: string): Promise<Segment[]> {
  const { rawQuery } = sqlite;

  return rawQuery(
    `
    select *
    from segment
    where website_id = {{websiteId}}
      and type = {{type}}
    order by created_at asc
    `,
    { websiteId, type },
  ).map(mapSegment);
}

export async function createSegment(data: {
  id: string;
  websiteId: string;
  type: string;
  name: string;
  parameters: any;
}): Promise<Segment> {
  const { rawQuery } = sqlite;

  rawQuery(
    `
    insert into segment (segment_id, website_id, type, name, parameters)
    values ({{id}}, {{websiteId}}, {{type}}, {{name}}, {{parameters}})
    `,
    { ...data, parameters: JSON.stringify(data.parameters ?? {}) },
  );

  return getSegment(data.id);
}

const SEGMENT_UPDATE_COLUMNS = {
  websiteId: 'website_id',
  type: 'type',
  name: 'name',
};

export async function updateSegment(segmentId: string, data: any): Promise<Segment> {
  const { rawQuery } = sqlite;
  const updates: string[] = [];
  const params: Record<string, any> = { segmentId };

  for (const [key, column] of Object.entries(SEGMENT_UPDATE_COLUMNS)) {
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
    update segment
    set ${updates.join(', ')}
    where segment_id = {{segmentId}}
    `,
    params,
  );

  return getSegment(segmentId);
}

export async function deleteSegment(segmentId: string): Promise<void> {
  const { rawQuery } = sqlite;

  rawQuery(`delete from segment where segment_id = {{segmentId}}`, { segmentId });
}
