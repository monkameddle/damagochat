import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { metrics, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';

export default fp(async function telemetryPlugin(app: FastifyInstance) {
  const meter = metrics.getMeter('fastify');
  const httpRequestDuration = meter.createHistogram('http.server.duration', {
    description: 'HTTP server request duration in milliseconds',
    unit: 'ms',
  });
  const httpRequestsTotal = meter.createCounter('http.server.requests.total', {
    description: 'Total HTTP requests',
  });
  const wsConnectionsGauge = meter.createUpDownCounter('ws.connections.active', {
    description: 'Active WebSocket connections',
  });

  app.decorate('wsGauge', wsConnectionsGauge);

  app.addHook('onRequest', async (req) => {
    (req as typeof req & { _startTime: number })._startTime = Date.now();
  });

  app.addHook('onResponse', async (req, reply) => {
    const duration = Date.now() - ((req as typeof req & { _startTime: number })._startTime ?? Date.now());
    const attrs = {
      'http.method': req.method,
      'http.route': req.routeOptions?.url ?? req.url,
      'http.status_code': String(reply.statusCode),
    };

    httpRequestDuration.record(duration, attrs);
    httpRequestsTotal.add(1, attrs);
  });

  app.addHook('onRequest', async (req) => {
    const tracer = trace.getTracer('fastify');
    const span = tracer.startSpan(`${req.method} ${req.url}`);
    (req as typeof req & { _span: Span })._span = span;
  });
});
