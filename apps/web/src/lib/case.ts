/**
 * Postgres is snake_case, the web app is camelCase.
 *
 * Converting generically in one place is what keeps the route handlers short —
 * the alternative is hand-mapping every column of every table 120 times, which
 * is exactly where typos become silent nulls.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Dates arrive from PostgREST as ISO strings already, and `Date` / `File` must
 * survive untouched, so only plain objects and arrays are walked.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function convert(value: unknown, mapKey: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => convert(item, mapKey));
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) out[mapKey(key)] = convert(nested, mapKey);
  return out;
}

/** Database row(s) → what the web app's components already expect. */
export const camelise = <T>(value: unknown): T => convert(value, toCamel) as T;

/** Request body → column names. */
export const snakeify = <T = Record<string, unknown>>(value: unknown): T => convert(value, toSnake) as T;

export type { Json };
