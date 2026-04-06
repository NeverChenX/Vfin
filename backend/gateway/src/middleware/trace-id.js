import { randomUUID } from 'node:crypto';

export function traceIdMiddleware(req, res, next) {
  const traceId = req.get('X-Trace-Id') ?? req.get('X-Request-Id') ?? randomUUID();

  req.traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);

  next();
}
