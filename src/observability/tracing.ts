import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { 
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor
} from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { 
  trace,
  context,
  Span,
  SpanKind,
  SpanStatusCode,
  Tracer,
  Context
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';
import { logger } from '../utils/logger';
import { config } from '../config';

interface TracingConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  jaegerEndpoint?: string;
  zipkinEndpoint?: string;
  consoleExporter?: boolean;
  samplingRate?: number;
}

export class TracingService {
  private static instance: TracingService;
  private sdk?: NodeSDK;
  private tracer: Tracer;
  private config: TracingConfig;
  private isInitialized: boolean = false;

  private constructor() {
    this.config = this.buildConfig();
    this.tracer = trace.getTracer(
      this.config.serviceName,
      this.config.serviceVersion
    );
  }

  static getInstance(): TracingService {
    if (!TracingService.instance) {
      TracingService.instance = new TracingService();
    }
    return TracingService.instance;
  }

  private buildConfig(): TracingConfig {
    return {
      serviceName: config.tracing?.serviceName || 'claude-discord-bridge',
      serviceVersion: config.tracing?.serviceVersion || process.env.npm_package_version || '1.0.0',
      environment: config.tracing?.environment || process.env.NODE_ENV || 'development',
      jaegerEndpoint: config.tracing?.jaegerEndpoint || process.env.JAEGER_ENDPOINT,
      zipkinEndpoint: config.tracing?.zipkinEndpoint || process.env.ZIPKIN_ENDPOINT,
      consoleExporter: config.tracing?.consoleExporter || process.env.NODE_ENV === 'development',
      samplingRate: config.tracing?.samplingRate || 1.0
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Tracing already initialized');
      return;
    }

    try {
      // Create resource
      const resource = Resource.default().merge(
        new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
          [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
          [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
          [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME || 'localhost',
          'service.namespace': 'discord-bots',
          'telemetry.sdk.name': 'opentelemetry',
          'telemetry.sdk.language': 'nodejs',
        })
      );

      // Create exporters
      const exporters = [];

      if (this.config.jaegerEndpoint) {
        exporters.push(new JaegerExporter({
          endpoint: this.config.jaegerEndpoint,
          serviceName: this.config.serviceName
        }));
      }

      if (this.config.zipkinEndpoint) {
        exporters.push(new ZipkinExporter({
          url: this.config.zipkinEndpoint,
          serviceName: this.config.serviceName
        }));
      }

      if (this.config.consoleExporter) {
        exporters.push(new ConsoleSpanExporter());
      }

      // Create tracer provider
      const tracerProvider = new BasicTracerProvider({
        resource,
        sampler: {
          shouldSample: () => ({
            decision: Math.random() < this.config.samplingRate ? 1 : 0,
            attributes: {}
          }),
          toString: () => 'ProbabilitySampler'
        }
      });

      // Add span processors
      exporters.forEach(exporter => {
        if (exporter instanceof ConsoleSpanExporter) {
          tracerProvider.addSpanProcessor(new SimpleSpanProcessor(exporter));
        } else {
          tracerProvider.addSpanProcessor(new BatchSpanProcessor(exporter));
        }
      });

      // Register tracer provider
      tracerProvider.register({
        propagator: new W3CTraceContextPropagator()
      });

      // Register instrumentations
      registerInstrumentations({
        instrumentations: [
          new HttpInstrumentation({
            requestHook: (span, request) => {
              span.setAttribute('http.request.body', JSON.stringify(request.body));
            },
            responseHook: (span, response) => {
              span.setAttribute('http.response.size', response.headers['content-length'] || 0);
            }
          }),
          new ExpressInstrumentation(),
          new RedisInstrumentation(),
          new IORedisInstrumentation(),
          new PgInstrumentation(),
          new WinstonInstrumentation()
        ]
      });

      // Initialize metrics
      await this.initializeMetrics();

      this.isInitialized = true;
      logger.info('OpenTelemetry tracing initialized', {
        serviceName: this.config.serviceName,
        environment: this.config.environment,
        exporters: exporters.length
      });
    } catch (error) {
      logger.error('Failed to initialize tracing:', error);
      throw error;
    }
  }

  private async initializeMetrics(): Promise<void> {
    const prometheusExporter = new PrometheusExporter(
      {
        port: config.metrics?.port || 9464,
        endpoint: '/metrics'
      },
      () => {
        logger.info(`Prometheus metrics available at http://localhost:${config.metrics?.port || 9464}/metrics`);
      }
    );

    const meterProvider = new MeterProvider({
      readers: [prometheusExporter],
      resource: Resource.default().merge(
        new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName
        })
      )
    });

