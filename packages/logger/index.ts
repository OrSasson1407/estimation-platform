import winston from 'winston';

/**
 * Creates a standardized Winston logger instance.
 * @param serviceName - The name of the microservice (e.g., 'project-service')
 */
export const createLogger = (serviceName: string) => {
  return winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json(),
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, ...rest }) => {
            const meta = Object.keys(rest).length ? JSON.stringify(rest) : '';
            return `[${timestamp}] ${level} [${service}]: ${message} ${meta}`;
          }),
        ),
      }),
    ],
  });
};

// Default export for ease of use
export const logger = createLogger('system');
