/**
 * OpenTelemetry instrumentation.
 * Must be initialised BEFORE any other imports so auto-instrumentation can patch modules.
 * Called at the top of main.ts and worker.ts via `--require` or explicit import.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const OTEL_EXPORTER_ENDPOINT =
  process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4317';

const SERVICE_NAME = process.env['OTEL_SERVICE_NAME'] ?? 'damagochat';
const SERVICE_VERSION = process.env['npm_package_version'] ?? '1.0.0';

let _sdk: NodeSDK | null = null;

export function initTelemetry(): void {
  if (process.env['OTEL_DISABLED'] === 'true') return;

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    'deployment.environment': process.env['NODE_ENV'] ?? 'development',
  });

  _sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: OTEL_EXPORTER_ENDPOINT }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: OTEL_EXPORTER_ENDPOINT }),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        '@opentelemetry/instrumentation-redis': { enabled: true },
        '@opentelemetry/instrumentation-ioredis': { enabled: true },
      }),
    ],
  });

  _sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  await _sdk?.shutdown();
}
