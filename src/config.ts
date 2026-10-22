/** Fixed AFAD endpoint. Tool input can never change the host or path. */
export const AFAD_EVENT_FILTER_URL = 'https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter';

/** AFAD only serves the most recent 1000 events; filters run inside that window. */
export const AFAD_SOURCE_CAP = 1000;

export const SERVER_NAME = 'afad-earthquake';
export const SERVER_VERSION = '0.1.0';

export const HTTP_TIMEOUT_MS = 10_000;
export const HTTP_MAX_RETRIES = 1;
export const HTTP_TOTAL_BUDGET_MS = 25_000;
export const HTTP_MAX_RETRY_AFTER_MS = 5_000;
export const HTTP_RETRY_DELAY_MS = 500;
export const HTTP_MAX_BODY_BYTES = 10 * 1024 * 1024;

export const DEFAULT_RESULT_LIMIT = 100;
export const MAX_RESULT_LIMIT = 1000;
export const LAST_24H_MS = 24 * 60 * 60 * 1000;

export const TURKEY_TIME_ZONE = 'Europe/Istanbul';
