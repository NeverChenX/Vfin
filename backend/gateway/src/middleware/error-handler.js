function resolveStatusCode(error) {
  if (
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
  ) {
    return error.statusCode;
  }

  return 500;
}

function resolveCode(error, statusCode) {
  if (error?.code) {
    return error.code;
  }

  return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR';
}

function resolveMessage(error, statusCode) {
  if (error?.message) {
    return error.message;
  }

  return statusCode >= 500 ? 'Internal server error' : 'Bad request';
}

function resolveProvider(error) {
  return error?.provider ?? 'gateway';
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = resolveStatusCode(error);
  const traceId = req.traceId;

  if (statusCode >= 500) {
    console.error(`[traceId=${traceId}]`, error);
  }

  return res.status(statusCode).json({
    code: resolveCode(error, statusCode),
    message: resolveMessage(error, statusCode),
    provider: resolveProvider(error),
    traceId
  });
}
