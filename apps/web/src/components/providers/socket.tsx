'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, getAccessToken } from '@/lib/api';
import { useAuth } from './auth';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  online: string[];
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false, online: [] });

export const useSocket = () => useContext(SocketContext);

/** Subscribes to a socket event for as long as the component is mounted. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => saved.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}

/** Joins a room while mounted (project board, chat channel). */
export function useRoom(kind: 'project' | 'channel', id: string | null | undefined) {
  const { socket, connected } = useSocket();
  useEffect(() => {
    if (!socket || !connected || !id) return;
    socket.emit(`${kind}:join`, id);
    return () => {
      socket.emit(`${kind}:leave`, id);
    };
  }, [socket, connected, kind, id]);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, workspaceId, ready } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<string[]>([]);

  useEffect(() => {
    if (!ready || !user) return;
    const token = getAccessToken();
    if (!token) return;

    const instance = io(API_URL, {
      auth: { token },
      // Polling stays as a fallback for networks that block websockets.
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    instance.on('presence:update', (payload: { online: string[] }) => setOnline(payload.online ?? []));

    setSocket(instance);
    return () => {
      instance.close();
      setSocket(null);
      setConnected(false);
    };
  }, [ready, user]);

  useEffect(() => {
    if (socket && connected && workspaceId) socket.emit('workspace:join', workspaceId);
  }, [socket, connected, workspaceId]);

  return <SocketContext.Provider value={{ socket, connected, online }}>{children}</SocketContext.Provider>;
}
