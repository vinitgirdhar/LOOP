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
 * Small fetch hook — enough for this app and one less dependency than a data
 * library. Re-runs when the key changes, cancels in-flight requests, and
 * exposes refetch plus an optimistic setter.
 */
export function useQuery<T>(path: string | null, deps: unknown[] = []): QueryState<T> & {
  refetch: () => Promise<void>;
  setData: (updater: T | ((previous: T | null) => T)) => void;
} {
  const [state, setState] = useState<QueryState<T>>({ data: null, meta: null, loading: Boolean(path), error: null });
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

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data, meta } = await api.get<T>(path, { signal: next.signal });
      if (!next.signal.aborted && mounted.current) setState({ data, meta: meta ?? null, loading: false, error: null });
    } catch (error: unknown) {
      if (next.signal.aborted || !mounted.current) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({ data: null, meta: null, loading: false, error: apiErrorMessage(error) });
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
