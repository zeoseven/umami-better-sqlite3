export const SQLITE = 'sqlite';
export const CLICKHOUSE = 'clickhouse';
export const KAFKA = 'kafka';
export const KAFKA_PRODUCER = 'kafka-producer';

// Fixes issue with converting bigint values
BigInt.prototype['toJSON'] = function () {
  return Number(this);
};

export function getDatabaseType() {
  return SQLITE;
}

export async function runQuery(queries: any) {
  if (process.env.CLICKHOUSE_URL) {
    if (queries[KAFKA]) {
      return queries[KAFKA]();
    }

    return queries[CLICKHOUSE]();
  }

  return queries[SQLITE]();
}

export function notImplemented() {
  throw new Error('Not implemented.');
}
