import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

const ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export interface AccessTokenPayload {
  sub: string;
  email: string;
  admin: boolean;
  sid: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'loop',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'loop' }) as AccessTokenPayload;
}

export function signRefreshToken(sessionId: string, userId: string): string {
  return jwt.sign({ sid: sessionId, sub: userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
    issuer: 'loop',
  });
}

export function verifyRefreshToken(token: string): { sid: string; sub: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'loop' }) as { sid: string; sub: string };
}

/** Refresh tokens and email links are stored hashed, never in plain text. */
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const randomOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
