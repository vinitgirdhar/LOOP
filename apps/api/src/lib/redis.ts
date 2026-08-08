import Redis from 'ioredis';
import { env, features } from '../env.js';
import { logger } from './logger.js';

/**
 * Redis is optional. Without it presence and rate limiting fall back to an
 * in-process map, which is correct for a single instance and good enough
 * for local development.
 */
export const redis = features.redis
  ? new Redis(env.REDIS_URL!, { maxRetriesPerRequest: 2, lazyConnect: false })
  : null;

redis?.on('error', (err) => logger.warn('redis error', err.message));

const memory = new Map<string, { value: string; expiresAt: number }>();

export async function cacheSet(key: string, value: string, ttlSeconds: number) {
  if (redis) {
    await redis.set(key, value, 'EX', ttlSeconds);
    return;
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function cacheGet(key: string): Promise<string | null> {
  if (redis) return redis.get(key);
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

export async function cacheDel(key: string) {
  if (redis) {
    await redis.del(key);
    return;
  }
  memory.delete(key);
}

/** Simple presence set: workspace → online user ids. */
const presence = new Map<string, Set<string>>();

export async function markOnline(workspaceId: string, userId: string) {
  if (redis) {
    await redis.sadd(`presence:${workspaceId}`, userId);
    await redis.expire(`presence:${workspaceId}`, 60 * 60);
    return;
  }
  if (!presence.has(workspaceId)) presence.set(workspaceId, new Set());
  presence.get(workspaceId)!.add(userId);
}

export async function markOffline(workspaceId: string, userId: string) {
  if (redis) {
    await redis.srem(`presence:${workspaceId}`, userId);
    return;
  }
  presence.get(workspaceId)?.delete(userId);
}

export async function onlineUsers(workspaceId: string): Promise<string[]> {
  if (redis) return redis.smembers(`presence:${workspaceId}`);
  return [...(presence.get(workspaceId) ?? [])];
}
