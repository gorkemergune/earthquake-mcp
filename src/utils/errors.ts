export type AfadErrorCode = 'AFAD_TIMEOUT' | 'AFAD_RATE_LIMITED' | 'AFAD_UNAVAILABLE' | 'AFAD_INVALID_RESPONSE';

const USER_MESSAGES: Record<AfadErrorCode, string> = {
  AFAD_TIMEOUT: 'AFAD servisi zamanında yanıt vermedi. Canlı veri doğrulanamadı.',
  AFAD_RATE_LIMITED: 'AFAD servisi istek sınırına ulaşıldığını bildirdi. Canlı veri doğrulanamadı; biraz sonra tekrar deneyin.',
  AFAD_UNAVAILABLE: 'AFAD servisine şu anda ulaşılamıyor. Canlı veri doğrulanamadı.',
  AFAD_INVALID_RESPONSE: 'AFAD servisinden beklenmeyen biçimde yanıt geldi. Canlı veri doğrulanamadı.',
};

/**
 * Runtime failure while fetching or validating AFAD data. `detail` is for
 * stderr diagnostics only and is never returned to the MCP client.
 */
export class AfadError extends Error {
  readonly code: AfadErrorCode;
  readonly detail: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(
    code: AfadErrorCode,
    detail: string,
    options: { retryable?: boolean; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(USER_MESSAGES[code], { cause: options.cause });
    this.name = 'AfadError';
    this.code = code;
    this.detail = detail;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }

  get userMessage(): string {
    return USER_MESSAGES[this.code];
  }
}
