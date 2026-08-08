/* eslint-disable no-console */
const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;

const min = levels[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? levels.info;

function emit(level: Level, message: string, meta?: unknown) {
  if (levels[level] < min) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  meta === undefined ? target(line) : target(line, meta);
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
