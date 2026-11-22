import { EVENT_NAME_LENGTH, URL_LENGTH, EVENT_TYPE, PAGE_TITLE_LENGTH } from '@/lib/constants';
import { CLICKHOUSE, SQLITE, runQuery } from '@/lib/db';
import clickhouse from '@/lib/clickhouse';
import kafka from '@/lib/kafka';
import sqlite from '@/lib/sqlite';
import { uuid } from '@/lib/crypto';
import { saveEventData, getEventDataRows } from './saveEventData';

export interface SaveEventArgs {
  websiteId: string;
  sessionId: string;
  visitId: string;
  createdAt?: Date;

  // Page
  pageTitle?: string;
  hostname?: string;
  urlPath: string;
  urlQuery?: string;
  referrerPath?: string;
  referrerQuery?: string;
  referrerDomain?: string;

  // Session
  distinctId?: string;
  browser?: string;
  os?: string;
  device?: string;
  screen?: string;
  language?: string;
  country?: string;
  region?: string;
  city?: string;

  // Events
  eventName?: string;
  eventData?: any;
  tag?: string;

  // UTM
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;

  // Click IDs
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  ttclid?: string;
  lifatid?: string;
  twclid?: string;
}

export async function saveEvent(args: SaveEventArgs) {
  return runQuery({
    [SQLITE]: () => relationalQuery(args),
    [CLICKHOUSE]: () => clickhouseQuery(args),
  });
}

async function relationalQuery({
  websiteId,
  sessionId,
  visitId,
  createdAt,
  pageTitle,
  tag,
  hostname,
  urlPath,
  urlQuery,
  referrerPath,
  referrerQuery,
  referrerDomain,
  eventName,
  eventData,
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
  utmTerm,
  gclid,
  fbclid,
  msclkid,
  ttclid,
  lifatid,
  twclid,
}: SaveEventArgs) {
  const { rawQuery, transaction } = sqlite;
  const { revenue, currency } = eventData ?? {};
  const websiteEventId = uuid();
  const eventCreatedAt = createdAt ?? new Date();
  const truncatedEventName = eventName?.substring(0, EVENT_NAME_LENGTH);
  const eventDataRows = eventData
    ? getEventDataRows({
        websiteId,
        sessionId,
        eventId: websiteEventId,
        urlPath: urlPath?.substring(0, URL_LENGTH),
        eventName: truncatedEventName,
        eventData,
        createdAt: eventCreatedAt,
      })
    : [];

  transaction(() => {
    rawQuery(
      `
      insert into website_event (
        event_id, website_id, session_id, visit_id, created_at, url_path, url_query,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        referrer_path, referrer_query, referrer_domain, page_title,
        gclid, fbclid, msclkid, ttclid, li_fat_id, twclid,
        event_type, event_name, tag, hostname
      )
      values (
        {{websiteEventId}}, {{websiteId}}, {{sessionId}}, {{visitId}}, {{createdAt}}, {{urlPath}}, {{urlQuery}},
        {{utmSource}}, {{utmMedium}}, {{utmCampaign}}, {{utmContent}}, {{utmTerm}},
        {{referrerPath}}, {{referrerQuery}}, {{referrerDomain}}, {{pageTitle}},
        {{gclid}}, {{fbclid}}, {{msclkid}}, {{ttclid}}, {{lifatid}}, {{twclid}},
        {{eventType}}, {{eventName}}, {{tag}}, {{hostname}}
      )
      `,
      {
        websiteEventId,
        websiteId,
        sessionId,
        visitId,
        createdAt: eventCreatedAt,
        urlPath: urlPath?.substring(0, URL_LENGTH),
        urlQuery: urlQuery?.substring(0, URL_LENGTH),
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        referrerPath: referrerPath?.substring(0, URL_LENGTH),
        referrerQuery: referrerQuery?.substring(0, URL_LENGTH),
        referrerDomain: referrerDomain?.substring(0, URL_LENGTH),
        pageTitle: pageTitle?.substring(0, PAGE_TITLE_LENGTH),
        gclid,
        fbclid,
        msclkid,
        ttclid,
        lifatid,
        twclid,
        eventType: eventName ? EVENT_TYPE.customEvent : EVENT_TYPE.pageView,
        eventName: truncatedEventName ?? null,
        tag,
        hostname,
      },
    );

    for (const row of eventDataRows) {
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
        row,
      );
    }

    if (revenue > 0 && currency) {
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
          eventId: websiteEventId,
          eventName: truncatedEventName,
          currency,
          revenue,
          createdAt: eventCreatedAt,
        },
      );
    }
  });
}

async function clickhouseQuery({
  websiteId,
  sessionId,
  visitId,
  distinctId,
  createdAt,
  pageTitle,
  browser,
  os,
  device,
  screen,
  language,
  country,
  region,
  city,
  tag,
  hostname,
  urlPath,
  urlQuery,
  referrerPath,
  referrerQuery,
  referrerDomain,
  eventName,
  eventData,
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
  utmTerm,
  gclid,
  fbclid,
  msclkid,
  ttclid,
  lifatid,
  twclid,
}: SaveEventArgs) {
  const { insert, getUTCString } = clickhouse;
  const { sendMessage } = kafka;
  const eventId = uuid();

  const message = {
    website_id: websiteId,
    session_id: sessionId,
    visit_id: visitId,
    event_id: eventId,
    country: country,
    region: country && region ? (region.includes('-') ? region : `${country}-${region}`) : null,
    city: city,
    url_path: urlPath?.substring(0, URL_LENGTH),
    url_query: urlQuery?.substring(0, URL_LENGTH),
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    referrer_path: referrerPath?.substring(0, URL_LENGTH),
    referrer_query: referrerQuery?.substring(0, URL_LENGTH),
    referrer_domain: referrerDomain?.substring(0, URL_LENGTH),
    page_title: pageTitle?.substring(0, PAGE_TITLE_LENGTH),
    gclid: gclid,
    fbclid: fbclid,
    msclkid: msclkid,
    ttclid: ttclid,
    li_fat_id: lifatid,
    twclid: twclid,
    event_type: eventName ? EVENT_TYPE.customEvent : EVENT_TYPE.pageView,
    event_name: eventName ? eventName?.substring(0, EVENT_NAME_LENGTH) : null,
    tag: tag,
    distinct_id: distinctId,
    created_at: getUTCString(createdAt),
    browser,
    os,
    device,
    screen,
    language,
    hostname,
  };

  if (kafka.enabled) {
    await sendMessage('event', message);
  } else {
    await insert('website_event', [message]);
  }

  if (eventData) {
    await saveEventData({
      websiteId,
      sessionId,
      eventId,
      urlPath: urlPath?.substring(0, URL_LENGTH),
      eventName: eventName?.substring(0, EVENT_NAME_LENGTH),
      eventData,
      createdAt,
    });
  }
}
