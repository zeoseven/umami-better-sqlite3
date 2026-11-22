import { DATA_TYPE } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { CLICKHOUSE, SQLITE, runQuery } from '@/lib/db';
import { flattenJSON, getStringValue } from '@/lib/data';
import clickhouse from '@/lib/clickhouse';
import kafka from '@/lib/kafka';
import sqlite from '@/lib/sqlite';
import { DynamicData } from '@/lib/types';

export interface SaveEventDataArgs {
  websiteId: string;
  eventId: string;
  sessionId?: string;
  urlPath?: string;
  eventName?: string;
  eventData: DynamicData;
  createdAt?: Date;
}

export async function saveEventData(data: SaveEventDataArgs) {
  return runQuery({
    [SQLITE]: () => relationalQuery(data),
    [CLICKHOUSE]: () => clickhouseQuery(data),
  });
}

export function getEventDataRows(data: SaveEventDataArgs) {
  const { websiteId, eventId, eventData, createdAt } = data;

  return flattenJSON(eventData).map(a => ({
    id: uuid(),
    websiteEventId: eventId,
    websiteId,
    dataKey: a.key,
    stringValue: getStringValue(a.value, a.dataType),
    numberValue: a.dataType === DATA_TYPE.number ? a.value : null,
    dateValue: a.dataType === DATA_TYPE.date ? new Date(a.value) : null,
    dataType: a.dataType,
    createdAt,
  }));
}

async function relationalQuery(data: SaveEventDataArgs) {
  const { rawQuery, transaction } = sqlite;

  const flattenedData = getEventDataRows(data);

  transaction(() => {
    for (const item of flattenedData) {
      rawQuery(
        `
        insert into event_data (
          event_data_id, website_event_id, website_id, data_key,
          string_value, number_value, date_value, data_type, created_at
        )
        values (
          {{id}}, {{websiteEventId}}, {{websiteId}}, {{dataKey}},
          {{stringValue}}, {{numberValue}}, {{dateValue}}, {{dataType}}, {{createdAt}}
        )
        `,
        item,
      );
    }
  });
}

async function clickhouseQuery(data: SaveEventDataArgs) {
  const { websiteId, sessionId, eventId, urlPath, eventName, eventData, createdAt } = data;

  const { insert, getUTCString } = clickhouse;
  const { sendMessage } = kafka;

  const jsonKeys = flattenJSON(eventData);

  const messages = jsonKeys.map(({ key, value, dataType }) => {
    return {
      website_id: websiteId,
      session_id: sessionId,
      event_id: eventId,
      url_path: urlPath,
      event_name: eventName,
      data_key: key,
      data_type: dataType,
      string_value: getStringValue(value, dataType),
      number_value: dataType === DATA_TYPE.number ? value : null,
      date_value: dataType === DATA_TYPE.date ? getUTCString(value) : null,
      created_at: getUTCString(createdAt),
    };
  });

  if (kafka.enabled) {
    await sendMessage('event_data', messages);
  } else {
    await insert('event_data', messages);
  }
}
