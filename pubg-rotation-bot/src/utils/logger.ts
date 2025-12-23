type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatDate(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, data?: unknown): void {
  const timestamp = formatDate();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
  debug: (message: string, data?: unknown) => {
    if (process.env.DEBUG) {
      log('debug', message, data);
    }
  },
};
