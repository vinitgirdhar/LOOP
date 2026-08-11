'use client';

/**
 * Writes made while offline, replayed when the connection comes back.
 *
 * IndexedDB rather than localStorage because the queue must survive a tab
 * crash and because localStorage is synchronous — blocking the main thread on
 * every mutation is exactly the wrong trade on a phone.
 *
 * Deliberately narrow: only the mutations the app marks as replayable are
 * queued. A failed write is not automatically safe to retry — a duplicate POST
 * creates two tasks, and a PATCH built from a stale view can overwrite someone
 * else's change. So callers opt in per request, and only idempotent-ish
 * operations do.
 */

const DB_NAME = 'loop-offline';
const STORE = 'queue';
const VERSION = 1;

export interface QueuedRequest {
  id: string;
  path: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body: unknown;
  workspaceId: string | null;
  queuedAt: number;
  attempts: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export const isSupported = () => typeof indexedDB !== 'undefined';

export async function enqueue(entry: Omit<QueuedRequest, 'id' | 'queuedAt' | 'attempts'>): Promise<void> {
  if (!isSupported()) return;
  const record: QueuedRequest = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
    attempts: 0,
  };
  await transact('readwrite', (store) => store.add(record));
  notify();
}

export async function pending(): Promise<QueuedRequest[]> {
  if (!isSupported()) return [];
  try {
    const rows = await transact<QueuedRequest[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedRequest[]>);
    return rows.sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    return [];
  }
}

const remove = (id: string) => transact('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>);

/** How many attempts a write gets before it is dropped rather than retried forever. */
const MAX_ATTEMPTS = 3;

/**
 * Replays the queue oldest first, stopping at the first network failure.
 *
 * Order matters — a PATCH to a task created by an earlier queued POST must not
 * run first — so this is sequential and bails out rather than racing ahead. A
 * 4xx means the server rejected the write on its merits; retrying will never
 * help, so it is dropped and reported.
 */
export async function flush(
  send: (entry: QueuedRequest) => Promise<Response>,
): Promise<{ sent: number; failed: number }> {
  const queue = await pending();
  let sent = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      const response = await send(entry);
      if (response.ok) {
        await remove(entry.id);
        sent += 1;
        continue;
      }
      if (response.status >= 400 && response.status < 500) {
        await remove(entry.id);
        failed += 1;
        continue;
      }
      // 5xx: the server is having a bad time, try again later.
      break;
    } catch {
      // Still offline. Leave the rest of the queue intact.
      if (entry.attempts + 1 >= MAX_ATTEMPTS) {
        await remove(entry.id);
        failed += 1;
      } else {
        await transact('readwrite', (store) => store.put({ ...entry, attempts: entry.attempts + 1 }) as unknown as IDBRequest<undefined>);
      }
      break;
    }
  }

  notify();
  return { sent, failed };
}

/** Lets the UI show a pending-writes badge without polling IndexedDB. */
const listeners = new Set<() => void>();
export function onQueueChange(listener: () => void): () => void {
  listeners.add(listener);
  // Returns void, not the Set's boolean — React treats any return value from
  // an effect as its cleanup function.
  return () => {
    listeners.delete(listener);
  };
}
const notify = () => listeners.forEach((listener) => listener());
