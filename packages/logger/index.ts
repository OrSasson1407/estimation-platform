// packages/logger/index.ts  ← UPDATED: Winston → Pino (spec requirement)
import pino from 'pino';

/**
 * Creates a Pino logger instance with structured JSON output.
 * In dev: pretty-printed. In production: raw JSON → Loki.
 * Spec: observability.ts — "Structured logging via Pino (JSON output to Loki)"
 */
export const createLogger = (serviceName: string) => {
  const isDev = process.env.NODE_ENV !== 'production';

  return pino({
    name: serviceName,
    level: isDev ? 'debug' : 'info',
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    }),
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
};

export const logger = createLogger('system');
export type Logger = ReturnType<typeof createLogger>;
