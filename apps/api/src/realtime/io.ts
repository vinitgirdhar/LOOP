import type { Server } from 'socket.io';

/**
 * The Socket.IO server is created in index.ts. Services import these helpers
 * instead of the server itself, which keeps the dependency graph acyclic.
 *
 * Rooms: ws:<workspaceId> · project:<projectId> · channel:<channelId> · user:<userId>
 */
let server: Server | null = null;

export const setIo = (io: Server) => {
  server = io;
};

export const getIo = () => server;

export const roomWorkspace = (id: string) => `ws:${id}`;
export const roomProject = (id: string) => `project:${id}`;
export const roomChannel = (id: string) => `channel:${id}`;
export const roomUser = (id: string) => `user:${id}`;

export function emitTo(room: string, event: string, payload: unknown) {
  server?.to(room).emit(event, payload);
}

export function emitToMany(rooms: string[], event: string, payload: unknown) {
  if (!server || rooms.length === 0) return;
  server.to(rooms).emit(event, payload);
}
