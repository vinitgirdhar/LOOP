/**
 * Same-origin by default: the API now lives in this app's own route handlers
 * (`src/app/api/**`), which talk to Supabase. An empty base means `fetch` hits
 * the deployment it was served from, so there is no CORS surface and no second
 * host to configure. The variable stays overridable only for pointing a local
 * web dev server at a deployed preview.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface ApiMeta {
  total: number;
  page: number;
  limit: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
  code?: string;
  meta?: ApiMeta;
  details?: { path: string; message: string }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
    public details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The session is a Supabase httpOnly cookie the browser attaches by itself and
 * JavaScript cannot read, so there is no access token held in memory here any
 * more. `x-loop-client` still forces a CORS preflight on any cross-site attempt
 * to reach these routes.
 */
let workspaceId: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setWorkspaceId = (id: string | null) => {
  workspaceId = id;
};
export const getWorkspaceId = () => workspaceId;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** FormData bypasses JSON encoding so file uploads work. */
  form?: FormData;
  workspace?: string | null;
  signal?: AbortSignal;
  raw?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta?: ApiMeta }> {
  const headers: Record<string, string> = { 'x-loop-client': 'web' };

  const ws = options.workspace === undefined ? workspaceId : options.workspace;
  if (ws) headers['x-workspace-id'] = ws;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? (options.body || options.form ? 'POST' : 'GET'),
    headers,
    credentials: 'include',
    signal: options.signal,
    ...(options.form ? { body: options.form } : options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (options.raw) return { data: (await response.text()) as T };

  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(response.status, `Request failed (${response.status})`);
  }

  if (!response.ok || payload.success === false) {
    if (response.status === 401 && !path.includes('/auth/')) onUnauthorized?.();
    throw new ApiError(response.status, payload.error ?? 'Request failed', payload.code, payload.details);
  }
  return { data: payload.data, meta: payload.meta };
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: 'PATCH', body }),
  del: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
  upload: <T>(path: string, form: FormData, options?: RequestOptions) => request<T>(path, { ...options, method: 'POST', form }),
  raw: request,
};

export const apiErrorMessage = (error: unknown): string =>
  error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong';