    // Register as global meter provider
    meterProvider.register();
  }

  // Span creation helpers
  startSpan(
    name: string,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, any>;
      parent?: Context;
    }
  ): Span {
    const span = this.tracer.startSpan(name, {
      kind: options?.kind || SpanKind.INTERNAL,
      attributes: options?.attributes
    }, options?.parent);

    // Add common attributes
    span.setAttributes({
      'service.name': this.config.serviceName,
      'service.version': this.config.serviceVersion,
      'environment': this.config.environment,
      'timestamp': Date.now()
    });

    return span;
  }

  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, any>;
    }
  ): Promise<T> {
    const span = this.startSpan(name, options);
    
    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        () => fn(span)
      );
      
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  }

  // Discord command tracing
  async traceCommand<T>(
    commandName: string,
    userId: string,
    guildId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.withSpan(
      `discord.command.${commandName}`,
      async (span) => {
        span.setAttributes({
          'discord.command.name': commandName,
          'discord.user.id': userId,
          'discord.guild.id': guildId,
          'discord.command.timestamp': Date.now()
        });
        
        return await fn();
      },
      { kind: SpanKind.SERVER }
    );
  }

  // Database operation tracing
  async traceDatabase<T>(
    operation: string,
    query: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.withSpan(
      `db.${operation}`,
      async (span) => {
        span.setAttributes({
          'db.system': 'postgresql',
          'db.operation': operation,
          'db.statement': query.substring(0, 500),
          'db.timestamp': Date.now()
        });
        
        const startTime = Date.now();
        const result = await fn();
        const duration = Date.now() - startTime;
        
        span.setAttribute('db.duration', duration);
        return result;
      },
      { kind: SpanKind.CLIENT }
    );
  }

  // Cache operation tracing
  async traceCache<T>(
    operation: string,
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.withSpan(
      `cache.${operation}`,
      async (span) => {
        span.setAttributes({
          'cache.system': 'redis',
          'cache.operation': operation,
          'cache.key': key,
          'cache.timestamp': Date.now()
        });
        
        const startTime = Date.now();
        const result = await fn();
        const duration = Date.now() - startTime;
        
        span.setAttributes({
          'cache.duration': duration,
          'cache.hit': result !== null && result !== undefined
        });
        
        return result;
      },
      { kind: SpanKind.CLIENT }
    );
  }

  // HTTP request tracing
  async traceHttp<T>(
    method: string,
    url: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.withSpan(
      `http.${method.toLowerCase()}`,
      async (span) => {
        span.setAttributes({
          'http.method': method,
          'http.url': url,
          'http.timestamp': Date.now()
        });
        
        const startTime = Date.now();
        try {
          const result = await fn();
          const duration = Date.now() - startTime;
          
          span.setAttributes({
            'http.duration': duration,
            'http.status_code': 200
          });
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          
          span.setAttributes({
            'http.duration': duration,
            'http.status_code': error.response?.status || 500,
            'http.error': error.message
          });
          
          throw error;
        }
      },
      { kind: SpanKind.CLIENT }
    );
  }

  // Session operation tracing
  async traceSession<T>(
    operation: string,
    sessionId: string,
    userId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.withSpan(
      `session.${operation}`,
      async (span) => {
        span.setAttributes({
          'session.operation': operation,
          'session.id': sessionId,
          'session.user_id': userId,
          'session.timestamp': Date.now()
        });
        
        return await fn();
      },
      { kind: SpanKind.INTERNAL }
    );
  }

  // Custom span attributes
  addSpanAttributes(attributes: Record<string, any>): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }

  // Add event to current span
  addSpanEvent(name: string, attributes?: Record<string, any>): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  // Record exception in current span
  recordException(error: Error): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
    }
  }

  // Get current trace ID
  getCurrentTraceId(): string | undefined {
    const span = trace.getActiveSpan();
    return span?.spanContext().traceId;
  }

  // Get current span ID
  getCurrentSpanId(): string | undefined {
    const span = trace.getActiveSpan();
    return span?.spanContext().spanId;
  }

  // Create baggage for context propagation
  createBaggage(items: Record<string, string>): Context {
    let ctx = context.active();
    
    for (const [key, value] of Object.entries(items)) {
      ctx = ctx.setValue(Symbol(key), value);
    }
    
    return ctx;
  }

  // Extract trace context from headers
  extractContext(headers: Record<string, string>): Context {
    const propagator = new W3CTraceContextPropagator();
    return propagator.extract(context.active(), headers, {
      get: (carrier, key) => carrier[key],
      keys: (carrier) => Object.keys(carrier),
      set: () => {}
    });
  }

  // Inject trace context into headers
  injectContext(headers: Record<string, string>): Record<string, string> {
    const propagator = new W3CTraceContextPropagator();
    propagator.inject(context.active(), headers, {
      get: (carrier, key) => carrier[key],
      keys: (carrier) => Object.keys(carrier),
      set: (carrier, key, value) => { carrier[key] = value; }
    });
    return headers;
  }

  // Shutdown tracing
  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.isInitialized = false;
      logger.info('OpenTelemetry tracing shut down');
    }
  }

  // Get tracing stats
  getStats(): any {
    return {
      initialized: this.isInitialized,
      serviceName: this.config.serviceName,
      serviceVersion: this.config.serviceVersion,
      environment: this.config.environment,
      samplingRate: this.config.samplingRate,
      currentTraceId: this.getCurrentTraceId(),
      currentSpanId: this.getCurrentSpanId()
    };
  }
}

// Export singleton instance
export const tracing = TracingService.getInstance();

// Export convenience functions
export function startSpan(name: string, options?: any): Span {
  return tracing.startSpan(name, options);
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: any
): Promise<T> {
  return tracing.withSpan(name, fn, options);
}

export function addSpanAttributes(attributes: Record<string, any>): void {
  tracing.addSpanAttributes(attributes);
}

export function recordException(error: Error): void {
  tracing.recordException(error);
}