'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { camelise } from '@/lib/case';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './auth';

/**
 * Supabase Realtime, behind the small slice of the Socket.io surface this app
 * actually used, so the board, chat, notifications and Auto-Pilot screens did
 * not have to change.
 *
 * Events no longer come from a server we run: they are Postgres change feeds,
 * filtered by the same row level security as an ordinary read. If a person
 * cannot select a row, they do not receive its changes either.
 */

type Listener = (payload: unknown) => void;

interface EventBus {
  on: (event: string, listener: Listener) => void;
  off: (event: string, listener: Listener) => void;
  /** Only `typing` is a real broadcast; joins and leaves are handled by useRoom. */
  emit: (event: string, payload?: unknown) => void;
}

interface SocketContextValue {
  socket: EventBus | null;
  connected: boolean;
  online: string[];
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false, online: [] });

export const useSocket = () => useContext(SocketContext);

/** Subscribes to an event for as long as the component is mounted. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener: Listener = (payload) => saved.current(payload as T);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
}

/**
 * Subscribes to one project board or one chat channel while mounted.
 *
 * The filter is applied server-side by Realtime, so a client only receives rows
 * for the room it is actually looking at rather than filtering the whole
 * workspace in the browser.
 */
export function useRoom(kind: 'project' | 'channel', id: string | null | undefined) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !id) return;

    const column = kind === 'project' ? 'project_id' : 'channel_id';
    const table = kind === 'project' ? 'tasks' : 'messages';
    const channel = supabase.channel(`${kind}:${id}`);

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `${column}=eq.${id}` },
      (change) => {
        const row = camelise<Record<string, unknown>>(change.new ?? change.old);

        if (table === 'tasks') {
          if (change.eventType === 'INSERT') emitLocal(socket, 'task:create', row);
          else if (change.eventType === 'UPDATE') emitLocal(socket, 'task:update', row);
          else emitLocal(socket, 'task:delete', row);
          return;
        }

        if (change.eventType === 'INSERT') emitLocal(socket, 'message:new', row);
        else if (change.eventType === 'UPDATE') emitLocal(socket, 'message:update', row);
      },
    );

    if (kind === 'channel') {
      channel.on('broadcast', { event: 'typing' }, ({ payload }) => emitLocal(socket, 'typing', payload));
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (change) => {
          const row = camelise<{ messageId?: string }>(change.new ?? change.old);
          if (row.messageId) emitLocal(socket, 'reaction:update', row);
        },
      );
    }

    void channel.subscribe();
    roomChannels.set(`${kind}:${id}`, channel);

    return () => {
      roomChannels.delete(`${kind}:${id}`);
      void supabase.removeChannel(channel);
    };
  }, [socket, kind, id]);
}

/** Rooms currently joined, so `emit('typing')` knows where to broadcast. */
const roomChannels = new Map<string, RealtimeChannel>();

/** Dispatches into the local bus without going back out over the wire. */
function emitLocal(bus: EventBus, event: string, payload: unknown) {
  (bus as EventBus & { dispatch: (e: string, p: unknown) => void }).dispatch(event, payload);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, workspaceId, ready } = useAuth();
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<string[]>([]);

  const socket = useMemo<EventBus & { dispatch: (event: string, payload: unknown) => void }>(() => {
    const listeners = new Map<string, Set<Listener>>();

    return {
      on(event, listener) {
        const set = listeners.get(event) ?? new Set<Listener>();
        set.add(listener);
        listeners.set(event, set);
      },
      off(event, listener) {
        listeners.get(event)?.delete(listener);
      },
      dispatch(event, payload) {
        listeners.get(event)?.forEach((listener) => listener(payload));
      },
      emit(event, payload) {
        if (event !== 'typing') return;
        const { channelId } = (payload ?? {}) as { channelId?: string };
        if (!channelId) return;
        void roomChannels.get(`channel:${channelId}`)?.send({ type: 'broadcast', event: 'typing', payload });
      },
    };
  }, []);

  useEffect(() => {
    if (!ready || !user || !workspaceId) {
      setConnected(false);
      return;
    }

    // Realtime authorises the socket with the current access token; without
    // this the connection is anonymous and every RLS-filtered feed stays empty.
    void supabase.realtime.setAuth();

    const channel = supabase.channel(`workspace:${workspaceId}`, { config: { presence: { key: user.id } } });

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (change) =>
        socket.dispatch('notification:new', camelise(change.new)),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_suggestions', filter: `workspace_id=eq.${workspaceId}` }, (change) =>
        socket.dispatch('suggestion:new', camelise(change.new)),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `workspace_id=eq.${workspaceId}` }, (change) =>
        socket.dispatch('activity:new', camelise(change.new)),
      )
      .on('presence', { event: 'sync' }, () => {
        setOnline(Object.keys(channel.presenceState()));
      });

    void channel.subscribe((status) => {
      const live = status === 'SUBSCRIBED';
      setConnected(live);
      if (live) void channel.track({ at: new Date().toISOString() });
    });

    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [ready, user, workspaceId, socket]);

  const value = useMemo<SocketContextValue>(() => ({ socket, connected, online }), [socket, connected, online]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
