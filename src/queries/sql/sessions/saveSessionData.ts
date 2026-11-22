import { DATA_TYPE } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { flattenJSON, getStringValue } from '@/lib/data';
import sqlite from '@/lib/sqlite';
import { DynamicData } from '@/lib/types';
import { CLICKHOUSE, SQLITE, runQuery } from '@/lib/db';
import kafka from '@/lib/kafka';
import clickhouse from '@/lib/clickhouse';

export interface SaveSessionDataArgs {
  websiteId: string;
  sessionId: string;
  sessionData: DynamicData;
  distinctId?: string;
  createdAt?: Date;
}

export async function saveSessionData(data: SaveSessionDataArgs) {
  return runQuery({
    [SQLITE]: () => relationalQuery(data),
    [CLICKHOUSE]: () => clickhouseQuery(data),
  });
}

export async function relationalQuery({
  websiteId,
  sessionId,
  sessionData,
  distinctId,
  createdAt,
}: SaveSessionDataArgs) {
  const { rawQuery, transaction } = sqlite;

  const jsonKeys = flattenJSON(sessionData);

  const flattenedData = jsonKeys.map(a => ({
    id: uuid(),
    websiteId,
    sessionId,
    dataKey: a.key,
    stringValue: getStringValue(a.value, a.dataType),
    numberValue: a.dataType === DATA_TYPE.number ? a.value : null,
    dateValue: a.dataType === DATA_TYPE.date ? new Date(a.value) : null,
    dataType: a.dataType,
    distinctId,
    createdAt,
  }));

  transaction(() => {
    for (const data of flattenedData) {
      rawQuery(
        `
        insert into session_data (
          session_data_id, website_id, session_id, data_key,
          string_value, number_value, date_value, data_type, distinct_id, created_at
        )
        values (
          {{id}}, {{websiteId}}, {{sessionId}}, {{dataKey}},
          {{stringValue}}, {{numberValue}}, {{dateValue}}, {{dataType}}, {{distinctId}}, {{createdAt}}
        )
        on conflict(session_id, data_key) do update set
          website_id = excluded.website_id,
          string_value = excluded.string_value,
          number_value = excluded.number_value,
          date_value = excluded.date_value,
          data_type = excluded.data_type,
          distinct_id = excluded.distinct_id
        `,
        data,
      );
    }
  });
}

async function clickhouseQuery({
  websiteId,
  sessionId,
  sessionData,
  distinctId,
  createdAt,
}: SaveSessionDataArgs) {
  const { insert, getUTCString } = clickhouse;
  const { sendMessage } = kafka;

  const jsonKeys = flattenJSON(sessionData);

  const messages = jsonKeys.map(({ key, value, dataType }) => {
    return {
      website_id: websiteId,
      session_id: sessionId,
      data_key: key,
      data_type: dataType,
      string_value: getStringValue(value, dataType),
      number_value: dataType === DATA_TYPE.number ? value : null,
      date_value: dataType === DATA_TYPE.date ? getUTCString(value) : null,
      distinct_id: distinctId,
      created_at: getUTCString(createdAt),
    };
  });

  if (kafka.enabled) {
    await sendMessage('session_data', messages);
  } else {
    await insert('session_data', messages);
  }
}
