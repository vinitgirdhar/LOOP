'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_URL, getWorkspaceId } from '@/lib/api';
import { flush, onQueueChange, pending, type QueuedRequest } from '@/lib/offline-queue';
import { useToast } from '@/components/providers/toast';

/**
 * Registers the service worker, watches connectivity, and drains the write
 * queue when the network returns.
 *
 * Mounted once in the root layout. It renders a status strip only when there
 * is something to say — a permanent "you are online" badge is noise.
 */
export function OfflineProvider() {
  const toast = useToast();
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  const refreshCount = useCallback(() => {
    void pending().then((rows) => setQueued(rows.length));
  }, []);

  useEffect(() => {
    // navigator.onLine is only trustworthy in the negative: false really does
    // mean no network, true only means an interface exists.
    setOnline(navigator.onLine);
    refreshCount();
    return onQueueChange(refreshCount);
  }, [refreshCount]);

  const drain = useCallback(async () => {
    const send = (entry: QueuedRequest) =>
      fetch(`${API_URL}${entry.path}`, {
        method: entry.method,
        headers: {
          'x-loop-client': 'web',
          'Content-Type': 'application/json',
          ...(entry.workspaceId ? { 'x-workspace-id': entry.workspaceId } : {}),
        },
        credentials: 'include',
        body: entry.body === null ? undefined : JSON.stringify(entry.body),
      });

    const { sent, failed } = await flush(send);
    if (sent > 0) toast.success(`${sent} offline change${sent === 1 ? '' : 's'} synced`);
    if (failed > 0) toast.error(`${failed} offline change${failed === 1 ? '' : 's'} could not be applied`);
    refreshCount();
  }, [toast, refreshCount]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void drain();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Anything left from a previous session goes out on load.
    if (navigator.onLine) void drain();

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [drain]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Registered after load so it never competes with the first paint.
    const register = () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  if (online && queued === 0) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-[60] flex justify-center px-3"
      style={{ bottom: 'calc(var(--bottom-chrome) + 0.5rem)' }}
    >
      <p
        className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium shadow-[var(--shadow)] ${
          online ? 'bg-[var(--warning-soft)] text-[var(--warning)]' : 'bg-[var(--ink)] text-[var(--ink-text)]'
        }`}
      >
        {online
          ? `Syncing ${queued} offline change${queued === 1 ? '' : 's'}…`
          : queued > 0
            ? `Offline · ${queued} change${queued === 1 ? '' : 's'} waiting to send`
            : 'Offline · showing the last data loaded'}
      </p>
    </div>
  );
}

export const currentWorkspaceForQueue = getWorkspaceId;
