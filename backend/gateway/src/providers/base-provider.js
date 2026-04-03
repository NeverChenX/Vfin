const OPERATION_METHODS = {
  quote: 'fetchQuote',
  minute: 'fetchMinute',
  kline: 'fetchKline',
  capital: 'fetchCapital',
  callauction: 'fetchCallauction',
  trade: 'fetchTradeDetail',
  news: 'fetchNews',
  announcements: 'fetchAnnouncements'
};

export class BaseProvider {
  constructor({ name }) {
    this.name = name;
  }

  async fetch(operation, context) {
    const methodName = OPERATION_METHODS[operation];

    if (!methodName || typeof this[methodName] !== 'function') {
      throw this.createError(`Provider "${this.name}" does not support ${operation}`, {
        code: 'UNSUPPORTED_OPERATION',
        statusCode: 500
      });
    }

    return this[methodName](context);
  }

  ensureMockableMode(mode, operation) {
    if (mode === 'mock') {
      return;
    }

    if (mode === 'force-error') {
      throw this.createError(
        `Provider "${this.name}" forced an error for ${operation}`,
        {
          code: 'FORCED_PROVIDER_ERROR',
          statusCode: 502
        }
      );
    }

    throw this.createError(`Unsupported provider mode "${mode}"`, {
      code: 'UNSUPPORTED_PROVIDER_MODE',
      statusCode: 400
    });
  }

  createError(message, { code = 'PROVIDER_ERROR', statusCode = 502, cause } = {}) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.code = code;
    error.statusCode = statusCode;
    error.provider = this.name;
    return error;
  }
}
