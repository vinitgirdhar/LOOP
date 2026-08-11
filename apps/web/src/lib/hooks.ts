'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, type ApiMeta } from './api';

interface QueryState<T> {
  data: T | null;
  meta: ApiMeta | null;
  loading: boolean;
  error: string | null;
}

/**
 * Responses already seen, keyed by request path.
 *
 * Navigating back to a section used to drop straight to an empty skeleton and
 * wait on the network again, which is most of what "the pages are slow" feels
 * like on a phone. Serving the last response immediately and revalidating
 * behind it makes a return visit paint at once. Module-level on purpose: it
 * lives as long as the tab and is dropped on a full reload, so it can never go
 * stale across a sign-out.
 */
const responseCache = new Map<string, { data: unknown; meta: ApiMeta | null }>();

export const clearQueryCache = () => responseCache.clear();

/**
 * Small fetch hook — enough for this app and one less dependency than a data
 * library. Re-runs when the key changes, cancels in-flight requests, serves the
 * previous response while revalidating, and exposes refetch plus an optimistic
 * setter.
 */
export function useQuery<T>(path: string | null, deps: unknown[] = []): QueryState<T> & {
  refetch: () => Promise<void>;
  setData: (updater: T | ((previous: T | null) => T)) => void;
} {
  const [state, setState] = useState<QueryState<T>>(() => {
    const cached = path ? responseCache.get(path) : undefined;
    return cached
      ? { data: cached.data as T, meta: cached.meta, loading: false, error: null }
      : { data: null, meta: null, loading: Boolean(path), error: null };
  });
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const run = useCallback(async () => {
    if (!path) {
      setState({ data: null, meta: null, loading: false, error: null });
      return;
    }
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;

    const cached = responseCache.get(path);
    // Show what we had and revalidate quietly; only an empty cache spins.
    setState((s) => ({
      data: (cached?.data as T) ?? s.data,
      meta: cached?.meta ?? s.meta,
      loading: s.data === null && cached === undefined,
      error: null,
    }));

    try {
      const { data, meta } = await api.get<T>(path, { signal: next.signal });
      responseCache.set(path, { data, meta: meta ?? null });
      if (!next.signal.aborted && mounted.current) setState({ data, meta: meta ?? null, loading: false, error: null });
    } catch (error: unknown) {
      if (next.signal.aborted || !mounted.current) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // A failed revalidation must not blank out content already on screen.
      setState((s) => ({ data: s.data, meta: s.meta, loading: false, error: apiErrorMessage(error) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    void run();
  }, [run]);

  const setData = useCallback((updater: T | ((previous: T | null) => T)) => {
    setState((s) => ({
      ...s,
      data: typeof updater === 'function' ? (updater as (p: T | null) => T)(s.data) : updater,
    }));
  }, []);

  return { ...state, refetch: run, setData };
}

/** Debounces a fast-changing value (search boxes, live filters). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Reads a one-shot intent flag out of the URL (`?new=1`) after hydration, then
 * strips it — so a refresh, a share or a back-navigation does not reopen the
 * dialog it triggered. Reading `window.location` rather than `useSearchParams`
 * keeps the page out of a Suspense boundary it does not otherwise need.
 */
export function useUrlIntent(key: string, onIntent: (value: string) => void) {
  const saved = useRef(onIntent);
  saved.current = onIntent;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(key);
    if (value === null) return;

    params.delete(key);
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    saved.current(value);
  }, [key]);
}

/**
 * Keeps a tab selection in the URL, so a deep link (a search hit, a shared
 * link) opens the pane it means to instead of dropping you on the first tab.
 */
export function useUrlTab(fallback: string, key = 'tab'): [string, (next: string) => void] {
  const [tab, setTab] = useState(fallback);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(key);
    if (value) setTab(value);
  }, [key]);

  const select = useCallback(
    (next: string) => {
      setTab(next);
      const params = new URLSearchParams(window.location.search);
      params.set(key, next);
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    },
    [key],
  );

  return [tab, select];
}

/** Fires when a click lands outside the referenced element. */
export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onOutside]);
  return ref;
}

/** Locks body scroll while a modal or drawer is open. */
export function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
